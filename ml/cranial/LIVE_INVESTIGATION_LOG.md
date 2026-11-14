# Live Investigation Log: Cranial Reconstruction ML Training

**Target Job:** `cranial-pilot-run-1794688489`  
**Host Environment:** AWS SageMaker (`ml.g5.2xlarge`)  
**Artifact Location:** `s3://hack-princeton-s3/cranial/checkpoints/run_1794688489`  
**Live Timestamp:** 2026-11-14 15:44 EST  

---

## 1. Latest Observation & Phenomenon

In the latest pilot run (`--mode pilot`, `--pilot-lr 0.002`, `--pilot-epochs 200`):

```text
2026-11-14 20:38:43 [INFO] === PILOT: overfitting 3 cases for ≤200 epochs ===
2026-11-14 20:38:57 [INFO]   Pilot epoch 10/200: dice=0.0117
2026-11-14 20:39:10 [INFO]   Pilot epoch 20/200: dice=0.0169
2026-11-14 20:39:22 [INFO]   Pilot epoch 30/200: dice=0.0263
2026-11-14 20:39:35 [INFO]   Pilot epoch 40/200: dice=0.0001
2026-11-14 20:39:48 [INFO]   Pilot epoch 50/200: dice=0.0001
2026-11-14 20:40:01 [INFO]   Pilot epoch 60/200: dice=0.0000
2026-11-14 20:40:14 [INFO]   Pilot epoch 70/200: dice=0.0000
2026-11-14 20:40:27 [INFO]   Pilot epoch 80/200: dice=0.0000
2026-11-14 20:40:40 [INFO]   Pilot epoch 90/200: dice=0.0000
```

### Key Observation
1. **Initial Learning (Epochs 1–30):** Dice steadily increased from $0.0036 \to 0.0117 \to 0.0169 \to 0.0263$ (a $7.3\times$ improvement over the initial run).
2. **Sudden Collapse (Epoch 40):** At epoch 40, Dice suddenly plummeted to $0.0001$ and subsequently remained flat at $0.0000$.
3. **Symptom:** $0.0000$ Dice means the network has predicted `preds.sum() == 0` — that is, **every single voxel in the 16.7 million voxel grid has an output probability $\le 0.5$**.

---

## 2. Hypothesis & Working Diagnosis

### The Mechanism of the Sudden Collapse to 0.0000
1. **The Class Imbalance Factor:**
   * Each $256^3$ case contains $16,777,216$ voxels.
   * Background zeros: $\sim 16,740,000$ voxels ($99.85\%$).
   * Foreground ones (implant): $\sim 25,000$ voxels ($0.15\%$).
   * Ratio of background to foreground is $\approx 1000 : 1$.

2. **Why BCE Overpowers Dice:**
   * In `0.5 * DiceLoss + 0.5 * BCEWithLogitsLoss`:
   * For BCE, every background voxel has a gradient of $\frac{1}{N} \sigma(z_i)$ pushing its logit $z_i$ negative.
   * Summed across the $16.7\text{ million}$ background voxels, the aggregate downward gradient is roughly $1,000\times$ larger than the upward gradient on the $25,000$ target voxels.
   * As the learning rate is increased ($0.002$), the network initially learns coarse features (raising Dice to $0.0263$), but as background penalties accumulate across millions of voxels, the global bias of the final convolutional layer is driven deeply negative ($z_i < 0$ everywhere).
   * Once all logits $z_i < 0$, $\sigma(z_i) < 0.5$ everywhere.
   * `(torch.sigmoid(logits) > 0.5)` produces **0 positive predictions**.
   * Dice immediately collapses to:
     $$\text{Dice} = \frac{2 \times 0}{0 + 25,000} = 0.0000$$
   * Once in the negative tail of the sigmoid, $\sigma'(z) \to 0$, causing vanishing gradients that freeze the model in the all-zero state.

---

## 3. Active Experiments & Progress Log

### Experiment 1: Loss Function & Learning Rate Ablation (Task 260)
Conducted on the 3 training cases at downsampled grid ($2,097,152$ voxels/case):

| Loss Function | LR | Ep 35 Avg Dice | Ep 35 Predicted Voxels (`p_sum`) | Status / Behavior |
|---|---|---|---|---|
| **Combined Dice + BCE** | `2e-3` | **0.0167** | 359,807 | Begins to suppress, moving towards zero collapse. |
| **Combined Dice + BCE** | `5e-4` | **0.0028** | 2,014,852 | Extremely sluggish; stuck outputting diffuse 0.5 probabilities. |
| **Pure DiceLoss** | `2e-3` | **0.0236** | 293,435 | Stable, monotonically improving foreground selection. |
| **Pure DiceLoss** | `5e-3` | **0.0571** | 119,130 | **Best.** $3.4\times$ higher Dice; false-positive background rapidly shedding. |
| **DiceFocalLoss** | `2e-3` | **0.0078** | 229,119 | Slower than pure Dice; focal scaling reduces signal on thin shell. |

### Experiment 2: Long-Horizon Convergence with Pure DiceLoss (Task 292)
Tested `Pure DiceLoss (lr=0.005)` across 120 epochs on the 3 cases to evaluate whether removing unweighted BCE prevents the epoch 40 collapse to $0.0000$ and enables continued convergence:

```text
ep  15: dice=0.0245, loss=0.9862, p_sum_avg=282920
ep  30: dice=0.0403, loss=0.9569, p_sum_avg=170315
ep  45: dice=0.1089, loss=0.8782, p_sum_avg=60134
ep  60: dice=0.2378, loss=0.7268, p_sum_avg=25230
ep  75: dice=0.6827, loss=0.3451, p_sum_avg=5339
ep  90: dice=0.8466, loss=0.1444, p_sum_avg=4047
ep 105: dice=0.8892, loss=0.1203, p_sum_avg=4043
ep 120: dice=0.9253, loss=0.0739, p_sum_avg=3578
```

### Result Analysis & Confirmation:
1. **No Collapse:** With pure DiceLoss, the epoch 40 collapse **did not occur**. Instead, Dice grew smoothly from $0.0403 \to 0.1089$.
2. **Exponential Convergence:** Once the network established correct spatial localization around epoch 60 ($0.2378$), Dice surged past $0.68 \to 0.84 \to 0.88$.
3. **Threshold Met:** At epoch 120, the model achieved **Dice = 0.9253** (exceeding the $0.90$ acceptance threshold).
4. **Volume Specificity:** Predicted voxels per case (`p_sum_avg`) dropped from $282,920$ (initial diffuse background) down to $3,578$ (exact contour of the missing implant).

---

## 4. Historical attempted solution (not fully verified)

1. **`ml/cranial/train.py`**:
   * Updated `build_loss()` to use pure Soft Dice Loss by default (`--loss dice`), while providing fallback choices (`dice_bce`, `dice_focal`).
   * Pinned `--pilot-lr 0.005` and `--pilot-epochs 200`.
   * Early stopping in `run_pilot` halts execution immediately once `dice >= 0.90` is reached ($\sim 110\text{--}120$ epochs, or $\sim 2.5\text{ minutes}$ on A10G).

2. **`ml/cranial/launch_training.py`**:
   * Set `"loss": "dice"`, `"pilot-lr": 0.005`, and `"pilot-epochs": 200` in SageMaker hyperparameters.
   * Ensured `"no-aug": False` for full training runs.

3. **Historical status:** The SageMaker pilot failed with the combined Dice+BCE loss. Later local experiments reported improved pilot Dice with pure Dice, but they do not verify the full 256³ pipeline or held-out performance. Do not treat this section as proof that deployment or a full run is ready.

---

## 5. Non-Technical Explanation: Why Did We Want the Model to "Cheat/Memorize" (Overfit) to 0.90?

If you don't have a background in Machine Learning, the word **"overfitting"** might sound like a bad thing — and normally, in real-world AI, it is! Here is what it means and why we did it on purpose:

---

### The "Open-Book 3-Flashcard Test" Analogy

Imagine you are hiring a student to learn how to design skull implants. Before you pay hundreds of dollars for a 3-week comprehensive medical course across 100 complex patient cases, you want to be 100% sure the student is not blind, speaks the same language as the teacher, and has a pen that actually works.

So on Day 1, you do a **sanity test**:
1. You give the student **just 3 flashcards** with the questions and the exact answers written right in front of them.
2. You say: *"Stare at these 3 exact flashcards for 2 minutes. Then I will ask you these exact 3 questions."*

#### What happened in your first training run:
The student scored **0.8%** on the 3 flashcards they were literally staring at.
* That didn't mean the student needed more study time.
* It meant something was fundamentally broken with the tools: the pen had no ink, the student couldn't see the paper, or the math grading system was marking every correct answer as wrong!
* **The Lesson:** If the student can't even copy 3 answers off an open flashcard, sending them to the full 4-hour AWS GPU training run on 91 patients would be throwing money in the trash.

#### What we did to fix it:
We found the "broken pen and invisible ink":
1. The grading formula (`BCE loss`) was penalizing the student so harshly for any ink on the page that the student learned the safest strategy was to leave the entire paper completely blank!
2. Once we switched to the correct grading system (`pure Dice loss`), the student scored **92.5%** on those 3 flashcards.

#### Why this doesn't ruin the real AI:
* This 3-flashcard test was just a **throwaway diagnostic check** (Model A).
* Once the test confirmed the tools, math, and code work, **we throw that test model away**.
* For the **real training run**, a brand new, fresh AI (Model B) is created from scratch on all **91 patients**, with strict rules (random rotations, flipping, and independent testing on 23 unseen patients) so that it is forced to **actually learn anatomy**, rather than just memorizing flashcards.
* **The final saved model (`best.pt`) is Model B (the real generalized model), NOT the overfitted pilot model.**





## 6. Proposed repair before the next run — 2026-11-14

User-authorized scope: keep the parietotemporal subset (91 train / 23 validation / 20 test), current U-Net, and current pure Dice loss. Limit each SageMaker attempt to one hour. Repair the pipeline before submitting another job.

Earlier “verified and ready” statements above are historical experiment notes, not an end-to-end acceptance result. The reported 0.9253 experiment used a downsampled grid; it does not establish a passing 256³ pilot or held-out performance. The loss explanations above are hypotheses, not a demonstrated universal cause of collapse.

### Behavior inventory and repair order

1. R4/R9/R16: inference must use the same preprocessing as preparation. Persist the actual spacing, shape, and axis-reindex setting in the freeze; consume it in prediction and evaluation. Verify exact tensor agreement and source-grid restoration with asymmetric synthetic masks. Reject incomplete freezes and empty/non-finite predictions.
2. R7: the full-run pilot must use a separate unaugmented dataset. Standalone pilot mode must stop after its sanity check; it must not write a misleading one-epoch full-model checkpoint. Verify pilot inputs remain fixed when full-training augmentation is enabled.
3. R6/R18: save recoverable state in SageMaker's synced checkpoint directory, preserve the true best score on resume, and cap jobs at 3600 seconds. Use an earlier training deadline to leave time for artifact writes. Verify checkpoint round trips and that timeout leaves resumable state.
4. R10/R11: keep failed cases in evaluation output and aggregate distance metrics. Represent undefined failure distances as infinity in calculation and null with an explicit failure flag in JSON; do not silently discard them. Fix boundary-band selection. Verify with small constructed masks and a deliberately failing case.
5. R2/R4: make audit checks actually inspect accepted CSV rows and complete physical frames. Verify a contaminated manifest and shifted origin are rejected.

### Verification before submission

Follow TDD at existing Python function and CLI seams: one failing regression, minimum repair, then surrounding tests. Use the existing local environment (`app/cranial-env/bin/python`); its torch version differs from the pinned GPU container, so CPU checks do not establish CUDA/AMP behavior.

Run the complete cranial pytest suite, saved-data audit, and source-coordinate round-trip check. Exercise a small real U-Net forward/backward step locally. Do not use official test model scores for debugging. Do not submit paid GPU jobs as part of this repair.

Remaining GPU gates: a timed full-resolution pilot must reach mean Dice >= 0.90 on three fixed training cases; check finite loss/gradients and measured memory/step time, then train within the one-hour cap. Inspect validation predictions, freeze settings, and only then open held-out test scores. Passing local checks alone does not prove model accuracy.

### Implementation update — 2026-11-14

Completed so far:
- Added `ml/cranial/tests/test_pipeline.py` and confirmed the orientation mismatch first failed on an asymmetric synthetic mask.
- Changed inference defaults to match preparation (`convert_to_ras: false`). The synthetic preprocessed array and restored source grid now match exactly.
- Added validation that a freeze includes a matching checkpoint hash, explicit preprocessing settings, threshold, and supported postprocessing settings.
- Added an explicit preprocessing argument to `predict_single`; CLI inference reads it from the freeze and records the checkpoint hash and preprocessing in prediction metadata.
- Training datasets now read preprocessing settings from the per-case metadata and reject mixed settings; training also rejects a mismatch between train and validation settings.
- Full-run pilot loader now builds a separate unaugmented dataset, even when full training augmentation is enabled.
- Prediction now rejects wrong-shaped, non-finite, and empty outputs.
- Regression suite: 8 passed using the project environment with NumPy 1.26.4 isolated under `/tmp/cranial-verify-deps`. The environment's installed NumPy 2.0.2 causes MONAI 1.3.0 augmentation setup to raise `OverflowError`; the project requirements pin NumPy 1.26.4. No project environment was modified.

Not complete: standalone pilot currently still proceeds into the one-epoch full-training loop; checkpoint writes/resume, one-hour runtime cap, evaluation failure accounting, and audit integrity checks remain to be fixed and tested. The full cranial test suite, saved-data audit, source-grid tests, and CPU U-Net training step remain to be run. No new SageMaker job has been submitted.

Status at that checkpoint: repair was incomplete. See the repair verification update below for current readiness.

### Repair verification update

Implemented checkpoint writes under `/opt/ml/checkpoints` for SageMaker, explicit launcher checkpoint sync path, latest checkpoint best-score ordering, standalone pilot termination (`epochs=0`), and a 3600-second full-job cap. Training stops starting new epochs after 3300 seconds; SageMaker enforces the hard limit. An interrupted partial epoch resumes from the last completed checkpoint.

Evaluation now consumes frozen preprocessing, retains exceptions as failed rows, includes failed distances in the HD95 aggregate, and uses the intended boundary band. Audit now includes accepted CSV rows whose empty error cells are read as NaN and checks origin/direction.

Verification: complete cranial suite reports **30 passed** (dependency deprecation warnings only). Includes a real small-grid U-Net backward/update, checkpoint restoration, and actual paired MONAI augmentation. Source landmark round trip: three errors 0.000000 mm, original grid restored, mask Dice after resampling 0.9596. These CPU checks do not prove CUDA/AMP behavior or full-resolution convergence.

Local verification command:
```sh
PYTHONPATH=/tmp/cranial-verify-deps MPLCONFIGDIR=/tmp/cranial-mpl app/cranial-env/bin/python -m pytest ml/cranial/tests -q
```

Next GPU step: run `python ml/cranial/launch_training.py --mode pilot` from the configured SageMaker launcher environment. Pilot is capped at 20 minutes and stops after its check. Only after a passing full-resolution pilot, use `python ml/cranial/launch_training.py --mode full`; it retains its pilot gate and is capped at one hour. No GPU job was submitted during this repair.

Saved-data audit: **134/134 passed, 0 failed**, with 91 train / 23 validation / 20 test. Launcher `--help` also succeeds. Current readiness: local checks pass; proceed with the bounded GPU pilot to verify 256³ learning and CUDA memory. Held-out accuracy remains unmeasured.

### GPU pilot regression investigation — run_1794690771

User logs confirm successful provisioning and CUDA startup, checkpoint directory `/opt/ml/checkpoints`, and 91/23 training/validation pairs. The full-run pilot reports Dice 0.0486 at epoch 10, 0.0303 at 20, and 0.0000 at 30 and 40. The supplied log does not contain the final pilot result. Full training remains gated on pilot Dice >= 0.90; do not bypass the gate.

Zero thresholded Dice alone cannot distinguish finite low-confidence predictions, numerical corruption, or an optimization problem. Learning rate 0.005 is a hypothesis to investigate, not an established cause. No learning-rate or dataset changes were made on this evidence.

Minimal numerical and diagnostic repairs (existing R7 behavior, so no new feature workflow):
- Compute all supported loss functions from float32 logits/targets with autocast disabled inside the loss. Model forward passes still use AMP. A CPU half-precision regression initially returned loss 1.0 instead of the float32 reference 0.99610895; after the repair it matches and preserves finite, nonzero target gradients.
- This is NOT a reproduction of the CUDA failure. [PyTorch's autocast documentation](https://docs.pytorch.org/docs/stable/amp.html) lists CUDA sum among operations promoted to float32. The CPU half-precision test does not exercise that path. Actual GPU convergence remains unverified.
- Pilot now rejects non-finite logits/loss before an optimizer update, and rejects non-finite evaluation logits. Previously NaN outputs could be thresholded to an empty mask and logged as Dice zero. A regression confirmed that missing rejection before the repair.
- At epoch 1 and every 10 epochs, log evaluation loss, total predicted and target voxels, maximum probability, and AMP scale alongside Dice. This distinguishes an empty prediction from low Dice due to excess predictions, and makes numerical issues visible.

Verification after these repairs: **32 passed**, 31 dependency/deprecation warnings, using the local verification command above. Both added regressions were observed failing before their fixes. No new GPU run was submitted, and local edits do not change the already uploaded running job.

Next action: obtain the current job's final pilot result before spending another attempt. If it fails, use the updated standalone pilot (`python ml/cranial/launch_training.py --mode pilot`) to obtain these diagnostics. Do not claim convergence is fixed until the full-resolution GPU pilot passes. Earlier readiness statements refer only to local pipeline checks.

Final result supplied by user: Dice remained 0.0000 through epoch 200; the pilot failed and exited with code 2 at 21:21. The gate stopped full training. SageMaker's traceback reports that deliberate exit, not a separate identified infrastructure error. The supplied logs do not reveal the cause. The next diagnostic pilot uses the updated float32 loss and logging, with the same pilot learning rate and data; it is a new paid job and convergence is unverified.

Diagnostic run `cranial-pilot-run-1794691340`: epoch 1 Dice 0.0193, loss 0.996132, 4,038,724 predicted and 83,594 target voxels; epoch 20 Dice 0.0283, loss 0.986603, 5,851,116 predicted voxels. At epoch 26 the new guard detected non-finite logits or loss and stopped the job. AMP scale was 65536 at epoch 20. This establishes numerical failure in this run, but does not identify whether the learning rate, AMP, gradients, or another issue caused it, or prove the cause of the previous run.

Added launcher option `--pilot-lr` so the next standalone experiment can change one variable: try 0.0005 instead of 0.005 while retaining AMP and the same data. This is a hypothesis, not a proven fix; a pilot passing at that rate does not prove held-out accuracy. The same option must be supplied to a subsequent full job to retain that pilot rate.

Diagnostic run `cranial-pilot-run-1794691715` at pilot learning rate 0.0005 completed 200 epochs without the non-finite guard firing, but failed the pilot: Dice peaked at 0.3126 among the logged epochs (70), then fell to 0.0319 at epoch 200. At epoch 200 it predicted 5,171,098 voxels across the three cases versus 83,594 target voxels; loss was 0.984055. Full training did not start. The lower learning rate alone did not solve convergence. The cause remains unconfirmed; preserve this state before further code changes.

last result:
python ml/cranial/launch_training.py --mode pilot --pilot-lr 0.0005
sagemaker.config INFO - Not applying SDK defaults from location: /Library/Application Support/sagemaker/config.yaml
sagemaker.config INFO - Not applying SDK defaults from location: /Users/viennguyen/Library/Application Support/sagemaker/config.yaml
/Users/viennguyen/hackprinceton/hack-princeton/app/cranial-env/lib/python3.9/site-packages/sagemaker/__init__.py:86: SageMakerV2DeprecationWarning: You are using the SageMaker Python SDK v2, which is on path of deprecation. v3 is the actively developed major version.
See https://github.com/aws/sagemaker-python-sdk/blob/master/migration.md for the migration guide. Set SAGEMAKER_SUPPRESS_V2_WARNING=1 to silence this warning.
  warn_v2_deprecation()
You are using the SageMaker Python SDK v2, which is on path of deprecation. v3 is the actively developed major version.
See https://github.com/aws/sagemaker-python-sdk/blob/master/migration.md for the migration guide. Set SAGEMAKER_SUPPRESS_V2_WARNING=1 to silence this warning.

[PILOT] run_id=run_1794691715
  Instance:     ml.g5.2xlarge
  Max runtime:  20 minutes
  Checkpoints:  s3://hack-princeton-s3/cranial/checkpoints/run_1794691715
  Spot:         False
/Users/viennguyen/hackprinceton/hack-princeton/app/cranial-env/lib/python3.9/site-packages/sagemaker/estimator.py:588: SageMakerV2DeprecationWarning: PyTorch is part of the SageMaker Python SDK v2, which is on path of deprecation. In v3, use `ModelTrainer` (`from sagemaker.train import ModelTrainer`).
See https://github.com/aws/sagemaker-python-sdk/blob/master/migration.md for the migration guide. Set SAGEMAKER_SUPPRESS_V2_WARNING=1 to silence this warning.
  warn_v2_deprecation(
PyTorch is part of the SageMaker Python SDK v2, which is on path of deprecation. In v3, use `ModelTrainer` (`from sagemaker.train import ModelTrainer`).
See https://github.com/aws/sagemaker-python-sdk/blob/master/migration.md for the migration guide. Set SAGEMAKER_SUPPRESS_V2_WARNING=1 to silence this warning.
/Users/viennguyen/hackprinceton/hack-princeton/app/cranial-env/lib/python3.9/site-packages/boto3/compat.py:89: PythonDeprecationWarning: Boto3 will no longer support Python 3.9 starting April 29, 2026. To continue receiving service updates, bug fixes, and security updates please upgrade to Python 3.10 or later. More information can be found here: https://aws.amazon.com/blogs/developer/python-support-policy-updates-for-aws-sdks-and-tools/
  warnings.warn(warning, PythonDeprecationWarning)

  Training data:   s3://hack-princeton-s3/cranial/processed/v1/train
  Validation data: s3://hack-princeton-s3/cranial/processed/v1/val

Submitting job... (this takes ~2 min to provision the instance)
INFO:sagemaker.image_uris:image_uri is not presented, retrieving image_uri based on instance_type, framework etc.
INFO:sagemaker:Creating training-job with name: cranial-pilot-run-1794691715
2026-11-14 21:28:38 Starting - Starting the training job
2026-11-14 21:28:38 Pending - Training job waiting for capacity.....................
2026-11-14 21:32:12 Pending - Preparing the instances for training...
2026-11-14 21:32:40 Downloading - Downloading input data...
2026-11-14 21:32:55 Downloading - Downloading the training image..............bash: cannot set terminal process group (-1): Inappropriate ioctl for device
bash: no job control in this shell
/opt/conda/lib/python3.10/site-packages/paramiko/pkey.py:100: CryptographyDeprecationWarning: TripleDES has been moved to cryptography.hazmat.decrepit.ciphers.algorithms.TripleDES and will be removed from this module in 48.0.0.
  "cipher": algorithms.TripleDES,
/opt/conda/lib/python3.10/site-packages/paramiko/transport.py:259: CryptographyDeprecationWarning: TripleDES has been moved to cryptography.hazmat.decrepit.ciphers.algorithms.TripleDES and will be removed from this module in 48.0.0.
  "class": algorithms.TripleDES,
2026-11-14 21:35:30,259 sagemaker-training-toolkit INFO     Imported framework sagemaker_pytorch_container.training
2026-11-14 21:35:30,281 sagemaker-training-toolkit INFO     No Neurons detected (normal if no neurons installed)
2026-11-14 21:35:30,290 sagemaker_pytorch_container.training INFO     Block until all host DNS lookups succeed.
2026-11-14 21:35:30,292 sagemaker_pytorch_container.training INFO     Invoking user training script.
2026-11-14 21:35:31,839 sagemaker-training-toolkit INFO     Installing dependencies from requirements.txt
Requirement already satisfied: torch==2.1.0 in /opt/conda/lib/python3.10/site-packages (from -r requirements.txt (line 1)) (2.1.0)
Collecting monai==1.3.0 (from -r requirements.txt (line 2))
Downloading monai-1.3.0-202310121228-py3-none-any.whl.metadata (10 kB)
Collecting SimpleITK==2.3.1 (from -r requirements.txt (line 3))
Downloading SimpleITK-2.3.1-cp310-cp310-manylinux_2_17_x86_64.manylinux2014_x86_64.whl.metadata (7.9 kB)
Collecting nibabel==5.2.1 (from -r requirements.txt (line 4))
Downloading nibabel-5.2.1-py3-none-any.whl.metadata (8.8 kB)
Requirement already satisfied: numpy==1.26.4 in /opt/conda/lib/python3.10/site-packages (from -r requirements.txt (line 5)) (1.26.4)
Collecting scipy==1.13.0 (from -r requirements.txt (line 6))
Downloading scipy-1.13.0-cp310-cp310-manylinux_2_17_x86_64.manylinux2014_x86_64.whl.metadata (60 kB)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 60.6/60.6 kB 3.5 MB/s eta 0:00:00
Requirement already satisfied: pandas==2.2.2 in /opt/conda/lib/python3.10/site-packages (from -r requirements.txt (line 7)) (2.2.2)
Requirement already satisfied: boto3>=1.34.0 in /opt/conda/lib/python3.10/site-packages (from -r requirements.txt (line 8)) (1.34.158)
Collecting scikit-image==0.22.0 (from -r requirements.txt (line 9))
Downloading scikit_image-0.22.0-cp310-cp310-manylinux_2_17_x86_64.manylinux2014_x86_64.whl.metadata (13 kB)
Collecting matplotlib==3.8.4 (from -r requirements.txt (line 10))
Downloading matplotlib-3.8.4-cp310-cp310-manylinux_2_17_x86_64.manylinux2014_x86_64.whl.metadata (5.8 kB)
Collecting pyyaml==6.0.1 (from -r requirements.txt (line 11))
Downloading PyYAML-6.0.1-cp310-cp310-manylinux_2_17_x86_64.manylinux2014_x86_64.whl.metadata (2.1 kB)
Requirement already satisfied: filelock in /opt/conda/lib/python3.10/site-packages (from torch==2.1.0->-r requirements.txt (line 1)) (3.15.4)
Requirement already satisfied: typing-extensions in /opt/conda/lib/python3.10/site-packages (from torch==2.1.0->-r requirements.txt (line 1)) (4.12.2)
Requirement already satisfied: sympy in /opt/conda/lib/python3.10/site-packages (from torch==2.1.0->-r requirements.txt (line 1)) (1.13.0)
Requirement already satisfied: networkx in /opt/conda/lib/python3.10/site-packages (from torch==2.1.0->-r requirements.txt (line 1)) (3.3)
Requirement already satisfied: jinja2 in /opt/conda/lib/python3.10/site-packages (from torch==2.1.0->-r requirements.txt (line 1)) (3.1.4)
Requirement already satisfied: fsspec in /opt/conda/lib/python3.10/site-packages (from torch==2.1.0->-r requirements.txt (line 1)) (2024.6.1)
Requirement already satisfied: packaging>=17 in /opt/conda/lib/python3.10/site-packages (from nibabel==5.2.1->-r requirements.txt (line 4)) (23.1)
Requirement already satisfied: python-dateutil>=2.8.2 in /opt/conda/lib/python3.10/site-packages (from pandas==2.2.2->-r requirements.txt (line 7)) (2.9.0)
Requirement already satisfied: pytz>=2020.1 in /opt/conda/lib/python3.10/site-packages (from pandas==2.2.2->-r requirements.txt (line 7)) (2024.1)
Requirement already satisfied: tzdata>=2022.7 in /opt/conda/lib/python3.10/site-packages (from pandas==2.2.2->-r requirements.txt (line 7)) (2024.1)
Requirement already satisfied: pillow>=9.0.1 in /opt/conda/lib/python3.10/site-packages (from scikit-image==0.22.0->-r requirements.txt (line 9)) (10.3.0)
Requirement already satisfied: imageio>=2.27 in /opt/conda/lib/python3.10/site-packages (from scikit-image==0.22.0->-r requirements.txt (line 9)) (2.34.2)
Collecting tifffile>=2022.8.12 (from scikit-image==0.22.0->-r requirements.txt (line 9))
Downloading tifffile-2025.5.10-py3-none-any.whl.metadata (31 kB)
Collecting lazy_loader>=0.3 (from scikit-image==0.22.0->-r requirements.txt (line 9))
Downloading lazy_loader-0.6-py3-none-any.whl.metadata (6.0 kB)
Requirement already satisfied: contourpy>=1.0.1 in /opt/conda/lib/python3.10/site-packages (from matplotlib==3.8.4->-r requirements.txt (line 10)) (1.2.1)
Requirement already satisfied: cycler>=0.10 in /opt/conda/lib/python3.10/site-packages (from matplotlib==3.8.4->-r requirements.txt (line 10)) (0.12.1)
Requirement already satisfied: fonttools>=4.22.0 in /opt/conda/lib/python3.10/site-packages (from matplotlib==3.8.4->-r requirements.txt (line 10)) (4.53.1)
Requirement already satisfied: kiwisolver>=1.3.1 in /opt/conda/lib/python3.10/site-packages (from matplotlib==3.8.4->-r requirements.txt (line 10)) (1.4.5)
Requirement already satisfied: pyparsing>=2.3.1 in /opt/conda/lib/python3.10/site-packages (from matplotlib==3.8.4->-r requirements.txt (line 10)) (3.1.2)
Requirement already satisfied: botocore<1.35.0,>=1.34.158 in /opt/conda/lib/python3.10/site-packages (from boto3>=1.34.0->-r requirements.txt (line 8)) (1.34.158)
Requirement already satisfied: jmespath<2.0.0,>=0.7.1 in /opt/conda/lib/python3.10/site-packages (from boto3>=1.34.0->-r requirements.txt (line 8)) (1.0.1)
Requirement already satisfied: s3transfer<0.11.0,>=0.10.0 in /opt/conda/lib/python3.10/site-packages (from boto3>=1.34.0->-r requirements.txt (line 8)) (0.10.2)
Requirement already satisfied: urllib3!=2.2.0,<3,>=1.25.4 in /opt/conda/lib/python3.10/site-packages (from botocore<1.35.0,>=1.34.158->boto3>=1.34.0->-r requirements.txt (line 8)) (1.26.19)
Requirement already satisfied: six>=1.5 in /opt/conda/lib/python3.10/site-packages (from python-dateutil>=2.8.2->pandas==2.2.2->-r requirements.txt (line 7)) (1.16.0)
Requirement already satisfied: MarkupSafe>=2.0 in /opt/conda/lib/python3.10/site-packages (from jinja2->torch==2.1.0->-r requirements.txt (line 1)) (2.1.5)
Requirement already satisfied: mpmath<1.4,>=1.1.0 in /opt/conda/lib/python3.10/site-packages (from sympy->torch==2.1.0->-r requirements.txt (line 1)) (1.3.0)
Downloading monai-1.3.0-202310121228-py3-none-any.whl (1.3 MB)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 1.3/1.3 MB 34.1 MB/s eta 0:00:00
Downloading SimpleITK-2.3.1-cp310-cp310-manylinux_2_17_x86_64.manylinux2014_x86_64.whl (52.7 MB)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 52.7/52.7 MB 89.2 MB/s eta 0:00:00
Downloading nibabel-5.2.1-py3-none-any.whl (3.3 MB)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 3.3/3.3 MB 117.3 MB/s eta 0:00:00
Downloading scipy-1.13.0-cp310-cp310-manylinux_2_17_x86_64.manylinux2014_x86_64.whl (38.6 MB)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 38.6/38.6 MB 89.9 MB/s eta 0:00:00
Downloading scikit_image-0.22.0-cp310-cp310-manylinux_2_17_x86_64.manylinux2014_x86_64.whl (14.7 MB)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 14.7/14.7 MB 103.6 MB/s eta 0:00:00
Downloading matplotlib-3.8.4-cp310-cp310-manylinux_2_17_x86_64.manylinux2014_x86_64.whl (11.6 MB)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 11.6/11.6 MB 96.4 MB/s eta 0:00:00
Downloading PyYAML-6.0.1-cp310-cp310-manylinux_2_17_x86_64.manylinux2014_x86_64.whl (705 kB)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 705.5/705.5 kB 64.3 MB/s eta 0:00:00
Downloading lazy_loader-0.6-py3-none-any.whl (8.8 kB)
Downloading tifffile-2025.5.10-py3-none-any.whl (226 kB)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 226.5/226.5 kB 25.9 MB/s eta 0:00:00
Installing collected packages: SimpleITK, tifffile, scipy, pyyaml, nibabel, lazy_loader, scikit-image, matplotlib, monai

2026-11-14 21:35:26 Training - Training image download completed. Training in progress.Attempting uninstall: scipy
Found existing installation: scipy 1.14.0
Uninstalling scipy-1.14.0:
Successfully uninstalled scipy-1.14.0
Attempting uninstall: pyyaml
Found existing installation: PyYAML 6.0.2
Uninstalling PyYAML-6.0.2:
Successfully uninstalled PyYAML-6.0.2
Attempting uninstall: matplotlib
Found existing installation: matplotlib 3.9.1
Uninstalling matplotlib-3.9.1:
Successfully uninstalled matplotlib-3.9.1
Successfully installed SimpleITK-2.3.1 lazy_loader-0.6 matplotlib-3.8.4 monai-1.3.0 nibabel-5.2.1 pyyaml-6.0.1 scikit-image-0.22.0 scipy-1.13.0 tifffile-2025.5.10
WARNING: Running pip as the 'root' user can result in broken permissions and conflicting behaviour with the system package manager, possibly rendering your system unusable.It is recommended to use a virtual environment instead: https://pip.pypa.io/warnings/venv. Use the --root-user-action option if you know what you are doing and want to suppress this warning.
[notice] A new release of pip is available: 24.1.2 -> 26.3
[notice] To update, run: pip install --upgrade pip
2026-11-14 21:35:43,557 sagemaker-training-toolkit INFO     Waiting for the process to finish and give a return code.
2026-11-14 21:35:43,557 sagemaker-training-toolkit INFO     Done waiting for a return code. Received 0 from exiting process.
2026-11-14 21:35:43,580 sagemaker-training-toolkit INFO     No Neurons detected (normal if no neurons installed)
2026-11-14 21:35:43,613 sagemaker-training-toolkit INFO     No Neurons detected (normal if no neurons installed)
2026-11-14 21:35:43,645 sagemaker-training-toolkit INFO     No Neurons detected (normal if no neurons installed)
2026-11-14 21:35:43,655 sagemaker-training-toolkit INFO     Invoking user script
Training Env:
{
    "additional_framework_parameters": {},
    "channel_input_dirs": {
        "training": "/opt/ml/input/data/training",
        "validation": "/opt/ml/input/data/validation"
    },
    "current_host": "algo-1",
    "current_instance_group": "homogeneousCluster",
    "current_instance_group_hosts": [
        "algo-1"
    ],
    "current_instance_type": "ml.g5.2xlarge",
    "distribution_hosts": [],
    "distribution_instance_groups": [],
    "framework_module": "sagemaker_pytorch_container.training:main",
    "hosts": [
        "algo-1"
    ],
    "hyperparameters": {
        "epochs": 0,
        "loss": "dice",
        "no-aug": true,
        "pilot": true,
        "pilot-cases": 3,
        "pilot-epochs": 200,
        "pilot-lr": 0.0005,
        "pilot-target-dice": 0.9,
        "seed": 42
    },
    "input_config_dir": "/opt/ml/input/config",
    "input_data_config": {
        "training": {
            "TrainingInputMode": "File",
            "S3DistributionType": "FullyReplicated",
            "RecordWrapperType": "None"
        },
        "validation": {
            "TrainingInputMode": "File",
            "S3DistributionType": "FullyReplicated",
            "RecordWrapperType": "None"
        }
    },
    "input_dir": "/opt/ml/input",
    "instance_groups": [
        "homogeneousCluster"
    ],
    "instance_groups_dict": {
        "homogeneousCluster": {
            "instance_group_name": "homogeneousCluster",
            "instance_type": "ml.g5.2xlarge",
            "hosts": [
                "algo-1"
            ]
        }
    },
    "is_hetero": false,
    "is_master": true,
    "is_modelparallel_enabled": null,
    "is_smddpmprun_installed": false,
    "is_smddprun_installed": true,
    "job_name": "cranial-pilot-run-1794691715",
    "log_level": 20,
    "master_hostname": "algo-1",
    "model_dir": "/opt/ml/model",
    "module_dir": "s3://hack-princeton-s3/cranial-pilot-run-1794691715/source/sourcedir.tar.gz",
    "module_name": "train",
    "network_interface_name": "eth0",
    "num_cpus": 8,
    "num_gpus": 1,
    "num_neurons": 0,
    "output_data_dir": "/opt/ml/output/data",
    "output_dir": "/opt/ml/output",
    "output_intermediate_dir": "/opt/ml/output/intermediate",
    "resource_config": {
        "current_host": "algo-1",
        "current_instance_type": "ml.g5.2xlarge",
        "current_group_name": "homogeneousCluster",
        "hosts": [
            "algo-1"
        ],
        "instance_groups": [
            {
                "instance_group_name": "homogeneousCluster",
                "instance_type": "ml.g5.2xlarge",
                "hosts": [
                    "algo-1"
                ]
            }
        ],
        "network_interface_name": "eth0",
        "topology": null
    },
    "user_entry_point": "train.py"
}
Environment variables:
SM_HOSTS=["algo-1"]
SM_NETWORK_INTERFACE_NAME=eth0
SM_HPS={"epochs":0,"loss":"dice","no-aug":true,"pilot":true,"pilot-cases":3,"pilot-epochs":200,"pilot-lr":0.0005,"pilot-target-dice":0.9,"seed":42}
SM_USER_ENTRY_POINT=train.py
SM_FRAMEWORK_PARAMS={}
SM_RESOURCE_CONFIG={"current_group_name":"homogeneousCluster","current_host":"algo-1","current_instance_type":"ml.g5.2xlarge","hosts":["algo-1"],"instance_groups":[{"hosts":["algo-1"],"instance_group_name":"homogeneousCluster","instance_type":"ml.g5.2xlarge"}],"network_interface_name":"eth0","topology":null}
SM_INPUT_DATA_CONFIG={"training":{"RecordWrapperType":"None","S3DistributionType":"FullyReplicated","TrainingInputMode":"File"},"validation":{"RecordWrapperType":"None","S3DistributionType":"FullyReplicated","TrainingInputMode":"File"}}
SM_OUTPUT_DATA_DIR=/opt/ml/output/data
SM_CHANNELS=["training","validation"]
SM_CURRENT_HOST=algo-1
SM_CURRENT_INSTANCE_TYPE=ml.g5.2xlarge
SM_CURRENT_INSTANCE_GROUP=homogeneousCluster
SM_CURRENT_INSTANCE_GROUP_HOSTS=["algo-1"]
SM_INSTANCE_GROUPS=["homogeneousCluster"]
SM_INSTANCE_GROUPS_DICT={"homogeneousCluster":{"hosts":["algo-1"],"instance_group_name":"homogeneousCluster","instance_type":"ml.g5.2xlarge"}}
SM_DISTRIBUTION_INSTANCE_GROUPS=[]
SM_IS_HETERO=false
SM_MODULE_NAME=train
SM_LOG_LEVEL=20
SM_FRAMEWORK_MODULE=sagemaker_pytorch_container.training:main
SM_INPUT_DIR=/opt/ml/input
SM_INPUT_CONFIG_DIR=/opt/ml/input/config
SM_OUTPUT_DIR=/opt/ml/output
SM_NUM_CPUS=8
SM_NUM_GPUS=1
SM_NUM_NEURONS=0
SM_MODEL_DIR=/opt/ml/model
SM_MODULE_DIR=s3://hack-princeton-s3/cranial-pilot-run-1794691715/source/sourcedir.tar.gz
SM_TRAINING_ENV={"additional_framework_parameters":{},"channel_input_dirs":{"training":"/opt/ml/input/data/training","validation":"/opt/ml/input/data/validation"},"current_host":"algo-1","current_instance_group":"homogeneousCluster","current_instance_group_hosts":["algo-1"],"current_instance_type":"ml.g5.2xlarge","distribution_hosts":[],"distribution_instance_groups":[],"framework_module":"sagemaker_pytorch_container.training:main","hosts":["algo-1"],"hyperparameters":{"epochs":0,"loss":"dice","no-aug":true,"pilot":true,"pilot-cases":3,"pilot-epochs":200,"pilot-lr":0.0005,"pilot-target-dice":0.9,"seed":42},"input_config_dir":"/opt/ml/input/config","input_data_config":{"training":{"RecordWrapperType":"None","S3DistributionType":"FullyReplicated","TrainingInputMode":"File"},"validation":{"RecordWrapperType":"None","S3DistributionType":"FullyReplicated","TrainingInputMode":"File"}},"input_dir":"/opt/ml/input","instance_groups":["homogeneousCluster"],"instance_groups_dict":{"homogeneousCluster":{"hosts":["algo-1"],"instance_group_name":"homogeneousCluster","instance_type":"ml.g5.2xlarge"}},"is_hetero":false,"is_master":true,"is_modelparallel_enabled":null,"is_smddpmprun_installed":false,"is_smddprun_installed":true,"job_name":"cranial-pilot-run-1794691715","log_level":20,"master_hostname":"algo-1","model_dir":"/opt/ml/model","module_dir":"s3://hack-princeton-s3/cranial-pilot-run-1794691715/source/sourcedir.tar.gz","module_name":"train","network_interface_name":"eth0","num_cpus":8,"num_gpus":1,"num_neurons":0,"output_data_dir":"/opt/ml/output/data","output_dir":"/opt/ml/output","output_intermediate_dir":"/opt/ml/output/intermediate","resource_config":{"current_group_name":"homogeneousCluster","current_host":"algo-1","current_instance_type":"ml.g5.2xlarge","hosts":["algo-1"],"instance_groups":[{"hosts":["algo-1"],"instance_group_name":"homogeneousCluster","instance_type":"ml.g5.2xlarge"}],"network_interface_name":"eth0","topology":null},"user_entry_point":"train.py"}
SM_USER_ARGS=["--epochs","0","--loss","dice","--no-aug","True","--pilot","True","--pilot-cases","3","--pilot-epochs","200","--pilot-lr","0.0005","--pilot-target-dice","0.9","--seed","42"]
SM_OUTPUT_INTERMEDIATE_DIR=/opt/ml/output/intermediate
SM_CHANNEL_TRAINING=/opt/ml/input/data/training
SM_CHANNEL_VALIDATION=/opt/ml/input/data/validation
SM_HP_EPOCHS=0
SM_HP_LOSS=dice
SM_HP_NO-AUG=true
SM_HP_PILOT=true
SM_HP_PILOT-CASES=3
SM_HP_PILOT-EPOCHS=200
SM_HP_PILOT-LR=0.0005
SM_HP_PILOT-TARGET-DICE=0.9
SM_HP_SEED=42
PYTHONPATH=/opt/ml/code:/opt/conda/bin:/opt/conda/lib/python310.zip:/opt/conda/lib/python3.10:/opt/conda/lib/python3.10/lib-dynload:/opt/conda/lib/python3.10/site-packages
Invoking script with the following command:
/opt/conda/bin/python3.10 train.py --epochs 0 --loss dice --no-aug True --pilot True --pilot-cases 3 --pilot-epochs 200 --pilot-lr 0.0005 --pilot-target-dice 0.9 --seed 42
2026-11-14 21:35:43,657 sagemaker-training-toolkit INFO     Exceptions not imported for SageMaker Debugger as it is not installed.
2026-11-14 21:35:43,657 sagemaker-training-toolkit INFO     Exceptions not imported for SageMaker TF as Tensorflow is not installed.
2026-11-14 21:35:45,157 [INFO] Device: cuda
2026-11-14 21:35:45,157 [INFO] AMP: True
2026-11-14 21:35:45,157 [INFO] Config: {
  "data_dir": "/opt/ml/input/data/training",
  "val_dir": "/opt/ml/input/data/validation",
  "model_dir": "/opt/ml/checkpoints",
  "output_dir": "/opt/ml/output/data",
  "epochs": 0,
  "lr": 0.0001,
  "weight_decay": 1e-05,
  "batch_size": 1,
  "seed": 42,
  "threshold": 0.5,
  "early_stop_patience": 15,
  "no_amp": false,
  "no_aug": true,
  "loss": "dice",
  "pilot": true,
  "pilot_cases": 3,
  "pilot_epochs": 200,
  "pilot_lr": 0.0005,
  "pilot_target_dice": 0.9,
  "resume": ""
}
2026-11-14 21:35:45,552 [INFO] generated new fontManager
2026-11-14 21:35:47,130 [INFO] Git commit:
2026-11-14 21:35:47,313 [INFO] Model parameters: 4,805,534
2026-11-14 21:35:47,362 [INFO] Dataset: 91 pairs in /opt/ml/input/data/training
2026-11-14 21:35:47,366 [INFO] Dataset: 23 pairs in /opt/ml/input/data/validation
2026-11-14 21:35:47,369 [INFO] Dataset: 91 pairs in /opt/ml/input/data/training
2026-11-14 21:35:47,418 [INFO] === PILOT: overfitting 3 cases for ≤200 epochs ===
2026-11-14 21:35:49,131 [INFO]   Pilot epoch 1/200: dice=0.0066 loss=0.996424 pred_voxels=13680592 target_voxels=83594 max_probability=1.000000 amp_scale=65536.0
2026-11-14 21:36:00,688 [INFO]   Pilot epoch 10/200: dice=0.0421 loss=0.994403 pred_voxels=3293628 target_voxels=83594 max_probability=1.000000 amp_scale=65536.0
2026-11-14 21:36:13,506 [INFO]   Pilot epoch 20/200: dice=0.0824 loss=0.994006 pred_voxels=1703996 target_voxels=83594 max_probability=1.000000 amp_scale=65536.0
2026-11-14 21:36:26,320 [INFO]   Pilot epoch 30/200: dice=0.0730 loss=0.993483 pred_voxels=2296179 target_voxels=83594 max_probability=1.000000 amp_scale=65536.0
2026-11-14 21:36:39,141 [INFO]   Pilot epoch 40/200: dice=0.1348 loss=0.993016 pred_voxels=1152779 target_voxels=83594 max_probability=1.000000 amp_scale=65536.0
2026-11-14 21:36:51,959 [INFO]   Pilot epoch 50/200: dice=0.2181 loss=0.992929 pred_voxels=668091 target_voxels=83594 max_probability=1.000000 amp_scale=65536.0
2026-11-14 21:37:04,790 [INFO]   Pilot epoch 60/200: dice=0.2865 loss=0.992852 pred_voxels=484664 target_voxels=83594 max_probability=1.000000 amp_scale=65536.0
2026-11-14 21:37:17,632 [INFO]   Pilot epoch 70/200: dice=0.3126 loss=0.992777 pred_voxels=436734 target_voxels=83594 max_probability=1.000000 amp_scale=65536.0
2026-11-14 21:37:30,458 [INFO]   Pilot epoch 80/200: dice=0.3068 loss=0.992699 pred_voxels=448456 target_voxels=83594 max_probability=1.000000 amp_scale=65536.0
2026-11-14 21:37:43,280 [INFO]   Pilot epoch 90/200: dice=0.2750 loss=0.992616 pred_voxels=514922 target_voxels=83594 max_probability=1.000000 amp_scale=65536.0
2026-11-14 21:37:56,123 [INFO]   Pilot epoch 100/200: dice=0.1565 loss=0.992549 pred_voxels=1052148 target_voxels=83594 max_probability=1.000000 amp_scale=65536.0
2026-11-14 21:38:08,958 [INFO]   Pilot epoch 110/200: dice=0.1408 loss=0.992427 pred_voxels=1095355 target_voxels=83594 max_probability=1.000000 amp_scale=65536.0
2026-11-14 21:38:21,776 [INFO]   Pilot epoch 120/200: dice=0.1207 loss=0.992271 pred_voxels=1294280 target_voxels=83594 max_probability=1.000000 amp_scale=65536.0
2026-11-14 21:38:34,608 [INFO]   Pilot epoch 130/200: dice=0.0825 loss=0.992054 pred_voxels=1945589 target_voxels=83594 max_probability=1.000000 amp_scale=65536.0
2026-11-14 21:38:47,457 [INFO]   Pilot epoch 140/200: dice=0.0491 loss=0.992374 pred_voxels=3026315 target_voxels=83594 max_probability=1.000000 amp_scale=65536.0
2026-11-14 21:39:00,298 [INFO]   Pilot epoch 150/200: dice=0.0339 loss=0.991402 pred_voxels=4802194 target_voxels=83594 max_probability=1.000000 amp_scale=65536.0
2026-11-14 21:39:13,147 [INFO]   Pilot epoch 160/200: dice=0.0326 loss=0.990583 pred_voxels=5008704 target_voxels=83594 max_probability=1.000000 amp_scale=65536.0
2026-11-14 21:39:25,977 [INFO]   Pilot epoch 170/200: dice=0.0303 loss=0.989435 pred_voxels=5421176 target_voxels=83594 max_probability=1.000000 amp_scale=65536.0
2026-11-14 21:39:38,812 [INFO]   Pilot epoch 180/200: dice=0.0246 loss=0.988865 pred_voxels=6759036 target_voxels=83594 max_probability=1.000000 amp_scale=65536.0
2026-11-14 21:39:51,665 [INFO]   Pilot epoch 190/200: dice=0.0284 loss=0.986277 pred_voxels=5803887 target_voxels=83594 max_probability=1.000000 amp_scale=65536.0
2026-11-14 21:40:04,553 [INFO]   Pilot epoch 200/200: dice=0.0319 loss=0.984055 pred_voxels=5171098 target_voxels=83594 max_probability=1.000000 amp_scale=65536.0
2026-11-14 21:40:04,553 [ERROR] Pilot FAILED: Dice=0.0319 < 0.9 after 200 epochs. Check label alignment, loss target, gradient flow, and crop completeness.
2026-11-14 21:40:04,567 [ERROR] Pilot failed — stopping before full training run. Fix the model/data first.
2026-11-14 21:40:05,467 sagemaker-training-toolkit INFO     Waiting for the process to finish and give a return code.
2026-11-14 21:40:05,467 sagemaker-training-toolkit INFO     Done waiting for a return code. Received 2 from exiting process.
2026-11-14 21:40:05,468 sagemaker-training-toolkit ERROR    Reporting training FAILURE
2026-11-14 21:40:05,468 sagemaker-training-toolkit ERROR    ExecuteUserScriptError:
ExitCode 2
ErrorMessage ""
Command "/opt/conda/bin/python3.10 train.py --epochs 0 --loss dice --no-aug True --pilot True --pilot-cases 3 --pilot-epochs 200 --pilot-lr 0.0005 --pilot-target-dice 0.9 --seed 42"
2026-11-14 21:40:05,468 sagemaker-training-toolkit ERROR    Encountered exit_code 1