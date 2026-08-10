import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
SQL = "\n".join(path.read_text(encoding="utf-8") for path in MIGRATIONS).lower()


class SupabaseContractTest(unittest.TestCase):
    def test_has_one_versioned_foundation_migration(self):
        self.assertEqual(1, len(MIGRATIONS))
        self.assertRegex(MIGRATIONS[0].name, r"^\d{14}_expenso_v1_foundation\.sql$")

    def test_all_v1_tables_exist_and_have_rls(self):
        tables = {
            "profiles",
            "personal_expenses",
            "groups",
            "group_members",
            "group_expenses",
            "expense_splits",
            "settlements",
            "payment_confirmations",
            "user_fcm_tokens",
        }
        for table in tables:
            with self.subTest(table=table):
                self.assertIn(f"create table public.{table}", SQL)
                self.assertIn(f"alter table public.{table} enable row level security", SQL)

    def test_privileged_functions_pin_search_path(self):
        definitions = re.findall(
            r"create or replace function\s+([\w.]+).*?\$\$;",
            SQL,
            flags=re.DOTALL,
        )
        self.assertGreaterEqual(len(definitions), 12)
        for match in re.finditer(
            r"create or replace function\s+([\w.]+).*?\$\$;",
            SQL,
            flags=re.DOTALL,
        ):
            definition = match.group(0)
            if "security definer" in definition:
                with self.subTest(function=match.group(1)):
                    self.assertIn("set search_path = ''", definition)

    def test_rpc_names_and_parameters_match_android_client(self):
        contracts = {
            "recalculate_balance": ["user_id_param"],
            "get_group_balances": ["group_id_param"],
            "create_group_expense": [
                "group_id_param",
                "paid_by_param",
                "title_param",
                "total_amount_param",
                "category_param",
                "split_type_param",
                "note_param",
                "expense_date_param",
                "splits_param",
            ],
            "delete_group_expense": ["expense_id_param"],
            "create_settlement": [
                "group_id_param",
                "receiver_id_param",
                "amount_param",
                "transaction_ref_param",
            ],
            "confirm_settlement": ["settlement_id_param", "user_id_param"],
            "reject_settlement": ["settlement_id_param"],
        }
        kotlin = "\n".join(
            path.read_text(encoding="utf-8")
            for path in (ROOT / "app" / "src" / "main" / "java").rglob("*RepositoryImpl.kt")
        )
        for rpc, parameters in contracts.items():
            with self.subTest(rpc=rpc):
                self.assertIn(f"function public.{rpc}(", SQL)
                self.assertIn(f'"{rpc}"', kotlin)
                for parameter in parameters:
                    self.assertIn(parameter, SQL)
                    self.assertIn(f'put("{parameter}"', kotlin)

    def test_atomic_mutation_contracts_are_exposed_only_to_authenticated(self):
        functions = {
            "create_group_expense",
            "delete_group_expense",
            "create_settlement",
            "confirm_settlement",
            "reject_settlement",
        }
        for function in functions:
            with self.subTest(function=function):
                self.assertRegex(SQL, rf"revoke all on function public\.{function}\([^;]+from public")
                self.assertRegex(SQL, rf"grant execute on function public\.{function}\([^;]+to authenticated")
        self.assertNotIn("service_role", SQL)

    def test_storage_buckets_have_write_policies(self):
        self.assertIn("('avatars', 'avatars', true, 5242880", SQL)
        self.assertIn("('group-images', 'group-images', true, 5242880", SQL)
        self.assertIn("array['image/jpeg', 'image/png', 'image/webp']", SQL)
        self.assertIn("create policy avatars_insert_own", SQL)
        self.assertIn("create policy group_images_insert_admin", SQL)

    def test_settlement_changes_are_published_to_realtime(self):
        self.assertIn("alter publication supabase_realtime add table public.settlements", SQL)
        self.assertIn("alter publication supabase_realtime add table public.payment_confirmations", SQL)


if __name__ == "__main__":
    unittest.main()
