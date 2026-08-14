from pathlib import Path
import unittest


MIGRATION = Path(__file__).parents[1] / "migrations" / "20260814050000_settlements_web_api.sql"
CONCURRENCY_FLOW = Path(__file__).with_name("settlement_concurrency.sh")


class SettlementConfirmationContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding="utf-8").lower()

    def test_amounts_are_cent_normalized_and_overpayment_is_rejected(self):
        self.assertIn("amount_param <> round(amount_param, 2)", self.sql)
        self.assertIn("amount_param > outstanding_amount", self.sql)
        self.assertIn("pending_settlement_exists", self.sql)

    def test_confirmation_is_receiver_only_idempotent_and_serialized(self):
        self.assertIn("settlement_record.receiver_id <> caller_id", self.sql)
        self.assertIn("settlement_record.status <> 'pending_confirmation'", self.sql)
        self.assertGreaterEqual(self.sql.count("pg_advisory_xact_lock"), 3)
        self.assertIn("hashtextextended(group_id_param::text, 0)", self.sql)
        self.assertIn("hashtextextended(group_id_param::text, 1)", self.sql)
        self.assertIn("current_outstanding <> settlement_record.outstanding_amount_at_creation", self.sql)
        self.assertIn("for update of splits", self.sql)

    def test_partial_allocation_and_rejection_terminal_state(self):
        self.assertIn("applied_amount := least(", self.sql)
        self.assertIn("is_settled = settled_amount + applied_amount >= owed_amount", self.sql)
        self.assertIn("set status = 'rejected'", self.sql)
        self.assertIn("payment_confirmations_response_state_check", self.sql)
        self.assertIn("settlement confirmation audit is inconsistent", self.sql)

    def test_rpc_permissions_are_narrowed(self):
        for function in ("create_settlement", "confirm_settlement", "reject_settlement"):
            self.assertIn(f"revoke all on function public.{function}", self.sql)
        for function in (
            "create_group_settlement_web",
            "confirm_group_settlement_web",
            "reject_group_settlement_web",
        ):
            self.assertIn(f"grant execute on function public.{function}", self.sql)

    def test_two_sessions_prove_expense_confirmation_serialization(self):
        flow = CONCURRENCY_FLOW.read_text(encoding="utf-8").lower()
        self.assertIn("wait_for_advisory_lock issue6_expense_a", flow)
        self.assertIn("issue6_expense_change_hold", flow)
        self.assertIn("issue6_confirm_changed_result", flow)
        self.assertIn("22023:settlement_changed", flow)


if __name__ == "__main__":
    unittest.main()
