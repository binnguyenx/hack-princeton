# Spec: Initial 3D bone editor (umbrella) — RETIRED

Intent: [intent.md](intent.md) · Status: retired · Last updated: 2026-11-14

> **Retired 2026-11-14.** Requirements R1–R42 and success criteria in the prior version of this file are **not** current truth. Do not plan or test against them. Active contracts live in category `spec.md` files under [README.md](README.md). Full prior text is in git history.

## Summary

Retired umbrella. No live requirements.

## Requirements

- R0. (removed) Entire prior requirement set retired with this umbrella. New IDs start at R1 inside each category spec.

## Success criteria

None for this file.

## Design

See category specs when written.

## Where it lives

- Umbrella index: `features/3d-bone-editor/README.md`
- Categories: `features/3d-bone-editor/software-app-model/`, `features/3d-bone-editor/business-ui/`, `features/3d-bone-editor/canvas-workspace/`

## Decisions

- D1. Split the mega-feature into four categories so each can ship and Close independently. Why: one plan carrying UI + CRUD + canvas ops + rendering failed gates and left partial stubs.

## Flagged concerns

- Resolved: Carry-over overload — retirement + category split.
- Existing `app/` and `app/server/` stubs must be claimed or discarded by the category that owns them; they do not inherit this retired spec.

## Open questions

None.

## Out of scope

Everything — file is retired.
