from pathlib import Path
import unittest


MIGRATION = Path(__file__).parents[1] / "migrations" / "20260810183832_settlement_confirmation_allocation.sql"
CONCURRENCY_FLOW = Path(__file__).with_name("settlement_concurrency_flow.sql")


class SettlementConfirmationContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding="utf-8").lower()

    def test_amounts_are_cent_normalized_and_overpayment_is_rejected(self):
        self.assertIn("amount_rounded numeric(12, 2) := round(amount_param, 2)", self.sql)
        self.assertIn("amount_rounded > -current_balance", self.sql)
        self.assertIn("already pending", self.sql)

    def test_confirmation_is_receiver_only_idempotent_and_serialized(self):
        self.assertIn("settlement_record.receiver_id <> user_id_param", self.sql)
        self.assertIn("settlement_record.status = 'confirmed' then return true", self.sql)
        self.assertGreaterEqual(self.sql.count("pg_advisory_xact_lock"), 3)
        self.assertIn("lock_group_expense_settlement_balance", self.sql)
        self.assertIn("settlement_record.amount > current_balance", self.sql)
        self.assertIn("for update of es", self.sql)

    def test_partial_allocation_and_rejection_terminal_state(self):
        self.assertIn("add column settled_amount", self.sql)
        self.assertIn("least(remaining_amount", self.sql)
        self.assertIn("is_settled = settled_amount + applied_amount >= owed_amount", self.sql)
        self.assertIn("settlement_record.status = 'rejected' then return true", self.sql)
        self.assertIn("set status = 'rejected'", self.sql)
        self.assertIn("for historical_settlement in", self.sql)
        self.assertIn("cannot backfill confirmed settlement", self.sql)

    def test_rpc_permissions_are_narrowed(self):
        for function in ("create_settlement", "confirm_settlement", "reject_settlement"):
            self.assertIn(f"revoke all on function public.{function}", self.sql)
            self.assertIn(f"grant execute on function public.{function}", self.sql)

    def test_two_sessions_prove_expense_confirmation_serialization(self):
        flow = CONCURRENCY_FLOW.read_text(encoding="utf-8").lower()
        self.assertIn("dblink_send_query", flow)
        self.assertIn("issue6_expense_session", flow)
        self.assertIn("dblink_is_busy('issue6_confirm')", flow)
        self.assertIn("confirmation resumes after the lock", flow)


if __name__ == "__main__":
    unittest.main()
