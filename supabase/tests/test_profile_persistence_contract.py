from pathlib import Path
import unittest


ROOT = Path(__file__).parents[2]
MIGRATION = ROOT / "supabase/migrations/20260812072009_profile_persistence.sql"
REPOSITORY = ROOT / "app/src/main/java/com/expenso/app/data/repository/ProfileRepositoryImpl.kt"
SCREEN = ROOT / "app/src/main/java/com/expenso/app/ui/screen/profile/ProfileScreen.kt"


class ProfilePersistenceContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding="utf-8").lower()
        cls.repository = REPOSITORY.read_text(encoding="utf-8")
        cls.screen = SCREEN.read_text(encoding="utf-8")

    def test_avatar_upsert_can_select_and_update_only_own_folder(self):
        self.assertIn("policy avatars_select_own", self.sql)
        self.assertIn("policy avatars_update_own", self.sql)
        self.assertGreaterEqual(self.sql.count("storage.foldername(name)"), 3)
        self.assertGreaterEqual(self.sql.count("auth.uid()"), 3)
        self.assertNotIn("using(true)", self.sql.replace(" ", ""))

    def test_profile_update_returns_row_and_omits_unrelated_null_fields(self):
        self.assertIn("buildJsonObject", self.repository)
        self.assertIn("fullName?.let", self.repository)
        self.assertIn("avatarUrl?.let", self.repository)
        self.assertIn('upiId == "" -> put("upi_id", JsonNull)', self.repository)
        self.assertIn("select()", self.repository)
        self.assertIn("decodeSingleOrNull<ProfileDto>()?.toDomain()", self.repository)

    def test_profile_refreshes_when_screen_resumes(self):
        self.assertIn("Lifecycle.Event.ON_RESUME", self.screen)
        self.assertIn("viewModel.loadProfile()", self.screen)


if __name__ == "__main__":
    unittest.main()
