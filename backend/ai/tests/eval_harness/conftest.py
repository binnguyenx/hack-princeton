"""Agent eval harness options and summary.

Offline (default): replayed model turns, real graph/tools/preflight; fast, free, deterministic.
Live: ``--live-bedrock [--bedrock-model ID]`` or ``--live-gemini [--gemini-model ID]`` grades the real
model against the same expectations (backend/ai/.env is loaded if present).
"""
import os
import sys
from collections import defaultdict
from pathlib import Path

SRC = Path(__file__).resolve().parents[2] / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

RESULTS: list[dict] = []


def pytest_addoption(parser):
    group = parser.getgroup("agent-eval")
    group.addoption("--live-gemini", action="store_true", default=False,
                    help="Grade the real Gemini model instead of replayed trajectories.")
    group.addoption("--live-bedrock", action="store_true", default=False,
                    help="Grade the real AWS Bedrock model (AWS credentials + region).")
    group.addoption("--bedrock-model", default=None,
                    help="Bedrock model/inference profile for --live-bedrock (sets SKULLFIX_BEDROCK_MODEL; ignored offline).")
    group.addoption("--gemini-model", default=None,
                    help="Model id for --live-gemini (e.g. gemini-3.1-flash-lite, gemini-2.5-flash, gemini-2.5-pro).")


def pytest_configure(config):
    config.addinivalue_line("markers", "live_gemini: case graded against the real model")
    if config.getoption("--live-gemini") or config.getoption("--live-bedrock"):
        env = Path(__file__).resolve().parents[2] / ".env"
        if env.is_file():
            from skullfix_ai.api.__main__ import _load_dotenv
            _load_dotenv(env)
        if config.getoption("--bedrock-model"):
            os.environ["SKULLFIX_BEDROCK_MODEL"] = config.getoption("--bedrock-model")
        if config.getoption("--gemini-model"):
            os.environ["SKULLFIX_GEMINI_MODEL"] = config.getoption("--gemini-model")


def pytest_terminal_summary(terminalreporter, exitstatus, config):
    if not RESULTS:
        return
    if config.getoption("--live-bedrock"):
        from skullfix_ai.agent.gemini_graph import bedrock_model_id
        mode = "live bedrock " + bedrock_model_id()
    elif config.getoption("--live-gemini"):
        mode = "live " + (os.environ.get("SKULLFIX_GEMINI_MODEL") or "default model")
    else:
        mode = "offline replay"
    by_category = defaultdict(lambda: [0, 0])
    for row in RESULTS:
        by_category[row["category"]][0] += row["passed"]
        by_category[row["category"]][1] += 1
    terminalreporter.write_sep("=", f"agent eval summary ({mode})")
    for category, (passed, total) in sorted(by_category.items()):
        terminalreporter.write_line(f"{category:<18} {passed}/{total}")
    total_passed = sum(row["passed"] for row in RESULTS)
    latency = sum(row["seconds"] for row in RESULTS) / len(RESULTS)
    terminalreporter.write_line(f"{'overall':<18} {total_passed}/{len(RESULTS)}   mean latency {latency:.2f}s")
    failed = [row for row in RESULTS if not row["passed"]]
    for row in failed:
        terminalreporter.write_line(f"  FAILED {row['id']}: {row['reason']}")
