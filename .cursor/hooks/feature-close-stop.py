#!/usr/bin/env python3
"""stop hook: auto-kick intent-spec-plan Close after major work.

Returns {} unless this turn looks like unfinished major feature work.
When it fires, Cursor submits followup_message as the next user message.
Fail open: any error prints {} so the agent can still stop.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

CLOSE_MARKERS = (
    "**Checks**",
    "**Docs updated**",
    "**Needs your decision**",
)
FEATURE_DOC_RE = re.compile(r"^features/[^/]+/(intent|spec|plan)\.md$")
STATUS_RE = re.compile(r"Status:\s*(accepted|done|draft|retired)\b", re.I)
# Agent/tooling trees never count as product code for Close detection.
SKIP_PREFIXES = (
    ".cursor/",
    ".agents/",
    ".claude/",
    ".codex/",
    "node_modules/",
    ".git/",
)


def emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload) + "\n")


def repo_root(workspace_roots: list[str]) -> Path:
    if workspace_roots:
        return Path(workspace_roots[0])
    return Path.cwd()


def git_changed_files(root: Path) -> list[str]:
    cmds = [
        ["git", "diff", "--name-only", "HEAD"],
        ["git", "diff", "--name-only", "--cached"],
        ["git", "ls-files", "--others", "--exclude-standard"],
    ]
    files: set[str] = set()
    for cmd in cmds:
        try:
            out = subprocess.check_output(cmd, cwd=root, text=True, stderr=subprocess.DEVNULL)
        except (subprocess.CalledProcessError, FileNotFoundError):
            continue
        for line in out.splitlines():
            path = line.strip()
            if path:
                files.add(path)
    return sorted(files)


def is_skipped_path(path: str) -> bool:
    return any(path.startswith(p) for p in SKIP_PREFIXES)


def is_code_change(path: str) -> bool:
    if is_skipped_path(path):
        return False
    if path.endswith(".md"):
        return False
    return True


def accepted_plans(root: Path) -> list[str]:
    features = root / "features"
    if not features.is_dir():
        return []
    found: list[str] = []
    for plan in sorted(features.glob("*/plan.md")):
        try:
            text = plan.read_text(encoding="utf-8")
        except OSError:
            continue
        match = STATUS_RE.search(text)
        if match and match.group(1).lower() == "accepted":
            found.append(str(plan.relative_to(root)))
    return found


def state_paths(root: Path, conversation_id: str) -> tuple[Path, Path]:
    state_dir = root / ".cursor" / "hooks" / "state"
    state_dir.mkdir(parents=True, exist_ok=True)
    done = state_dir / f"close-done-{conversation_id}"
    pending = state_dir / f"close-pending-{conversation_id}"
    return done, pending


def transcript_has_close_report(transcript_path: str | None) -> bool:
    if not transcript_path:
        return False
    path = Path(transcript_path)
    if not path.is_file():
        return False
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return False
    # Prefer the tail so old reports from earlier features don't suppress a new Close.
    tail = text[-120_000:]
    return any(marker in tail for marker in CLOSE_MARKERS)


def needs_close(changed: list[str], accepted: list[str]) -> bool:
    feature_docs = [p for p in changed if FEATURE_DOC_RE.match(p)]
    code = [p for p in changed if is_code_change(p)]
    if not code:
        return False
    # Build in progress: accepted plan + code edits.
    if accepted and code:
        return True
    # Build that also touched feature docs (common even if status not yet accepted).
    if feature_docs and code:
        return True
    return False


FOLLOWUP = """Major work looks done without a Close report. Run intent-spec-plan Close now (`.agents/skills/intent-spec-plan/references/verification.md`):

1. Run the plan Proof tests/commands and report real output (tests are the verification interface).
2. Run `python .agents/skills/intent-spec-plan/scripts/check_features.py .`
3. Review the diff against intent.md, spec.md, and plan.md; fix or flag mismatches for a human decision.
4. Update docs: spec Where it lives + Last updated; plan status → done + Deviations; docs/project.md index; AGENTS.md if a project-wide convention/command changed.
5. Reply with the Close report from verification.md §5 (Needs your decision / Checks table / Docs updated). Do not start new work in this turn.
"""


def main() -> int:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        emit({})
        return 0

    status = payload.get("status")
    loop_count = int(payload.get("loop_count") or 0)
    conversation_id = payload.get("conversation_id") or "unknown"
    workspace_roots = payload.get("workspace_roots") or []
    transcript_path = payload.get("transcript_path")

    if status != "completed":
        emit({})
        return 0

    root = repo_root(workspace_roots)
    done, pending = state_paths(root, conversation_id)

    if done.exists():
        emit({})
        return 0

    if transcript_has_close_report(transcript_path):
        done.write_text("closed\n", encoding="utf-8")
        if pending.exists():
            pending.unlink()
        emit({})
        return 0

    changed = git_changed_files(root)
    accepted = accepted_plans(root)
    major = needs_close(changed, accepted) or pending.exists()

    if not major:
        emit({})
        return 0

    # Already followed up once and still no Close report: one stronger retry via loop_limit.
    pending.write_text(
        json.dumps(
            {
                "loop_count": loop_count,
                "accepted_plans": accepted,
                "changed_sample": changed[:40],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    emit({"followup_message": FOLLOWUP})
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # fail open
        print(f"[feature-close-stop] {exc}", file=sys.stderr)
        emit({})
        raise SystemExit(0)
