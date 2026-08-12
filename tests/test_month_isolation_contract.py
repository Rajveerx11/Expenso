from pathlib import Path
import unittest


REPOSITORY = (
    Path(__file__).parents[1]
    / "app/src/main/java/com/expenso/app/data/repository/ExpenseRepositoryImpl.kt"
)


class MonthIsolationContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = REPOSITORY.read_text(encoding="utf-8")

    def test_postgrest_month_range_is_half_open(self):
        self.assertEqual(2, self.source.count('gte("expense_date", startDate)'))
        self.assertEqual(2, self.source.count('lt("expense_date", endDate)'))
        self.assertNotIn('lte("expense_date", endDate)', self.source)

    def test_rows_and_totals_share_defensive_calendar_filter(self):
        self.assertGreaterEqual(self.source.count("filterExpensesForMonth("), 3)
        self.assertIn("YearMonth.from(LocalDate.parse", self.source)
        self.assertIn("== selectedMonth", self.source)


if __name__ == "__main__":
    unittest.main()
