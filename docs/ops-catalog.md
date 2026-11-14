# Ops catalog (initial 3D bone editor)

All UI controls and `window.__hackPrincetonDebug` call these shared operations. **No separate undo stack** this phase: `Cmd/Ctrl+Z` maps to `restoreRevision`. **No delete** ops this phase.

| Op | Kind | Inputs | Target | Result | Failure |
|-|-|-|-|-|-|
| `readState` | view | — | session | Snapshot of open project + view + openDocuments (or null) | — |
| `listProjects` | view | — | registry | Local/recent project summaries | — |
| `navigateCamera` | view | `camera` | view | Camera updated | No project |
| `setVisibility` | view | `objectId`, `visible` | view | Visibility map updated | No project |
| `setInspectionPlane` | view | plane | view | Plane updated | No project |
| `selectObject` | view | `objectId \| null` | view | Selection updated | Unknown id / no project |
| `createProject` | edit | `name` | session | New empty project open; zero cases; empty tabs; dirty false | Empty name |
| `createCase` | edit | `name` | project | Case added; dirty | No project / empty name |
| `importSample` | edit | `caseId`, `sampleDir` | case | Sample + source volume | Unknown case / IO |
| `createCandidate` | edit | `sampleId` | sample | Candidate + revision 0 (volume copy) | Unverified sample (R20), missing volume |
| `openDocument` | edit | `kind`, `id` | workspace | Tab added (or focused); active set | Unknown sample/candidate / no project |
| `closeDocument` | edit | `kind`, `id` | workspace | Tab removed only; records kept | No project / tab not open |
| `setActiveDocument` | edit | `kind`, `id` | workspace | Active tab switched | Tab not open / no project |
| `transformCandidate` | edit | `candidateId`, `pose`, `apply` | candidate | If `apply`: new revision with pose; else no history write | Source anatomy, unknown candidate |
| `restoreRevision` | edit | `candidateId`, `revisionId` | candidate | Current revision pointer set | Missing revision |
| `saveProject` | edit | `dir` | project | Package written; dirty cleared | Write error (session kept) |
| `openProject` | edit | `dir` | session | Loads package atomically | Missing blob/mesh → prior project kept (R21) |

View ops never write candidate history. Esc / `apply:false` leaves history unchanged (R9). Close document ≠ delete sample/candidate (R34).
