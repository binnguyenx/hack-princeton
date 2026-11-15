# Plan: PR #31 final review repairs

Spec: ../spec.md R90–R95 clarifications. Date: 2026-11-14. Status: done (publication authorized; not merged). Owner coordinator.

Preflight: read current PR d0a11d2, review findings, repository workflow, existing intent/spec/plan and audit evidence. User authorizes these repairs only; draft acceptance remains unchanged. Worktree is isolated from the running app; task-start file hashes are recorded in /private/tmp/hp-pr31-three-repairs-before.json.

- F1 (R93/R95), independent: exclude mutating specs from default discovery; validate canonical disposable roots and run profile at config/spec boundaries. Proof: real CLI --list, unsafe config/root rejection and guard tests before any HTTP writes. Status done.
- F2 (R90/R92), independent: use active-document context rather than retained global selection. Preserve viewport selection; verify key/history reset and correct label/payload through actual tab clicks. Proof: helper/panel and disposable browser regression. Status done.
- F3 (R91), independent: skip previous follow-up tokens when choosing the last substantive human intent. Proof: HTTP multi-follow-up chains, assistant spoofing, no-intent fallback and no-write invariance. Status done.
- F4 (R95), depends F1–F3: full Python/app suites, type/build/lint, browser dev/built on disposable roots, feature checker and protected-file/diff review. Status done.

Files: default/dedicated Playwright config, disposable test guard, read-only chat browser tests, context helper/thin App prop, read-only reply helper, focused tests and current docs/setup/work summary. No CSS, Viewport, slices, Node CRUD or original apiPlugin edits. No live storage/server, Bedrock, AI writes or merge. Publication is authorized only after the review follow-up below.

## Close evidence

- F1: default Playwright discovery regression failed on the old runner and now passes: only the two existing canvas tests are discovered. Five isolation tests pass, including canonical-root/profile/URL rejection, storage symlink/hardlink rejection and an alternate real Playwright runner pointed at an in-memory trap. That alternate runner fails with the explicit profile error and sends zero HTTP requests. No application database is involved in the negative runner test.
- F2: actual browser regression first failed because Doc A's history survived a switch to Doc B while selection A remained. After the repair, label/request/context all use active Doc B; a new conversation has empty history, while viewport selection still equals A. Helpers cover missing/invalid documents and current restored revision pointers.
- F3: the HTTP chain brief→continue→yes→tell me more→continue failed before the fix and now preserves brief intent. New substantive human input changes topic; assistant text and follow-up-only history do not invent intent. Browser repeats the brief/continue chain as well, with unchanged application manifests.
- Final: **144 Python tests, 110 app tests, 3 dev + 3 built browser journeys pass**. Dev root /private/tmp/hp-chat-e2e-KAyHDa; built root /private/tmp/hp-chat-e2e-0qE0gs. Build/typecheck and strict standalone guard typecheck pass. Lint exits zero with existing unrelated warnings only. Feature checker: 4 features, 0 errors, 0 warnings; diff/whitespace checks pass.
- Protected recovery CSS, Viewport, SliceViewport, original apiPlugin and app/server files match task-start hashes. No live storage/server was selected, no new provider/AI mutation capability was added, and no commit/push/merge had been performed at that initial implementation Close.

## Deviations

The temporary alternate-runner config needs its own ESM package declaration to load the actual TypeScript config correctly; the regression asserts the profile error, not any generic process failure. Symlink fixtures are unlinked rather than removed as directories. Default legacy canvas tests remain discoverable; this repair excludes/guards the mutating chat suite rather than redesigning unrelated browser coverage. Global viewport selection is intentionally preserved; only chat authority follows the active document.

## Publication follow-up

Owner subsequently authorizes review, commit and push to PR #31, without merge. Scope is these three repairs and their tests/docs; the prior no-publication restriction records the implementation stage. Review additionally makes the unsafe-runner regression point to a deliberately nonexistent browser executable: it must still fail at the profile guard with zero HTTP requests, proving no system Chrome dependency is required for this negative test. Re-run verification and protected-file checks before publishing. No live runtime is changed.

Publication recheck: 144 backend tests, 110 app tests, 3 dev and 3 built browser journeys pass on fresh disposable roots /private/tmp/hp-chat-e2e-XQe0gS and /private/tmp/hp-chat-e2e-KVvBOU. The negative runner test also passes with a nonexistent browser path and zero HTTP calls. Protected recovery UI, original apiPlugin/CRUD and live runtime are excluded from the publication changes.
