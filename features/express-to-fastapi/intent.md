# Intent: Express-to-FastAPI migration

Author: Repository owner · Date:2026-11-14 · Status: draft

Preserve existing UI HTTP contracts and durable SQLite/NRRD data while moving application backend ownership to Python. The completed target has one FastAPI backend; Vite remains frontend tooling. Keep intent/spec separate, characterize contracts first, test copied Node data, and protect acknowledged writes through staged cutover/rollback. Reconstruction stays mock and sandbox-isolated; future graph/providers must not mutate live data without accepted contracts.

## Scoped authorization

The owner authorized the implementation queue and later feature publication. This does not accept the full draft or D1–D5 hardening proposals. This publication branch contains application repository, frozen Node-created data compatibility, transactional revision/cascade coordination, and paired SQLite/volume backups. Later dependent PRs publish the remaining implementation and complete local operation records.
