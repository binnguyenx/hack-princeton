# Canvas interaction contracts

Intent: [intent.md](intent.md) · Status: accepted · Last updated: 2026-11-14

## Summary

The canvas resolves each pointer sequence to one owner before a tool acts. It uses familiar editor behavior: visible handles manipulate, clicks select, Place consumes a plain anatomy tap, and dragging empty space navigates.

## Requirements

- R1. `app/src/viewport/canvasInteractions.ts` must expose a pure resolver whose input describes the active canvas mode, pointer button/modifiers, and hit targets, and whose result names one owner: `manipulate`, `paint`, `place`, `select`, `navigate`, or `none`.

- R2. For a plain primary-button pointer sequence, the resolver must use this priority: an unlocked visible manipulation handle; active Highlight paint; active Place on anatomy; an annotation object for selection; empty canvas navigation. A non-primary button, Control/Meta click, or a navigation modifier must not produce a placement, paint, selection, or manipulation owner.

- R3. Every 3D canvas direct-action handler must check the resolved owner before acting. A gesture claimed by one owner must not also place a point, select an annotation, paint, or start a plane/ROI manipulation.

- R4. 3D and slice Place surfaces must use the shared gesture classifier for the 4px tap threshold. A drag navigates or adjusts the mode that owns it; it never creates a placement point. The existing curve finish behavior remains: a second tap within 350ms, Enter, or the Finish curve control queues a ready curve without adding an extra point.

- R5. Canvas shortcuts have one owner: the capture-phase listener in `App.tsx`. `CanvasWorkspace` must not install a second window keydown listener for Enter or Escape. Enter finishes an active curve. Escape first cancels a current placement draft, then follows the existing canvas cancel behavior.

- R6. Direct object manipulation must begin only from visible handles belonging to the selected, unlocked object. Clicking an annotation without a handle selects it; clicking a locked object's handle does not begin manipulation.

- R7. The resolver and its integration must be covered by focused unit tests for precedence, modifier protection, tap/drag placement protection, and curve finish ownership.

- R8. Canvas tools must keep semantic operations separate from pointer ownership. UI and future agent callers must invoke the same supported application/tool API for named operations such as selecting an annotation, placing a point, finishing a curve, or changing a plane/ROI extent; an agent must not emulate pointer events or depend on viewport hit-testing. This feature does not enable live AI mutation.

## Success criteria

S1. Given a visible unlocked plane/ROI handle under the pointer, when the user drags it, only the manipulation path begins; placement, paint, and selection do not run.

S2. Given active Place and no visible handle, when the user taps anatomy, exactly one placement point is sent. When the user drags, no placement point is sent.

S3. Given active Place and an annotation under the pointer, a plain tap follows the active Place tool; with Place inactive, the same tap selects the annotation.

S4. Given Highlight is active, a primary drag paints only; it does not orbit, place, or select.

S5. Given a curve draft, a second tap within 350ms or Enter finishes it once and leaves a queued stack entry.

S6. Given a text input has focus, its normal editing keys are not handled as canvas shortcuts; Mod+S and Mod+Z retain their documented behavior.

## Design

`CanvasInteractionContext` is the shared seam. Each surface gathers only facts it can know: active mode, active annotation type, pointer button/modifiers, whether a picked unlocked handle, anatomy, or annotation is under the pointer. `resolveCanvasPointerOwner` maps those facts to one owner.

The resolver does not raycast or mutate state. `Viewport` continues to own Three.js raycasts and OrbitControls; slice views continue to own IJK conversion. Both call the same resolver and gesture classifier before forwarding a direct action. This keeps geometry details out of the interaction policy and allows future candidate-editing tools to supply their own handles using the same context.

Pointer ownership is only a human-input adapter. The semantic action invoked after ownership is resolved remains the stable application/tool API boundary: UI code and a future agent use the same named operation, but only the UI adapter translates a pointer sequence into it. Agent proposals and future mutations therefore remain inspectable and testable without a browser or camera state.

The interaction priority deliberately favors an explicit visible handle over all modes. Place then favors anatomy over selecting an existing annotation, because the user explicitly entered Place. The system never turns a drag into a placement.

## Where it lives

- `app/src/viewport/canvasInteractions.ts`
- `app/src/viewport/canvasGestures.ts`
- `app/src/viewport/Viewport.tsx`
- `app/src/ui/SliceViewport.tsx`
- `app/src/ui/CanvasWorkspace.tsx`
- `app/src/App.tsx`
- `app/tests/canvasInteractions.test.ts`
- `app/tests/canvasGestures.test.ts`

## Decisions

D1. The explicit-handle-first rule wins over the active mode. A handle is a direct request to edit that object; this matches common design tools and prevents accidental placement over a selected object.

D2. Place wins over annotation selection when there is no handle. The Place mode is explicit and remains the only way a plain tap creates a draft point.

D3. The resolver is pure. Input ownership stays testable without Three.js or DOM event-order dependence.

D4. Panel controls remain the dependable plane/ROI editing path. 3D handles participate only when visibly hit and unlocked.

D5. Agent callers reuse the supported application/tool API, never synthetic pointer events or copied UI logic. Why: a model cannot reliably infer screen-space hit targets, and the API preserves validation, auditability, and a deterministic test seam.

## Flagged concerns

- Resolved: existing `Viewport` capture listeners overlap. This change puts a single ownership check at each action entry point, without replacing Three.js navigation internals in the same change.

## Open questions

None.

## Out of scope

- New annotation types or persisted-data changes.
- Replacing OrbitControls, changing camera bindings, or introducing a general command framework.
- Promoting the 3D plane/ROI gizmos over panel controls.
