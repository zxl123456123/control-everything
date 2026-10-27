"""Contracts for the minimal deployable Keycloak child theme."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
THEME = ROOT / "web/workspace/identity-theme/control-everything/login"
FILES = {
    "theme.properties",
    "resources/css/studio.css",
    "messages/messages_zh_Hans.properties",
}


def properties(path):
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip() and not line.startswith("#"):
            key, value = line.split("=", 1)
            if key in values:
                raise AssertionError(f"duplicate property: {key}")
            values[key] = value
    return values


class IdentityThemeTests(unittest.TestCase):
    def test_only_three_files_and_official_parent_resources(self):
        self.assertEqual({p.relative_to(THEME).as_posix() for p in THEME.rglob("*") if p.is_file()}, FILES)
        config = properties(THEME / "theme.properties")
        self.assertEqual(config, {
            "parent": "keycloak.v2", "import": "common/keycloak",
            "styles": "css/styles.css css/studio.css?v=20261028-2", "locales": "zh-Hans,en",
        })
        self.assertTrue((THEME / "resources/css/studio.css").is_file())

    def test_messages_preserve_parent_parameter_contracts(self):
        messages = properties(THEME / "messages/messages_zh_Hans.properties")
        self.assertEqual(set(messages), {
            "loginTitle", "loginAccountTitle", "registerTitle", "oauthGrantTitle", "oauthGrantRequest",
            "oauth2DeviceVerificationTitle", "verifyOAuth2DeviceUserCode",
            "oauth2DeviceInvalidUserCodeMessage", "oauth2DeviceExpiredUserCodeMessage",
            "oauth2DeviceVerificationCompleteHeader", "oauth2DeviceVerificationCompleteMessage",
            "oauth2DeviceVerificationFailedHeader", "oauth2DeviceVerificationFailedMessage",
            "oauth2DeviceConsentDeniedMessage", "errorTitle", "invalidUserMessage",
            "noAccount", "backToLogin", "doYes", "doNo",
        })
        for key, value in messages.items():
            expected = ["{0}"] if key in {"loginTitle", "oauthGrantTitle"} else []
            self.assertEqual(re.findall(r"\{\d+\}", value), expected, key)
            self.assertRegex(value, r"[\u4e00-\u9fff]", key)

    def test_no_template_script_external_asset_or_secret_boundary(self):
        for relative in FILES:
            source = (THEME / relative).read_text(encoding="utf-8")
            if relative == "resources/css/studio.css":
                begin, end = "/* BEGIN CE GENERATED GEIST FONT */", "/* END CE GENERATED GEIST FONT */"
                self.assertEqual(source.count(begin), 1)
                self.assertEqual(source.count(end), 1)
                prefix, generated = source.split(begin)
                generated, suffix = generated.split(end)
                syntax = re.sub(r"/\*.*?\*/", "", generated, flags=re.S)
                urls = re.findall(r"url\s*\([\"']?([^\"')]+)", syntax)
                self.assertEqual(len(urls), 1)
                self.assertTrue(urls[0].startswith("data:font/woff2;base64,"))
                self.assertNotRegex(syntax, r"(?i)<script|<#|https?://|@import")
                source = prefix + suffix
            if relative == "resources/css/studio.css":
                # Calm Glass: the only url() allowed besides the font is an inline SVG data URI (icon masks and brand
                # mark); its xmlns is a namespace identifier, never fetched.
                inline = re.findall(r"url\(([^)]*)\)", source)
                for target in inline:
                    self.assertRegex(target, r"^[\"']?(data:image/svg\+xml,|#)", target)
                stripped = re.sub(r"url\([^)]*\)", "", source)
                self.assertNotRegex(stripped, r"(?i)<script|<#|https?://|@import")
            else:
                self.assertNotRegex(source, r"(?i)<script|<#|https?://|@import|url\s*\(")
        css = (THEME / "resources/css/studio.css").read_text(encoding="utf-8")
        self.assertIn(":root.pf-v5-theme-dark", css)
        self.assertNotIn("prefers-color-scheme", css)
        self.assertIn("forced-colors: active", css)
        self.assertIn(":focus-visible", css)
        self.assertIn("--ca-input: #858585", css)
        self.assertIn("--ca-input: #929292", css)
        # Calm Glass contract: light glass blur + fallbacks, motion and transparency opt-outs, no decorative layers.
        for needle in ("backdrop-filter", "@supports not", "prefers-reduced-transparency: reduce",
                       "prefers-reduced-motion: reduce"):
            self.assertIn(needle, css)
        for banned in ("ca-drift", "i-grain", "--ca-glow", "--ca-blob", "mask-composite", "mix-blend-mode"):
            self.assertNotIn(banned, css)
        self.assertIn("--ca-accent-text: #285e9b", css)

    def test_theme_is_sdist_source_but_not_a_wheel_web_asset(self):
        manifest = (ROOT / "MANIFEST.in").read_text(encoding="utf-8")
        for relative in FILES:
            path = "web/workspace/identity-theme/control-everything/login/" + relative
            self.assertIn("include " + path, manifest)
        build_assets = (ROOT / "tools/packaging/build_assets.py").read_text(encoding="utf-8")
        self.assertNotIn("identity-theme/", build_assets)


if __name__ == "__main__":
    unittest.main()
