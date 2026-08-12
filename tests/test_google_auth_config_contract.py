from pathlib import Path
import unittest


BUILD = Path(__file__).parents[1] / "app" / "build.gradle.kts"


class GoogleAuthBuildContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.script = BUILD.read_text(encoding="utf-8")

    def test_client_id_sources_have_documented_precedence(self):
        gradle_property = cls_index(self.script, 'gradleProperty("GOOGLE_WEB_CLIENT_ID")')
        environment = cls_index(self.script, 'environmentVariable("GOOGLE_WEB_CLIENT_ID")')
        local_property = cls_index(self.script, 'localProperties.getProperty("GOOGLE_WEB_CLIENT_ID")')
        self.assertLess(gradle_property, environment)
        self.assertLess(environment, local_property)
        self.assertIn("map(String::trim)", self.script)
        self.assertIn("firstOrNull(String::isNotEmpty)", self.script)

    def test_every_release_task_path_depends_on_validation(self):
        self.assertIn('it.name == "preReleaseBuild"', self.script)
        self.assertIn("dependsOn(validateGoogleSignInReleaseConfig)", self.script)
        self.assertIn('inputs.property("googleWebClientId", googleWebClientId)', self.script)
        self.assertIn(".matches(configuredClientId)", self.script)


def cls_index(value: str, needle: str) -> int:
    index = value.find(needle)
    if index < 0:
        raise AssertionError(f"Missing build contract: {needle}")
    return index


if __name__ == "__main__":
    unittest.main()
