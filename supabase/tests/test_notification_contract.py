from pathlib import Path
import unittest


ROOT = Path(__file__).parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "20260810185110_notification_delivery.sql"
FUNCTION = ROOT / "supabase" / "functions" / "send-notification" / "index.ts"
MANIFEST = ROOT / "app" / "src" / "main" / "AndroidManifest.xml"


class NotificationContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding="utf-8").lower()
        cls.edge = FUNCTION.read_text(encoding="utf-8")

    def test_inbox_is_private_and_deduplicated(self):
        self.assertIn("unique (recipient_id, event_key)", self.sql)
        self.assertIn("notifications_select_own", self.sql)
        self.assertNotIn("grant insert on public.notifications", self.sql)
        self.assertIn("mark_notifications_read", self.sql)

    def test_all_required_events_enqueue_notifications(self):
        for event in ("expense_added", "member_added", "settlement_request", "settlement_confirmed", "settlement_rejected"):
            self.assertIn(event, self.sql)
        self.assertIn("on conflict (recipient_id, event_key) do nothing", self.sql)

    def test_tokens_are_managed_only_through_scoped_rpcs(self):
        self.assertIn("revoke all on public.user_fcm_tokens from authenticated", self.sql)
        self.assertIn("register_push_token", self.sql)
        self.assertIn("unregister_push_token", self.sql)
        self.assertIn("installation_id", self.sql)

    def test_edge_function_requires_service_role_and_claims_delivery(self):
        self.assertIn('request.headers.get("authorization") !== `Bearer ${serviceRoleKey}`', self.edge)
        self.assertIn('rpc("claim_notification_delivery"', self.edge)
        self.assertIn("FIREBASE_SERVICE_ACCOUNT_JSON", self.edge)
        self.assertIn("firebase.messaging", self.edge)

    def test_delivery_is_per_device_and_has_a_durable_retry_drain(self):
        self.assertIn("notification_deliveries", self.sql)
        self.assertIn("next_delivery_at", self.sql)
        self.assertIn('payload.drain === true', self.edge)
        self.assertIn('status: "retry_scheduled"', self.edge)
        self.assertIn('status: "sent_to_all_valid_devices"', self.edge)

    def test_android_declares_fcm_service_and_deep_links(self):
        if not MANIFEST.exists():
            self.skipTest("Legacy Android client was replaced by the web application")
        manifest = MANIFEST.read_text(encoding="utf-8")
        self.assertIn("com.google.firebase.MESSAGING_EVENT", manifest)
        for host in ("group", "settlement", "notifications"):
            self.assertIn(f'android:host="{host}"', manifest)


if __name__ == "__main__":
    unittest.main()
