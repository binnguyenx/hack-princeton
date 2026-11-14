import unittest

from skullfix_ai.operations.execute import execute_operation


class MissingContractTest(unittest.TestCase):
    def test_real_measurement_without_agreed_contract_stores_no_number(self):
        result = execute_operation("measure.candidate", agreed_operation_ids=frozenset())

        self.assertEqual(result.status, "unavailable")
        self.assertEqual(result.reason, "operation-contract-missing")
        self.assertIsNone(result.value)


if __name__ == "__main__":
    unittest.main()
