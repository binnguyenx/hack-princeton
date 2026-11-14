"""Run deterministic suites available in this publication slice."""
from pathlib import Path
import sys
import unittest
TEST_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(TEST_ROOT.parent / "src"))
if __name__ == "__main__":
    suite = unittest.TestSuite()
    for relative in ['unit/schemas', 'integration/workflows', 'unit/operations']:
        suite.addTests(unittest.TestLoader().discover(str(TEST_ROOT / relative)))
    raise SystemExit(0 if unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful() else 1)
