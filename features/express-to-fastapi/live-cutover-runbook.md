# Live cutover procedure — executed and verified

Status: owner approved and execution completed. FastAPI is the sole application backend/writer; Express is removed from the active app. See cutover-completion.md for actual evidence and recovery/retention paths.

## Preconditions

1. T02/T03 compatibility, T04 actual browser checks and S13 disposable handoff evidence must pass. See task-board.md and execution-evidence.md.
2. Identify the exact live root (default candidate: repository data/storage, overridden by HACK_STORAGE_ROOT), all Express/Vite processes and all clients. The operator must approve this root and the concrete downtime/cutover procedure before execution. A generic migration instruction does not satisfy this gate.
3. Select a timestamped backup directory outside the application root and frontend build output. Verify capacity for the full database and volumes.
4. Agree the observation duration, start time, success/failure criteria, rollback runtime retention location and owner. The owner approved30 minutes; actual periodic observation exceeded1800seconds before removal. Seven-day recovery retention starts at removal verification.
5. Preserve the exact Express-capable source/dependency environment separately from the new runtime. Keep dependencies available through the agreed support window.

## Successful live path (conditional future operation)

1. Disable client writes and stop the Express/Vite writer. Confirm no old writer remains; do not run both backends against the root.
2. With all connections closed, copy app-model.sqlite and the complete volumes tree into the chosen paired backup. If WAL/SHM files exist, first use a verified SQLite backup/checkpoint procedure rather than omitting uncheckpointed data. Preserve the original root.
3. On a disposable restore of the backup, run SQLite integrity_check and foreign_key_check; compare all volume_assets references and file SHA-256 values with sample/revision hashes. Compare project/case/sample/candidate/revision identities, timestamps and current pointers against the quiesced baseline. Record a restore manifest and evidence. A directory copy without verification is not an accepted backup.
4. Build frontend with `cd app && npm run build`. Launch the already-installed Python environment with explicit paths:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src .venv/bin/python -m skullfix_ai.api --storage-root "$APP_STORAGE_ROOT" --host 127.0.0.1 --port 8000 --frontend-dir "$FRONTEND_BUILD_DIR"
```

The task does not set APP_STORAGE_ROOT or FRONTEND_BUILD_DIR automatically. Replace these with reviewed absolute paths. No second AI HTTP server is launched.

5. Verify /healthz, existing project manifests and binary downloads before enabling writes. Readiness indicates composition startup, not a substitute for checking the actual database/files.
6. Reopen clients. Verify normal UI workflow and restart persistence without running destructive acceptance fixtures on live data. Record first acknowledged FastAPI write, current process/root and observation start.
7. Leave FastAPI running as sole writer. Start the agreed observation period. Only after its actual exit criteria are met may T06 remove Express/Multer.

## Conditional rollback

Use only if cutover fails or recovery is required. S13 is already a disposable rehearsal; do not repeat it on live data.

- Before acknowledged new writes: stop FastAPI/clients, preserve current root, verify no acknowledged post-backup write, restore the paired verified backup and start the preserved Express runtime as sole writer.
- After acknowledged writes: stop FastAPI/clients, preserve the current root and backup, then use the S13-verified Express runtime against current compatible data. Check both eras' records and ordinary continued operation. Never silently replace current data with the old snapshot.
- If compatibility or integrity is uncertain: keep writes stopped and reconcile explicitly using preserved current data and backup. Losing acknowledged writes is destructive and requires separate approval; no automatic recovery subsystem is implemented.

## Current gate result

All gates passed under explicit owner approval. Actual discovery was a fresh empty installation; no old dataset was invented. Backup/restore, S13, live browser/restart and full30-minute monitoring passed, followed by active-app Express removal and clean-install acceptance. Recovery archive remains outside the app for at least7days. Read cutover-completion.md before using rollback; after writes, use current data and never silently restore the old empty baseline.
