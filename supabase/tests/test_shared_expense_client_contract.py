from pathlib import Path
import unittest


ROOT = Path(__file__).parents[2]


class SharedExpenseClientContractTest(unittest.TestCase):
    def test_mutations_use_atomic_rpcs_and_decode_delete_result(self):
        source = (ROOT / "app/src/main/java/com/expenso/app/data/repository/GroupRepositoryImpl.kt").read_text(encoding="utf-8")
        self.assertIn('"create_group_expense"', source)
        self.assertIn('"delete_group_expense"', source)
        delete_block = source[source.index('"delete_group_expense"'):]
        self.assertIn("decodeAs<Boolean>()", delete_block)


if __name__ == "__main__":
    unittest.main()
