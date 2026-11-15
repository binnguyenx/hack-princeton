"""Run deterministic suites published in this feature slice."""
from pathlib import Path
import sys
import unittest
TEST_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(TEST_ROOT.parent / "src"))
if __name__ == "__main__":
    suite = unittest.TestSuite()
    for relative in ['unit/storage', 'integration/storage', 'unit/schemas', 'integration/workflows', 'unit/operations', 'unit/integrations/geometry', 'unit/tools', 'unit/reports', 'unit/agent', 'integration/operations', 'integration/workspace', 'integration/application', 'integration/api']:
        suite.addTests(unittest.TestLoader().discover(str(TEST_ROOT / relative)))
    raise SystemExit(0 if unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful() else 1)
