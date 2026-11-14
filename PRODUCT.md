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
- Shared operation interface for UI and programmatic callers.
- At least two licensed sample files committed under `data/samples/`.

Deferred (not this phase): voxel sculpt, annotate, measure, compare, in-app generation/chat, model training, cloud collaboration, raw CT preparation, clinical approval, manufacture.

Undecided product facts carried forward: exact defect locations beyond cranial vault demo scope; whether guided generation lands in MVP vs stretch.

## Brand Commitments

- Product display name: **undecided**. Draft working label “SkullFix” may appear in older notes; do not treat it as final branding in UI chrome or marketing copy.
- Design system name: **hack-princeton** (`DESIGN.md` frontmatter `name: hack-princeton`).
- UI styling reference (feel only, not layout): soft medical “neumorphic / soft UI” light chrome — large radii, quiet shadows, airy spacing. Binding file: `.impeccable/reference/ui-styling-medit-soft.jpg`.
- Do not copy the reference’s dashboard composition (DNA hero, supplement cards, calendar strip, multi-stat marketing layout). Editor layout stays minimal and functional: viewport-first Operate UI.
- At most four main colors with explicit hierarchy; elevated white panels are a Base tint, not a fifth brand color.
- Visual system of record: `DESIGN.md`. Feature R14 checklist: `docs/design-conventions.md` (points at DESIGN.md + editor interaction rules).
- **Agent rule:** any UI / front-end design or implementation must follow the **hack-princeton** system in `DESIGN.md` (and `AGENTS.md` § UI / front-end design system). Ask before changing tokens or locking a product name.

## Evidence on Hand

- Draft product intent: `hackprinceton_intent.md`
- Feature docs: `features/3d-bone-editor/` (intent, spec, plan)
- Styling reference image: `.impeccable/reference/ui-styling-medit-soft.jpg`
- No shipped UI, no acquired sample NRRDs in-repo yet, no testimonials or clinical claims to fabricate

## Product Principles

1. Source anatomy is sacred; candidates are experimental and recoverable.
2. Navigation and inspection never silently become edits.
3. One shared operation layer for humans, UI, and agents.
4. Soft, calm chrome; the 3D case is the visual focus.
5. Honest about limits—unsupported actions fail visibly; no clinical certification theater.

## Accessibility & Inclusion

No product-specific standard locked yet. Baseline for web Operate UI: visible focus, text contrast meeting WCAG AA for ink-on-base and ink-on-elevated surfaces, do not rely on color alone for selection vs error (pair Signal orange with label/icon).
