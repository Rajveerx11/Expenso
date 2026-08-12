import pathlib
import re
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "20260812082339_centralized_group_listing.sql"
FLOW_TEST = ROOT / "supabase" / "tests" / "centralized_group_listing_flow.sql"
REPOSITORY = (
    ROOT
    / "app"
    / "src"
    / "main"
    / "java"
    / "com"
    / "expenso"
    / "app"
    / "data"
    / "repository"
    / "GroupRepositoryImpl.kt"
)


class CentralizedGroupListingContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding="utf-8").lower()
        cls.flow_test = FLOW_TEST.read_text(encoding="utf-8").lower()
        cls.repository = REPOSITORY.read_text(encoding="utf-8")

    def test_migration_repairs_creator_memberships_idempotently(self):
        self.assertIn("function private.repair_group_creator_memberships()", self.sql)
        self.assertIn("insert into public.group_members", self.sql)
        self.assertIn("select groups.id, groups.created_by, 'admin'", self.sql)
        self.assertIn("on conflict (group_id, user_id) do update", self.sql)
        self.assertIn("select private.repair_group_creator_memberships()", self.sql)
        self.assertIn("revoke all on function private.repair_group_creator_memberships() from public", self.sql)

    def test_listing_is_authenticated_duplicate_free_and_rls_aware(self):
        self.assertIn("create or replace function public.list_user_groups()", self.sql)
        self.assertIn("security invoker", self.sql)
        self.assertIn("select distinct groups.*", self.sql)
        self.assertIn("memberships.user_id = (select auth.uid())", self.sql)
        self.assertIn("revoke all on function public.list_user_groups() from public", self.sql)
        self.assertIn("grant execute on function public.list_user_groups() to authenticated", self.sql)
        self.assertNotIn("security definer", self.sql)

    def test_client_uses_one_listing_rpc_and_atomic_creation_rpc(self):
        listing = re.search(
            r"override suspend fun getUserGroups.*?\n    }",
            self.repository,
            flags=re.DOTALL,
        ).group(0)
        creation = re.search(
            r"override suspend fun createGroup.*?\n    }",
            self.repository,
            flags=re.DOTALL,
        ).group(0)

        self.assertEqual(1, listing.count('rpc("list_user_groups")'))
        self.assertNotIn('postgrest["groups"]', listing)
        self.assertNotIn('postgrest["group_members"]', listing)
        self.assertNotIn("emptyList()", listing)
        self.assertIn('"create_group_with_admin"', creation)
        self.assertNotIn('postgrest["groups"].insert', creation)
        self.assertNotIn('postgrest["group_members"].insert', creation)

    def test_database_flow_covers_creator_member_multiple_and_outsider(self):
        self.assertIn("create_group_with_admin('trip'", self.flow_test)
        self.assertIn("create_group_with_admin('home'", self.flow_test)
        self.assertIn("creator sees every group once", self.flow_test)
        self.assertIn("member sees every joined group once", self.flow_test)
        self.assertIn("non-member sees no groups", self.flow_test)
        self.assertIn("anonymous role cannot execute group listing", self.flow_test)
        self.assertGreaterEqual(self.flow_test.count("repair_group_creator_memberships()"), 2)
        self.assertIn("repair restores one administrator membership", self.flow_test)
        self.assertIn("rerunning repair does not duplicate", self.flow_test)


if __name__ == "__main__":
    unittest.main()
