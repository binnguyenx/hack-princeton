# Plan: Shared annotation colour system

Spec: [spec.md](spec.md) · Status: done · Date: 2026-11-15

> Historical: implemented 2026-11-15 on `feat/deep-agent-case-report`. See Deviations.

## Approach
Add one palette module and route every annotation colour decision through `resolveAnnotationColor`. The 3D builders in `AnnotationOverlay.ts` take colour from the annotation instead of constants. Emphasis lightens the annotation's own colour instead of swapping to a fixed blue. The existing highlight-only swatch controls (placement strip and list row) generalise to all types. New placements get `meta.color` only when the user picked a colour, so untouched annotations keep today's look and meta.

## Files that change
- `app/src/domain/annotationPalette.ts` (new): palette, keys, type defaults, resolver, hex helpers (R1, R3, R8)
- `app/src/viewport/AnnotationOverlay.ts`: per-annotation colour in glyphs, lines, curves, angle, plane, ROI, highlight, labels' owner; preview colour (R6, R7)
- `app/src/viewport/annotationBehaviors/selectable.ts`: emphasis lightens the base colour, keeps its hue (R6, S7)
- `app/src/ui/CanvasWorkspace.tsx`: placement colour swatches for every placement type (R4)
- `app/src/ui/AnnotationList.tsx`: colour swatch row for every annotation type, disabled when locked (R5)
- `app/src/App.tsx`: one session placement colour (replaces `highlightColor`); applied in `queueReadyPlacement` and highlight strokes; passed to overlay preview (R4, R7, R10)
- `DESIGN.md`: "Annotation palette (canvas only)" section (R2)
- Tests: `app/tests/annotationPalette.test.ts` (new), `app/tests/annotationOverlay.test.ts`, `app/tests/annotationBehaviors.test.ts`, `app/tests/ui/inspector.annotation.test.tsx`, `app/tests/projectPackage.test.ts`

## Order of work
1. Palette module and resolver (red → green).
2. Overlay builders use resolved colours; ROI default stays amber.
3. Emphasis keeps hue.
4. List row swatches for all types; locked disables.
5. Placement colour state and strip swatches; queueReadyPlacement applies it.
6. ZIP round-trip test for `meta.color`.
7. DESIGN.md section; hard-coded hex sweep (S6).

## Risks
- Emphasis change could make selection less obvious. Mitigation: scale bump plus a strong lightening (still the same hue).
- Material-per-colour: builders already create materials per object, so no shared-material mutation risk.

## Proof
- R1, R3, R8: `app/tests/annotationPalette.test.ts`
- R6, R7, S1, S2: `app/tests/annotationOverlay.test.ts` colour cases
- S7: `app/tests/annotationBehaviors.test.ts` emphasis keeps hue
- R5, S3, S4: `app/tests/ui/inspector.annotation.test.tsx`
- R4, R10: `app/tests/ui/` placement swatch test + `cd app && npm test`
- R9, S5: `app/tests/projectPackage.test.ts` colour round-trip
- S6: `grep -rn "0x[0-9a-fA-F]\{6\}\|#[0-9A-F]\{6\}" app/src/viewport/AnnotationOverlay.ts app/src/ui/AnnotationList.tsx app/src/ui/CanvasWorkspace.tsx` returns nothing annotation-related
- R2: DESIGN.md diff review

## Deviations
- Added `app/src/ui/AnnotationColorSwatches.tsx` (shared swatch row used by the list and the placement strip) and touched `app/src/viewport/Viewport.tsx` (passes the placement colour into the draft preview) and `app/src/App.css` (shared swatch class, disabled state). Same behaviour as planned; fewer duplicated swatch lists.
- S5 (ZIP/package round-trip) passed as soon as its setup was right: colour rides in `meta`, so no persistence code changed (D1). The test stays as a regression guard.
- App UI tests need Node ≥ 22.22 (jsdom 31 / undici 8). Under Node 20 every jsdom test file fails to start with "Failed to start forks worker". Ran app tests with nvm's Node 22.23.5.
