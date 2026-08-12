from pathlib import Path
import re
import unittest


ROOT = Path(__file__).parents[1]
EXCLUDED = {".git", "build", ".gradle", ".kotlin", "__pycache__"}


class CredentialHygieneTest(unittest.TestCase):
    def test_current_tree_contains_no_live_client_or_private_credentials(self):
        findings = []
        patterns = {
            "JWT": re.compile(r"eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}"),
            "Supabase secret": re.compile(r"sb_secret_[A-Za-z0-9_-]{20,}"),
            "Supabase publishable": re.compile(r"sb_publishable_(?!replace_me)[A-Za-z0-9_-]{20,}"),
            "private key": re.compile(
                r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s+[A-Za-z0-9+/=]{40,}"
            ),
        }
        for path in ROOT.rglob("*"):
            if not path.is_file() or any(part in EXCLUDED for part in path.parts):
                continue
            if path.suffix.lower() in {".jar", ".png", ".webp", ".class"}:
                continue
            if path.suffix.lower() == ".apk":
                findings.append(f"tracked/distributed APK: {path.relative_to(ROOT)}")
                continue
            try:
                content = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue
            for label, pattern in patterns.items():
                if pattern.search(content):
                    findings.append(f"{label}: {path.relative_to(ROOT)}")
        self.assertEqual([], findings)

    def test_local_credential_files_are_ignored(self):
        ignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
        for entry in (
            "local.properties", ".env", "*.pem", "*.key", "*.apk", "google-services.json"
        ):
            self.assertIn(entry, ignore)

    def test_android_uses_only_approved_project_and_external_key_sources(self):
        build = (ROOT / "app/build.gradle.kts").read_text(encoding="utf-8")
        app_module = (
            ROOT / "app/src/main/java/com/expenso/app/core/di/AppModule.kt"
        ).read_text(encoding="utf-8")
        approved = "https://rspuqbcgjqezimwwpbzl.supabase.co"
        urls = re.findall(r'https://[a-z0-9]+\.supabase\.co', build + app_module)
        self.assertEqual([approved], urls)
        gradle = build.index('gradleProperty("SUPABASE_PUBLISHABLE_KEY")')
        environment = build.index('environmentVariable("SUPABASE_PUBLISHABLE_KEY")')
        local = build.index('localProperties.getProperty("SUPABASE_PUBLISHABLE_KEY")')
        self.assertLess(gradle, environment)
        self.assertLess(environment, local)
        self.assertIn("dependsOn(validateSupabaseReleaseConfig)", build)
        self.assertIn("BuildConfig.SUPABASE_PUBLISHABLE_KEY", app_module)
        self.assertNotIn("legacyAnon", build)
        self.assertNotIn("isLegacyAnon", app_module)


if __name__ == "__main__":
    unittest.main()
