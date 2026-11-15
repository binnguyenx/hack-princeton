# Cranial Reconstruction ML Training: Learning Failure Postmortem & Solution

**Date:** 2026-11-14  
**Context:** SageMaker PyTorch Training Job (`ml.g5.2xlarge`)  
**Target:** 3D Cranial Defect Reconstruction (SkullBreak parietotemporal dataset)  
**Status:** Resolved  

---

## 1. Executive Summary

During execution of `python3 ml/cranial/launch_training.py --mode full`, the training job terminated prematurely at minute 1 with exit code 2. The job failed during its mandatory pre-flight pilot overfit check (`run_pilot` in `train.py`):

```text
2026-11-14 20:16:02 [INFO] === PILOT: overfitting 3 cases for ≤50 epochs ===
2026-11-14 20:16:15 [INFO]   Pilot epoch 10/50: dice=0.0036
2026-11-14 20:16:28 [INFO]   Pilot epoch 20/50: dice=0.0047
2026-11-14 20:16:40 [INFO]   Pilot epoch 30/50: dice=0.0044
2026-11-14 20:16:53 [INFO]   Pilot epoch 40/50: dice=0.0045
2026-11-14 20:17:05 [INFO]   Pilot epoch 50/50: dice=0.0087
2026-11-14 20:17:05 [ERROR] Pilot FAILED: Dice=0.0087 < 0.9 after 50 epochs.
2026-11-14 20:17:05 [ERROR] Pilot failed — stopping before full training run. Fix the model/data first.
```

The model failed to learn anything beyond near-zero predictions (Dice $0.0087$, $< 1\%$). Full training never started.

---

## 2. Root Cause Analysis

Investigation revealed four interacting root causes spanning optimization dynamics, extreme class imbalance, loss formulation, and launcher configuration:

### 2.1 Infeasible Optimization Budget for 3D U-Net Initial Convergence
* **The Math:** The pilot attempted to overfit 3 cases with batch size 1 for 50 epochs. That is only **150 gradient updates total** ($3 \times 50 = 150$).
* **Step Size Limitation:** `train.py` initialized the pilot AdamW optimizer using the default learning rate `lr = 1e-4` ($0.0001$). Under AdamW, the maximum possible coordinate update per step is bounded by $\approx \text{lr}$. In 150 steps, weights could displace at most $150 \times 10^{-4} = 0.015$ from random initialization.
* **Empirical Measurement:** Measuring weight tensors across 150 steps confirmed maximum parameter change was only **$0.017$** and mean change was **$0.004$**. A 5-level 3D U-Net with 4.8 million parameters initialized from Kaiming distributions cannot reorganize its spatial filters to reconstruct a 3D cranial shell in only 150 steps at $\text{lr}=10^{-4}$.
* **Premature Timeout:** On an A10G GPU, 50 epochs took only **63 seconds** ($1.25\text{ s/epoch}$). The pilot had a 20-minute timeout allocation (`MAX_RUN_PILOT = 1200\text{ s}`), but was artificially capped at 50 epochs.

### 2.2 Extreme Class Imbalance ($99.85\%$ Background)
In the 1 mm isotropic canonical space ($256^3 = 16,777,216$ voxels per case):
* **Defective skull:** $\sim 350,000$ voxels ($2.1\%$)
* **Missing bone (implant target):** $\sim 16,000$ to $42,000$ voxels (**$0.10\%$ to $0.25\%$**)
* **Empty background:** $\sim 16,740,000$ voxels (**$99.85\%$**)

### 2.3 Loss Satiation & Sigmoid Saturation Trap
The loss was defined as:
$$\mathcal{L} = 0.5 \cdot \mathcal{L}_{\text{Dice}} + 0.5 \cdot \mathcal{L}_{\text{BCE}}$$

1. **Unweighted BCE Dominance:** Because $99.85\%$ of voxels are label $0$, standard `BCEWithLogitsLoss` rapidly rewards predicting negative logits everywhere. If the network predicts logit $\approx -10$ ($\sigma(z) \approx 0.000045$), BCE drops from $0.693$ down to $0.015$.
2. **Sigmoid Vanishing Gradient:** Sinking all logits into large negative values moves the network into the saturation tail of the sigmoid activation, where the derivative $\sigma'(z) = \sigma(z)(1 - \sigma(z)) \to 0$.
3. **Squared Pred Trap:** With MONAI's `DiceLoss(squared_pred=True)`, the denominator is $\sum p_i^2 + \sum y_i^2$. When predicted probabilities are small ($p_i \sim 0.01 \implies p_i^2 \sim 0.0001$), backpropagating through the saturated sigmoid yielded Dice gradients of magnitude $\approx 10^{-9}$. The optimizer was effectively trapped predicting zero everywhere.

### 2.4 Launcher Configuration Bugs
1. **Accidental Augmentation Suppression in Full Training:** In `launch_training.py`, `--mode full` passed `"no-aug": True` to hyperparameters. This meant even if the pilot had passed, the 50-epoch full training run would have executed with spatial augmentations disabled.
2. **Interface Mismatch:** `prepare_data.py` had renamed `lps_to_ras` to `reindex_axes_ras`. `test_preprocessing.py`, `predict.py`, and `evaluate.py` imported `lps_to_ras`, causing `ImportError` when running test suites or inference.
3. **Container Pip Conflicts:** `requirements.txt` strictly pinned `boto3==1.34.0`, which downgraded boto3 inside the SageMaker PyTorch 2.1 container and produced pip dependency warnings with SageMaker SDK and `s3transfer`.

---

## 3. Empirical Ablation Experiments

To confirm the hypothesis, experiments were conducted on the exact SkullBreak parietotemporal training volumes:

| Experiment Configuration | Learning Rate | Epochs / Steps | Implant Dice | Observation |
|---|---|---|---|---|
| **Baseline:** Dice(squared) + BCE | $1 \times 10^{-4}$ | 50 ep (150 steps) | **0.0087** | **Failure** (identical to SageMaker run). Logits stay near 0, gradients collapse. |
| **Baseline Extended:** Dice(squared) + BCE | $1 \times 10^{-4}$ | 200 ep (600 steps) | **0.2326** | Extremely slow drift; fails $\ge 0.90$ threshold. |
| **Increased LR:** Default Loss | $1 \times 10^{-3}$ | 200 ep (600 steps) | **0.8663** | Nearing threshold; learning dynamics restored. |
| **Target Setup:** Default Loss | $2\text{--}5 \times 10^{-3}$ | 200 ep (600 steps) | **0.9136** | **PASSED.** Rapid convergence past $0.90$ within 130–160 epochs. |
| **Linear Dice:** `squared_pred=False` | $2\text{--}5 \times 10^{-3}$ | 200 ep (600 steps) | **0.9149** | **PASSED.** Smooth gradients, no saturation trap. |

---

## 4. Implemented Solutions

### 4.1 `ml/cranial/train.py`
1. **Pure Soft Dice Loss Default:**
   ```python
   def build_loss(loss_type: str = "dice"):
       dice_loss = DiceLoss(
           sigmoid=True,
           smooth_nr=1e-5,
           smooth_dr=1e-5,
           squared_pred=False,  # linear denominator prevents gradient vanishing
           reduction="mean",
       )
       if loss_type == "dice":
           return dice_loss
       ...
   ```
   *For 1000:1 imbalanced 3D cranial reconstruction ($99.85\%$ background), unweighted BCE drives all logits negative and causes sudden collapse to zero. Pure DiceLoss is background scale-invariant and smoothly converges.*

2. **Dedicated Pilot Overfit Hyperparameters:**
   * Set `--pilot-lr 0.005` so the pilot can overfit 3 cases without being throttled.
   * Increased default `--pilot-epochs` to `200`. Since each epoch on 3 cases takes $\approx 1.25\text{ s}$ on A10G, 120 epochs requires only $\approx 2.5\text{ minutes}$. `run_pilot` terminates early as soon as `dice >= 0.90` is reached.

### 4.2 `ml/cranial/launch_training.py`
1. **Enabled Augmentations for Full Training:**
   * Changed `"no-aug": False` for `--mode full` so `RandAffined` and `RandFlipd` augmentations are active on the 91 training cases.
2. **Configured Pilot Parameters in Launcher:**
   * Pilot runs with `"loss": "dice"`, `"pilot-epochs": 200`, and `"pilot-lr": 0.005`.
3. **Added `--skip-pilot` Flag:**
   * Users can run `python3 ml/cranial/launch_training.py --mode full --skip-pilot` to immediately execute full training without repeating the pilot.
4. **Configurable Learning Rate:**
   * Added `--lr` CLI override (default `2e-4` for full training).

### 4.3 `ml/cranial/prepare_data.py` & Tests
1. **Backwards-Compatible Coordinate Transform Alias:**
   * Exported `lps_to_ras = reindex_axes_ras` in `prepare_data.py`.
   * Updated `resample_to_spacing` to accept `interpolator` argument.
2. **Synchronized Test Suite:**
   * Updated `ml/cranial/tests/test_preprocessing.py` to match current function signatures. All 18 unit tests now pass cleanly (`18 passed in 0.55s`).

### 4.4 `ml/cranial/requirements.txt`
* Replaced `boto3==1.34.0` with `boto3>=1.34.0` to eliminate container package conflicts.

---

## 5. Verification & Runbook

### Local Sanity Verification
Run the unit test suite:
```bash
python3 -m pytest ml/cranial/tests/test_preprocessing.py -v
```

Verify dataset manifest integrity:
```bash
python3 ml/cranial/audit_data.py --manifest ml/cranial/manifests/split_v1.csv
```
*(Confirms 134/134 cases pass all dimensional, binary, non-empty, and non-overlap checks.)*

### Launching on SageMaker

1. **Verify Pilot Overfit (Sanity Check):**
   ```bash
   python3 ml/cranial/launch_training.py --mode pilot
   ```
   *Expected outcome:* Reaches Dice $\ge 0.90$ within 100–160 epochs ($\approx 2\text{--}3$ minutes runtime).

2. **Run Full Training:**
   ```bash
   python3 ml/cranial/launch_training.py --mode full
   ```
   *Runs pilot check first, passes, and transitions into 50-epoch full training with data augmentation.*

3. **Run Full Training Directly (Skipping Pilot):**
   ```bash
   python3 ml/cranial/launch_training.py --mode full --skip-pilot
   ```

---

## 6. Key Takeaways for 3D Medical Deep Learning

1. **Beware the Overfit Sanity Trap:** An overfit sanity test on $N \le 4$ cases requires *more gradient steps per case* than a full training epoch. Do not limit an overfit test to the same epoch count as full training if the step budget is insufficient for gradient descent to travel across parameter space.
2. **Extreme Class Imbalance ($< 1\%$ positive voxels):** Avoid unweighted BCE loss or set `squared_pred=False` in Dice loss. Unweighted BCE will aggressively optimize background zeros, driving activations into sigmoid saturation where gradients for positive voxels vanish.
3. **Wall-clock vs. Epoch Budgeting:** When GPU epochs are fast ($1\text{ second/epoch}$ for small subsets), do not artificially cap epoch counts to low numbers. Give the optimizer sufficient iterations to reach convergence.
