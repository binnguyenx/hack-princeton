# Spec: Initial 3D bone editor

Intent: [intent.md](intent.md) · Status: draft · Last updated: 2026-11-14

## Summary

The editor opens one local project at a time. A case contains multiple bone samples, each with protected source anatomy and independently editable candidates whose revisions survive reopening. Users control the workspace through shared operations that developers can call directly and future agent tools can expose.

## Requirements

- R1. A case can contain at least two samples, and each sample can contain at least two candidates. Every candidate identifies its owning sample.
- R2. Import preserves the source geometry's units, orientation, and spatial placement. Missing metadata that prevents interpretation must be reported before the sample is treated as spatially verified.
- R3. Each sample's rendered geometry must agree with independently checked reference dimensions and orientation under the verification method and tolerance selected for its format (Q1).
- R4. Editing a candidate must leave its source anatomy and sibling candidates unchanged.
- R5. Camera navigation and visibility changes must leave source and candidate geometry unchanged.
- R6. Every supported control operation must have a documented name, inputs, target, result, and failure behavior. Inspection/view operations and project-data changes must be distinguishable in this interface.
- R7. UI controls and direct developer calls must invoke the same operations with the same validation, source protection, and edit recovery behavior. The exact mechanical tool list is settled through Q2.
- R8. Callers can read object identifiers, ownership, active candidate revision, selection, and relevant view state without changing them.
- R9. A rejected, cancelled, or failed edit must leave the last completed candidate state and recorded history unchanged and report its outcome to the caller.
- R10. Each candidate has its own recorded revisions. Users can identify their order, inspect earlier geometry, and recover an earlier version without changing another candidate.
- R11. Local saving and reopening must preserve case/sample/candidate ownership, source data and spatial metadata, recorded revisions, and each candidate's current revision. Included annotations, measurements, and workspace state must also be restored; exact view-state fields are settled through Q3.
- R12. A failed save must not be reported as successful. The editor must retain the unsaved work in the running session and expose the failure.
- R13. If annotation or measurement tools are included, their records must identify the object they describe. Measurements must identify the geometry revision used; a result from an earlier revision must not appear current after an edit.
- R14. Before interface implementation, a project-wide Markdown convention file must define layout, visual styles, selection/tool/error states, mouse/trackpad interactions, and the shortcut mapping. The editor must expose included operations through visible controls and distinguish navigation from editing.
- R15. The project directory must contain actual data files for at least two distinct samples, with source, license, and local path records. Both must pass import and rendering checks. The implementation plan must explicitly include acquisition and storage of these files.
- R16. The development setup must let a coding agent open the running frontend, exercise controls, capture the 3D viewport, and inspect console errors through browser automation/MCP access.
- R17. The coding agent can inspect locally stored sample files and their metadata, saved project records, and candidate revision records. It can trace a rendered object's ID back to its source sample or candidate revision.
- R18. The coding agent can inspect live scene objects by ID, including ownership, geometry representation and dimensions, units, spatial transforms, visibility, selection, and current revision. It can invoke supported operations through the shared interface and read the resulting state without bypassing validation or history handling.
- R19. The implementation plan must explicitly configure the required development MCP connections and app debug interface, document setup and launch steps, and verify browser, data, and live-object access. Reuse available tools where sufficient; add missing access rather than assuming browser access exposes application data automatically.

## Success criteria

- S1. Open the two stored samples in one case and create two candidates for one sample. After editing one candidate, compare the source and sibling geometries with their prior states: both are unchanged. Verifies R1, R4, R15.
- S2. For each stored sample, check physical dimensions, orientation, and placement against the reference defined in Q1. Repeat with missing required metadata and confirm the sample is not presented as verified. Verifies R2–R3.
- S3. From equivalent starting states, invoke an included edit through the UI and directly through the operation interface. Both yield equivalent geometry and history. Invalid targets, cancellation, and an induced operation failure leave the prior completed state intact. Verifies R6–R9.
- S4. Navigate the camera and change visibility, then compare geometry before and after. Read state through the developer interface and confirm the object identifiers and view state match the workspace. Verifies R5, R8.
- S5. Record multiple revisions on one candidate and recover an earlier version. Save, close, and reopen the project; verify relationships, geometry, history, and the current revision. An induced save failure is shown and leaves the in-session work available. Verifies R10–R12.
- S6. If measurements are included, measure a candidate and then edit it. The prior result remains associated with its original revision and is not displayed as current. Reopen the project and verify those associations remain. Verifies R11, R13.
- S7. Review every included control against the convention file. Verifies R14.
- S8. Follow the documented development setup from a fresh session. Have the coding agent load a stored sample, capture the viewport, inspect the console, read the sample's metadata, and resolve a rendered object to its live state and stored data. Invoke a supported candidate edit through the shared interface, inspect its result and revision, then save and inspect the saved record. Retain the tool outputs as evidence. Verifies R16–R19.

## Design

The logical records below describe ownership, not a database or file format choice. IDs remain stable across saving and reopening so separate records can refer to the same objects.

| Record | Relationships and required information |
| --- | --- |
| Project | ID, case ownership, saved workspace state. One project is open at a time. |
| Case | ID, project ID, associated samples. Whether a project needs multiple cases remains open. |
| Sample | ID, case ID, source anatomy, source/license information. A sample may contain several input files. |
| Source anatomy | Object ID, sample ID, protected geometry/data, units and spatial metadata. |
| Candidate | Object ID, sample ID, current revision reference. Alternatives have separate candidate IDs. |
| Candidate revision | Revision ID, candidate ID, order/history relationship, recoverable geometry and spatial state. Checkpoint timing and change metadata remain open. |
| Annotation, if included | ID, target object, annotation content and spatial attachment. Behavior after geometry changes remains open. |
| Measurement, if included | ID, target object and revision, measurement definition, value and units or an unavailable reason. |

Annotations and measurements are separate records linked to objects; they may become separate tables if a database is selected. Revision geometry must remain recoverable, but full snapshots versus stored changes is a later storage decision. Display simplification must not silently replace the geometry used for edits or measurements.

Buttons, gestures, and keybinds call the shared operation interface. Operations validate their target and inputs, perform the change, and report a result or failure. Geometry changes enter candidate history according to the checkpoint policy. View changes update workspace state without becoming geometry edits. The read interface lets callers resolve targets and verify results. Future API/MCP adapters reuse these interfaces.

Development debugging needs three connected views: browser behavior, stored data, and live application objects. Browser automation provides interaction and visual/error evidence. Local data access exposes source files and persisted records. An app debug interface exposes live object state and shared operations, using the same IDs as storage. Wire these views into the coding agent's tools during this phase. The exact MCP tools and connection mechanism depend on the chosen runtime; this does not require a separate server for each view.

Each sample retains its own spatial metadata. Putting samples in the same case does not establish that they are aligned; simultaneous overlays and alignment behavior require a decision in Q1.

## Where it lives

- Feature documents: `features/3d-bone-editor/`.
- Product context and feature index: `hackprinceton_intent.md` and `docs/project.md`.
- Proposed design convention file: `docs/design-conventions.md` (not created yet).
- Application, sample-data, test, MCP configuration, and debug-interface locations are not established. The plan must name them after the runtime and format decisions.

## Decisions

- D1. Keep multiple samples per case and multiple candidates per sample. This separates source examples from alternative designs.
- D2. Track revisions within each candidate. A new version of one design does not become a different candidate automatically.
- D3. Protect source anatomy and keep view state separate from geometry. Inspection must not alter the reference used for editing.
- D4. Share operations across UI and programmatic callers. This keeps validation and recovery behavior consistent when agent tools are added.
- D5. Store sample files inside the repository's project directory. Download links alone cannot support reproducible local checks.

## Flagged concerns

- The format, tool list, tolerances, and runtime are unresolved. R2–R3 and R7 cannot become executable acceptance tests until those decisions are made.
- “Git-ish” establishes recoverable candidate history, but does not yet decide checkpoint timing, restoration semantics, branching, or merging. No full Git behavior is assumed.
- Candidate history can retain substantial geometry data. Storage limits and save-failure recovery must be designed against the acquired samples before the plan is accepted.
- No application or acquired sample data exists in the inspected repository. R15–R16 describe required delivery work, not completed checks.

## Open questions

1. Which source and file format will supply the two samples: prepared volume, surface mesh, or raw scans? Choose supported variants, metadata handling, reference checks, tolerances, and size limits. Define what relates samples in a case and whether users view them separately or overlay aligned samples.
2. How does a candidate enter the workspace, and which exact edits, annotations, and measurements are included? Define targets, invalid inputs, cancellation, and units for each tool before implementation.
3. When are revisions recorded, and what change details do they retain? How do restore and undo/redo interact? Decide branching/merging scope, whether multiple cases are needed, local file versus app-managed storage, save/autosave policy, saved view state, restart recovery, and geometry export needs. Define annotation behavior after edits if annotations are included.
4. Which visual reference, panel layout, device interactions, and minimal keybinds go into the global conventions? Specify shortcut behavior while typing.
5. Which runtime, OS/devices, offline requirements, and performance targets must the stack support? Select rendering, geometry, state, and storage tools after Q1–Q2. Verify existing browser automation/MCP access before adding setup.

## Out of scope

Clinical approval, manufacturing readiness, and universal bone reconstruction are excluded by the parent intent. Proposed initial-editor exclusions remain AI generation, model training, in-app chat, evidence retrieval, cloud collaboration, and production-facing external API/MCP control adapters. Development MCP setup and debug access are included in this phase. Raw CT preparation and advanced revision behavior remain open decisions, not assumed capabilities.
