# 3D bone editor (umbrella)

**Status: restructured 2026-11-14.** The single mega-feature intent → spec → plan at this folder root is **retired**. Do not implement against those files.

Prior top-level docs tried to carry management UI, disk CRUD, canvas ops, and viewport rendering in one unit. That overloaded the plan, skipped gates after amendments, and left nothing successfully Closed as a coherent ship.

## How to work here now

Each **category** below is its own intent → spec → plan cycle. Accept and Close one category before starting the next (build order in `docs/project.md`).

| Category | Folder | What it owns |
|-|-|-|
| Software app model | [`software-app-model/`](software-app-model/intent.md) | Project / case / sample / candidate / revision **domain** + **persistent CRUD** (local disk + API). No React chrome, no 3D tools. |
| Business UI | [`business-ui/`](business-ui/intent.md) | Atlassian-like management surfaces that drive the app model (home, tables, dialogs, nav). |
| Canvas workspace | [`canvas-workspace/`](canvas-workspace/intent.md) | Unified canvas tools + viewport: inspect/edit ops, restore/apply behavior, smooth GLB-first rendering, and clean-state interaction wiring. |
| Canvas workspace Slicer relaunch | [`canvas-workspace-improve/`](canvas-workspace-improve/intent.md) | Cross-reference Workbench (Slicer-standard 3D + linked slices). **Tester / API mechanics catalog:** [`canvas-workspace-improve/README.md`](canvas-workspace-improve/README.md). |

Retired root files (historical only): `intent.md`, `spec.md`, `plan.md`. Recover full prior text from git history if needed.

## Rules

1. New requirements go in the matching category’s `intent.md` / `spec.md`, not in the retired root.
2. Do not reopen the root plan for new work.
3. Existing `app/` code is scaffolding to reuse or replace per the active category plan — it is not proof that a category shipped.
