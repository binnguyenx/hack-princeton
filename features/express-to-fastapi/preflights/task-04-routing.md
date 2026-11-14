# Preflight: Task 04 built frontend serving preparation

Date: 2026-11-14 · Owner: fastapi_transport agent · Status: implementation preparation authorized; live cutover not authorized.

Read migration R27–R29, S14, Vite configuration and current middleware. FastAPI static serving is opt-in through an explicit frontend directory. Register actual API routes first; unknown `/api` and `/api/...` remain JSON errors for every method and cannot reach SPA fallback. Serve contained existing assets; only extensionless non-API client routes fall back to index.html. No server-local path exposure or arbitrary file serving.

Test API precedence, static content types, client-route refresh, missing assets, traversal exclusion, wrong methods and absent build directory with temporary directories. Coordinator owns real built-app browser/dev-proxy checks and documents exact verified state. No modification of Vite preview; it remains frontend-only.

## Evidence and review

Implemented opt-in built frontend serving through the same FastAPI factory and CLI. Tests verify existing JS assets/content types, index/client refresh, missing assets, contained paths, readiness, JSON errors for unknown API paths across methods, and missing build directory rejection. The 8-test API suite passes; coordinator retains responsibility for actual built-frontend/browser and Vite proxy evidence. No test-client check is represented as browser verification.

CLI: `PYTHONPATH=backend/ai/src <python> -m skullfix_ai.api --storage-root <explicit-root> --frontend-dir <built-app-directory> --host 127.0.0.1 --port 8000`. Omitting both `--storage-root` and explicit `HACK_STORAGE_ROOT` is a usage error. `/healthz` reports composition readiness without initializing data. Express remains the live authority until the separate cutover gate passes.
