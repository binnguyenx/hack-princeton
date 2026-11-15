# Spec: Shared annotation colour system

Intent: [intent.md](intent.md) · Status: accepted (owner, via /tdd implement, 2026-11-15) · Last updated: 2026-11-15

## Summary
All annotation tools share one 5-colour palette. Any annotation (landmark/node, line/edge, curves, angle, text note, plane, ROI, highlight) can be given any palette colour when placed or later from the annotation panel. Colour is stored as an ordinary annotation property, so persistence, revisions and commit logic are untouched. Annotations with no colour look exactly as they do today.

## Requirements
- R1. One shared palette module defines 5 colours, used by every annotation surface (3D overlay, placement strip, annotation list):

  | Key | Hex |
  |-|-|
  | `accent` | #2F6BFF (DESIGN accent) |
  | `amber` | #F59E0B |
  | `emerald` | #10B981 |
  | `rose` | #F43F5E |
  | `slate` | #64748B |

  No other file hard-codes annotation colours.
- R2. `DESIGN.md` documents the palette as "Annotation palette (canvas only)". These colours are allowed only for annotation geometry inside the 3D canvas, slice views, the matching swatches and case-report captures. App chrome stays Base/Ink/Accent, and `signal` stays reserved for danger.
- R3. An annotation's colour is `meta.color`, holding one of the 5 keys. Missing or unknown values render in the type's default, which matches today's look: `roi` → `amber`, every other type → `accent`.
- R4. While placing any annotation type, the placement strip shows the 5 swatches. The chosen colour is applied to annotations placed from then on and is remembered for the session. It starts at the type's default.
- R5. Each annotation list row shows a colour swatch. Choosing a swatch changes that annotation's colour through the existing annotation update path (uncommitted stack or API update), exactly as other meta edits do. A locked annotation's swatch is disabled.
- R6. In the 3D viewport every part of an annotation uses its colour: point glyphs, control points, segments, curves, angle arms, plane fill and outline, ROI box, text-note pin and highlight overlay. Hover and selection emphasis stay distinguishable (they change size, opacity or outline, never hue).
- R7. Placement previews (in-progress ghost geometry) use the colour selected for placement.
- R8. The highlight tool's colour options (`mechanical-last-parts` R62) become the shared palette. Existing highlight values `accent`, `amber`, `rose`, `emerald` keep their exact colours.
- R9. Colour survives save and reload, revision changes, and portable ZIP Save/Open, because it travels in `meta` with no new persistence fields, API routes or schema changes.
- R10. Changing a colour does not create a revision or commit by itself. It behaves like any other annotation meta edit today (marks the session dirty / uncommitted).

## Success criteria
- S1. Given a line placed with `emerald` selected, when the viewport renders, then its segment and both endpoint glyphs use #10B981.
- S2. Given an existing ROI with no `meta.color`, when rendered, then it is amber (#F59E0B), the same as before this feature.
- S3. Given a plane, when its colour is changed to `slate` from the list row, then the plane fill and outline update, the change goes through the annotation update path, and no revision is created.
- S4. Given a locked annotation, when its row renders, then the swatch control is disabled.
- S5. Given annotations of every type with different colours, when the project is saved as a ZIP and reopened, then every `meta.color` is unchanged.
- S6. Given the codebase, when searched for annotation hex colours outside the palette module, then none are found in `app/src/viewport/` and `app/src/ui/` annotation code.
- S7. Given a selected annotation in `rose`, when hovered and selected, then its emphasis is visible without its hue changing.

## Design
A new `app/src/domain/annotationPalette.ts` exports the palette, type defaults and a `resolveAnnotationColor(annotation)` helper. `AnnotationOverlay.ts` replaces its `ACCENT`/`ROI_COLOR`/`HIGHLIGHT_COLORS` constants with per-annotation colour from the helper. Materials are created per colour (cached) instead of a single accent material.

`CanvasWorkspace`'s highlight swatch control generalises into a placement-colour control shown for every placement type. `AnnotationList` replaces its highlight-only colour list with the shared swatch control for every row. Colour edits call the same update operation that renames and other meta edits use.

## Where it lives
- Frontend: `app/src/domain/annotationPalette.ts`, `app/src/ui/AnnotationColorSwatches.tsx`, `app/src/viewport/AnnotationOverlay.ts`, `app/src/viewport/annotationBehaviors/selectable.ts`, `app/src/viewport/Viewport.tsx`, `app/src/ui/CanvasWorkspace.tsx`, `app/src/ui/AnnotationList.tsx`, `app/src/App.tsx`, `app/src/App.css`
- Design: `DESIGN.md`
- Tests: `app/tests/annotationPalette.test.ts`, `app/tests/annotationOverlay.test.ts`, `app/tests/annotationBehaviors.test.ts`, `app/tests/projectPackage.test.ts`, `app/tests/ui/inspector.annotation.test.tsx`, `app/tests/ui/canvasWorkspace.test.tsx`

## Decisions
- D1. Colour lives in `meta.color`, not a new column or field. Why: owner wants persistence untouched, and `meta` already round-trips through every store and package. Alternatives: a typed `color` field (schema and API changes).
- D2. Type defaults equal today's colours (ROI amber, others accent). Why: "existing annotations keep their current look". Alternatives: distinct default per type (changes existing cases' appearance).
- D3. Palette: accent, amber, emerald, rose, slate. Why: superset of the current highlight colours plus a neutral, all clear against grey bone. Alternatives: adding violet (DESIGN bans purple/lavender), adding red (reads as danger/`signal`).

## Flagged concerns
- The owner didn't pick the colours or defaults; the palette and D2 are proposals. Please confirm or change them.
- `rose` (#F43F5E) is close to `signal` red (#E5484D). Inside the canvas it marks an annotation, not an error. It's kept because highlights already use it, but it could be swapped for teal if that's confusing.
- The intent asks for colours in slice views, but slice views draw no annotations today (`mechanical-last-parts` R18 is not implemented). This spec does not add slice annotation drawing. When slice drawing is built, it must use `resolveAnnotationColor`.

## Open questions

## Out of scope
- Custom hex pickers, opacity, per-vertex colour.
- Colouring bone meshes or volumes.
- Drawing annotations in slice views (see flagged concerns).
