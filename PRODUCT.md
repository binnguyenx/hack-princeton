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

- Import and spatially verify NRRD samples; create candidates; rigid transform with revisions; camera/visibility/inspection plane as view-only; portable local save/open.
- Slicer-standard canvas inspection: validated patient coordinates, recoverable 3D navigation, synchronized Axial/Sagittal/Coronal views, crosshair, window/level, projection/ruler/display controls, and one-shot or persistent placement records.
- Shared operation interface for UI and programmatic callers.
- At least two licensed sample files committed under `data/samples/`.

Deferred (not this phase): voxel sculpt, advanced saved annotations and quantitative comparison, in-app generation/chat, model training, cloud collaboration, raw CT preparation, clinical approval, manufacture.

Undecided product facts carried forward: exact defect locations beyond cranial vault demo scope; whether guided generation lands in MVP vs stretch.

## Brand Commitments

- Product display name: **undecided**. Draft working label “SkullFix” may appear in older notes; do not treat it as final branding in UI chrome or marketing copy.
- Design system name: **hack-princeton** (`DESIGN.md` frontmatter `name: hack-princeton`).
- **Pinned visual world** (user brief, 2026-11-14): soft monochrome Operate UI — light gray ground, floating white containers, quiet depth, B/W/gray neutrals with **accent blue only for strong actions**. Craft image: `.impeccable/reference/ui-styling-soft-monochrome.jpg`.
- **Atlassian role:** layout / grid / business-component structure for management (tables, toolbars, filters, page headers) — **not** the visual skin. Layout density reference: `.impeccable/reference/ui-styling-atlassian-b2b.jpg`.
- **Canvas role:** viewport-dominant editor chrome (Figma/Blender restraint in density), same soft monochrome skin as management.
- Soft Medit / clinical wellness marketing chrome remains an **anti-reference** (`.impeccable/reference/ui-styling-medit-soft.jpg`).
- Legitimate project/case **management tables and toolbars are in scope**. Still ban marketing/wellness dashboard kits (DNA heroes, supplement cards, calendar strips, fake clinical metric theater).
- Three main colors: **Base → Ink → Accent**. Elevated white and borders are structural. Signal is rare danger only — not a brand hue.
- Motion: calm Corporate/Premium micro-interactions (signature ease `cubic-bezier(0.2, 0, 0, 1)`); functional feedback, not decoration.
- UI implementation direction: **Radix Themes first** (`@radix-ui/themes`) for management-shell composition, with Radix UI primitives where Themes needs behavior composition, styled via `DESIGN.md` CSS tokens and `lucide-react` iconography. Ad-hoc hand-rolled chrome and browser `window.prompt()` are rejected.
- Visual system of record: `DESIGN.md`. Feature R14 checklist: `docs/design-conventions.md` (management vs canvas + ops mapping).
- **Agent rule:** any UI / front-end design or implementation must follow the **hack-princeton** system in `DESIGN.md` (and `AGENTS.md` § UI / front-end design system). Ask before changing tokens or locking a product name.

## Evidence on Hand

- Draft product intent: `hackprinceton_intent.md`
- Feature docs: `features/3d-bone-editor/` (intent, spec, plan)
- Visual craft reference: `.impeccable/reference/ui-styling-soft-monochrome.jpg`
- Layout density reference: `.impeccable/reference/ui-styling-atlassian-b2b.jpg`
- Anti-reference (wellness soft UI): `.impeccable/reference/ui-styling-medit-soft.jpg`
- Sample data and fixture projects exist under `data/`

## Product Principles

1. Source anatomy is sacred; candidates are experimental and recoverable.
2. Navigation and inspection never silently become edits.
3. One shared operation layer for humans, UI, and agents.
4. Business-software clarity in management **structure**; soft monochrome craft across the whole app; editor restraint on the canvas—the 3D case stays the visual focus there.
5. Honest about limits—unsupported actions fail visibly; no clinical certification theater.

## Accessibility & Inclusion

No product-specific standard locked yet. Baseline for web Operate UI: visible focus, text contrast meeting WCAG AA for ink-on-base and ink-on-elevated surfaces, do not rely on color alone for selection vs error (pair Signal with label/icon).
