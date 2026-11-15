# Cranial reconstruction ML: research and proposed design

Date: 2026-11-14 · Status: research and draft design, not an accepted implementation spec

## Recommendation

The selected approach is direct prediction of the missing cranial bone volume from a segmented defective skull. The finalized training sources are SkullFix, SkullBreak and healthy MUG500+ skulls with synthetic defects. Reserve subjects from these sources for validation. Keep the official SkullBreak evaluation subjects as a synthetic benchmark, and reserve all 29 real MUG500+ defect cases for the final external evaluation. A small 3D U-Net remains the proposed architecture; checkpoint initialization and exact split manifests are not yet finalized.

The useful product output is a separate, editable reconstruction candidate in the existing 3D workspace. The model predicts geometry. It does not predict a treatment label, material, screw locations, or a validated manufacturing design.

A warm GPU service returning a candidate within 30–60 seconds is a reasonable engineering target. It is not a measured property of this proposed implementation. Training time, memory use and final quality remain to be established through a pilot.

This report uses the supplied 2026-11-14 intent and SkullBreak/SkullFix PDF. It also checks original publications, author repositories, dataset records and official software documentation. Repository presence and published results are verified separately from execution: no model was trained, checkpoint loaded, or full dataset archive audited in this research pass.

## 1. What the model generates

A voxel is a small 3D cell. The current NRRD input already represents the skull as a grid of these cells. For a binary skull mask, 1 means bone and 0 means empty space.

Let D be the defective skull and I the reference missing-bone piece. Train a model f so that f(D) produces one score per voxel for membership in I. This is supervised 3D shape completion expressed as dense segmentation. Although each output cell has a class, millions of predictions together form a shape.

The training pair is:

- Input: segmented defective skull D.
- Target: missing-bone volume I supplied by the dataset, or constructed from a healthy skull and a synthetic removal mask.
- Prediction: a 3D probability-like score volume P, converted into a binary candidate mask using a validation-selected threshold.

An alternative predicts the complete skull C and derives I by subtracting D. The original AutoImplant baseline implements both formulations. Its authors describe clean direct outputs and demonstrate improved geometry with a two-stage direct pipeline, but report failures on unfamiliar defects. Their completion comparison is qualitative; it does not establish universal superiority of either formulation [S6]. Start with direct prediction because its target matches the candidate object. If it performs poorly on unfamiliar defects, compare completion using the same subjects and evaluation rules.

For synthetic generation, choose a removal region M, set D = C AND NOT M, and I = C AND M. Never supply C or I as inference inputs. Existing benchmark labels may incorporate border processing; inspect their relationships before assuming exact algebraic equality.

### From scores to the app's candidate

1. Read the prepared source NRRD and preserve its full voxel-to-patient transform.
2. Apply the saved preprocessing transform and run the network.
3. Map output scores back to the source grid and threshold there.
4. For the initial inlay-style anatomical completion, exclude occupied source-bone voxels and clip to a user-confirmed repair region if one is provided.
5. Reject an empty result. Inspect disconnected components; do not blindly keep only the largest component when the case contains multiple defects.
6. Save the candidate as a separate NRRD in the source coordinate frame.
7. Derive a GLB display mesh using a surface extraction method such as marching cubes. Apply the complete affine, including orientation and translation. Display smoothing must not silently change the saved volume.
8. Save method, model version, input revision, transforms, quality checks and timing with the candidate revision.

This matches the intent's volume-authoritative design. An STL can be a later geometry export. It has no intrinsic units or patient-coordinate metadata, so preserve that information separately. A generated anatomical patch is not automatically a finished implant: thickness design, rim/onlay geometry, clearance, fixation and material remain separate tasks.

### What human guidance means in this baseline

| User action | Real mechanism | Limitation |
| --- | --- | --- |
| Mark the repair region | Clip the generated candidate to an explicit allowed mask | Clipping can truncate the repair; show the result and check the boundary |
| Keep source anatomy unchanged | Never overwrite source voxels or source files | This is enforced by software, not learned |
| Preserve part of a previous candidate | Copy locked voxels and allow edits only elsewhere | Check seams; this is a later editing feature |
| Ask for a different contour or thickness | Explicit geometry operation, or a future model trained with such conditioning | A baseline U-Net does not understand text or arbitrary constraints |

An LLM can call the generation tool and explain its returned measurements. It must not interpret a voxel score of 0.9 as 90% clinical confidence.

## 2. Datasets and what each contributes

| Dataset | Independent anatomy and labels | Proposed role | Important limitation |
| --- | --- | --- | --- |
| SkullBreak [S1,S2] | 114 training and 20 evaluation skulls; five defect variants each, producing 570/100 paired defective skulls and reference pieces | Primary training and held-out synthetic evaluation | 570 pairs are only 114 independent skulls; defects are synthetic |
| SkullFix [S1,S6] | 100 training triplets; 110 challenge test cases | Selected training source with a required subject-held-out validation subset | Public test targets were withheld in the dataset publication; verify any later release before assuming local test scoring is possible |
| MUG500+ A, linked paper [S3,S4] | 500 healthy skulls, with volume and surface representations | Selected training source; split healthy subjects before creating synthetic defects | No paired defect target until you generate it; requires quality inspection |
| MUG500+ B [S3,S4] | 29 real craniotomy skulls with expert-designed implant meshes | Final external real-case test set; no training or model selection | Expert designs are reference designs, not the exact original missing bone; mesh-to-volume conversion is required |
| AutoImplant 2021 Task 2 [S5] | 11 real defective skull masks | Small external qualitative stress test | The cited release contains defective volumes without paired implant targets |
| Volumetric Images of Patient Specific Implants for Cranial Defects [S10] | 31 single-defect pairs derived from MUG500+ B, augmented to 930 | Excluded from training because its source subjects are the final test set | Not a new 930-patient cohort; shares origins with MUG500+ B |
| CQ500 and MedShapeNet [S1,S11] | Raw CT source or broader anatomical shape collections | Later expansion after provenance and eligibility review | CQ500 already underlies SkullBreak/SkullFix; MedShapeNet includes existing sources and is not automatically an independent paired reconstruction dataset |

SkullBreak uses binary NRRDs at 512³ with 0.4 mm voxels. SkullFix uses 512 × 512 × Z with varying spacing. SkullBreak's categories include parietotemporal, frontoorbital, bilateral and two random defects. The datasets differ in alignment and segmentation procedures [S1,S2].

### Access and licensing

- SkullBreak: author-published training and evaluation archive links are listed in [S1,S12]. Use those authoritative links, record checksums, and validate downloaded case counts. The attached paper assigns CC BY-NC-SA 4.0 plus the CQ500 EULA to the derived data. The article's own license is distinct from the dataset's license.
- SkullFix: use the challenge/author links in [S1,S6]. Do not assume evaluation labels are included.
- MUG500+: download the latest Figshare version [S4]. Its API metadata was accessible during this research and identifies CC BY 4.0. The author repository documents corrected case names. Preserve original IDs.
- Task 2: Zenodo exposes 11 NRRD files totaling about 16.7 MB [S5]. Confirm usage terms in the downloaded record before redistributing.
- Mendeley derivative: the record identifies CC BY 4.0 [S10]. Preserve original MUG500+ provenance as well.

The evidence supports public availability, not a claim that every multi-gigabyte archive has been downloaded and validated here. Dataset terms, code licenses and checkpoint permissions must be recorded separately. A permissive code license does not remove noncommercial data restrictions.

### Finalized dataset roles and proposed split counts

For SkullBreak, freeze 91 of the 114 official training subjects for training and 23 for validation. Keep the 20 official evaluation subjects untouched. With all five variants this is 455 training, 115 validation and 100 test pairs. Counts decrease if you filter unsupported locations.

All defects, crops, augmentations and meshes from one source skull stay in one partition. Store original subject IDs, not just file names. Generate additional defects only after the split. If an augmentation combines two skulls, both source subjects must belong to the same partition.

For an initial product claim, restrict to a single cranial-vault defect, beginning with parietotemporal cases. Predefine this subset before inspecting model scores. Report bilateral, frontoorbital and other random cases separately as stress tests; do not silently drop bad predictions.

Include SkullFix and healthy MUG500+ in the final training experiment, even if debugging begins with SkullBreak alone. Reserve validation subjects from each before augmentation. Proposed starting counts, subject to eligibility and duplicate checks, are 80/20 for SkullFix training/validation and 400/100 for healthy MUG500+ training/validation. These counts are implementation proposals; the source selection is finalized. The publication reports no overlap between the published SkullFix and SkullBreak tracks [S1]. Check provenance again if importing repackaged versions or raw CQ500.

Keep all 29 MUG500+ B subjects untouched for final external testing. Freeze model selection, threshold, preprocessing and postprocessing using validation data before evaluating these cases. If results from these cases drive changes, disclose that they have become development data rather than continuing to call them an untouched final test set. Training on the 930-case Mendeley derivative contaminates a MUG500+ B test. Public pretrained models may also have seen proposed test subjects: unknown training provenance means their scores are demo results, not clean held-out evidence.

## 3. Published implementations worth using

| Work | What is available | How to use it |
| --- | --- | --- |
| Li et al., AutoImplant baseline, 2020 [S6] | Direct implant and skull completion implementations; old TensorFlow 1.4/Python 3.6 environment | Read as a simple formulation reference; reimplement the idea in PyTorch instead of spending the hackathon reviving its environment |
| Li et al., SkullRec / MONAI, 2023 [S7] | Training code, synthetic-defect scripts and pretrained-weight directories | Best accessible reference for a simple trainable completion pipeline |
| Wodzinski et al., 2022 [S8,S9] | PyTorch reconstruction, optional refinement, preprocessing and implant-modeling pipeline | Useful for pipeline design and evaluation; omit expensive optional augmentation initially |
| AutoImplantPipe [S13] | Segmentation and reconstruction training/inference examples and checkpoint links | Alternative integration reference; some weights use noncommercial in-house data |
| Friedrich et al., point-cloud diffusion, 2023 [S12] | Public implementation and detailed benchmark tables | Research comparison, not the first implementation for this latency target |

SkullRec's README documents MONAI 0.8.1, PyTorch 1.11 and an RTX 3090 with 24 GB. Its current source resizes to 256 × 256 × 128 and contains a U-Net configuration. These are reproduction settings, not guaranteed compatibility with current packages. Freeze a working environment and test coordinate handling rather than copying preprocessing blindly [S7].

The Wodzinski repository says pretrained weights require contacting the author. Its optional cross-case augmentation involves more than 20,000 registrations [S9]. Do not make either a prerequisite for the hackathon.

The point-cloud diffusion repository reports approximately 1,002 seconds for one SkullBreak prediction pipeline on an A100, without ensembling. Its comparison reports a 3D U-Net at Dice 0.87 and HD95 2.32 mm on SkullBreak. Those are published reference results under that study's setup, not a prediction of this baseline's score [S12].

## 4. Preprocessing design

### Dataset audit

Create a manifest containing dataset version, original subject ID, defect category, split, source paths, checksums, shape, voxel spacing, origin and direction matrix. Record label source: synthetic removed bone, expert design, or pseudo-label. Do not mix these labels without tracking them.

For each pair, check finite metadata, valid dimensions, binary values, nonempty labels and matching physical frames. Inspect orthogonal slices with the target overlaid. Detect duplicated subjects and scan conversions. Check D/I overlap and C-versus-D-union-I consistency, allowing only documented dataset processing differences.

### Spatial standardization

1. Read spacing, origin and direction from the file. If physical metadata is missing or ambiguous, stop that case for review.
2. Preserve the original affine. The intent uses RAS internally and includes LPS import conversion; apply that conversion exactly once. Array order and patient-axis order are different concepts.
3. Reorient into one documented patient frame. Reorientation is not anatomical registration: if a model expects aligned skulls, additional alignment must be validated using available anatomy.
4. Crop from the defective input with sufficient physical margin to include the missing convexity. Never use the hidden target to choose the inference crop. Reject insufficient context instead of cutting it off.
5. Start the custom model pilot at approximately 1 mm isotropic spacing and a 256³ padded grid when the full supported region fits. These are proposed settings. Enlarge the field or change spacing explicitly if a case exceeds it; do not distort all skulls into an arbitrary cube.
6. Use nearest-neighbor sampling for binary training masks. Use linear interpolation for predicted scores during inverse resampling, followed by thresholding.
7. Cache deterministic preprocessing on disk. Apply random augmentation after the cache, so it varies across epochs.
8. Retain inverse transforms and restore every prediction to source resolution and coordinates before measurement and saving.

A coarse 128³ run can debug the pipeline. It is not evidence of accurate thin-bone geometry. Upsampling a coarse output cannot recover details never represented. If the baseline loses boundaries, first check spatial preprocessing, then consider a finer local refinement stage.

### Extra MUG500+ preparation

For healthy skulls, inspect the cranial vault, remove irrelevant artifacts using a documented rule, and generate bounded defects of varied sizes and shapes in the supported area. Include some border variation. Keep validation and test defect generators and seeds fixed.

For real B cases, voxelize expert implant STL meshes onto the defective NRRD's exact grid. Verify scale, orientation, alignment and mesh closure visually and numerically. Do not align by independently centering the mesh and skull. If a mesh cannot define an enclosed volume, repair it with a recorded method or mark it unsuitable for voxel metrics.

Expert implants and removed-bone masks represent different design objectives. Score them separately. Do not call an automatically produced replacement a human ground-truth implant.

## 5. A concrete training experiment

The following settings are engineering starting points, not literature-derived optimum values or guaranteed results.

| Setting | Proposed initial value |
| --- | --- |
| Framework | PyTorch + MONAI, pinned after a GPU smoke test |
| Architecture | Small 3D U-Net with global skull context |
| Inputs/outputs | One binary skull channel; one missing-piece logit channel |
| Channels | 16, 32, 64, 128, 256 across five levels |
| Normalization | Instance normalization as a starting choice for batch size 1 |
| Working grid | Approximately 1 mm isotropic; pad to 256³ when anatomically sufficient |
| Loss | Equal initial weights for soft Dice loss and binary cross-entropy with logits |
| Optimizer | AdamW, learning rate 0.0001, weight decay 0.00001 |
| Batch | Start at 1; profile memory before increasing |
| Precision | CUDA mixed precision after a full-precision smoke test |
| Augmentation | Small paired rotations/translations/scales; additional training-only synthetic defects |
| Run limit | Initial ceiling of 100 epochs; validation early stopping with patience 15 evaluations |
| Selection | Best validation implant Dice, with HD95 and visible failure review as secondary checks |

MONAI supplies U-Net components, paired transforms, Dice/cross-entropy losses and distance metrics [S14]. The settings above are a custom baseline inspired by the literature, not an exact reproduction of a paper.

### Execution order

1. **One-case round trip.** Read input, transform it, inverse-transform a known mask and display it in the app. Confirm physical landmark agreement. This catches coordinate failures before training.
2. **One GPU forward/backward pass.** Record peak allocated GPU memory and seconds per step. Verify finite gradients and a nonzero target.
3. **Deliberately overfit 2–4 training cases.** Disable augmentation and confirm the model can reconstruct them. This is an implementation diagnostic, not a performance result.
4. **Run the subject-held-out experiment.** Enable augmentation, save both best and latest checkpoints, and evaluate fixed validation cases consistently.
5. **Inspect failures by category.** Track empty patches, floating pieces, excessive interior fill, crop truncation, thin-shell loss and seam gaps.
6. **Freeze the pipeline.** Fix checkpoint, threshold and postprocessing before opening test results.
7. **Evaluate the final source-space candidates.** Include the actual cleanup/export steps that users receive, alongside raw network metrics for diagnosis.
8. **Run real-case transfer tests separately.** Report domain shift rather than averaging it away.

Use a simple mirror-based comparator for unilateral cases with suitable intact opposite anatomy. It needs a documented midsagittal plane/alignment and the same user-region assumptions as the learned method. It is not a valid comparator for all bilateral defects. Also include an empty-patch sanity baseline to catch misleading full-skull metrics.

### How to tell what is wrong

| Observation | First checks and next action |
| --- | --- |
| Cannot fit 2–4 cases | Label alignment, output activation/loss pairing, target values, gradient flow, crop completeness |
| Training improves; validation worsens | Subject leakage audit, capacity, augmentation, early stopping; inspect category differences |
| Both scores stay low | Broken labels or preprocessing first; then learning rate, resolution, context and model capacity |
| High complete-skull Dice; poor patch | Score the implant, not unchanged bone; verify loss target |
| Synthetic good; real poor | Domain shift, segmentation style and defect morphology; do not claim more epochs will fix it |
| Correct shape appears flipped or offset | Axis order and affine conversion, especially duplicate LPS/RAS conversion |
| OOM or slow training | Profile grid/channels/activations and disk loading; adjust one parameter at a time |

No training/validation gap alone proves generalization. A low gap can mean both sets are poorly predicted. Evaluate actual held-out geometry and failures.

## 6. GPU platform and coding-agent workflow

The platform must require no out-of-pocket payment for the hackathon. Prefer AWS, then an MLH-affiliated provider. Free credits are a finite event budget, not permanently free GPU hosting. Provisioning remains conditional on actual account eligibility, GPU quota, regional capacity and credit coverage.

### Preferred platform: AWS SageMaker AI plus S3

AWS's October 2026 announcement describes a new-account experience with $100 in initial credits, the opportunity to earn $100 more, and eligible GPU access for training, notebooks and endpoints. Credits apply across SageMaker AI training and deployment. This new-account offer does not automatically apply to an existing AWS account. Confirm the account's Free plan and service eligibility before launching anything [S16].

Use S3 for compressed datasets, checkpoints and candidate artifacts. Develop and smoke-test through Studio, then launch a managed PyTorch/MONAI training job with a maximum runtime. Use a single G5-class GPU with approximately 24 GB GPU memory as the initial target. Choose CPU RAM and volume size from the data audit; the memory requirement of the proposed model still needs profiling.

Serve with a SageMaker Asynchronous Inference GPU endpoint. The app supplies an S3 input location and receives an asynchronous job/output location. The inference container runs the complete volume-to-candidate pipeline. AWS documents payloads up to 1 GB and processing up to one hour. Keep one instance warm during judging; configure scale-to-zero outside that window. Cold starts invalidate a 30-second request-to-result promise [S17]. SageMaker Serverless Inference does not support GPUs and is not the proposed serving option [S18].

Before starting, verify that the selected account plan permits the exact training and asynchronous endpoint configurations. Read the displayed regional rates and reserve credits for inference, storage and logs. Set a job runtime ceiling. A budget notification on a paid account is not itself a hard spending cap. Do not upgrade to paid service merely to get around a quota or eligibility failure.

### MLH alternative and free fallback

MLH's Vultr partner page offers $100 credits with an event gift code and no credit card. Obtain the code from the opening ceremony or MLH coach. Vultr's MLH page advertises GPU infrastructure, but neither this report nor that general statement confirms that this particular event/account can deploy a GPU using its gift credit. Confirm GPU product eligibility and available capacity with the coach [S19].

If confirmed, one Vultr GPU VM can run PyTorch/MONAI training and later a FastAPI inference service. This is operationally simpler than separate managed jobs and endpoints. Use persistent storage, durable checkpoints and a warm process during the demo. Shut down chargeable GPU resources after use and check the provider's storage lifecycle.

If neither sponsor route is accessible, Kaggle provides free GPU notebook sessions, generally a 30-hour weekly allowance subject to availability. Its current notebook documentation lists 12-hour GPU sessions and 20 GB of auto-saved working disk. It is a training fallback, not a dependable always-on inference endpoint. A larger cache requires sharding or a smaller working subset [S20].

Do not choose Amazon SageMaker Studio Lab for a new account: AWS explicitly says new customers can no longer join [S21].

### Data load and storage budget

Keep original data compressed and store prepared binary masks as uint8. Convert only each training batch to floating point. Do not expand all source volumes or cache the full dataset in RAM.

Calculated example: one 256³ uint8 volume is 16 MiB. A defective-mask/target pair is 32 MiB. All 570 SkullBreak training pairs occupy approximately 17.8 GiB in this representation before compression, metadata or other artifacts. The 670 training-plus-evaluation pairs occupy about 20.9 GiB. Float32 caches would be four times larger. Complete skulls need not be duplicated for every defect variant.

A 50–100 GB working volume is a starting allocation for this processed subset plus checkpoints, not a guarantee that all original datasets and expanded archives fit. Audit compressed source sizes and process in batches. Debug on a smaller subset first; include the selected healthy MUG500+ data in the final experiment. Audit its additional disk and preprocessing requirements before allocating the job volume. S3 or sponsor object storage holds originals and completed artifacts; the GPU job loads only the current local working data [S22].

### Coding-agent connection

On AWS, the local coding agent can use the AWS CLI or Python SDK to submit and inspect training jobs, retrieve CloudWatch logs, and read checkpoint/evaluation artifacts from S3. This avoids requiring SSH into a managed training container. Save local entry points for preparation, training, evaluation and prediction so the same code can also run on a regular VM. On a sponsor GPU VM, the agent can execute those scripts over SSH.

Give the agent access to the project resources it needs, a fixed experiment budget and explicit stop conditions. Do not store credentials in source files. No special ML agent protocol or new training controller is required.

### Proposed scripts to implement

These are proposed project interfaces, not existing commands in the uploaded project:

| Interface | Contract |
| --- | --- |
| `prepare_data.py --config ...` | Validate manifests, splits and deterministic preprocessing; write cache and audit report |
| `train.py --config ... --run-id ...` | Train reproducibly, save resumable checkpoints and periodic validation artifacts |
| `evaluate.py --checkpoint ... --split ...` | Produce per-case source-space metrics and category/subject summaries |
| `predict.py --input ... --output-dir ...` | Generate candidate NRRD, display mesh and metadata using deployment preprocessing |
| `benchmark.py --manifest ...` | Measure complete pipeline latency, peak memory and failures |

Each run should save the exact Git commit, environment lock, dataset/split hashes, config, seed, model and optimizer state, scheduler/scaler state where used, epoch, best score and RNG states needed for resumption. Write `metrics.jsonl` for machine-readable progress and a plain log for errors. Save fixed validation slice overlays and example meshes. TensorBoard is optional; it is not a dependency for agent debugging.

Use managed training jobs on SageMaker. On a regular VM, launch a job that survives the SSH session using a process supervisor or a simple `nohup` launch with its PID recorded. Have the agent check job status, recent logs, validation artifacts and GPU memory between iterations. It should record a hypothesis before a change and compare against the previous run.

Freeze the test split and acceptance rules. Do not let the agent improve apparent results by moving test cases into training, altering labels, silently changing metrics or hiding failed cases. Give it a maximum runtime, a budget within confirmed credits, and a stopping rule. This report does not provision hardware or authorize out-of-pocket charges.

Estimate training time from a timed pilot: training steps × measured step time + validation + preprocessing. Do not assume a fixed number of hours from dataset size alone. An epoch is not comparable when different runs generate different numbers of augmented samples.

## 7. Inference latency

Wodzinski et al. report 34.7 seconds on average, with 28.9–44.6 seconds across their Task 2 cases, for a pipeline including I/O, preprocessing, reconstruction/refinement, thinning and print preparation [S8]. This supports feasibility of the requested order of magnitude, not a guarantee on other hardware or for this app.

Proposed warm-service budget:

| Stage | Target budget, not benchmark |
| --- | --- |
| Read and preprocess | 5 seconds |
| Network forward pass | 5 seconds |
| Restore source grid and geometry checks | 5 seconds |
| Surface extraction and display-mesh preparation | 10 seconds |
| Save artifacts and return result | 5 seconds |

Keep the model loaded, use one prediction pass, and avoid test-time ensembles initially. Prepared NRRD input keeps raw CT segmentation outside this budget. Cache legitimate deterministic preprocessing, not test predictions disguised as live generation.

Measure median and p95 request-to-artifact latency across held-out cases on a named machine. Also measure browser-visible latency, upload time and cold start separately. A 0.1-second network does not imply a 0.1-second user workflow. With only 20 independent test skulls, p95 is descriptive and uncertain; report sample count and worst case too.

## 8. Proposed acceptance requirements

These are hackathon engineering targets. They are not clinical safety limits or scores already achieved.

| ID | Requirement / success check |
| --- | --- |
| R1 | Accept prepared binary NRRD skull masks with valid physical metadata and a declared supported defect region |
| R2 | Return a separate, nonempty candidate NRRD plus derived display mesh in the original patient frame |
| R3 | Leave source file hashes and source geometry unchanged |
| R4 | Keep every derivative of a subject within one partition; publish the split manifest |
| R5 | On the predefined supported synthetic test subset, target mean implant Dice ≥0.80 and median per-case HD95 ≤5 mm; report every case and category |
| R6 | Report a documented boundary metric and average surface distance in mm; do not present full-skull Dice as repair quality |
| R7 | Compare with the mirror baseline on the same eligible unilateral subset; aim for higher mean Dice without worse median HD95, and report if this is not achieved |
| R8 | On a pinned warm deployment machine, target median complete service latency ≤30 seconds and p95 ≤60 seconds, including mesh/artifact generation |
| R9 | Flag empty, nonfinite, truncated or wrongly framed output as failure. Include failures in denominators and runtime summaries |
| R10 | Save model version, checkpoint hash, preprocessing config, source revision and method with each candidate |
| R11 | Restore a saved candidate/revision identically in source coordinates; landmark round-trip transform test tolerance ≤0.01 mm before voxel resampling |
| R12 | Inspect all final test failures and a predetermined typical/best/worst sample set in orthogonal slices and 3D |
| R13 | Present MUG500+ B or Task 2 results separately from synthetic benchmark results and explicitly state label/provenance limitations |

Metric definitions:

- Implant Dice measures overlap of predicted and reference missing-piece masks. Empty prediction against a nonempty target scores zero.
- HD95 measures the 95th-percentile surface discrepancy. Specify the implementation's symmetric convention and supply voxel spacing so results are millimeters, not voxel counts. For empty predictions, mark distance undefined/failure and report failures separately; never silently exclude them from a success claim.
- Boundary Dice is overlap in a defined band near the defect interface. Use the challenge evaluator and its exact band definition when claiming challenge comparability. Otherwise label the metric as your own definition. It is different from surface Dice at a distance tolerance.
- Average symmetric surface distance complements HD95. Neither proves safe fit.
- Group summaries by original skull to avoid overweighting subjects with extra variants. Report mean/median, spread, worst cases, category sample counts and failure count.

The 0.80/5 mm targets are deliberately provisional project choices below stronger published synthetic results, not medical thresholds. Do not change them after viewing the final test set just to pass. If the learned model does not beat the geometric baseline, the model experiment still yields useful evidence, but the generation claim must reflect that result.

## 9. Integration with the supplied intent

The intent states that Express and SQLite own live app metadata; Python currently has a read-only app adapter. Keep that ownership. Python should produce reconstruction artifacts and a structured result. The authorized app service then creates the candidate and revision. Do not write directly into the live SQLite store from a training or inference script.

Proposed generation request: case ID, source sample/revision ID, optional allowed repair-region artifact, and model version. Resolve file paths server-side. The source revision and candidate revision must be immutable job inputs.

Proposed result: job ID, status, candidate volume path/artifact ID, display mesh artifact ID, coordinate metadata, input revision, checkpoint hash, timings, geometry-check results and warnings. Do not return a fabricated universal fit score.

Use an asynchronous job response if generation can last tens of seconds. A single warm GPU worker and a bounded queue are enough for the first demo; no distributed serving platform is required. When a result arrives, check that it still refers to the selected source revision. Attach it as a new candidate rather than replacing a newer edit.

The model worker, app service and LLM have distinct responsibilities: generate geometry, commit revisioned artifacts, and call supported tools/explain returned evidence. Calculated geometry checks are not ML predictions.

## 10. Work sequence and decision points

1. **Data and coordinate proof:** acquire the exact dataset version, freeze subject partitions, display input/reference pairs and complete round-trip checks.
2. **Baseline experiment:** verify tiny-case overfitting, train the small U-Net, compare against mirroring where applicable, and inspect held-out failures.
3. **Product connection:** serve the frozen model, save candidates through the app owner, and benchmark the whole display workflow.
4. **Evidence-driven stretch:** improve defect diversity using the selected healthy MUG500+ source; add completion/refinement only if direct prediction or resolution is the bottleneck.

Keep a research record containing sources, experiments and limitations. Once scope is chosen, the feature intent should say the user outcome; its spec should define input/output, supported cases, coordinate rules and acceptance checks; its plan should map those checks to the actual repository. The research report is not a substitute for inspecting the live code before implementation.

Open decisions: confirmed no-cost GPU access and credit/runtime budget, supported case subset, whether an allowed repair region is required, and whether the first demonstration prioritizes a self-trained checkpoint or a known pretrained model. Reasonable defaults here are one 24 GB GPU pilot, one cranial-vault defect, an optional user-confirmed region, and a self-trained direct-prediction baseline. Public pretrained models remain a fallback with explicit provenance.

## Sources

- **S1:** Kodym et al., SkullBreak / SkullFix dataset, 2021. Supplied PDF and [original publication](https://pmc.ncbi.nlm.nih.gov/articles/PMC8100897/). Counts, representations, synthetic construction, split and license information.
- **S2:** [AutoImplant 2021 Task 1](https://autoimplant2021.grand-challenge.org/Task1/). Defect categories and warning about segmentation differences.
- **S3:** Li et al., MUG500+, 2021. [User-linked article](https://pmc.ncbi.nlm.nih.gov/articles/PMC8591340/) and [publisher full text](https://www.sciencedirect.com/science/article/pii/S2352340921008003). The PMC endpoint presented a bot check; the publisher supplied the relevant content.
- **S4:** [MUG500+ Figshare](https://figshare.com/articles/dataset/MUG500_Repository/9616319), [record metadata API](https://api.figshare.com/v2/articles/9616319), and [author maintenance repository](https://github.com/Jianningli/mug500plus). API metadata and current repository content retrieved; full dataset not downloaded.
- **S5:** [AutoImplant 2021 Task 2 clinical cases](https://zenodo.org/records/5008819). Eleven defective NRRD files in the inspected record.
- **S6:** [Li et al., AutoImplant baseline code](https://github.com/Jianningli/autoimplant). Direct prediction/completion formulations and legacy environment.
- **S7:** [SkullRec repository](https://github.com/Project-MONAI/research-contributions/tree/main/SkullRec), [README](https://raw.githubusercontent.com/Project-MONAI/research-contributions/main/SkullRec/README.md), [source](https://raw.githubusercontent.com/Project-MONAI/research-contributions/main/SkullRec/monaiSkull.py), and [SoftwareX paper](https://www.sciencedirect.com/science/article/pii/S2352711023001280). README/source and repository directory entries inspected; checkpoint loading not tested.
- **S8:** Wodzinski et al., Deep learning-based framework for automatic cranial defect reconstruction and implant modeling, 2022. [PubMed](https://pubmed.ncbi.nlm.nih.gov/36257198/), [author-hosted article](https://arodes.hes-so.ch/record/12943/files/Wodzinski_2022_Deep_learning.pdf). Runtime figures retrieved from the indexed article's processing-time section; not reproduced here.
- **S9:** [Wodzinski implementation](https://github.com/MWod/AutoImplant_2021). Pipeline stages, optional registration augmentation and weight access conditions.
- **S10:** [Mendeley volumetric implant dataset](https://data.mendeley.com/datasets/ywnjr7gnty/1). MUG500+ lineage, 31 base pairs and 930 augmented examples.
- **S11:** [MedShapeNet author repository](https://github.com/GLARKI/MedShapeNet2.0) and [paper](https://arxiv.org/abs/2308.16139). Broad shape collection and source provenance.
- **S12:** [Point-cloud diffusion implementation and benchmark](https://github.com/pfriedri/pcdiff-implant). Runtime and U-Net comparison; dataset download links.
- **S13:** [AutoImplantPipe](https://github.com/biodatlab/autoimplantpipe). Training/inference entry points and checkpoint licensing notes.
- **S14:** Official MONAI [overview](https://project-monai.github.io/core.html), [losses](https://monai.readthedocs.io/en/stable/losses.html), [metrics](https://monai.readthedocs.io/en/stable/metrics.html). Implementation primitives; pin versions during implementation.
- **S15:** Official Runpod [SSH documentation](https://docs.runpod.io/pods/configuration/use-ssh) and [network-volume overview](https://www.runpod.io/blog/network-volumes-on-runpod-what-they-are-and-when-you-need-one). Platform access and persistent-storage concepts; prices and availability were not evaluated.


### Platform update sources, checked 2026-11-14

- **S16:** [AWS: new SageMaker Studio sign-in experience, October 19, 2026](https://aws.amazon.com/blogs/machine-learning/developers-can-now-access-sagemaker-studio-through-the-new-aws-experience/), [AWS Free Tier](https://aws.amazon.com/free/). New-account credits, eligibility and GPU availability; actual account not inspected.
- **S17:** [SageMaker Asynchronous Inference](https://docs.aws.amazon.com/sagemaker/latest/dg/async-inference.html) and [autoscaling](https://docs.aws.amazon.com/sagemaker/latest/dg/async-inference-autoscale.html). Large input payloads and scale-to-zero capability.
- **S18:** [SageMaker Serverless Inference exclusions](https://docs.aws.amazon.com/sagemaker/latest/dg/serverless-endpoints.html). No GPU support.
- **S19:** [MLH Vultr partner offer](https://www.mlh.com/partners/vultr) and [Vultr MLH partnership](https://discover.vultr.com/mlh). Event gift credits and advertised GPU infrastructure; specific event GPU entitlement remains unverified.
- **S20:** Kaggle [notebook specifications](https://www.kaggle.com/docs/notebooks) and [GPU allowance](https://www.kaggle.com/docs/efficient-gpu-usage). Quotas and hardware remain subject to availability.
- **S21:** [AWS Studio Lab availability change](https://docs.aws.amazon.com/sagemaker/latest/dg/studio-lab-availability-change.html). Closed to new customers.
- **S22:** [SageMaker training input modes](https://docs.aws.amazon.com/sagemaker/latest/dg/model-access-training-data-using-pysdk.html), [training job CLI](https://docs.aws.amazon.com/cli/latest/reference/sagemaker/create-training-job.html), and [G5 hardware](https://aws.amazon.com/ec2/instance-types/g5/). Data access, job automation and GPU specifications.


### Decision recorded 2026-11-14

Direct prediction is the selected formulation. Training sources are SkullFix, SkullBreak and healthy MUG500+. Validation uses held-out original subjects from these sources. The official SkullBreak evaluation split remains a synthetic test benchmark. All 29 real MUG500+ defect subjects are reserved for final external testing against expert-designed implants. Neither these subjects nor their augmented derivatives enter training or model selection. Exact subject manifests, supported-case filters and initialization remain to be audited and specified.
