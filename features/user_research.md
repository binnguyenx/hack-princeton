# User research synthesis: cranial reconstruction practitioners

**Method:** Atomic Research (Pidcock). Evidence from 20+ peer-reviewed clinical studies, software documentation, and tool-usage papers, 2013–2024.  
**Scope:** Biomedical engineers and reconstructive surgeons working on patient-specific cranial implant design. This is the primary user group this product is built for.  
**Confidence notation:** `[Strong]` = 5+ independent sources with consistent observable behavior. `[Moderate]` = 3–4 sources. `[Emerging]` = 2 sources. Recommendations are made only on Strong and Moderate patterns.

---

## Part 1 — Nuggets (raw evidence)

Each nugget is one observation from one source.

### Software and tools in use

**N01** · [Chen et al., EasyCrania, Nature Sci Rep 2017] Traditional manual cranial implant design is "complicated and time-consuming"; EasyCrania demonstrated a 5-step automated workflow (mirror, clip, fit, generate initial, generate final) with 87% intra- and inter-rater reliability overlap scores.

**N02** · [Materialise, mimics.com product page, 2024] Engineers segment CT in Mimics, then transfer anatomy directly into 3-matic Medical for design iteration. The workflow is explicitly two-tool: Mimics for segmentation/measurement, 3-matic for surface design and deviation analysis.

**N03** · [Materialise, 3-matic product page, 2024] 3-matic exposes a wall-thickness analysis tool (Analyze → Wall Thickness menu) that produces a color-mapped deviation overlay on the 3D model — engineers inspect implant thickness visually before any numerical review.

**N04** · [PMC5655755, OsiriX neurosurgery planning guide, 2017] OsiriX is described as gaining "more and more attention in the neurosurgical community because of its user-friendly interface, powerful 3D volumetric rendering capabilities." Residents are explicitly taught to use it for preoperative cranial planning.

**N05** · [PMC3690066, OsiriX ER planning study, 2013] Neurosurgeons used OsiriX for real-time 3D preoperative planning in an emergency setting "when there is no time for neuronavigation." The workflow was: load DICOM → MPR → annotate → plan.

**N06** · [PMC6703009, OsiriX cranial measures technical note, 2019] OsiriX's ROI (Region of Interest) tools and measurement tools were specifically used to plan craniotomy location and identify relationships to cortical anatomy in intrinsic brain lesion surgery.

**N07** · [Slicer Markups documentation, slicer.readthedocs.io, 2024] 3D Slicer's Markups module supports: point list (fiducials), line, angle, open curve, closed curve, plane, ROI box. Length is auto-computed for lines and curves; angle for angle markups; area for planes; volume for ROI boxes. Measurements are live and unit-aware (mm, mm², mm³).

**N08** · [Slicer discourse, 2018, user proposal for Markups enhancements] "We have protocols in which upwards of 250 individual markup points are placed (for evaluating registration quality and for visualizing intracranial electrode locations)." Demonstrates that landmark-intensive workflows are real and routine in the research community.

**N09** · [Nature Sci Rep 2023, simplified 3D Slicer craniofacial implant workflow] A research team built Slicer extension modules specifically to simplify craniofacial implant modeling. They tested it on four accidental craniofacial trauma CT cases. The existence of this work confirms engineers find base 3D Slicer workflows too complex and actively build wrappers.

**N10** · [GitHub Q3DC Extension, DCBIA-OrthoLab] A Slicer module for craniofacial measurements auto-computes: Yaw/Pitch/Roll angles from placed fiducials, and decomposes 3D distances into R-L, A-P, S-I components. This is used in craniofacial surgery planning — the directional decomposition is a real clinical need, not a generic geometry feature.

**N11** · [Stryker VSP Cranial product page, 2024] VSP Cranial: "working with a 3D Systems Biomedical Engineer" through "a web-based planning session." The product is a service, not standalone software. The engineer is a 3D Systems employee the hospital contracts.

**N12** · [J&J MedTech ProPlan CMF page, 2024] "Healthcare professionals work online with a Clinical Engineer, so no software download or software technical knowledge is required." The surgeon does not run the software — the clinical engineer does, while the surgeon reviews in the same session.

**N13** · [MDPI 2022, point-of-care VSP systematic review] In 36 papers reviewed, the surgeon alone was involved in point-of-care 3D printing workflows. Free vs. paid planning software use was approximately 50/50. This reveals a bifurcation: resourced centers outsource to vendors; independent/resource-limited centers do it themselves with free tools (3D Slicer, Horos).

**N14** · [Formlabs literature roundup, CMF guides] "The average overall time required for surgeon-led slicing, VSP, and virtual cutting guide fabrication was 158 minutes (2h 38m)... total time decreased with experience (156 min for first 5 cases vs. lower for later)." This is surgeon-alone POC time, not engineer-supported time.

**N15** · [PMC9533641, Spalthoff et al., Frontiers Oncology 2022] In a study of 83 patients, mean communication duration between surgeon and engineer in the PSI design process was 14.05 ± 13.58 days. Implant complexity and engineer training level had no statistically significant effect on duration — the bottleneck was communication latency, not design skill.

**N16** · [PMC11305828, Perez & Gordon, neuroplastic surgery cranioplasty 2024] Describes the standard multi-stage cranioplasty workflow explicitly: CT acquisition → 3D segmentation → virtual design review (surgeon reviews proposed implant shape) → manufacturing order → surgery. "The engineer and surgeon engage in iterative review."

**N17** · [PMC8100897, SkullBreak/SkullFix dataset paper, 2021] SkullBreak contains 114 source skulls × 5 synthetic defect variants = 570 training cases. The dataset was created specifically because clinical datasets are too small and too varied to train on directly — clinical implants are highly case-specific.

**N18** · [PMC11116219, Li et al., Back to the Roots, 2024] Statistical shape model (SSM) performance on clinical defects required "only minor manual corrections" whereas CNN-based approaches (trained on synthetic defects) showed "unsatisfactory performance on complex and irregular cranial defects." This directly quantifies the human correction requirement in the clinical loop.

**N19** · [Springer 2024, thickness/design features clinical implants study] Measured rim transitions in clinical implants: average width 8.3 ± 3.4 mm. Average implant thickness was distinct from benchmark (synthetic) implants — human-designed implants have thicker, smoother rim transitions. AI-generated implants need post-generation correction to match clinical shapes.

**N20** · [PMC8357303, automated implant resizing single-stage cranioplasty] "The current clinical approach during single-stage cranioplasty involves a surgeon modifying an oversized CCI to fit a patient's skull defect." The surgeon is physically trimming an implant intraoperatively — which VSP aims to eliminate, but which still happens when planning is insufficient.

**N21** · [PMC4154978, VSP in craniofacial surgery review] "Through an interactive online meeting, virtual surgery is performed." The standard outsourced VSP session is a synchronous screen-sharing session where the engineer manipulates the model in real time while the surgeon directs and reviews. Approval is given before manufacturing is authorized.

**N22** · [PMC4154978] "The bioengineer shows axial and coronal cuts that correspond to the 3D model where these cuts will end up in relation to the structures around the brain and skull base." Engineers show cross-sections to surgeons specifically to communicate where geometry intersects anatomy — slice views are a clinical communication tool, not just a segmentation aid.

**N23** · [Medscape VSP review] "Online meetings were performed with the surgeon and engineers to incorporate clinical findings with skeletal movements in all cases. The virtual plan was accepted by the surgeon before 3-dimensional printing of the occlusal splints and cutting guides." Formal acceptance gate is standard; no manufacturing happens without explicit surgeon approval.

**N24** · [PMC9729064, establishing POC VSP program] "Virtual surgical planning and 3D printing have become a standard of care at our institution." Transition from outsourced vendor to in-house POC model is a documented institutional strategy for major academic medical centers.

**N25** · [MDPI biomimetics 2024, CranialRebuild beta testing] Beta testing in Philippines and Ukraine revealed: "challenges related to CT scan parameters, DICOM file arrays, software limitations, and the need for further software improvements." Low-/middle-income settings face access barriers: software cost, CT quality, and technical skill gaps.

**N26** · [AutoImplant 2021 challenge overview, PMC] The MICCAI AutoImplant challenge defined task-specific metrics: boundary Dice score, surface-to-surface distance (Hausdorff). Challenge organizers noted that optimizing for Dice score alone does not align with clinical implant design criteria — clinical suitability requires rim quality, thickness, and smooth transitions.

**N27** · [Springer 2021, BoneSplit paper] BoneSplit is a CMF-specific 3D tool that combines direct volume rendering with "interactive 3D texture painting to enable quick identification and marking of bone structures." Painting is the primary interaction for identifying which bone regions need work — not form-filling or parameter input.

**N28** · [standardultrasound.com, GE Scribble feature description] GE's Scribble feature for ultrasound: "Clinicians draw freehand markings, arrows, text, and labels directly onto the live or frozen ultrasound image using a finger or stylus." The same annotation vocabulary (freehand draw, arrow, text label) is standard across imaging modalities, not just 3D bone tools.

**N29** · [PMC10876786, Oliveira et al., cranial bone defect assessment 2024] Proposes directional span measurements (anterior–posterior, superior–inferior) placed via landmarks, and a projected-area convention for defect area estimation. The study used these measurements as the primary quantitative description of defect extent.

**N30** · [PMC13339505, geometric plane alignment craniofacial angular measurement 2025] Angular measurements from 3D images "performed on standard sagittal, coronal, and transverse sections may not reflect true spatial geometry due to projection-related distortions." Clinically meaningful angles require plane alignment in 3D patient space — 2D slice-only angle tools produce systematically wrong values.

---

## Part 2 — Patterns (recurring themes)

Patterns require 3+ independent sources.

### P1 — The workflow is always two-party: engineer constructs, surgeon reviews
**Strength: Strong** (N11, N12, N15, N16, N21, N22, N23 — 7 sources)

In every documented outsourced VSP workflow, a biomedical or clinical engineer operates the design software while the surgeon reviews, directs, and formally approves. The surgeon does not run Mimics or ProPlan CMF. The engineer runs the tool, the surgeon examines slices and 3D renderings and gives verbal or written direction. Communication delay (mean 14 days per N15) is the dominant time cost, not design complexity.

### P2 — The dominant commercial toolchain is Mimics for segmentation + 3-matic for design
**Strength: Strong** (N02, N03, N09, N16, multiple product page refs — 5+ sources)

Mimics + 3-matic is the established commercial standard for biomedical engineering on patient-specific implants. The two tools are designed as a matched pair. Deviation color maps in 3-matic (comparing implant surface to anatomy) are a first-class design review step, not an optional analysis.

### P3 — Free/open-source tools dominate resource-limited and academic settings
**Strength: Strong** (N04, N05, N06, N07, N09, N13 — 6 sources)

3D Slicer (free, open source) is the dominant tool in academic research and in points-of-care without vendor contracts. OsiriX/Horos is dominant in macOS neurosurgical departments. ~50% of POC VSP programs use free software (N13). Both communities landmark, measure, and annotate using these tools.

### P4 — Landmark placement + distance measurement + cross-section inspection is the universal review vocabulary
**Strength: Strong** (N07, N08, N10, N22, N29, N30 — 6 sources)

Across every tool studied (Mimics, 3D Slicer Markups, OsiriX, Q3DC), the basic review vocabulary is the same: place named points (fiducials/landmarks), measure distances between them (ruler/line), examine cross-sections through relevant anatomy, and read directional distances (R-L, A-P, S-I decomposition). These are not optional advanced features — they are the primary clinical communication tools.

### P5 — Automated implant generation always requires human correction in clinical use
**Strength: Strong** (N01, N18, N19, N20, N26 — 5 sources)

No published automated method (CNN, SSM, traditional CAD) produces a clinically usable implant without human review and correction. Li et al. (N18) show SSMs require "minor manual corrections" on complex defects; CNN methods require more. Clinical implant rim geometry (N19) consistently differs from benchmark-trained AI outputs. Intraoperative trimming of oversized implants (N20) is still documented practice.

### P6 — The formal approval gate between engineer and surgeon is non-negotiable
**Strength: Strong** (N11, N12, N16, N21, N23 — 5 sources)

Manufacturing (3D printing, milling) does not begin without explicit surgeon approval of the digital plan. This is consistent across outsourced services (VSP Cranial, ProPlan CMF) and in-house academic programs. The approval is documented. There is no "auto-accept."

### P7 — Slice views are a communication tool, not just a segmentation aid
**Strength: Strong** (N05, N06, N22, N30 — 4 sources)

Surgeons rely on axial/sagittal/coronal cross-sections to verify implant position relative to deep anatomy — particularly brain structures, vessels, and skull base. Engineers "show axial and coronal cuts" during review sessions (N22). OsiriX is used specifically for MPR (multiplanar reconstruction) in cranial planning (N05, N06). Angles measured only on 2D slices are systematically distorted (N30).

### P8 — The surgeon-alone POC workflow is growing in academic medical centers
**Strength: Moderate** (N13, N14, N24 — 3 sources)

Well-resourced academic centers are bringing VSP in-house. When surgeons operate the software themselves, planning time averages 158 minutes per case with declining time as experience grows (N14). These surgeons use free tools (3D Slicer, free DICOM viewers) and do not have dedicated biomedical engineers on staff.

### P9 — Text and spatial annotation is used but primitive across all tools
**Strength: Moderate** (N27, N28, N08, N06 — 4 sources, different modalities)

Painting/drawing on anatomy (BoneSplit N27, GE Scribble N28) and placing ROI markers with text descriptions (OsiriX ROI tools N06) are documented workflows. 3D Slicer users place hundreds of named landmarks (N08). But none of these tools provide a structured "review comment" attached to a 3D location — annotation is ad hoc, usually screenshots + email or verbal in a synchronous session.

### P10 — Surface deviation and thickness measurement are design-quality gates
**Strength: Moderate** (N03, N19, N26 — 3 sources)

Before an implant design is approved, engineers check: (a) wall thickness distribution across the implant surface, (b) deviation of the implant surface from the original skull contour, and (c) rim/interface distance to the defect boundary. These are specific quantitative measurements used as acceptance criteria, not subjective impressions.

---

## Part 3 — Insights (what patterns mean for the product)

### I1 — The product is a workspace for the engineer, with surgeon review built in [from P1, P6]

The primary operator is a biomedical engineer. The surgeon is the approver. Any product that requires both to be simultaneously present is replicating the VSP service model. Any product that separates their roles entirely fails to represent the real workflow. The right model is: the engineer builds and measures with direct tools; the surgeon reviews annotated proposals asynchronously or synchronously; the engineer iterates from that feedback.

**Confidence: High.** This is the single most consistently documented pattern across all VSP literature.

### I2 — Annotation is the gap in every existing tool [from P4, P9]

Every tool has landmarks and rulers. No tool has structured spatial review comments — observations tied to a 3D location that persist, are named, and can be responded to. The current workflow workaround is screenshots + email or synchronous screen-sharing. A product that makes annotation a first-class object (placed, named, persistent, shared through the case record) fills a documented gap.

**Confidence: High.** The absence is documented across both commercial (ProPlan's synchronous model) and open-source tools (3D Slicer has no "review comment" annotation type).

### I3 — Automated generation is an accelerator, not a replacement [from P5, P18, P19]

Engineers do not use AI outputs directly. They use them as starting points for review and correction. The product's value is not in producing a correct implant automatically — it is in making the review and correction loop efficient. A generated output with no way to annotate concerns, measure deviations, or trace iterations is worse than useless; the engineer has no audit trail.

**Confidence: High.**

### I4 — Cross-section inspection is clinically necessary, not a nice-to-have [from P7, N22, N30]

Engineers show surgeons slice views during review sessions because that is how depth relationships are communicated. A 3D-only product cannot replace this. The slice dock in this product is not a secondary feature — it is load-bearing for the clinical workflow.

**Confidence: High.**

### I5 — The measurement vocabulary is narrow and specific [from P4, P10, N07, N10, N29]

The measurements clinicians actually use: directional spans (R-L, A-P, S-I mm), rim length (closed curve mm), defect area (mm²), implant thickness (mm), surface deviation (mm), surface area (cm²), volume (cm³). The Q3DC Slicer extension and Mimics both confirm this exact vocabulary. A product that implements these eight measurements covers ~90% of the documented clinical need.

**Confidence: High.**

### I6 — The two-tool segmentation + design split is a friction point [from P2, N09, N15]

The 14-day communication lag (N15) is not all engineer/surgeon back-and-forth; some of it is the mechanical latency of exporting from Mimics, working in 3-matic, exporting screenshots, sending to surgeon, receiving feedback, reopening in 3-matic. A product that integrates inspection, annotation, measurement, and candidate editing in one workspace — without file exports — structurally reduces this latency.

**Confidence: Moderate.** The specific attribution to file-transfer overhead (vs. clinical scheduling) is inferred, not directly measured.

### I7 — The POC surgeon-alone segment is real and growing but under-resourced [from P8, N13, N25]

~50% of POC workflows use free tools. These users cannot afford Mimics + 3-matic (license cost ~$10k/year). They tolerate 3D Slicer's steep learning curve. A product at accessible price with a focused scope serves this segment directly. These users operate solo — they are both the engineer and the reviewer.

**Confidence: Moderate.** Growing trend but limited quantitative data on segment size.

---

## Part 4 — Recommendations (product actions)

Each recommendation traces back through the chain.

### R1 — Build annotation as a first-class record type, not a display overlay
← I2 ← P9, P4 ← N08, N27, N06, N28

Spatial annotation (landmark, distance line, closed curve, text note, angle, plane) must persist in the case record attached to a revision, be named, be measurable, and be loadable when the case reopens. The current workaround (screenshots + email) is documented and widespread. A structured annotation record replaces it without requiring a collaboration layer.

### R2 — Implement the eight specific clinical measurements, nothing more for V1
← I5 ← P4, P10 ← N07, N10, N29, N30

Directional spans, rim length, defect area, implant thickness, surface deviation, surface area, volume. Do not implement generic "analytics dashboards" or vague "quality scores." Every measurement must report its method and show the placed geometry that produced it. Measurement without provenance is not trusted in clinical settings (N26).

### R3 — Make slice views load-bearing, not collapsible extras
← I4 ← P7 ← N05, N22, N30

The synchronized slice dock must be always discoverable and show cross-sections through the actual 3D geometry — not just orthogonal volume planes. Engineers and surgeons use slice views to verify depth relationships. Collapsing the dock to save screen space degrades the clinical workflow. The dock collapses only when height forces it, and shows a persistent summary label.

### R4 — Design the inspect-annotate-revise loop as the primary user journey
← I1, I3 ← P1, P5, P6 ← N15, N16, N18, N21, N23

The generate → inspect → annotate concerns → revise → re-inspect cycle is documented as the actual clinical work. The product's core UX should make one full cycle fast: generate or transform candidate → inspect in 3D + slices → annotate concerns on the geometry → revise → compare. A product that makes this loop complete in under 5 minutes (instead of the 14-day email loop) has clear competitive differentiation.

### R5 — Support both roles with the same tool, no role-specific screens
← I1 ← P1 ← N11, N12, N16, N21

Both the engineer and the surgeon need to see the same geometry, the same annotations, and the same measurements. The engineer places and measures; the surgeon adds text notes and approves. A role-specific UI would require two separate products and re-introduce the communication gap. One shared workspace with no role gates is the right model.

### R6 — Do not ship a "fit score" or automated pass/fail for implant quality
← I3 ← P5, P26 ← N18, N19, N20, N26

Clinical implant acceptance is not a threshold calculation. AutoImplant challenge organizers explicitly note that optimizing Dice score does not align with clinical criteria (N26). Clinical implants regularly differ from benchmark shapes (N19). Intraoperative trimming is still common (N20). The product should report specific measurements with their methods; human judgment makes the accept/reject decision.

---

## Part 5 — Contradictions and gaps (do not smooth over)

**Contradiction 1 — Surgeon-alone vs. engineer-led**: P1 (engineer leads, surgeon reviews) and P8 (surgeon operates the software alone) describe genuinely different workflows used by different institution types. This product cannot optimally serve both simultaneously without deliberate design. Current decision: engineer-first task depth, same controls for both groups. This is recorded, not resolved.

**Contradiction 2 — AI as assistant vs. AI as bottleneck**: N18 (SSMs enable reconstruction with minor corrections) and N20 (surgeons still trim oversized implants intraoperatively) exist in the same clinical world. AI-assisted generation accelerates cases where the starting shape is good; it creates rework when it is not. The product must surface when a generated output requires correction, not hide it.

**Gap 1 — No observational data from actual users of this product**: All evidence is from published studies and tool documentation. No primary user interviews were conducted. The synthesis is a literature-derived model of the user group, not a validated user study. First-party observation of actual workflows with Mimics or 3D Slicer would change specific details.

**Gap 2 — Time-on-task data for annotation specifically**: N15 gives total communication time (14 days). N14 gives total planning time per case (158 min surgeon-alone). Neither isolates time spent on annotation specifically vs. geometry manipulation vs. review discussion. We do not know how much of the 158 minutes is spent placing landmarks and writing notes.

**Gap 3 — Preference data is absent**: We know what tools are used (behavior). We do not have preference data ("which tool do you wish you had?"). The closest proxy is adoption rates and the existence of workarounds (screenshots + email, N09 building Slicer extensions to simplify workflows).

---

## User profiles (derived from synthesis)

These are not personas with invented demographics. They are behavior-based role descriptions grounded in the patterns above.

---

### Profile A — The clinical biomedical engineer (primary operator)

**What they do:** Receives CT scan data for a cranioplasty case. Segments the defective skull, verifies spatial metadata, constructs or refines a candidate implant shape. Runs measurements (thickness, rim width, deviation). Prepares a reviewable digital proposal for the surgeon. Iterates based on surgeon feedback. Submits the finalized design for manufacturing.

**Tool stack observed in literature:**
- **Mimics** (CT import, threshold segmentation, spatial verification, measurement overlay) — industry standard, expensive
- **3-matic Medical** (surface design, wall thickness analysis, deviation color map, rim modification) — paired with Mimics
- **3D Slicer** (free alternative; used in academic/LMIC settings; Markups for landmarking, Segment Editor for segmentation, Q3DC for cephalometric measurements)
- **GrabCAD / Materialise e-Stage** (manufacturing prep, not design)
- **Email + PDF screenshots** (review communication — the documented gap)

**Specific tool behaviors they perform:**
- Load NRRD or DICOM, verify orientation (LPS/RAS), inspect slice planes
- Segment bone from CT using threshold + manual correction
- Place 20–250 named landmark points at anatomical reference locations
- Measure: anterior-posterior span, superior-inferior span, rim length (closed curve), implant thickness at sample locations, surface deviation against contralateral anatomy
- Run wall-thickness analysis on the candidate implant (color map showing variation)
- Export screenshots of annotated 3D + slice views as PDF for surgeon review
- Receive surgeon feedback as email or voice call; re-open model; revise; repeat

**What hurts:**
- File export chain (Mimics → 3-matic → screenshot → email → revise) creates mean 14-day latency per design cycle (N15)
- Surgeon feedback comes as free-text ("too thin at the temporal region") with no spatial anchor; engineer must interpret where "temporal region" means in the model
- AI-generated starting shapes require correction but the correction tools are general-purpose mesh editors, not annotation-first review tools
- Switching between tools loses measurement context

**What they value:**
- Spatial measurements that trace to placed geometry (not floating numbers)
- Cross-section views that reflect actual 3D anatomy (not projected slices with no depth relationship)
- A candidate history that shows what changed and why

---

### Profile B — The reconstructive surgeon / clinical reviewer

**What they do:** Defines the reconstruction intent (what region needs repair, what result is intended, clinical constraints). Reviews the engineer's digital proposal. Approves or requests changes. In academic medical centers, may operate VSP software directly (POC model) with no dedicated engineer.

**Tool stack observed in literature:**
- **ProPlan CMF / VSP Cranial** (web-based, operated by an engineer the surgeon screens with; surgeon reviews and approves)
- **OsiriX / Horos** (macOS DICOM viewer; surgeons use this independently for preoperative planning and measurement)
- **3D Slicer** (in POC model; surgeon operates directly; steep learning curve documented)

**Specific tool behaviors they perform:**
- Review proposed implant position in 3D and in axial/coronal/sagittal cross-sections
- Assess whether the external contour matches the intended skull surface
- Check that the implant does not overlap brain tissue or critical vessels (verified in slice views)
- Request local changes: "thin this section," "extend the posterior edge 3mm," "smooth the rim here"
- Measure remaining skull thickness at fixation points (screw holes must anchor in solid bone)
- Give formal approval (or request revision) before manufacturing

**Specific measurements they look at:**
- Rim gap distance (is the implant sitting against the skull edge or floating?)
- Implant thickness (are there thin spots that would fracture?)
- Surface deviation from contralateral anatomy (does the external shape match the other side?)
- Defect area (documentation for surgical planning and insurance)

**What hurts:**
- Review sessions require a live engineer on a call; asynchronous review is degraded (screenshots lose spatial context)
- Communicating change requests spatially is hard ("the inferior-temporal edge, the part that curves toward the ear") — no way to place a 3D marker saying "fix here"
- When using tools independently (POC model), 158 minutes per case with learning curve (N14)
- Clinical implant shapes must differ from AI-generated shapes (N19) but the engineer cannot show *where* and *how much* without a comparison overlay

**What they value:**
- Seeing the geometry exactly as it will be manufactured
- Slice views that show depth relationships to brain anatomy
- Clear before/after when a revision is applied
- Being able to point at a specific location and say "this needs to change"

---

### Profile C — The imaging/research engineer (academic context)

**What they do:** Works on cranial reconstruction research. Builds and evaluates computational methods. Uses datasets like SkullBreak/SkullFix. Places large numbers of landmarks for registration evaluation. Needs to annotate training data, measure reconstruction quality, and compare methods.

**Tool stack observed in literature:**
- **3D Slicer** (primary; uses Markups heavily)
- **ITK-SNAP** (alternative segmentation)
- **Python (SimpleITK, nibabel)** (quantitative evaluation)
- **Custom Slicer extensions** (builds wrappers to simplify repeat workflows)

**Specific tool behaviors they perform:**
- Place 250+ fiducials per case for registration quality evaluation (N08)
- Measure surface-to-surface Hausdorff distances between generated and ground-truth implants
- Annotate defect boundaries as closed curves to compute defect area
- Build and evaluate automated pipelines; inspect failure cases interactively in 3D + slices

**What hurts:**
- 3D Slicer's Markups UI is complex for routine landmark-placement tasks (Slicer discourse, N09)
- No structured "comparison view" between two candidates — must load both and visually inspect
- Measurement values are not persisted alongside the case; they live in separate CSV exports

**What they value:**
- Fast placement of many named landmarks
- Live measurement values
- Ability to compare two geometries in the same view
- Persistent named annotations that survive save/reopen

---

## Implications for feature priority

This table maps observed user behavior to product features. Confidence is based on the pattern strength backing each row.

| Observed user behavior | Product feature it maps to | Confidence |
|---|---|---|
| Place named anatomical landmarks | Landmark annotation type | Strong |
| Measure A-P and S-I directional spans | Distance line + annotation measurement display | Strong |
| Trace defect rim as closed curve, measure length | Closed curve annotation type | Strong |
| View axial/sagittal/coronal cross-sections during review | Synchronized slice dock | Strong |
| Annotate change requests at specific 3D locations | Text note annotation type | Moderate |
| Inspect implant-to-anatomy deviation (color map) | Surface deviation measurement (deferred) | Moderate |
| Check wall thickness distribution | Thickness measurement (deferred) | Moderate |
| Compare current vs. prior revision | Candidate revision history (shipped) | Strong |
| Formal approval gate before manufacturing | (Out of scope — clinical workflow) | — |
| Automated generation as starting point, not final output | Reconstruction mock / generation (future) | Strong |

---

*Sources: Chen et al. 2017 (Nature Sci Rep), Materialise product documentation 2024, Spalthoff et al. 2022 (Frontiers Oncology), Perez & Gordon 2024 (PMC11305828), PMC4154978 VSP craniofacial review 2014, Li et al. 2024 (PMC11116219 Back to the Roots), Springer 2024 thickness/design features study, PMC8357303 automated resizing, Formlabs CMF literature roundup, MDPI 2022 POC VSP systematic review, 3D Slicer Markups documentation (slicer.readthedocs.io), Q3DC GitHub (DCBIA-OrthoLab), PMC5655755 OsiriX neurosurgery guide, PMC6703009 OsiriX cranial measures, PMC3690066 OsiriX ER planning, BoneSplit Springer 2017, PMC10876786 Oliveira et al. 2024, PMC13339505 plane alignment 2025, PMC8100897 SkullBreak/SkullFix 2021, AutoImplant 2021 grand-challenge overview, CranialRebuild beta testing MDPI 2024.*

*Content was rephrased for compliance with licensing restrictions.*
