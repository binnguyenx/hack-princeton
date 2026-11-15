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
---

## 7. Setup change after run_1794691715 — 2026-11-14

### Insight from the last pilot (not a new theory of labels)

`cranial-pilot-run-1794691715` (`pilot-lr=0.0005`, AMP on) did learn, then died:

| Epoch | Hard Dice | Soft loss | Pred voxels / 3 cases | Target voxels |
|------:|----------:|----------:|----------------------:|--------------:|
| 1 | 0.0066 | 0.996 | 13.7M | 83.6k |
| 70 | **0.3126** | 0.993 | 437k | 83.6k |
| 200 | 0.0319 | 0.984 | **5.2M** | 83.6k |

Reading that against prior runs:

1. Soft Dice loss stayed ~0.99 while hard Dice briefly reached 0.31 — the training objective and the gate metric disagree. Soft probability mass on background keeps soft Dice near zero; thresholded Dice can still look briefly okay.
2. After the peak, predictions ballooned again. Reporting epoch-200 Dice hid the real peak. The pilot loop had no best-score gate and no patience stop.
3. `pilot-lr=0.005` + AMP hit non-finite logits (~epoch 26). `0.0005` stayed finite but never finished the job in 200 epochs. Mid LR without AMP is the next single paid experiment.
4. The only prior Dice ≥0.90 result was on a **downsampled** grid, not full 256³. That is still the fallback if this job stalls below a usable peak. Not applied in this change.

Demo target (~0.6–0.7 overlap) is **held-out** quality later. The pilot gate remains ≥0.90 on 3 memorized cases; this change only tries to make that plumbing check reachable without burning past the peak.

### Code / launcher changes (hypothesis, not proven convergence)

1. `train.py` `run_pilot`:
   - Gate on **best** Dice, not final epoch.
   - Early-stop when best Dice does not improve for `--pilot-patience` (default 40).
   - Log `best=@epoch` next to current Dice.
   - When AMP is off, use plain `loss.backward()` / `optimizer.step()` (no GradScaler path).
2. Pilot AMP **off by default** (`--pilot-amp` to re-enable). Full-run AMP unchanged.
3. Default `--pilot-lr` → **0.001** in `train.py` and `launch_training.py` (between the NaN and stall settings).
4. Regression: `test_pilot_passes_on_best_dice_and_stops_when_patience_expires`.

Local verification after the change:
```sh
PYTHONPATH=/tmp/cranial-verify-deps MPLCONFIGDIR=/tmp/cranial-mpl \
  app/cranial-env/bin/python -m pytest ml/cranial/tests -q
```

### Next paid job (user runs)

```sh
python ml/cranial/launch_training.py --mode pilot
```

Expected hyperparameters: `pilot-lr=0.001`, `pilot-amp=false`, `pilot-patience=40`, pure Dice, unaugmented 3 cases, ≤20 min SageMaker cap. Watch for `best=` climbing and either PASS ≥0.90 or early-stop with an honest peak. If peak stays well below ~0.6 with finite loss, next step is 128³ prep — not another blind LR sweep. Convergence is unverified until this job finishes.

---

## 8. run_1794715417 result + switch to 128³ (v2) — 2026-11-14

### Result (hypothesis from §7 tested)

Job `cranial-pilot-run-1794715417`: `pilot-lr=0.001`, `pilot-amp=false`, `patience=40`, pure Dice, 256³ `processed/v1`.

| Epoch | Dice | Best | Pred voxels | Target |
|------:|-----:|-----:|------------:|-------:|
| 1 | 0.0085 | 0.0085@1 | 11.1M | 83.6k |
| 36 | — | **0.2415@36** | — | 83.6k |
| 40 | 0.2360 | 0.2415@36 | 612k | 83.6k |
| 76 | 0.0430 | 0.2415@36 | 3.8M | 83.6k |

Early-stop fired correctly. Soft loss still ~0.99. Peak **worse** than `…1715` (0.31 at lr 0.0005+AMP). Conclusion: float32 + mid LR does not unlock full-resolution overfit. Stop spending GPU on 256³ LR/AMP ablations.

### Setup change (authorized)

1. `configs/prepare.yaml`: `target_shape: [128, 128, 128]`, `processed_version: v2`, manifests `split_v2.csv` / `audit_v2.json`. Leave S3 `processed/v1` untouched.
2. `upload_processed.py`: reads version/paths from prepare.yaml (no hard-coded v1).
3. `launch_training.py`: default `PROCESSED_VERSION=v2`.

U-Net strides still divide 128 (128/2⁴ = 8). Soft edges vs 256³ are acceptable for the pilot/demo path; held-out quality still unproven until a pilot passes.

### Commands for the user (repo root, cranial-env)

Raw SkullBreak must already be under `/tmp/skullbreak/` (or re-run the loader). Then:

```sh
source app/cranial-env/bin/activate
python ml/cranial/prepare_data.py --config ml/cranial/configs/prepare.yaml --round-trip-only
python ml/cranial/prepare_data.py --config ml/cranial/configs/prepare.yaml
python ml/cranial/audit_data.py --manifest ml/cranial/manifests/split_v2.csv --visualize --n-vis 3
python ml/cranial/upload_processed.py
PROCESSED_VERSION=v2 python ml/cranial/launch_training.py --mode pilot
```

Expect logs to show `processed/v2` and ~128³ tensors. Pilot gate remains Dice ≥ 0.90 on 3 cases. Convergence unverified until that job finishes.

### v2 spacing fix (same day)

`prepare` at `target_shape=128³` with `target_spacing=1.0` failed immediately: resampled size `[205,205,205]` exceeds 128 (reject_oversized). That is expected — the full skull is ~205 mm.

Fix: set `target_spacing: [2.0, 2.0, 2.0]` with `target_shape: [128,128,128]`. Linear size halves vs v1, so cases that fit in 256@1mm fit in 128@2mm. Re-run round-trip then full prepare; do not clip.

---

## 9. Decision: accepted pilot recipe (R7 passed) — 2026-11-14

### Result

Job `cranial-pilot-run-1794717579` **PASSED** R7 overfit gate.

| Setting | Value |
|---------|--------|
| Data | `s3://…/cranial/processed/v2` (2 mm isotropic, 128³) |
| Loss | pure soft Dice |
| Pilot AMP | off (`pilot-amp=false`) |
| Pilot LR | **0.005** |
| Patience | 40 (best-Dice gate) |
| Cases | 3 train, no aug |
| Peak | **best Dice = 0.9043 @ epoch 89** (loss≈0.097, pred≈9890 vs target 10450) |

Failed recipes that led here (do not revisit as first experiments):

| Job | Grid | LR | AMP | Peak hard Dice |
|-----|------|----|-----|----------------|
| …1715 | v1 256@1mm | 0.0005 | on | 0.31 then collapse |
| …5417 | v1 256@1mm | 0.001 | off | 0.24 |
| …7046 | v2 128@2mm | 0.001 | off | 0.23 |
| **…7579** | **v2 128@2mm** | **0.005** | **off** | **0.90 PASS** |

### Decision (locked for next full run)

1. **Training cache:** processed **v2** only for the first claimed train/eval path until a later owner decision reopens v1 (1 mm / 256³).
2. **Pilot gate recipe:** `--pilot-lr 0.005`, pilot AMP off, pure Dice, best-Dice + patience. Passes R7; this is a **memorization check**, not a demo or held-out score.
3. **Do not freeze or evaluate the pilot-only job artifacts** as the product model. Pilot mode with `epochs=0` does not produce the full-run `best.pt` to ship.
4. **Next job:** full training with the same data/pilot gate:
   ```sh
   PROCESSED_VERSION=v2 python ml/cranial/launch_training.py --mode full --pilot-lr 0.005
   ```
   Full-run optimization LR remains the launcher full `--lr` default unless separately changed. Val Dice selects `best.pt`; only then freeze and run `evaluate.py` on test.
5. **Demo target (~0.6–0.7)** remains a **held-out** bar after Phase 7/8 — not satisfied by this pilot.

Recorded in feature docs as **D7**.

---

## 10. Transparency: what the pilot is, what Dice means, and why we keep the gate — 2026-11-14

Written so a later teammate (or us at 3am) does not confuse “pilot passed” with “demo ready.”

### Pieces of the system (plain language)

| Term | What it is |
|------|------------|
| **U-Net** | The neural net architecture (MONAI 3D U-Net). Input = defective skull mask; output = per-voxel score for “missing bone.” This is the model we train. |
| **Hard Dice** | Overlap accuracy after thresholding scores at 0.5. `2\|P∩T\| / (\|P\|+\|T\|)`. 0 = no overlap, 1 = perfect. This is what the pilot gate and val/test reports use. |
| **Soft Dice (loss)** | Continuous version of Dice on probabilities (before hard threshold). Training minimizes `1 − soft Dice`. Can disagree with hard Dice when lots of soft probability sits on background. |
| **Pilot** | Cheap overfit gate (spec R7): train a **throwaway** net on **3 fixed training cases**, no augmentation, require hard Dice ≥ **0.90** on those **same** 3. If fail → exit before full train. |
| **Full train** | New model from scratch on **91** train cases (aug on). Pick `best.pt` by **validation** Dice on **23** subjects. |
| **Freeze + test** | After choosing `best.pt` on validation only, lock config and score the **20** official test subjects (and optionally MUG500+ B later). That is the presentable held-out claim. |

### What the pilot specifically does in code

1. Build a fresh U-Net (not reused for full train).
2. Load 3 unaugmented train pairs (`make_pilot_loader`).
3. Optimize with pure soft Dice, typically `pilot-lr=0.005`, AMP **off** (D7).
4. Each epoch: train on those 3, then evaluate hard Dice on those 3.
5. Track **best** Dice; early-stop if no improvement for `pilot-patience` (40).
6. Pass if best ≥ 0.90; else fail the job (`exit 2`) so SageMaker does not continue to full train.
7. Delete pilot weights. Full train always starts from a **new** random init.

Pilot is **intentional cheating** (train and score on the same tiny set). That is the point: if it cannot memorize 3 open flashcards, the pen/ink/grading are broken.

### Why keep the pilot if full train is the real work?

Full train does **not** need the pilot’s weights. The pilot answers a different question:

> “Is this loss / LR / precision / grid / label path capable of learning *at all*?”

We kept burning that question the hard way. Chronology of insights:

1. **Dice+BCE on 256³** → model learned “predict empty” (class imbalance); hard Dice ~0.
2. **Pure Dice** fixed the empty-trap in downsampled experiments, not automatically at full res.
3. **Soft loss stuck ~0.99 while hard Dice peeked then collapsed** → objective vs metric mismatch; reporting final-epoch Dice hid peaks → added best-Dice + patience.
4. **`pilot-lr=0.005` + AMP on 256³** → non-finite logits; float32 pilot became default.
5. **`pilot-lr=0.001` on 256³ and on v2 128³** → peak hard Dice ~0.23–0.31, then ballooning FPs.
6. **v2 (2 mm / 128³) alone** did not fix learning at lr 0.001.
7. **v2 + `pilot-lr=0.005` + no AMP** → first real SageMaker R7 pass (`…7579`, Dice 0.9043 @ ep 89). Locked as **D7**.

Each failed full-shaped attempt would have cost ~provisioning + up to 1 hour. Pilot fails in minutes. So the gate is **insurance**, not pedagogy for the final model.

Once D7 is trusted, `--skip-pilot` on `--mode full` is allowed to save ~few minutes. Default remains “run pilot” because silent no-learning failures were common. Skipping does **not** change the full-train math; it only removes the fuse.

### What we present vs what we do not

| Artifact | Present as demo / paper-style held-out? |
|----------|----------------------------------------|
| Pilot Dice 0.90 | **No** — memorization check only |
| Val Dice during full train | **Model selection only** — not the final claim; can overfit to val if you peek forever |
| Test Dice after freeze | **Yes** — primary synthetic held-out claim |
| MUG500+ B | **Separate** domain-shift table, or “not run” |

Demo wish (~0.6–0.7 overlap) means **held-out** (val during iteration, test for the report), not pilot.

### Soft Dice vs hard Dice (recurring insight)

On sparse implants (~0.1–0.25% of voxels), soft Dice can stay near 0 (loss ~0.99) while hard Dice briefly looks better: many voxels have mid probabilities that hurt soft Dice but stay under 0.5 so they don’t count in hard Dice—until they cross 0.5 and predictions balloon. Always log **pred_voxels vs target_voxels**, **loss**, and **best hard Dice** together. Do not trust a single number.

### Grid decision (v1 vs v2)

- **v1:** 1 mm, 256³ — matches earlier R4 wording; failed to overfit under the LRs we could keep numerically stable in time.
- **v2:** 2 mm, 128³ — coarser; anything that fit in 256@1mm fits in 128@2mm; first passing pilot. Softer bone edges; acceptable for first demo path. v1 left on S3 untouched.

### Full-run note (in progress at time of writing)

`cranial-full-run-1794717924`: D7 pilot re-passed (0.9043 @ 89), then full train with `lr=0.0002`, aug on, AMP on for the full loop. Early val Dice climbed to ~0.12 by epoch 6 then slipped while soft loss stayed ~0.99. That does **not** invalidate the pilot; it means **generalization under full-run hyperparameters is a separate problem** from “can we overfit 3 cases.” Revisit full `lr` / crop / loss only after this job’s best val Dice is known—do not confuse with reopening the pilot fuse without evidence.

### Operator checklist

```sh
# Pilot only (fuse)
PROCESSED_VERSION=v2 python ml/cranial/launch_training.py --mode pilot --pilot-lr 0.005

# Full train (default includes pilot gate)
PROCESSED_VERSION=v2 python ml/cranial/launch_training.py --mode full --pilot-lr 0.005

# Full train without re-running pilot (only if D7 still trusted)
PROCESSED_VERSION=v2 python ml/cranial/launch_training.py --mode full --pilot-lr 0.005 --skip-pilot
```

Confirm launcher prints `Processed ver: v2`. Never freeze pilot-only artifacts. Freeze only after val-selected `best.pt` from a full run.

---

## 11. Full run `cranial-full-run-1794717924` — val Dice ~0.12 (not demo-ready) — 2026-11-15

### What happened

D7 pilot gate re-passed inside the full job (best Dice 0.9043 @ epoch 89 on 3 cases), then a **new** U-Net trained on 91 cases with aug on.

| Setting | Value |
|---------|--------|
| Data | processed **v2** (2 mm / 128³) |
| Pilot | `pilot-lr=0.005`, AMP off → PASS |
| Full train LR | **`lr=0.0002`** (launcher default) |
| Full AMP | on |
| Aug | on (`no-aug=false`) |
| Early stop patience | 15 |
| Saved `best.pt` | epoch **5**, **`best_val_dice ≈ 0.1156`** |

Artifacts downloaded to repo as `ml/best.pt` + `ml/freeze_candidate.json` (checkpoint path on S3: `cranial/checkpoints/run_1794717924/`). SageMaker `training-output/.../output/` was empty by design — weights sync via the **checkpoints** prefix, not that folder.

### Is bad performance “too little data”?

**Unlikely as the main cause of 0.12.** Reasons:

1. **Same 91-case pool / same v2 grid that the pilot proved learnable.** The fuse showed a U-Net + pure Dice **can** fit cranial implants on this data when the optimizer steps are large enough (`pilot-lr=0.005` → 0.90 on 3 cases). That rules out “labels are pure noise” and “architecture can’t represent the task at all.”
2. **91 subjects is small for a robust clinical model**, and it **can** cap *how high* held-out Dice eventually goes (demo 0.6–0.7 may be hard; SOTA papers often use more skulls/variants). But “best val = 0.12 after peaking at epoch 5 then sliding” looks like **optimization / train–val dynamics**, not a hard data-volume floor. With too little data you’d more often see **train improving while val plateaus mid-range**, or mild overfitting to ~0.3–0.5 — not almost-no-signal on val while the identical stack overfits 3 cases at lr 0.005.
3. **Primary suspect: full-run learning rate ~25× smaller than the only LR that worked.** Pilot needed **0.005**. Full train used **0.0002**. Soft train/val loss stayed ~0.99 while hard val Dice briefly hit ~0.12 then fell — the same soft/hard mismatch pattern from failed low-LR pilots (§7–§8). Early stop will tend to keep a weak `best.pt` if nothing later beats epoch 5.
4. **Secondary factors (real, but secondary to LR here):**
   - Full train starts from **scratch** (pilot weights discarded by design) — expected; not a bug.
   - **Augmentation on** makes each epoch harder than the unaugmented pilot; with a tiny LR that can stall.
   - **AMP on** for the full loop (pilot was float32); less likely than LR given v2 size, still a confounder.
   - **Class imbalance / soft Dice** still fights sparse implants; higher LR was what finally moved soft loss on the pilot.
   - Coarser **v2** grid softens thin bone — affects ceiling quality, not “stuck at 0.12.”

### Decision / next experiment

1. **Do not freeze or present** `ml/best.pt` from `…7924` as a working demo. Val ≈ 0.12 is failure for the product claim.
2. **Next full job — change one main knob:** raise full `--lr` to match the working pilot scale:
   ```sh
   PROCESSED_VERSION=v2 python ml/cranial/launch_training.py --mode full --pilot-lr 0.005 --lr 0.005
   ```
   Hypothesis: underpowered AdamW steps, not “need 10× more skulls first.” If this NaNs or collapses, try `--lr 0.001` or full `--no-amp` next — still before collecting a new dataset.
3. **When to blame data volume:** if a well-optimized full run reaches decent **train** Dice but **val/test** stay &lt; ~0.4 with healthy loss curves, then expand data (more SkullBreak categories / SkullFix / synthetic defects) or regularize. That is a later diagnosis.
4. Operator note: always read `best_dice` from `best.pt` or `metrics.jsonl` under `s3://…/cranial/checkpoints/run_*/`, not `training-output/.../output/`.

### Transparency one-liner

Pilot 0.90 = “the pen works.” Full val 0.12 = “the real exam failed,” most likely because we took the exam with a much smaller pen stroke (`lr=0.0002`) than the stroke that passed the fuse (`0.005`), not because 91 skulls make learning impossible.

---

## 12. Training-loop fixes before the D9 retry — 2026-11-15

### Finding: the flip augmentation turned skulls upside down

`SkullDataset` returns tensors shaped `[C, z, y, x]` (SimpleITK array order). The training augmentation used `RandFlipd(spatial_axis=0)`, which is the first **spatial** axis = **z (superior–inferior)**. So about half of all training samples during full train were upside-down skulls. Validation and test are never flipped. The mirror baseline in `evaluate.py` mirrors image X (array axis 2) — the left-right axis the augmentation was supposed to use.

This fits the pattern we kept seeing:

| Run | Augmentation | Result |
|-----|--------------|--------|
| Pilot `…7579` | off | best Dice 0.90 on 3 cases (memorization works) |
| Full `…7924` | **on (z-flip bug)** | best val Dice 0.12 @ epoch 5, then slid |

The z-flip is not the only possible cause (full LR was also 25× lower than the pilot's, see §11), but it is a real bug, and it would hurt even a well-tuned LR. Both are fixed or changeable before the next paid run.

### Changes (spec D10)

1. **Flip axis:** `spatial_axis=2` (x, left–right). Parietotemporal defects flipped left–right stay realistic: the defect simply moves to the other side.
2. **LR schedule:** new `lr_for_epoch()` — linear warmup for `--warmup-epochs` (default 5), then cosine decay from `--lr` down to 1% of it on the last epoch. It is a pure function of the epoch index, so `latest.pt` resume lands on the same LR without saving scheduler state. Applies to full train only; the pilot (D7) is unchanged.
3. **Early-stop patience:** default 30 (was 15) in `train.py` and the launcher. 23 val subjects give noisy val Dice; patience 15 stopped `…7924` right after an epoch-5 peak.
4. **Diagnostics:** every epoch now logs `lr` and **`train_dice`** (hard Dice on the augmented training batches) in the log line and `metrics.jsonl`. This is the number we were missing to decide whether to blame data volume:
   - train Dice high, val Dice low → generalization problem → more data (all 5 SkullBreak categories) / regularization.
   - train Dice low too → still an optimization/target problem → consider predicting the complete skull (D1 alternative).
5. Launcher: `--early-stop-patience` and `--warmup-epochs` flags, passed through as hyperparameters.

### Verification (local, CPU)

New regression tests in `ml/cranial/tests/test_pipeline.py`:

- `test_augmentation_mirrors_only_left_right_never_upside_down` — blob in a corner; over 20 augmented samples its z and y centre never cross the midline, and the x centre does sometimes. Failed before the fix (`z centre 76.7`), passes after.
- `test_lr_schedule_warms_up_then_cosine_decays_to_floor`, `test_lr_schedule_without_warmup_starts_at_base` — hand-worked values (base 0.005: epoch 0 → 0.001, epoch 4 → 0.005, cosine midpoint → 0.002525, last → 0.00005).
- `test_full_training_defaults_tolerate_noisy_validation` — patience 30, warmup 5.
- `test_train_epoch_reports_hard_dice_on_training_cases` — perfect logits → train Dice 1.0, empty → 0.0.

Result: `39 passed` (was 33). A 3-epoch CPU smoke run of `train.main()` on synthetic 32³ data logged `lr=2.50e-03 → 5.00e-03 → 5.00e-05` and `train_dice` per epoch in `metrics.jsonl`.

Local tests ran on torch 2.15 / MONAI 1.6 in a throwaway Python 3.13 environment (no torch 2.1 wheel for 3.13); SageMaker still uses the pinned versions in `requirements.txt`. `launch_training.py` was only compile-checked, because it imports `sagemaker`.

Known local-only quirk (pre-existing, not changed): on macOS, `train.py` with `num_workers>0` fails with `cannot pickle 'module' object` because the dataset stores the SimpleITK module and macOS starts worker processes with spawn. SageMaker (Linux, fork) is unaffected.

### Next paid job

```sh
PROCESSED_VERSION=v2 python ml/cranial/launch_training.py --mode full \
  --pilot-lr 0.005 --lr 0.005 --no-amp
```

Defaults now add 5 warmup epochs, cosine decay and patience 30. Read `train_dice` next to `val_dice` in `metrics.jsonl` before choosing the next change. Do not freeze unless val Dice is clearly better than the 0.12 of `…7924`. Convergence and held-out quality are **unverified** until this job finishes.

---

## 13. Full run `cranial-full-run-1794725904` — first freeze, held-out targets met — 2026-11-15

### Training (D10 recipe)

`PROCESSED_VERSION=v2 python ml/cranial/launch_training.py --mode full --pilot-lr 0.005 --lr 0.005 --no-amp`

| Setting | Value |
|---------|-------|
| Data | processed v2 (2 mm / 128³), 91 train / 23 val, parietotemporal |
| Pilot | re-passed, best 0.9043 @ ep 89 |
| Full LR | 0.005, 5 warmup epochs, cosine to 5e-5 |
| AMP | off |
| Aug | on, flip axis fixed (x) |
| Patience | 30 (never triggered) |
| Runtime | 651 billable seconds (~8 s/epoch) |
| `best.pt` | epoch 50, **val Dice 0.8398** (training grid), sha256 `f6b59dfb…3260` |

Learning curve: val Dice 0.05 → 0.41 (ep 4) → 0.62 (ep 9) → 0.74 (ep 15) → 0.81 (ep 25) → 0.84 (ep 50). Train Dice (augmented) tracked val closely (0.826 vs 0.840 at ep 50), so there is **no overfitting**; the model was still improving slowly at the 50-epoch cap.

Compared with `…7924` (val 0.12): the two changes were the flip-axis bug fix and the 25× higher LR with warmup/cosine. We did not ablate which one mattered more.

### Freeze

`ml/cranial/manifests/freeze_v2.json`: run `run_1794725904`, checkpoint hash `sha256:f6b59dfb…3260`, threshold 0.5, preprocessing v2, postprocessing `exclude_source_bone` + `reject_empty`, `frozen: true`. Written **before** any held-out scoring.

### Evaluation on the source grid (0.4 mm, `evaluate.py`)

| Split | n | Mean Dice | Median Dice | Min Dice | 95% bootstrap CI (mean) | Median HD95 | Max HD95 | Failures | Mirror Dice / HD95 |
|-------|--:|----------:|------------:|---------:|------------------------:|------------:|---------:|---------:|-------------------:|
| val (model selection) | 23 | 0.835 | 0.851 | 0.695 | 0.809–0.858 | 2.04 mm | 4.40 mm | 0 | 0.326 / 111.5 mm |
| **test (held out, scored once)** | **20** | **0.811** | 0.832 | 0.608 | **0.778–0.840** | **2.49 mm** | 5.20 mm | **0** | 0.229 / 116.9 mm |

R12 provisional targets (mean Dice ≥ 0.80, median HD95 ≤ 5 mm) are **met on test**. Every case is listed in `reports/eval_v2/per_case_test.csv`; nothing was dropped.

Honest caveats:

1. **Dice margin is thin.** 0.811 vs 0.80 target, and the bootstrap CI over 20 cases (0.778–0.840) straddles 0.80. HD95 has a comfortable margin.
2. **Mapping back to the source grid costs little:** val 0.840 on the 2 mm grid → 0.835 on the 0.4 mm source grid.
3. **Worst cases.** Test: `eval_007` 0.608 / 5.20 mm, `eval_012` 0.699, `eval_004` 0.723; 4/20 below 0.75. The `eval_007` overlay (`slices/lowest_dice_eval_007.png`) shows the prediction in the right place with the right curvature; disagreement is a band along the bone surface — consistent with 2 mm grid softness, not a wrong-location failure.
4. **Mirror baseline is a straw man.** It mirrors about the image centre, not the skull midline, and keeps every asymmetric sliver (HD95 > 100 mm). Beating it is not strong evidence; R12 absolute targets are the meaningful comparison.
5. **Scope.** Synthetic SkullBreak parietotemporal defects only (D2/D3). No other categories, no real defects. R15 MUG500+ B: **not run** (expert meshes not converted).
6. Test has now been opened. Any change to threshold, training, or code from here makes these 20 cases development data; a new held-out claim would need new data (e.g. MUG500+ B).

### Next options (not started)

- Train longer (val still rising at epoch 50; time budget allows ~6× more epochs).
- Other SkullBreak categories as stress tests / training data (scope change, needs spec).
- Refine at 1 mm around the predicted patch to sharpen the surface band seen in the worst cases.
- R15 MUG500+ B domain-shift table.
