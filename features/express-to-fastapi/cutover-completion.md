# Live FastAPI cutover and Express removal — completed

Date:2026-11-14. Owner explicitly approved storage discovery, backup/restore verification, live cutover, full30-minute observation, subsequent Express removal and7-day recovery retention. No commit/push. Overall draft specs and D1–D5 hardening proposals are not automatically accepted.

## Discovery and data

No prior app-model.sqlite, HACK_STORAGE_ROOT override or running application process was found in the scoped discovery. The canonical root `/Users/minhtrietnguyen/Desktop/hack princeton/hack-princeton/data/storage` was therefore initialized as a new empty installation. A pre-initialization absence receipt and an empty baseline backup were retained; this does not claim migration of an old user dataset. The labeled cutover-verification project, prepared NRRD, candidate/revisions and restored pointer remain available.

## Backup and retention

Recovery directory: `/Users/minhtrietnguyen/Desktop/hack princeton/migration-recovery/20261114-090600-0500`. Pre-cutover-backup passed SQLite integrity/foreign-key/row/hash and disposable restore checks. SQLite Connection.backup() handles WAL; automated tests additionally prove committed WAL pages and reject changed volume hashes. A separate post-observation snapshot preserves all acknowledged FastAPI-era records before code removal.

The independent `express-runtime/` contains working source (including pre-existing dirty/untracked work), its original lockfile and independently installed dependencies. Its real Express/shared contracts and S13 passed before cutover. It is outside the active repository/dependency tree. Retain this directory and both backups **at least until 2026-11-21T09:44:21.807695-05:00 (America/New_York)**, seven days after removal verification. No automatic deletion job is scheduled.

## Observation and operations

First acknowledged FastAPI write: `2026-11-14T14:08:44.608109+00:00`. Periodic monitoring began `2026-11-14T14:10:05.272153+00:00` and finished `2026-11-14T14:40:17.149109+00:00` (09:40:17 EST). Actual monitored elapsed: `1800.019` seconds, required1800. No unplanned monitor errors. The deadline was conservatively extended from first write to guarantee30 minutes from the first periodic sample.

Actual Chrome project/case/prepared import/candidate/transform/restore/reload passed on the running app; a controlled FastAPI restart preserved the manifest, hash and restored pointer. Monitor checked API availability, manifest ownership/current pointers and binary hashes throughout. Express removal was applied only after the observed gate passed.

## Final acceptance

- Python:105 tests passed, including frozen Node baseline, repository/WAL backup, FastAPI HTTP fault, legacy sandbox and graph tests.
- App:45 tests passed; shared16 FastAPI contracts and real Python-over-HTTP context preserved.
- Actual Chrome:3 tests passed (default dev proxy, built FastAPI, frontend-only preview).
- Clean npm ci, production build/type check and lint passed; lint has2 inherited warnings. Express/Multer/types are absent from package/lock/module resolution.
- Current tests require no Express. Historical Node reverse-write/S13 proof remains in the separate recovery runtime; checksum-locked synthetic Node DB/volume fixtures keep pre-migration reads/writes executable in Python. No required coverage is silently discarded.

## Current runtime and rollback

FastAPI is the sole application backend/writer at `http://127.0.0.1:8000`, PID `54643`, serving the built frontend. Vite dev always proxies /api to FastAPI (default127.0.0.1:8000); preview is frontend-only. Express/Multer, Node repository and middleware are removed from the active app. AI graph remains fake-model/read-only for application data; sandbox generation is separate.

After acknowledged writes, stop FastAPI/clients and preserve current data before using the retained Express runtime on the **current** root. Its `run-express-rollback.sh` explicitly selects that root, clears HACK_API_ORIGIN and refuses startup while8000 is occupied. Never restore the empty pre-cutover baseline over current data. If current data is suspect, stop writes and reconcile explicitly; destructive recovery is not authorized implicitly.
