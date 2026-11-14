# Migration decisions awaiting owner acceptance

Status: proposed, not accepted. Current queue authorization allows implementation and baseline characterization; it does not resolve D1–D5. The existing Express baseline is retained in disposable parity implementations pending decisions; these branches are not cut over to live data.

- D1 — errors/validation. Alternative A: preserve current HTML parser errors, missing-body/meta 500s and accepted malformed pose elements during parity. Alternative B (recommended): JSON 400 and finite numeric pose validation. Consequence: intentional API change, requires explicit delta tests and handling legacy stored values. Affects T03 and validation portions of T02; baseline transport work can proceed.
- D2 — multipart booleans. Alternative A (recommended for parity): exact string true only. Alternative B: accept additional spellings with explicit documented mapping. Consequence: changes verified-source eligibility. Affects T03 import parsing.
- D3 — missing deletes. Alternative A (recommended for migration): preserve current project/case204 vs sample/candidate404. Alternative B: standardize status policy. Consequence: changed public error expectations. Affects T02/T03 delete behavior.
- D4 — cross-project case delete. Alternative A: retain characterized baseline temporarily. Alternative B (recommended): 404 without any mutation for wrong owner. Consequence: intentional defect fix and explicit HTTP/repository regression. Affects T02/T03 delete slice; do not silently fix.
- D5 — post-commit file cleanup. Alternative A: retain characterized baseline temporarily and report limitation. Alternative B (recommended): explicit cleanup failure/reconciliation policy. Must decide reporting status, retained cleanup evidence, operator procedure and schema implications before implementing the change. Consequence: public error and durable-state change. Affects T02 cleanup and T03 deletion; proposed reconciliation system not authorized implicitly.

## Other gates

- Live cutover: requires review of the concrete runbook, exact storage root, writers, paired backup and rehearsal evidence. No live change authorized by a generic migration command.
- Observation and Express rollback retention: duration/start/exit evidence not specified. T06 cannot remove Express until agreed and actually satisfied.
- Unchanged SQLite schema/layout is the baseline; no schema-version change is introduced without a concrete need and review.

## Execution strategy selected under owner delegation

The owner delegated optimization and requested no further questions. The coordinator selected unchanged Express baseline for this migration, with explicit baseline tests and limitations. This is not acceptance of the proposed hardening alternatives D1–D5. Hardening remains separate; no automatic recovery system or schema changes are added. Full parity implementation can proceed on disposable storage; live deployment and removal gates remain explicit.
