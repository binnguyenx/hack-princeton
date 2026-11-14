# Preflight: authorized live cutover and observation

Date: 2026-11-14. Owner explicitly approved the reviewed procedure, autonomous storage-root discovery, verified paired backup, FastAPI cutover, a full30-minute observation window, Express removal afterward and backup/rollback retention for7 days. No commit/push. This supersedes the previous live/removal approval blockers; hardening proposals remain unchanged.

Discovery found no app-model.sqlite in checkout/worktrees/Desktop/Documents/Downloads/Cursor workspaceStorage and no configured HACK_STORAGE_ROOT or running application process. Canonical root is repository data/storage. This is a new empty application installation, not evidence of migration of old user records; preserve an absence receipt and initialize/backup a verified empty baseline before any API write.

Preserve the exact pre-removal source, lockfile and independently installed Express runtime outside the repo. Restore-verify SQLite backup plus volumes, including structural integrity, foreign keys, hashes, IDs and revision pointers. Rerun S13 on disposable copies. Start one persistent loopback FastAPI process at8000 serving built frontend. Record first acknowledged write and monotonic/UTC observation start/deadline. Exercise actual UI workflow and restart, monitor full1800seconds. Prepare removal in a separate staging checkout; do not apply it to the live repo before the window passes. Then run clean installation, retained contracts/repository/browser/graph proof without Express. Keep rollback data/runtime at least7days after removal; no automatic deletion is scheduled.

All changes map to migration R11–R20,R26–R34 and approved runbook. Shared intent/spec remain draft except this scoped approval. No blind snapshot rollback after acknowledged writes.
