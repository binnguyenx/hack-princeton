# Plan: SQLite schema-v2 application storage and coordinated local-artifact lifecycle

Spec: [spec.md](spec.md) · Status: done · Date: 2026-11-14

> Historical: records this publication slice. Read spec.md for requirements.

## Files that change

Publish sqlite schema-v2 application storage and coordinated local-artifact lifecycle and its tests/documentation. Preserve later work for dependent PRs rather than importing missing modules.

## Proof

Run PYTHONDONTWRITEBYTECODE=1 python3 -B backend/ai/tests/run_checks.py: 42 tests expected. Existing requirements for traceability: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20, R21, R22, R23, R24, R25, R26, R27, R28, R29, R30, R31, R32, R33, R34, R35, R36, R37, R38, R39, R40, R41, R42, R43, R44, R45, R46, R47, R48, R49, R50, R51, R52, R53, R54, R55, R56, R57, R58, R59, R60, R61, R62, R63. This slice proves only the listed implementation; deferred application requirements and R35–R39 remain unimplemented/proposed. The schema and fixture tests do not prove API delivery, model execution or geometry quality.

## Deviations

The approved PR split publishes dependencies incrementally. The final app-integration PR restores the complete documentation and source snapshot.
