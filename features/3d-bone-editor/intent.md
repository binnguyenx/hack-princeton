# Intent: Initial 3D bone editor

Author: Vien Nguyen · Date: 2026-11-14 · Status: accepted
Parent intent: [AI workspace for bone reconstruction design](../../hackprinceton_intent.md)

## Problem

The project needs a working mechanical foundation: import bone data, render it correctly in 3D, edit it through understandable controls, and save the work locally. The global intent describes the larger reconstruction workspace, but leaves the first supported inputs and tools undecided. We need to settle those boundaries before implementation.

## Desired outcome

- Import multiple supported bone samples into a case within a project and inspect their 3D shapes with the correct scale, orientation, and placement. A plausible-looking render alone is not enough to establish correctness.
- Perform an agreed set of mechanical operations directly in the editor. Each tool makes its target and effect clear. The exact operations remain open below.
- Keep source anatomy separate from editable candidates and make edits recoverable, following the global intent. Unsupported operations or failed edits must not silently damage the case.
- Support multiple candidates per sample and track each candidate's changes as a recoverable revision history that survives saving and reopening.
- Save work locally and reopen it to continue editing. The saved content and recovery behavior must be defined before choosing storage.
- Use a small, consistent set of visible controls and keybinds. Camera movement, selection, and editing must be distinguishable so inspecting the model does not accidentally change it.

The completion check is one agreed demo case: import it, verify its spatial correctness, perform every included operation, recover from an unwanted edit, then save and reopen the result.

## Affected users and systems

Biomedical engineers and surgeons use the same controls, with the engineer's construction and revision workflow prioritized. This work covers data import, the 3D workspace, mechanical tools, local project state, and controls.

The initial editor works on one project at a time. A case within the project groups multiple samples. A sample is the source data for one example and may contain several files. Each sample can have multiple candidates, each with its own revision history. A 3D object is an individually displayed or selectable item within the project.

The agreed conceptual data model is:

- Project: owns the case, its objects, and saved state.
- Case: groups the samples being worked on together.
- Sample: owns its source anatomy and associated candidates.
- Source anatomy: the sample's imported bone data and its units/orientation, protected from editing.
- Candidate: a separate editable piece associated with one sample. Multiple candidates represent alternative designs for that sample.
- Candidate revision: a recorded version within one candidate's history. Revisions track how that candidate changes over time and allow earlier versions to be recovered.
- Annotations and measurements: attached to the objects they describe, if those tools are included.

The rendered 3D appearance is a view of this data. Camera rotation changes the view without changing the object's geometry.

Organize controls around named operations that developers can call independently of UI buttons and keybinds. Keep inspection/view operations distinct from operations that change project data. Each operation defines its inputs, target, result, and failure behavior. UI controls and future agent tools must use the same operations, including validation, source protection, and undo behavior for edits. Provide a way to read the relevant project and view state so callers can identify targets and inspect results. This phase establishes the shared internal interface; an external API or MCP adapter can expose it later.

Schema note: keep annotations and measurements as separate records linked to their objects. They can live in separate tables if we choose a database. Following the global intent, measurements also identify the geometry revision they describe so edits cannot leave old results appearing current. The physical schema and storage technology remain undecided.

Development also needs a way for the coding agent to inspect the running frontend and reproduce failures. This is separate from the product's eventual in-app AI agent.

## Constraints

- Keep the global intent's cranial vault reconstruction scope and research/demo limits.
- Here, safe editing means protecting source data, making changes recoverable, and reporting unsupported or failed operations. It does not mean certifying a design as clinically safe.
- Preserve spatial metadata and distinguish display geometry from geometry used for measurements.
- Work is saved locally. Whether processing must also stay local or work offline remains open.
- Record the agreed visual and interaction conventions in one project-wide Markdown file before building the interface.
- Select the stack after establishing the input data, required operations, and target runtime.
- The implementation plan must explicitly acquire at least two distinct samples and store their actual data files in the project directory. Record each sample's source, license, and local path. Verify that both samples import and render correctly; links or download instructions alone do not satisfy this requirement.

## Out of scope

Inherited from the global intent: clinical approval, manufacturing readiness, and support for every bone or reconstruction workflow.

Proposed boundary for this initial editor, pending acceptance: AI generation, model training, in-app chat, evidence retrieval, and cloud collaboration are later work. Their place in the overall product remains unchanged. Raw CT preparation is undecided until the input scope is chosen.

## Open questions

Resolve these in order. Examples below are choices to discuss, not committed features.

1. What exact data will the first case use? Choose a representative source file and its license. Decide between a prepared bone volume, a surface mesh, or raw scans requiring preparation. Confirm the supported format and variants, units, orientation, object separation, and expected size. Define what happens when spatial metadata is missing and how we verify the import against a known reference. This determines the data representation and rendering needs.

2. What does the first editing session actually do? Write the shortest start-to-finish workflow and name its required tools. Separate inspection (camera movement, visibility, cross-sections) from changes to geometry (for example, moving a candidate or trimming it). Decide how an editable candidate enters the case, what selection targets, and which annotations or measurements are essential. For each included edit, define the allowed target, invalid inputs, and undo/cancel behavior. “All intended mechanical functions” needs this explicit list.

3. How are cases, samples, and revision history saved? Clarify what relates samples within a case and whether a project needs multiple cases. Decide whether users save a portable project file, use app-managed local storage, or need both. Preserve the sample/candidate relationships and candidate revision histories on reopening; specify the remaining saved state. Define when a revision is created, what change details it records, and how restoring it interacts with undo/redo. Branching and merging remain undecided. Decide manual save versus autosave, unsaved-change behavior, and recovery after a failed save or restart. Separate reopening a project from exporting geometry for another tool.

4. What are the global design and control conventions? Agree on a visual reference, panel layout, typography, colors, spacing, selection/tool states, and error feedback. Choose supported mouse/trackpad interactions and the smallest useful shortcut set, including how shortcuts behave while typing. Record the decisions in a proposed `docs/design-conventions.md`; visual styling and interaction behavior both belong there.

5. What runtime, stack, and debugging access support those choices? Choose browser or desktop, target OS/devices, offline expectations, and acceptable loading/interaction performance on the sample case. Then select rendering, geometry processing, state, and persistence tools. Check available browser automation/MCP access before adding setup. Verify the coding agent can open the app, exercise controls, capture the 3D viewport, and inspect console errors. Define how it will inspect scene state as well: screenshots alone cannot establish correct geometry or units.

## Amendments

2026-11-14 — Include development MCP/tool setup for coding-agent access to the browser, local sample and project data, and live scene objects. The plan must configure and verify these connections, including object inspection and calls through the shared operation interface. This development access is part of the initial editor; production-facing agent APIs can follow later.
