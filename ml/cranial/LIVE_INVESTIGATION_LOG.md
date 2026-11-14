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
