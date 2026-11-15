# Intent: Canvas interaction contracts

Author: Vien Nguyen · Date: 2026-11-14 · Status: accepted
Parent: [3d-bone-editor README](../3d-bone-editor/README.md) · Extends: [canvas-workspace](../3d-bone-editor/canvas-workspace/intent.md), [mechanical-last-parts](../3d-bone-editor/mechanical-last-parts/intent.md)

---

## Problem

Direct manipulation in the canvas is unreliable. A pointer gesture can be read by Place, selection, navigation, annotation handles, plane or ROI gizmos, and browser-level shortcuts at the same time. The outcome depends on event-listener order instead of the object and mode the user meant to control.

This makes annotation placement flaky, makes normal shortcuts behave unexpectedly, and makes it too easy to move, place, select, or navigate by accident. Each new interactive object currently needs its own event-handling fix, so the problem gets bigger as tools are added.

## Desired outcome

Every direct manipulation starts with one clear owner and has one result. Users can tell whether they are navigating the view, selecting an object, placing a new object, or manipulating the selected object. A compatible modifier can intentionally change the active interaction without leaking into another tool.

Navigation and manipulation are reusable interfaces, not code paths tied to a particular annotation type. New tools can declare their supported interactions and receive a resolved gesture from one canvas input system. They do not attach competing listeners to the viewport.

The immediate result is reliable curve finishing and panel-first plane/ROI editing. The same contract must be usable by candidate editing and later direct-manipulation tools.

## Affected users and systems

- Biomedical engineers and surgical planners working in the 3D viewport and synchronized slice views.
- `app/src/viewport/Viewport.tsx`, `SliceViewport.tsx`, `canvasGestures.ts`, and canvas keyboard handling.
- Annotation placement, selection, hover, drag, plane/ROI controls, and the Place strip.
- Existing canvas navigation and future candidate-editing tools.

## Constraints

- Preserve the product rule: navigation and inspection never silently become edits.
- Keep CanvasWorkspace placement drafts ephemeral and keep the annotation stack / Mod+S persistence model unchanged.
- Use the current Slicer-oriented canvas conventions and honor platform-aware shortcuts.
- Do not change persisted annotation types, SQLite schema, API contracts, or revision behavior as part of this work.
- Keep the slice dock interactive while Place is active.
- Do not add a second visual system or redesign the canvas chrome outside the interaction feedback required by this work.

## Out of scope

- Adding Landmark or Angle back to Place.
- New annotation types, AI mutation, or candidate geometry algorithms.
- A broad keyboard-command redesign outside canvas navigation and direct manipulation.
- Making unreliable 3D plane/ROI gizmos the primary editing path. Panel controls remain the dependable path unless a later accepted spec proves the gizmos meet this contract.

## Open questions

None. The accepted direction is to follow common editor behavior: click selects, visible handles manipulate, empty-space drag navigates, and Place owns a plain tap on anatomy. The spec defines the exact precedence and shared interface.
