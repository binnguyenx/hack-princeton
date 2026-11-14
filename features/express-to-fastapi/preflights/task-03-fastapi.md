# Preflight: Task 03 FastAPI compatibility transport

Date: 2026-11-14 · Owner: fastapi_transport agent · Status: implementation authorized by the nine-task queue; compatibility proposals remain unaccepted.

Read AGENTS.md, migration intent/spec/plan, actual Express router/Vite mount, Phase A shared HTTP scenarios, Python package and Node application storage. Current routes are 13. D1–D5 are proposals: implement the characterized baseline only; no hardening decision is inferred. Live cutover/removal remain separate gates.

## Scope and ownership

Own `backend/ai/src/skullfix_ai/api/`, `config.py`, API integration tests and this preflight. Application repository agent owns application persistence. Coordinator owns dependencies, shared contract lifecycle, frontend configuration, final integration and main docs.

## Planned changes and requirements

R1–R9, R14, R16–R17: explicit factory, synchronous repository injection, thin 13-route compatibility router, bounded JSON parsing and current error-envelope behavior. Use threadpool for synchronous repository calls. Malformed JSON/oversized bodies retain current HTML baselines until D1 is resolved. No live default root or import-time database initialization. Multipart preserves fields and exact lowercase boolean handling. No response validation that rejects existing legacy values.

## TDD proof

Start with failing API inventory test against a dependency-injected fake repository; add transport/error tests and verify the coordinator's shared Express contract scenarios via real FastAPI process. Exact commands/evidence recorded after execution. Existing route source remains untouched.

## Decisions and blockers

D1–D5 are not accepted by this task. Baseline compatibility is temporary and must not be mistaken for approval of legacy defects. No live cutover or Express removal occurs.

## Evidence and review

- Implemented `api/app.py`, `api/routes/application.py`, `api/errors.py`, explicit CLI `api/__main__.py`, and `config.py`.
- Coordinator's first real-process shared suite: 16/16 pass (`/tmp/hp-fastapi-contract-first.log`). This is HTTP compatibility evidence, not a live cutover.
- Local tests: 8/8 API/static tests pass with `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src /private/tmp/hp-implementation-venv/bin/python -B -m unittest discover -s backend/ai/tests/integration/api -v`.
- TDD behavioral reds: unexpected multipart field returned 400 instead of baseline 500; malformed multipart boundary returned JSON instead of middleware HTML; nonstandard JSON NaN reached the repository (201) instead of parser rejection (400). Corrected parser/transport only, then all tests green. Initial dependency-missing invocation is not counted as a behavioral red.
- FastAPI 0.162 uses lazy included-router entries. Inventory checks actual generated OpenAPI paths/methods against the exact 13 expected routes, rather than assuming `app.routes` is flattened.
- Synchronous repository calls run in Starlette's threadpool. Repository owns per-call connections, so the transport does not keep a global SQLite connection. Graceful process shutdown is owned by Uvicorn.
- No import/factory storage writes, implicit live root, live AI mutation, sandbox routing, response schema coercion, Express deletion, or live cutover was introduced.
- Pending hardening D1–D5 remains pending; current parser/status baselines are explicitly compatibility behavior, not new approval of defects.

## Independent-review parity repairs

A separate review reproduced two differences through real Express HTTP: uploaded fallback filenames retained path components in FastAPI, and compressed JSON requests failed instead of being decoded. Regression tests first failed (gzip/deflate/br 400 instead of 201; basename mismatch), then passed after repair. The installed Node body-parser also supports Zstandard on Node 24, so the transport supports all current gzip/deflate/br/zstd encodings, rejects unsupported encodings with 415 HTML, rejects invalid compressed data with 400 HTML, and applies the 10 MiB limit to decoded output (413 HTML). Filename fallback removes POSIX and Windows path components as Multer does; explicit displayName is preserved.

Final focused API/static suite: 10 tests, OK. Brotli and Zstandard runtime versions are pinned by the coordinator. These are baseline compatibility repairs, not acceptance of D1–D5 hardening proposals. No live data or Express runtime was modified.
