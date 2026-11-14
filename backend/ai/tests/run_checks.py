"""Run all deterministic backend suites without AWS or a running service."""

from pathlib import Path
import sys
import unittest


TEST_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(TEST_ROOT.parent / "src"))


def main() -> int:
    suite = unittest.TestSuite()
    for relative in (
        "unit/storage",
        "integration/storage",
        "unit/schemas",
        "integration/workflows",
        "unit/operations",
        "unit/integrations/geometry",
        "integration/operations",
        "integration/workspace",
        "integration/application",
        "integration/api",
        "integration/agent",
    ):
        suite.addTests(unittest.TestLoader().discover(str(TEST_ROOT / relative)))
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
