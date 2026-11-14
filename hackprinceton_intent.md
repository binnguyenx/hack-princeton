# Intent: AI workspace for bone reconstruction design

Author: Vien Nguyen · Date: 2026-11-13 · Status: draft (living product brief)  
Last updated: 2026-11-14  
Project: HackPrinceton · Product display name: **undecided** (do not ship “SkullFix” in UI chrome)  
Design system: **hack-princeton** (`DESIGN.md`, `PRODUCT.md`)

> This file is **draft product input**, not an accepted feature folder. Accepted behavior lives under `features/` and is indexed in `docs/project.md`. When this brief and a feature conflict, the accepted feature `spec.md` wins for implementation.

## Problem

Biomedical engineers and reconstructive surgeons translate a clinical reconstruction goal into patient-specific geometry through repeated design and review. Cranial implant research documents time-consuming manual design, corrections after automated generation, and differences between benchmark reconstruction shapes and clinically used implants [1–3].

That establishes a problem worth attempting for a hackathon. Proving market demand or outperforming every existing product is not a prerequisite. We want to explore whether a shared 3D workspace with useful AI assistance can make constructing, inspecting, and revising a repair easier.

The working medical scope is **cranial vault reconstruction for cranioplasty**. In plain English, this means designing a proposed replacement for an existing missing section of the skull surrounding the brain. The exact supported defect locations and complexity remain open. This does not imply support for every skull structure or every bone.

## Desired outcome

Create a 3D design workspace where users can inspect anatomy, construct and edit candidate repairs, supply constraints, calculate geometric measurements, and work with an AI agent on the same case. The experience should resemble a focused design canvas with medically meaningful objects.

**Agreed product direction**

- Support biomedical engineers and surgeons. Prioritize the engineer's construction and revision workflow.
- Provide one shared set of capabilities. Organize controls by tasks such as select, constrain, generate, edit, measure, inspect, and compare. Do not add “surgeon mode,” “engineer mode,” or profession-specific versions of the same button.
- Support both an AI-generated starting replacement and generation guided by a user's intended repair or existing draft.
- Make human-directed iteration the central experience: generate → inspect → constrain or edit → regenerate or refine.
- Include an agent that understands the selected case, executes supported operations, explains tool results, and retrieves cited knowledge.
- Treat training our own reconstruction model as a preference. An existing model or suitable geometric method may supply the generation capability.
- Keep direct mechanical tools usable independently of chat. Both interaction paths operate on the same objects.

**Generation with human guidance**

A user can begin with only the defective anatomy, or provide a draft and supported constraints. Candidate guidance includes a region of interest, a reference contour, a region to preserve, or a localized revision request. The exact supported controls remain to be specified.

Natural-language instructions must map to real mechanisms. A region mask can restrict editable geometry; preserving a region requires an explicit lock and a check that the result respects it. Following a reference surface requires a fitting or reconstruction method that accepts that reference. Understanding an instruction in chat does not establish that the shape model can obey it.

Human guidance is intended to improve alignment with the user's design goal. Anatomical accuracy is evaluated separately. Local edits must also be checked for discontinuities where the revised and preserved regions meet.

**Three distinct outputs**

| Output | Meaning | Product representation |
| --- | --- | --- |
| Intended repair | Reconstruction objectives and case-specific constraints. | A reconstruction brief linked to annotated anatomy. This is a proposed product record, not a standardized clinical form. |
| Proposed design | A concrete candidate shape intended to satisfy those requirements. | An editable reconstruction segment or surface, with its source method and revisions. |
| Review result | Measurements, observations, and requested changes associated with that candidate. | A geometry report and spatial annotations tied to the reviewed revision. |

The demo deliverable is a reviewable digital reconstruction proposal. It is not automatically a finished implant specification for manufacture.

## Current product state (2026-11-14)

What has landed since the original draft. Feature folders remain the implementation authority.

### Software app model — shipped

`features/3d-bone-editor/software-app-model/`

- Durable local domain: **User → Project → Case → Sample → Candidate → Candidate revision**.
- **SQLite** for metadata; **filesystem** for NRRD bytes under `data/storage/`.
- Live authority is `app/server/storageSqlite.ts` and Express `/api` routes. Prepared NRRD volumes are authoritative geometry; display meshes are derived, not the save source of truth.
- Candidate revision R0 references the sample volume + pose (no byte copy at create). Delete is in v1. Portable zip export deferred.
- Source anatomy is protected; edits attach to candidates/revisions only.

### Business / management UI — shipped

`features/3d-bone-editor/business-ui/` and `business-ui-polish/`

- Management surfaces for projects, cases, samples, and candidates: list/create/open, hand off “open in 3D” to the canvas.
- **Atlassian role = layout/structure** (tables, toolbars, filters, page headers) — not the visual skin.
- **Radix Themes first** for management composition; Radix primitives where Themes lacks behavior; no `window.prompt`.
- Soft monochrome skin shared with the canvas (see Design below). Medit/wellness marketing chrome is an anti-reference.

### Canvas workspace — shipped (base)

`features/3d-bone-editor/canvas-workspace/`

- Unified canvas: load sample, inspect anatomy, create/select candidate, rigid **transform with Apply / Cancel**, restore prior revision, persist via app model.
- GLB-first / smooth display-mesh path for viewport quality; view actions never silently become edits.
- Shared ops surface for toolbar, shortcuts, and `window.__hackPrincetonDebug` automation.

### Mechanical canvas from 3D Slicer — shipped (Cross-reference Workbench)

`features/3d-bone-editor/canvas-workspace-improve/`

Behavioral contract is distilled from Slicer’s interacting-with-views, 3D view, mouse/keyboard, and coordinate-systems docs. Parity means **observable behavior**, not Qt chrome or full Slicer modules.

**Decided and implemented**

| Topic | Decision |
| --- | --- |
| Coordinate truth | Internal patient/world = **RAS** (+X Right, +Y Anterior, +Z Superior). Files default to **LPS** unless metadata declares RAS; one LPS→RAS flip on the first two axes. Full IJK→patient affine preserved. |
| Layout | **3D-first Cross-reference Workbench**: dominant 3D view + persistent compact **Axial / Sagittal / Coronal** slice dock; maximize/restore a single view. |
| Crosshair | Shared RAS point; Shift-pick moves crosshair; linked slices scroll together. “Linked” is status of shared crosshair sync (not a no-op control). |
| Modes | **View** (default), **Window/Level**, **Place** (one-shot or persistent). Escape cancels unfinished placement. |
| Navigation | Slicer-like orbit / pan / zoom / roll; Center / Reset View; standard anatomical views; view actions never mutate model transforms or source bytes. |
| Status | Compact RAS mm by default; expandable LPS / IJK. |
| Failure | Named viewport errors; Rebuild View on WebGL loss; last valid scene retained; Reset View always reachable. |
| Slice framing | Full plane drawn; auto-fit around anatomy; superior-up on sagittal/coronal for LPS Z-up volumes; volume-edge FOV falls back to full-plane framing when the scan mask touches a volume face. |
| Out of this contract | Mesh sculpt, boolean repair, implant generation, DICOM DB, Slicer modules beyond the linked view/coordinate sections. Advanced layer/keyboard/stereo parity deferred in plan Deviations. |

### Design system — soft monochrome Operate UI

Pinned 2026-11-14 (`PRODUCT.md`, `DESIGN.md`):

- Light gray ground, floating white containers, quiet depth; **Base → Ink → Accent** (accent blue only for strong actions); Signal for danger only.
- Dual register: Atlassian **structure** on management; Figma/Blender **density** on canvas chrome; same soft monochrome skin everywhere.
- Motion: Corporate/Premium micro-interactions (`cubic-bezier(0.2, 0, 0, 1)`); functional feedback, not decoration.
- Studio viewport: soft gray ground + 3D grid; slate display-mesh contrast against `#e8eaee`.

### AI workspace assistant — in progress (foundation)

`features/ai-workspace-assistant/`

- Accepted foundation: backend identity ownership ideas, shared structural schemas, SQLite/artifact storage in the Python sandbox, synchronous operation service, labeled reconstruction **mock**.
- Live app already owns project CRUD; Python has a **read-only** app workspace adapter. Do not point Python sandbox storage at `app-model.sqlite`.
- **Not done:** live AI chat mutations, real measurement/edit/compare contracts, graph/API/model integration, cited knowledge retrieval. Retry lifecycle is proposed pending review.

### Sample / training data

Curated SkullBreak cases under `data/samples/` (CC BY-NC-SA 4.0); inspection notes in `data/README.md`. Samples are not the app project store until product docs say so.

### Still aspirational (desired outcome, not shipped)

- Guided / learned bone completion as a first-class generate path.
- Quantitative measurement suite and review-result records as specified in the tables below.
- Agent that executes the same ops as mechanical tools with grounded explanations.
- Voxel sculpt, advanced annotations, contour-guided regeneration, raw CT preparation, clinical approval, manufacture, cloud collaboration.

## Affected users and systems

Biomedical engineers here means medical design or imaging/CAD specialists who construct patient-specific geometry. Surgeons contribute clinical objectives, anatomical interpretation, surgical constraints, and review. Responsibilities overlap: either person may operate the tools. A surgeon does not necessarily hand over a complete numerical engineering specification.

The workflow below synthesizes published planning practices [4–6]. The named records and controls are proposed product representations. Each technical description is followed by its plain-English meaning.

**1. Define the reconstruction intent**

**Technical:** The surgeon identifies the calvarial defect, anatomical location and laterality, intended reconstructed contour, and relevant surgical constraints. The surgeon and engineer agree how those requirements translate into geometry. Depending on the case, further considerations include the implant–bone interface, fixation access, and surrounding soft-tissue coverage. Detailed fixation and soft-tissue modeling are outside the initial working scope.

**Plain English:** The surgeon explains what region needs replacing, what result is intended, and what the design must respect. The engineer helps turn that description into things that can be drawn or checked.

**Expected output:** A reconstruction brief, marked defect region, reference contour or geometry when available, and explicit unresolved requirements. Any numeric target must identify its author, units, and rationale; the app does not invent a standard thickness or clearance.

**2. Prepare the anatomical reference**

**Technical:** In a CT-based workflow, an imaging specialist or engineer performs bone segmentation, inspects the segmentation, and produces a registered 3D representation. Segmentation means identifying bone within the scan. The surgeon can review the clinically relevant anatomy. A prepared segmented volume can bypass this preparation stage for the demo.

**Plain English:** Convert the scan into the bone model the design will use, then check that it represents the intended anatomy. A clean-looking render alone does not establish that the model is correct.

**Expected output:** A source bone volume and display surface with physical units, orientation, and coordinate metadata. Keep this reference available while experimenting on separate candidates. **Demo decision:** prepared NRRD / segmented volumes are the working input; raw CT ingestion remains out of current scope.

**3. Construct a reconstruction candidate**

**Technical:** The engineer creates a candidate for a patient-specific cranial implant using CAD operations, mirroring where suitable, surface fitting, or learned shape completion. The design concerns include external contour, internal surface, thickness, and the transition to the residual calvarium. Inlay designs sit within a defect; onlay designs extend over its margin [7].

**Plain English:** Build the replacement piece, including its outside shape, inside shape, thickness, and how it meets the remaining skull. The AI can produce a starting piece or help revise one.

**Expected output:** A separately editable candidate with its source, reference geometry, constraints, and revision history. Generating missing anatomy is only one part of designing an implant.

**Shipped today:** candidate entity + rigid transform revisions against protected sample anatomy. **Not shipped:** sculpt, boolean repair, learned completion as a product generate path (mock adapter exists in AI sandbox only).

**4. Inspect geometry and review the intended repair**

**Technical:** The engineer examines geometric properties and discrepancies. The surgeon reviews whether the proposal addresses the intended contour and surgical requirements. Both can inspect cross-sections, annotate the interface, and compare candidates. Numeric geometry measurements support this review; they do not establish clinical suitability by themselves.

**Plain English:** Check the piece from several views, identify where it fails to match the intended design, and mark what should change. Some questions can be answered by a calculation; others require human judgment.

**Expected output:** A revision-specific measurement report, annotated concerns, and localized change requests. Distinguish human observations from computed values and model predictions.

**Shipped today:** synchronized 3D + orthogonal slices, crosshair, window/level, place mode, coordinate readout. **Not shipped:** agreed quantitative measurement methods and formal review-result records.

**5. Revise and hand off the digital proposal**

**Technical:** The engineer or surgeon revises the candidate using shared tools. The agent can translate a request into supported operations. Recompute affected measurements and compare against the prior revision. In a full clinical workflow, technical finalization and surgical review precede manufacture and use; those downstream approvals are not implemented by this demo.

**Plain English:** Change the requested part, see exactly what changed, and keep a recoverable version of the result. Either user can make the change directly or ask the agent to do it.

**Expected output:** A saved candidate revision, its constraint and measurement records, and a concise change explanation. Exact external export formats remain open.

**Measurements and constraints**

A requirement is a desired target; a measurement describes the current geometry. Neither user group owns all measurements. A user supplies or reviews the annotation or target, and the software calculates the supported quantity.

The following is a proposed metric vocabulary, not a finalized MVP checklist. Clinical studies examine defect extent and implant thickness, rim geometry, surface area, and volume [2, 8]. The calculation conventions below are product choices requiring specification.

| Term and units | Technical meaning | Plain English and source of the value |
| --- | --- | --- |
| Defect location and laterality | Human-checked anatomical region and left/right designation. | Where the missing section is. A person supplies or verifies the label. |
| Defect span, mm | Distance between selected landmarks. Directional spans can be anterior–posterior or superior–inferior when correctly placed. | How far the opening extends front to back or top to bottom. Users place/check endpoints; software measures them. |
| Defect area estimate, cm² | Proposed convention: project a checked rim curve onto a displayed fitted plane and measure the enclosed area. | An estimate of opening size. This is not the exact missing curved surface and is not interchangeable with other clinical area-estimation methods. |
| Annotated rim length, mm | Length of a selected closed 3D boundary curve. | Distance around the chosen edge. Depends on how that edge was marked. |
| Implant thickness, mm | Separation of inner and outer candidate surfaces under a specified thickness algorithm. | How thick the replacement is locally. A desired thickness is a supplied constraint; measured thickness is an output. |
| Rim/interface distance, mm | Distances between explicitly identified candidate and defect interface regions, with a defined sampling method. | Where the proposed piece sits away from the intended boundary. A nearest-surface distance alone cannot prove full fit. |
| Bone overlap, mm³ | Intersection of candidate and source bone geometry. | Where both occupy the same space. Some rim designs intentionally overlap the bone, so report location and extent rather than marking every overlap as a failure. |
| Candidate surface area and volume, cm² / cm³ | Area of the specified candidate surface and enclosed or occupied volume. | Size of the proposed piece. Neither quantity alone establishes shape accuracy or suitability. |
| Surface deviation, mm | Distance to a named, aligned reference surface. | How the proposal differs from a reference. The reference and comparison method must be visible. |

Coverage, contour continuity, and unwanted geometry are also useful review concepts in reconstruction research [3]. Quantifying them requires explicit reference regions and definitions. Do not invent a universal “fit score” or pass threshold.

These records stay attached to the geometry revision that produced them. Missing inputs yield an unavailable result with a reason. Changes invalidate dependent measurements until recalculated.

**Canvas objects and system responsibilities**

Candidate shared objects include source anatomy, defect annotations, landmarks, measurement lines, reference surfaces, regions of interest, candidate segments, and inspection planes. Trim planes, local editing brushes, and preservation masks remain proposed controls. An inspection plane changes visibility; a geometry-editing tool changes a candidate.

| System responsibility | Intended behavior | Status |
| --- | --- | --- |
| Canvas and case state | Display and select objects; retain annotations, constraints, candidates, and revisions in one coordinate system. | Partial — case/candidate/revision + view/crosshair state shipped; rich annotations deferred. |
| Geometry tools | Perform explicit construction/editing operations and calculate measurements. | Partial — rigid transform + place; measure/sculpt open. |
| Reconstruction generator | Infer or construct a candidate missing-bone shape using the supported inputs and constraints. | Mock adapter only; real method undecided. |
| AI agent | Read case context, interpret requests, call tools, and explain their actual results. | Foundation in progress; live mutations not available. |
| Evidence retrieval | Supply cited source passages for knowledge questions; distinguish general literature from case-specific findings. | Not started. |
| Persistence | Save anatomy references, candidate versions, constraints, results, and operation history. | App-model CRUD shipped; AI review/run records in Python sandbox. |

A segmented volume with derived display meshes is the working representation. Full spatial metadata must be preserved. Source anatomy remains separate from experimental edits; simplified display geometry should not silently replace measurement geometry. Technical stack for the editor shell: Vite + React + TypeScript + Three.js (`PRODUCT.md`).

## Constraints

- This is a HackPrinceton prototype for prepared research/demo cases. The team has general software expertise and limited medical background; explain specialized terms alongside their use.
- Provide the same feature set to both user groups. Engineering-first prioritization concerns task depth, not access restrictions or role-specific UI.
- Include agentic behavior. Custom model training is optional.
- Use deterministic algorithms for quantities or edits that are fully defined by existing geometry. Use a learned reconstruction model where missing anatomy must be inferred.
- Record what was supplied by a human, predicted by a model, or calculated by a tool. Keep generated objects separate and edits recoverable.
- Do not silently ignore unsupported constraints. Acknowledge them before claiming the request was fulfilled.
- Use accessible data and document applicable licenses. Keep evaluation targets out of runtime generation and agent context.
- UI / front-end work must follow `DESIGN.md` / `PRODUCT.md` (soft monochrome Operate UI). Mechanical canvas behavior must follow the accepted Slicer-parity specs under `canvas-workspace-improve/`.
- Mechanical tools and the future agent share one operation layer; direct tools must work without chat.

**Data and ML direction**

The proposed learned task is defective skull volume → missing-bone volume, or completed skull followed by evaluated extraction of the missing portion. SkullBreak/SkullFix provide binary NRRD triplets containing complete skulls, artificial defects, and removed bone [9]. These targets support shape completion rather than clinical outcome prediction.

SkullBreak's 570 training examples derive from 114 skulls. Split by source skull so related defects do not cross training/test boundaries. Preserve spatial transforms during preprocessing. Compare a learned method with a simple applicable baseline, such as mirroring on suitable unilateral defects.

Evaluate missing-piece overlap and physical surface distances, runtime, constraint adherence, and visible failure cases. Benchmark similarity does not replace review of the intended design. Following Google's ML guidance, define measurements, start with a simple baseline/model, and verify the complete data-to-output workflow [10]. Pretrained AutoImplantPipe code and checkpoint links are implementation leads, not dependencies already tested locally [11].

**Provisional staging**

| Draft milestone | Intended outcome | Decision status |
| --- | --- | --- |
| Mechanical foundation — inspect & persist | Inspect prepared case in 3D + linked slices; durable project/case/sample/candidate/revision; rigid candidate transform with recoverable revisions. | **Shipped** (app model + canvas + Slicer Cross-reference Workbench). |
| Mechanical foundation — measure & compare | Annotate, constrain, measure, and compare with agreed metric contracts. | Still needed; exact tools and metrics remain open. |
| Business management shell | Atlassian-structured management CRUD with soft monochrome + Radix Themes. | **Shipped** (business-ui + polish). |
| Agent-enabled MVP | Execute supported canvas operations through chat and provide grounded explanations and cited knowledge. | Agreed direction; foundation in progress; live demo minimum still open. |
| Guided generation | Generate a starting replacement and refine a candidate using implemented human constraints. | Agreed capability; MVP versus stretch still open; sandbox mock only today. |
| Optional model work | Train or fine-tune a reconstruction model and compare it with a baseline. | Preference, not a required milestone or dependency. |
| Further stretch work | Richer local editing, raw CT preparation, or additional planning objects. | Candidates to scope separately; not automatically committed. |

## Out of scope

- A universal bone or reconstructive-surgery platform in the first version. Cranial vault reconstruction remains the proposed starting scope; jaw, orbit, skull base, and pediatric planning require separate definitions.
- Autonomous clinical decisions, implant manufacture, surgical deployment, or certification of a candidate as safe.
- Predicting healing, complications, or postoperative appearance from the available skull-shape labels. These require separate targets and evidence.
- Treating a bone-completion result as a complete manufacturable implant with validated material and fixation specifications.
- Separate applications or hardcoded workflows by profession. Real-time multiuser collaboration is not required merely to support both groups.
- Writing implementation plans or treating every proposal in this document as an accepted technical requirement.
- Copying full 3D Slicer application modules (DICOM database, Segment Editor as product scope, Python console, extensions) beyond the accepted view/coordinate parity boundary.

## Open questions

1. Which cranial vault defect types and locations will the first case support?
2. ~~Does the first workflow begin with a prepared segmented model or raw CT?~~ → **Prepared NRRD / segmented volumes** for the current demo phase.
3. Which actual corrections and guidance controls should be implemented first after rigid transform? Planar trimming is one candidate, not an agreed clinical priority. Slicer Segment Editor is a candidate *reference* for a later geometry-edit contract, not adopted wholesale.
4. Which measurements are essential for the first demonstration, and what are their exact definitions and expected precision?
5. Which generation method can we run with available data, licenses, hardware, and time? Which constraints can it genuinely honor?
6. Does guided generation belong in the MVP or the first stretch phase?
7. What candidate import/export format and review record are needed for the demo?
8. What small held-out evaluation and example workflow will demonstrate generation, editing, and agent tool use working together?
9. Which browser/device combinations are acceptance targets for touch (and later stereo) capability checks?
10. When AI live mutations land, what exact protocol validates browser-executed geometry commits against app-model revisions?

**Research basis**

The cited sources establish clinical context and technical precedents. Product records, controls, and milestone assignments above remain our design choices.

1. [Chen et al., EasyCrania, 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5482863/) — dedicated cranial design workflow and measured design effort.
2. [Thickness and design features of clinical cranial implants, 2024](https://pubmed.ncbi.nlm.nih.gov/38430381/) — thickness, rim width, surface area, and volume; measured cohort values are not universal design targets.
3. [Li et al., Back to the Roots, 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11116219/) — reconstruction quality on clinical defects and human correction.
4. [Wilde et al., Computer-Assisted Mandibular Reconstruction, 2014](https://pmc.ncbi.nlm.nih.gov/articles/PMC4078148/) — explicit surgeon–engineer planning collaboration; a mandibular cadaver study, not a universal cranial protocol.
5. [Hagen et al., Automated Knowledge-Based Virtual Surgical Planning, 2025](https://www.mdpi.com/2077-0383/14/13/4508) — imaging preparation followed by surgeon-operated proposal review and refinement.
6. [Perez and Gordon, Computerized Surgical Planning in Complex Cranioplasty, 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11305828/) — cranial reconstruction context and surgical considerations.
7. [Quantitative Assessment of Patient-Specific PEEK Cranial Implants, 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8395180/) — contour, thickness, edge profiles, and manufacturing-related design elements.
8. [Oliveira et al., Cranial Bone Defect Assessment, 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC10876786/) — directional spans and an area-estimation method; our proposed projected-area convention differs.
9. [Kodym et al., SkullBreak / SkullFix, 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8100897/) — attached dataset paper; synthetic defect triplets, subject counts, and data limitations.
10. [Google, Rules of Machine Learning](https://developers.google.com/machine-learning/guides/rules-of-ml) — metrics, simple baselines, and reliable pipelines.
11. [AutoImplantPipe](https://github.com/biodatlab/autoimplantpipe) — documented inference/training entry points and checkpoint licensing notes; access and execution still require verification.
12. [3D Slicer Markups](https://slicer.readthedocs.io/en/latest/user_guide/modules/markups.html) and [Segment Editor](https://slicer.readthedocs.io/en/latest/user_guide/modules/segmenteditor.html) — established annotation and geometry-editing concepts.
13. [3D Slicer: Interacting with views](https://slicer.readthedocs.io/en/latest/user_guide/user_interface.html#interacting-with-views), [3D view](https://slicer.readthedocs.io/en/latest/user_guide/user_interface.html#d-view), [Mouse and keyboard](https://slicer.readthedocs.io/en/latest/user_guide/user_interface.html#mouse-keyboard-shortcuts), [Coordinate systems](https://slicer.readthedocs.io/en/latest/user_guide/coordinate_systems.html) — normative reference boundary for the shipped Cross-reference Workbench.

## Amendments

2026-11-13 — Draft revised to record shared capabilities for biomedical engineers and surgeons, engineering-first task priorities, technical and plain-English workflow descriptions, human-guided generation, and optional custom model training. Earlier exact editing choices and stage assignments remain proposals. Status remains draft.

2026-11-14 — Product state catch-up: recorded shipped **software app model**, **business UI + polish**, **canvas workspace**, and **Slicer-standard Cross-reference Workbench** (RAS/LPS, linked slices, View/W/L/Place, view≠edit). Recorded soft monochrome Operate design system and AI foundation-in-progress. Marked prepared NRRD as the demo anatomy input. Updated staging, system-responsibility status, and open questions. Product display name remains undecided; this file stays draft product input, not an accepted feature spec.
