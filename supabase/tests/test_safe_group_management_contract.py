from pathlib import Path
import unittest


MIGRATION = Path(__file__).parents[1] / "migrations" / "20260810182003_safe_group_management.sql"


class SafeGroupManagementContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding="utf-8").lower()

    def test_mutations_are_authenticated_security_definer_rpcs(self):
        for function in (
            "create_group_with_admin",
            "add_group_member_by_email",
            "remove_group_member_safely",
            "delete_group_safely",
            "can_delete_group_safely",
        ):
            self.assertIn(f"function public.{function}", self.sql)
            self.assertIn(f"grant execute on function public.{function}", self.sql)
        self.assertGreaterEqual(self.sql.count("security definer"), 5)
        self.assertGreaterEqual(self.sql.count("set search_path = ''"), 5)

    def test_removal_guards_identity_admin_and_debt(self):
        self.assertIn("member_id_param = caller_id", self.sql)
        self.assertIn("sole administrator cannot be removed", self.sql)
        self.assertIn("member_has_unresolved_debt", self.sql)
        self.assertIn("status = 'pending_confirmation'", self.sql)
        self.assertIn("get diagnostics inserted_count = row_count", self.sql)
        self.assertIn("already a group member", self.sql)
        self.assertIn("revoke update(role) on public.group_members", self.sql)
        self.assertGreaterEqual(self.sql.count("pg_advisory_xact_lock"), 5)
        self.assertIn("validate_expense_split_membership", self.sql)

    def test_delete_preserves_financial_history(self):
        self.assertIn("groups with financial history are retained", self.sql)
        self.assertIn("exists (select 1 from public.group_expenses", self.sql)
        self.assertIn("exists (select 1 from public.settlements", self.sql)


if __name__ == "__main__":
    unittest.main()
