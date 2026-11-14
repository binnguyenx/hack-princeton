# Preflight and review: Mechanical documentation reconciliation

Owner: coordinator. Date:2026-11-14. Status: complete.

## Scope and authorization

The owner requested rereading the mechanical README and canvas spec, tracing tools to code, and updating gaps only. This corrects documentation drift against already implemented behavior; no new intent, requirement, implementation plan or acceptance gate is introduced. Existing uncommitted code/docs from the prior task must be preserved. No application code, tests, dependency, runtime data, commit or push changes are authorized here.

## Read and evidence

Read the current canvas intent/spec and mechanical README; compare the improvement spec/plan targets with App command/keyboard handlers, command registry, document/inspector/workbench components, Three.js viewport/navigation/pose math, legacy session/debug ops, package IO helpers and actual FastAPI placement service/repository. Existing canvas/placement/migration browser and focused math/HTTP tests were inspected, not rerun. Full behavioral/speculative scientific references were not revalidated by this source-only review.

## Findings addressed

- Numeric rigid Transform/Apply/Cancel and full-pose Restore now exist; old missing-draft claims were stale.
- Focus and navigation controls are wired; Select is document-context only and still lacks scene picking/highlight.
- Visibility has a command/state path but no renderer consumption. Save/Open Package browser callbacks are messages despite real API-backed persistence.
- One-shot slice Place is not a persistent landmark or candidate construction. Numeric placement is editor-world positioning, not real reconstruction.
- Advertised shortcut labels are not handler parity: Restore Backspace missing; Shift+Z restores rather than Redo; plain Enter is suppressed in input fields.
- Debug writes remain legacy in-memory ops; activeView/pending count and full state/error/failure coverage are incomplete. World-matrix layout differs from stored pose layout.
- Static ruler/axes, simplified tilt lock and view/slice controls do not satisfy full Slicer/clinical/measurement requirements. Explicitly retain these gaps instead of marking all controls complete.

## Files changed

- canvas-workspace/spec.md: replace stale status section, update review date and add source/proof limits without changing requirements/status.
- canvas-workspace-improve/README.md: current implemented/partial/missing catalog, manual placement instructions, debug/shortcut caveats, setup/proof commands and source map.
- This review record and canvas-workspace/plan.md: document-only verification/trace evidence.

## Verification

Feature checker passed:4 features,0 errors,0 warnings. git diff --check passed. Relative Markdown link destinations resolve. Before/after hashes confirm that only the four intended Markdown files changed and all pre-existing code/tests/dependencies remain byte-for-byte identical. Initial tracked/untracked file hashes are saved outside the repo at /private/tmp/hp-mechanics-doc-review-before.json. No runtime/browser suite was rerun for this documentation-only correction, and no live storage/process was touched. Requirements and acceptance status are unchanged.
