# Plan: Canvas interaction contracts

Spec: [spec.md](spec.md) · Status: done · Date: 2026-11-14

> Historical: describes how this change was built. For how the feature works now, read spec.md.

## Approach

Add a pure interaction resolver before touching event handlers. Route existing pointer entry points through that resolver and the existing gesture classifier, then remove the duplicate CanvasWorkspace keyboard listener. This makes ownership explicit without rewriting Three.js navigation or annotation persistence.

## Files that change

- `app/src/viewport/canvasInteractions.ts` — shared input context and pure ownership resolver; pointer-only adapter boundary for future semantic operations (R1, R2, R6, R8).
- `app/tests/canvasInteractions.test.ts` — precedence and modifier tests written first (R7, S1–S4).
- `app/src/viewport/Viewport.tsx` — route handle, paint, Place, and annotation selection entry points through the resolver (R3, R6).
- `app/src/ui/SliceViewport.tsx` — use the shared classifier/resolver for Place taps (R4).
- `app/src/ui/CanvasWorkspace.tsx` — remove the competing window keyboard listener (R5).
- `app/src/App.tsx` — make capture-phase Enter/Escape own curve finish and draft cancellation (R5, S5, S6).
- `app/tests/canvasGestures.test.ts` — preserve shared tap/drag and finish-related coverage (R4, R7).

## Order of work

1. Write a failing resolver test for handle, paint, Place, selection, navigation, and modifier precedence.
2. Implement the smallest pure resolver until that test passes.
3. Write/extend a failing shared-gesture test for a Place drag producing no tap, then keep it green while integrating the resolver.
4. Route 3D pointer entry points through resolver checks, beginning with visible gizmo handles, then Highlight, Place, and selection.
5. Route slice Place through the same classifier and resolver.
6. Remove CanvasWorkspace's duplicate keyboard listener and move its draft-cancel rule into the App capture handler.
7. Run focused tests, build, and browser journeys where the local test setup permits.

## Risks

- Three.js listeners run in capture phase. The riskiest change is ensuring an explicit handle claims the pointer before Place or OrbitControls see it. The resolver tests prove the policy; focused manual/browser checks prove listener integration.
- Enter currently has two listeners. Removing one must preserve both curve finish and Escape draft cancellation; App becomes the one owner.

## Proof

- `cd app && npm test -- canvasInteractions canvasGestures canvasWorkspace annotationPlacement annotationOverlay annotationBehaviors inspector.annotation`
- `canvasInteractions.test.ts` proves R1, R2, R6, and R7; the focused canvas suites prove R3, R4, and R5.
- R8 is proved by the reviewed architecture boundary: `canvasInteractions.ts` accepts only resolved human-input facts and does not invoke persistence or agent code; semantic tool APIs remain the sole future agent entry point.
- `cd app && npm run build`
- Manual: Place an open curve, finish with a second tap and Enter, verify one queued entry each; drag empty canvas in Place and verify no point; select a plane, drag a visible handle, then use panel Size/Rotate.

## Deviations

None.
