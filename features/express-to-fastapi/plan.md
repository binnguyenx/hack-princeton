# Plan: Python application repository and verified paired backups

Spec: [spec.md](spec.md) · Status: done · Date:2026-11-14

> Historical: records verified publication slice1, not completion of every migration target.

## Files that change

The source/test paths in spec.md and stage-specific preflights, runtime dependency/runner wiring, scoped setup and project guidance.

## Proof

Python runner expects83 passing tests for the available modules. Application tests verify copied Node data, transactions, rollback/cleanup baseline, restart, hashes, metadata, pointers and sandbox separation. Later API/browser/graph proofs are available only when their slices are present.

- R1: planned dependent-slice HTTP/browser/cutover proof; not implemented by this slice.
- R2: planned dependent-slice HTTP/browser/cutover proof; not implemented by this slice.
- R3: available-slice proof above; full end-to-end acceptance is recorded by the dependent slices.
- R4: planned dependent-slice HTTP/browser/cutover proof; not implemented by this slice.
- R5: available-slice proof above; full end-to-end acceptance is recorded by the dependent slices.
- R6: available-slice proof above; full end-to-end acceptance is recorded by the dependent slices.
- R7: available-slice proof above; full end-to-end acceptance is recorded by the dependent slices.
- R8: available-slice proof above; full end-to-end acceptance is recorded by the dependent slices.
- R9: available-slice proof above; full end-to-end acceptance is recorded by the dependent slices.
- R10: available-slice proof above; full end-to-end acceptance is recorded by the dependent slices.
- R11: available-slice proof above; full end-to-end acceptance is recorded by the dependent slices.
- R12: available-slice proof above; full end-to-end acceptance is recorded by the dependent slices.
- R13: available-slice proof above; full end-to-end acceptance is recorded by the dependent slices.
- R14: planned dependent-slice HTTP/browser/cutover proof; not implemented by this slice.
- R15: available-slice proof above; full end-to-end acceptance is recorded by the dependent slices.
- R16: planned dependent-slice HTTP/browser/cutover proof; not implemented by this slice.
- R17: planned dependent-slice HTTP/browser/cutover proof; not implemented by this slice.
- R18: planned dependent-slice HTTP/browser/cutover proof; not implemented by this slice.
- R19: planned dependent-slice HTTP/browser/cutover proof; not implemented by this slice.
- R20: planned dependent-slice HTTP/browser/cutover proof; not implemented by this slice.
- R21: planned dependent-slice HTTP/browser/cutover proof; not implemented by this slice.
- R22: available-slice proof above; full end-to-end acceptance is recorded by the dependent slices.
- R23: available-slice proof above; full end-to-end acceptance is recorded by the dependent slices.
- R24: available-slice proof above; full end-to-end acceptance is recorded by the dependent slices.
- R25: planned dependent-slice HTTP/browser/cutover proof; not implemented by this slice.
- R26: planned dependent-slice HTTP/browser/cutover proof; not implemented by this slice.
- R27: planned dependent-slice HTTP/browser/cutover proof; not implemented by this slice.
- R28: planned dependent-slice HTTP/browser/cutover proof; not implemented by this slice.
- R29: planned dependent-slice HTTP/browser/cutover proof; not implemented by this slice.
- R30: planned dependent-slice HTTP/browser/cutover proof; not implemented by this slice.
- R31: planned dependent-slice HTTP/browser/cutover proof; not implemented by this slice.
- R32: planned dependent-slice HTTP/browser/cutover proof; not implemented by this slice.
- R33: planned dependent-slice HTTP/browser/cutover proof; not implemented by this slice.
- R34: planned dependent-slice HTTP/browser/cutover proof; not implemented by this slice.

## Deviations

The owner requested separate reviewable PRs. Documentation is scoped to each branch and consolidated to the complete reviewed source in the final docs PR. No whole-draft acceptance inferred.
