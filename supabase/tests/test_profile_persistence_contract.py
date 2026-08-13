from pathlib import Path
import unittest


ROOT = Path(__file__).parents[2]
BASE_MIGRATION = ROOT / "supabase/migrations/20260812072009_profile_persistence.sql"
WEB_MIGRATION = ROOT / "supabase/migrations/20260814010000_web_backend_foundation.sql"
SERVICE = ROOT / "apps/web/src/server/profile/profile-service.ts"
LAYOUT = ROOT / "apps/web/src/app/(dashboard)/layout.tsx"


class ProfilePersistenceContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = (
            BASE_MIGRATION.read_text(encoding="utf-8")
            + WEB_MIGRATION.read_text(encoding="utf-8")
        ).lower()
        cls.service = SERVICE.read_text(encoding="utf-8")
        cls.layout = LAYOUT.read_text(encoding="utf-8")

    def test_avatar_upload_is_limited_to_the_authenticated_folder(self):
        self.assertIn("policy avatars_select_own", self.sql)
        self.assertIn("policy avatars_insert_own", self.sql)
        self.assertIn("policy avatars_update_own", self.sql)
        self.assertGreaterEqual(self.sql.count("storage.foldername(name)"), 4)
        self.assertGreaterEqual(self.sql.count("auth.uid()"), 4)
        self.assertNotIn("using(true)", self.sql.replace(" ", ""))
        self.assertIn("createSignedUploadUrl", self.service)
        self.assertIn("pathPattern.test(path)", self.service)

    def test_profile_update_is_session_scoped_and_omits_unrelated_fields(self):
        self.assertIn("if (patch.fullName !== undefined)", self.service)
        self.assertIn("if (patch.upiId !== undefined)", self.service)
        self.assertIn(".eq('id', userId)", self.service)
        self.assertNotIn("email: patch", self.service)
        self.assertIn(".select(PROFILE_SELECT)", self.service)

    def test_authenticated_layout_loads_authoritative_profile(self):
        self.assertIn("requirePageUser", self.layout)
        self.assertIn("getProfile(client, userId)", self.layout)
        self.assertNotIn("MOCK_PROFILE", self.layout)


if __name__ == "__main__":
    unittest.main()
