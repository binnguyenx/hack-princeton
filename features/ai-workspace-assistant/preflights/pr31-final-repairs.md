# Preflight: PR #31 final review repairs

Owner coordinator. Date: 2026-11-14. Status: complete; see plan Close evidence. Plan: ../plans/pr31-final-repairs.md.

Confirmed all three findings from actual default test discovery, context resolution/state transitions and repeated-follow-up HTTP calls. Default discovery must be fixed before running browser tests. Dedicated tests must validate root realpath/storage children and profile/base URL; no existing server reuse. F2 changes chat context only, not global viewport selection. F3 reuses bounded human intent only, never assistant-provided facts. Preserve running application/workspace and test on new disposable roots/ports. Initial implementation prohibited commit/push/merge; the subsequent publication follow-up authorizes reviewed commit/push to PR #31, while merge and live runtime changes remain prohibited.
