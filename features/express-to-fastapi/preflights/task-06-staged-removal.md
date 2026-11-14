# Preflight: staged Express removal candidate

Date: 2026-11-14. Owner authorized cutover, complete thirty-minute observation, then removal; coordinator alone applies the candidate after the actual gate. This work is confined to an isolated staging copy and is not live removal.

Scope: freeze a tiny synthetic Node-created SQLite/volume oracle before deleting Node runtime, preserve fixture-driven Python compatibility, all repository transaction/rollback/cascade/fault coverage, shared sixteen-route FastAPI contracts, actual cross-language HTTP reader proof and browser workflows. Express-only S13 and reverse-write proof remain executable in independently installed recovery runtime outside the active app.

Candidate removals: app/server/api.ts, storageSqlite.ts, vite-api-plugin.ts; Express/Multer and types; obsolete Express test lifecycle/inventory/characterization files only after equivalent active Python/FastAPI coverage. Vite always proxies /api to configured/default loopback FastAPI, preview stays frontend-only. No app UI redesign, public API change, schema migration, live root access or commits.

Proof: frozen baseline checksum and Python read/write/restart tests; active real FastAPI contract suite and Python-over-HTTP integration; full Python runner and app tests; clean npm ci without Express/Multer; build/lint and three browser tests. Preserve failures as evidence; do not weaken expected behavior.

## Staging evidence

Actual isolated candidate checks: npm ci passed; Express/Multer and direct type packages are absent from package.json, lockfile and module resolution. App tests45/16 files passed; Python103 passed; Chrome browser3 passed; build/type passed; lint exit0 with2 inherited warnings. Frozen Node fixture copied and mutated in Python while original checksums remained unchanged. The first discovery run exposed missing staging sandbox dirs due the coordinator copy filter; those staging-only paths were restored, then full checks passed. No source outside staging changed. The coordinator applies the machine-readable manifest only after the actual observation gate; this file does not claim live removal occurred.

Operational scripts added in the staged candidate: `npm run backend -- --storage-root <explicit-root>` runs the installed FastAPI entrypoint; `npm start` supplies ../data/storage and built dist from app cwd. `backend --help` and `start --help` import/argument parsing passed. Bare backend with HACK_STORAGE_ROOT unset exits2 before creating storage, confirming the library/CLI did not acquire an implicit default root. Staging .venv symlink is test setup only and is excluded from the apply manifest.

Actual application: the coordinator applied this candidate only after the real1800second monitor passed. Final current-repo verification is105 Python/45 app/3 Chrome, plus clean npm install without Express/Multer, build/type/lint and restored current-data compatibility with the retained runtime. See cutover-completion.md.
