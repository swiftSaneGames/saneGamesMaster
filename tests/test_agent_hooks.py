"""Behavioral tests for the project hooks; stdlib only, no Claude account needed."""
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/agent_hooks.py"
spec = importlib.util.spec_from_file_location("studio_agent_hooks", SCRIPT)
hooks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hooks)


class HookTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def event(self, path, tool="Write", **values):
        return {"hook_event_name": "PreToolUse", "tool_name": tool,
                "cwd": str(self.root), "tool_input": {"file_path": str(path), **values}}

    def run_hook(self, mode, event=None, raw=None):
        data = json.dumps(event).encode() if raw is None else raw
        output, errors = io.StringIO(), io.StringIO()
        status = hooks.main([mode], io.BytesIO(data), output, errors)
        return status, output.getvalue(), errors.getvalue()

    def assertDenied(self, event):
        status, output, errors = self.run_hook("guard-edit", event)
        self.assertEqual(status, 0)
        self.assertEqual(errors, "")
        result = json.loads(output)["hookSpecificOutput"]
        self.assertEqual(result["hookEventName"], "PreToolUse")
        self.assertEqual(result["permissionDecision"], "deny")
        return output

    def assertNoDecision(self, event):
        self.assertEqual(self.run_hook("guard-edit", event), (0, "", ""))

    def test_normal_source_and_approval_logic_remain_editable(self):
        for path in ("cloudflare/native/store.mjs", "docs/approval-guide.md",
                     "tests/approval_test.py", "docs/secrets-policy.md"):
            with self.subTest(path=path):
                self.assertNoDecision(self.event(path))

    def test_secret_environment_files_are_protected(self):
        for path in (".env", ".env.production", "nested/.env.local", ".ENV.PRODUCTION"):
            with self.subTest(path=path):
                self.assertDenied(self.event(path))

    def test_dummy_examples_remain_editable(self):
        for path in (".env.example", ".env.production.example", "docs/.env.dev.example"):
            with self.subTest(path=path):
                self.assertNoDecision(self.event(path))

    def test_private_keys_and_signing_material_are_protected(self):
        for path in ("signing/distribution.p12", "test.pfx", "upload.keystore", "app.jks",
                     "profile.mobileprovision", "server.key", ".ssh/id_ed25519"):
            with self.subTest(path=path):
                self.assertDenied(self.event(path, tool="Edit"))

    def test_public_key_and_certificate_are_not_private_key_rules(self):
        for path in ("server.crt", "certificate.pem", ".ssh/id_ed25519.pub"):
            with self.subTest(path=path):
                self.assertNoDecision(self.event(path))

    def test_only_approval_state_directory_is_protected(self):
        self.assertDenied(self.event(".studio/approvals/candidate.json"))
        self.assertDenied(self.event(".studio/approvals"))
        self.assertNoDecision(self.event(".studio/approvals-guide.md"))
        self.assertNoDecision(self.event(".studio/approvals/../notes.md"))

    def test_relative_traversal_resolves_sensitive_target(self):
        for path in ("docs/../.env", "docs/../.studio/approvals/release.json",
                     "../.env.production"):
            with self.subTest(path=path):
                self.assertDenied(self.event(path))

    def test_absolute_paths_apply_same_rules(self):
        self.assertDenied(self.event(self.root / ".env.production"))
        self.assertNoDecision(self.event(self.root / "docs" / "plan.md"))

    def test_symlink_alias_to_sensitive_file_is_protected(self):
        target = self.root / ".env.production"
        target.write_text("synthetic fixture")
        alias = self.root / "innocent.txt"
        alias.symlink_to(target)
        self.assertDenied(self.event(alias))

    def test_protected_alias_name_stays_protected(self):
        target = self.root / "ordinary.txt"
        target.write_text("synthetic fixture")
        alias = self.root / ".env.production"
        alias.symlink_to(target)
        self.assertDenied(self.event(alias))

    def test_example_alias_cannot_hide_sensitive_target(self):
        alias = self.root / ".env.example"
        alias.symlink_to(self.root / ".env.production")
        self.assertDenied(self.event(alias))

    def test_approval_directory_symlink_is_protected(self):
        directory = self.root / ".studio" / "approvals"
        directory.mkdir(parents=True)
        alias = self.root / "cache"
        alias.symlink_to(directory, target_is_directory=True)
        self.assertDenied(self.event(alias / "candidate.json"))

    def test_malformed_event_never_echoes_input(self):
        marker = "DO_NOT_LOG_SYNTHETIC_TOKEN"
        for raw in (b"{", b"[]", ("{bad:" + marker).encode(), b"null"):
            with self.subTest(raw=raw[:10]):
                status, output, errors = self.run_hook("guard-edit", raw=raw)
                self.assertEqual(status, 0)
                self.assertEqual(json.loads(output)["hookSpecificOutput"]["permissionDecision"], "deny")
                self.assertNotIn(marker, output + errors)

    def test_missing_and_invalid_paths_are_denied(self):
        for path in (None, 42, {}, [], "", "  ", "x\0.env", "x" * 32769):
            event = self.event("unused")
            event["tool_input"]["file_path"] = path
            with self.subTest(path_type=type(path).__name__):
                self.assertDenied(event)

    def test_invalid_tool_metadata_is_denied(self):
        for name in (None, {}, []):
            with self.subTest(name=name):
                self.assertDenied(self.event("valid.txt", tool=name))
        for value in (None, [], "not-an-object"):
            event = self.event("valid.txt")
            event["tool_input"] = value
            self.assertDenied(event)

    def test_relative_path_requires_usable_cwd(self):
        for cwd in (None, "relative", [], "invalid\0cwd"):
            event = self.event("file.txt")
            event["cwd"] = cwd
            self.assertDenied(event)

    def test_wrong_event_cannot_trigger_edit_flow(self):
        event = self.event("file.txt")
        event["hook_event_name"] = "SessionStart"
        self.assertDenied(event)

    def test_large_input_is_denied_without_echoing_content(self):
        status, output, errors = self.run_hook("guard-edit", raw=b"x" * (hooks.MAX_INPUT_BYTES + 1))
        self.assertEqual(status, 0)
        self.assertLess(len(output + errors), 500)
        self.assertEqual(json.loads(output)["hookSpecificOutput"]["permissionDecision"], "deny")

    def test_tool_content_and_transcript_are_never_logged(self):
        marker = "DO_NOT_LOG_SYNTHETIC_CONTENT"
        event = self.event(".env", content=marker, old_string=marker, new_string=marker)
        event["transcript_path"] = marker
        event["session_id"] = marker
        output = self.assertDenied(event)
        self.assertNotIn(marker, output)

    def test_guard_does_not_claim_to_intercept_bash_or_other_tools(self):
        for tool in ("Bash", "Read", "mcp__service__write"):
            event = {"hook_event_name": "PreToolUse", "tool_name": tool,
                     "tool_input": {"command": "synthetic ignored input"}}
            self.assertNoDecision(event)

    @unittest.skipIf(os.name == "nt", "POSIX path behavior")
    def test_foreign_windows_path_is_not_misinterpreted_on_posix(self):
        self.assertDenied(self.event(r"C:\project\.env"))

    def test_session_reminder_uses_only_fixed_protocol_context(self):
        marker = "DO_NOT_LOG_SYNTHETIC_METADATA"
        status, output, errors = self.run_hook("session-start", {
            "hook_event_name": "SessionStart", "source": "compact",
            "session_id": marker, "transcript_path": marker, "model": marker})
        context = json.loads(output)["hookSpecificOutput"]
        self.assertEqual(status, 0)
        self.assertEqual(errors, "")
        self.assertEqual(context["hookEventName"], "SessionStart")
        self.assertIn("checkpoint", context["additionalContext"])
        self.assertIn("saved no checkpoint", context["additionalContext"])
        self.assertNotIn(marker, output)

    def test_bad_session_metadata_is_nonblocking(self):
        status, output, errors = self.run_hook("session-start", raw=b"not json")
        self.assertEqual(status, 0)
        self.assertEqual(output, "")
        self.assertIn("invalid hook metadata", errors)

    def test_command_line_io_matches_claude_hook_protocol(self):
        proc = subprocess.run([sys.executable, str(SCRIPT), "guard-edit"],
                              input=json.dumps(self.event(".env")), text=True,
                              capture_output=True, check=False, timeout=5)
        self.assertEqual(proc.returncode, 0)
        self.assertEqual(proc.stderr, "")
        self.assertEqual(json.loads(proc.stdout)["hookSpecificOutput"]["permissionDecision"], "deny")

    def test_configuration_scopes_guard_without_permission_overrides(self):
        config = json.loads((ROOT / ".claude/settings.json").read_text())
        self.assertEqual(set(config), {"hooks"})
        self.assertEqual(set(config["hooks"]), {"SessionStart", "PreToolUse"})
        self.assertEqual(config["hooks"]["PreToolUse"][0]["matcher"], "Write|Edit")
        for groups in config["hooks"].values():
            for group in groups:
                for handler in group["hooks"]:
                    self.assertEqual(handler["type"], "command")
                    self.assertEqual(handler["timeout"], 5)
                    self.assertIn('"${CLAUDE_PROJECT_DIR}/scripts/agent_hooks.py"', handler["command"])


if __name__ == "__main__":
    unittest.main()
