# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite + React + TypeScript + Three.js in `app/`. Local-first browser editor. Prefer this over a desktop shell so Playwright MCP can drive the UI. Confirmed from `features/3d-bone-editor/plan.md`.

## Users

Primary: biomedical engineers / medical design specialists constructing and revising patient-specific cranial repair geometry in a focused 3D workspace.

Secondary: reconstructive surgeons who supply clinical objectives and review proposals. Same controls for both groups—no profession-specific product modes. Engineer construction/revision workflow is prioritized for depth.

## Product Purpose

This HackPrinceton project is a 3D design workspace for cranial vault reconstruction (cranioplasty). Users inspect anatomy, construct and edit candidate repairs, supply constraints, measure geometry, and (later) work with an AI agent on the same case. The consumer product name is undecided.

Success for the hackathon demo: a reviewable digital reconstruction proposal with protected source anatomy, editable candidates, recoverable revisions, and local save/reopen—not a manufacturable implant or clinical certification.

## Positioning

Human-directed iteration is central: generate → inspect → constrain or edit → refine. Mechanical tools and future agent tools share the same operations and objects. Direct tools must work without chat.

## Operating Context

- Local project with one open project at a time; cases group samples; samples own protected source anatomy and multiple candidates with revision history.
- Prepared NRRD volumes are the authoritative geometry; display meshes are derived for Three.js and are not the saved source of truth.
- Development requires browser automation (Playwright MCP), local sample/project data access, and a debug bridge (`window.__hackPrincetonDebug`) for live object inspection.
- Research/demo cases; team has software expertise and limited medical background—specialized terms need plain-language pairing in product copy when shown.

## Capabilities and Constraints

Confirmed (initial editor phase per accepted/planned feature docs):

- Import and spatially verify NRRD samples; create candidates; numeric rigid placement with preview and expected-revision commits; camera/visibility/inspection plane as view-only; portable local save/open.
- Slicer-standard canvas inspection: validated patient coordinates, recoverable 3D navigation, synchronized Axial/Sagittal/Coronal views, crosshair, window/level, projection/ruler/display controls, and one-shot or persistent placement records.
- Shared operation interface for UI and programmatic callers.
- At least two licensed sample files committed under `data/samples/`.

Deferred (not this phase): voxel sculpt, advanced saved annotations and quantitative comparison, in-app generation/chat widget (read-only fake-model transport exists), model training, cloud collaboration, raw CT preparation, clinical approval, manufacture.

Undecided product facts carried forward: exact defect locations beyond cranial vault demo scope; whether guided generation lands in MVP vs stretch.

## Brand Commitments

- Product display name: **undecided**. Draft working label “SkullFix” may appear in older notes; do not treat it as final branding in UI chrome or marketing copy.
- Design system name: **hack-princeton** (`DESIGN.md` frontmatter `name: hack-princeton`).
- **Pinned dual-register chrome** (user brief, 2026-11-14): non-canvas surfaces are business software—“look and feel… with tables and buttons… clean UI like Atlassian style”; the 3D workspace canvas is “clean like Figma or like Blender.” Soft Medit / large-radius wellness chrome is an **anti-reference** (`.impeccable/reference/ui-styling-medit-soft.jpg` is not binding).
- Craft bars: management = Atlassian-like B2B Operate (dense tables, toolbars, dropdowns, small radii); canvas = Figma/Blender-like editor chrome (viewport-dominant, compact toolbars/tabs, quiet panels). Binding craft image for management density: `.impeccable/reference/ui-styling-atlassian-b2b.jpg`.
- Legitimate project/case **management tables and toolbars are in scope**. Still ban marketing/wellness dashboard kits (DNA heroes, supplement cards, calendar strips, fake clinical metric theater).
- At most four main colors with explicit hierarchy; elevated white panels are a Base tint, not a fifth brand color. Accent is professional blue for primary actions—not soft lavender fills.
- UI implementation direction: **Radix Themes first** (`@radix-ui/themes`) for management-shell composition, with Radix UI primitives (`@radix-ui/react-dialog`, `@radix-ui/react-tabs`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-tooltip`) where Themes needs behavior composition, all styled via `DESIGN.md` CSS tokens and paired with `lucide-react` for enterprise iconography. Ad-hoc hand-rolled chrome and browser `window.prompt()` are rejected.
- Visual system of record: `DESIGN.md`. Feature R14 checklist: `docs/design-conventions.md` (management vs canvas + ops mapping).
- **Agent rule:** any UI / front-end design or implementation must follow the **hack-princeton** system in `DESIGN.md` (and `AGENTS.md` § UI / front-end design system). Ask before changing tokens or locking a product name.

## Evidence on Hand

- Draft product intent: `hackprinceton_intent.md`
- Feature docs: `features/3d-bone-editor/` (intent, spec, plan)
- Management craft reference: `.impeccable/reference/ui-styling-atlassian-b2b.jpg`
- Anti-reference (retired soft UI): `.impeccable/reference/ui-styling-medit-soft.jpg`
- Sample data and fixture projects exist under `data/`; app shell scaffolding under `app/` does not yet match this brand pin

## Product Principles

1. Source anatomy is sacred; candidates are experimental and recoverable.
2. Navigation and inspection never silently become edits.
3. One shared operation layer for humans, UI, and agents.
4. Business-software clarity on management surfaces; editor restraint on the canvas—the 3D case stays the visual focus there.
5. Honest about limits—unsupported actions fail visibly; no clinical certification theater.

## Accessibility & Inclusion

No product-specific standard locked yet. Baseline for web Operate UI: visible focus, text contrast meeting WCAG AA for ink-on-base and ink-on-elevated surfaces, do not rely on color alone for selection vs error (pair Signal with label/icon).
