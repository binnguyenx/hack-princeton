# Intent: Business UI polish (design system hardening)

Author: Vien Nguyen · Date: 2026-11-14 · Status: accepted  
Parent: [3d-bone-editor README](../README.md)

## Problem

The current management/productivity layer (projects, cases, sample/candidate tables, dialogs, navigation) is functionally wired but still feels inconsistent and handcrafted. Too many ad-hoc UI pieces and duplicated styles create a clumsy workflow, visual drift, and small interaction glitches.

## Desired outcome

A clean, modern business-software UI layer for management surfaces that:

- Uses a reusable component structure with **Radix Themes first** and **Radix Primitives where needed**.
- Removes noisy filler text and inconsistent visual details that reduce trust.
- Keeps CRUD behavior unchanged while improving workflow clarity, hierarchy, and interaction smoothness.
- Enforces consistent structure for page header, sidebar, toolbar, table actions, and modal forms.
- Adds regression tests for common UI glitches (search/filter behavior, state consistency, action affordances).

## Affected users and systems

Primary users are engineers/surgeons managing projects and case assets before entering canvas. Touches `app/src/ui/*` management surfaces, management CSS/token usage, and UI seam tests in `app/tests/ui/`.

## Constraints

- Scope is **management/business layer only** (projects/cases/tables/dialogs/nav); canvas viewport/tool styling is out of scope.
- Prefer `@radix-ui/themes` components for layout/chrome (`Table`, `Grid`, `Flex`, `Tabs`, inputs/buttons/badges/cards).
- Use `@radix-ui/react-*` primitives for behavior/accessibility composition where Themes does not cover the need.
- No manual visual primitives when a Radix Themes component can provide equivalent structure.
- Follow `DESIGN.md` and `docs/design-conventions.md` management register.

## Out of scope

- Canvas viewport rendering/material/tool-rail visual redesign.
- Backend CRUD schema/endpoint changes.
- New domain entities or process flow expansion beyond current business-ui capability.

## Decisions captured for this intent

1. This is a new feature unit separate from the shipped CRUD-wiring `business-ui` unit.
2. Radix Themes + Primitives policy is a hard implementation requirement for management UI.
3. Testing focus includes micro-glitch prevention, not just CRUD happy paths.

## Amendments

2026-11-14 — Product owner confirms strict Radix Themes + Primitives policy and confirms management-surface-only scope.
