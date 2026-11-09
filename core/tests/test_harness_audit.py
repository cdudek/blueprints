"""Fresh evidence, missing rules, secret-path refusal and idempotent issue publication."""

from __future__ import annotations

import importlib.machinery
import importlib.util
import json
import os
import shlex
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parents[1] / "references"


def load(name: str, path: Path):
    loader = importlib.machinery.SourceFileLoader(name, str(path))
    spec = importlib.util.spec_from_loader(name, loader)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    loader.exec_module(module)
    return module


audit = load("tested_harness_audit", HERE / "harness-audit.py")
legacy = load("tested_legacy_guards", HERE / "legacy-guards-test.py")
sync = load("tested_harness_sync", HERE / "sync-harness-audit.py")


class PlatformPolicy(unittest.TestCase):
    def run_policy(self, responses, **overrides):
        config = {"owner": "example-owner", "default_branch": "main", **overrides}

        def fake(args, root, **kwargs):
            if args[1:3] == ["repo", "view"]:
                self.assertNotIn("GH_REPO", kwargs["env"])
                return subprocess.CompletedProcess(args, 0, "example-owner/repo\n", "")
            value = responses.get(args[-1], None)
            return subprocess.CompletedProcess(
                args, 1 if value is None else 0, json.dumps(value), ""
            )

        with patch.object(audit, "command", side_effect=fake):
            return audit.branch_policy(Path("."), config)

    def test_active_rules_and_classic_protection_both_supply_proof(self):
        for suffix, payload in (
            (
                "rules/branches/main",
                [
                    {
                        "type": "required_status_checks",
                        "parameters": {
                            "required_status_checks": [
                                {"context": "local-ci"},
                                {"context": "decision4"},
                            ]
                        },
                    }
                ],
            ),
            (
                "branches/main/protection/required_status_checks",
                {"contexts": ["local-ci", "decision4"]},
            ),
        ):
            with self.subTest(source=suffix):
                evidence, gaps = self.run_policy({"repos/example-owner/repo/" + suffix: payload})
                self.assertEqual(gaps, [])
                self.assertTrue(evidence["branches"][0]["applied"])

    def test_missing_unknown_and_interior_rules_are_owned_gaps(self):
        evidence, gaps = self.run_policy(
            {
                "repos/example-owner/repo/branches/main/protection/required_status_checks": {
                    "checks": [{"context": "local-ci"}, {"context": "decision4"}]
                }
            },
            protected_branches=["milestone/audit"],
        )
        self.assertEqual(len(evidence["branches"]), 2)
        self.assertEqual(len(gaps), 1)
        self.assertEqual(gaps[0].check, "github-protection:milestone/audit")
        self.assertEqual(gaps[0].owner, "example-owner")
        self.assertIn("decision4", gaps[0].reason)
        _, gaps = self.run_policy({"repos/example-owner/repo/rules/branches/main": []})
        self.assertEqual(len(gaps), 1)

    def test_repository_binding_and_invalid_responses_fail_closed(self):
        _, gaps = self.run_policy({}, repository="example-owner/other")
        self.assertIn("differs", gaps[0].reason)
        evidence, gaps = self.run_policy(
            {"repos/example-owner/repo/rules/branches/main": {"unexpected": True}}
        )
        self.assertFalse(evidence["branches"][0]["applied"])
        self.assertEqual(len(gaps), 1)


class HarnessAudit(unittest.TestCase):
    def setUp(self):
        policy = patch.object(audit, "branch_policy", return_value=({"branches": []}, []))
        policy.start()
        self.addCleanup(policy.stop)
        self.temporary = tempfile.TemporaryDirectory(prefix="harness-audit-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "repo"
        self.root.mkdir()
        for source, destination in (
            ("harness-audit.py", "harness-audit"),
            ("legacy-guards-test.py", "legacy-guards-test.py"),
        ):
            self.write("scripts/" + destination, (HERE / source).read_text())
        self.write("fixture.json", "{}\n")
        self.config = {
            "version": 1,
            "owner": "example-owner",
            "default_branch": "main",
            "legacy": [],
            "checks": [
                {
                    "id": "probe",
                    "owner": "example-owner",
                    "kind": "execution",
                    "tools": [[sys.executable, "--version"]],
                    "configs": ["fixture.json"],
                    "rules": ["controlled checker"],
                    "reason": "A fresh controlled test execution",
                }
            ],
        }
        self.write(audit.CONFIG, json.dumps(self.config))
        self.write(
            audit.LOCK,
            json.dumps(
                {
                    "pin": "0" * 40,
                    "version": 1,
                    "repository": audit.SOURCE_REPOSITORY,
                    "source": audit.SOURCE_DIRECTORY,
                    "files": {
                        "scripts/" + name: audit.digest(self.root / "scripts" / name)
                        for name in ("harness-audit", "legacy-guards-test.py")
                    },
                }
            ),
        )
        self.gate(
            "printf 'fresh checker; base=%s\\n' \"$CI_LOCAL_BASE_REF\" > \"$logs/probe.log\"\nprintf 'PASS probe (0s)\\n'\n"
        )
        self.git("init", "-q", "-b", "main")
        self.commit()
        self.git("update-ref", "refs/remotes/origin/main", "HEAD")

    def write(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return path

    def git(self, *args):
        result = subprocess.run(
            [
                "git",
                "-c",
                "user.name=Audit Fixture",
                "-c",
                "user.email=fixture@example.invalid",
                *args,
            ],
            cwd=self.root,
            env={k: v for k, v in os.environ.items() if not k.startswith("GIT_")},
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()

    def commit(self):
        self.git("add", ".")
        self.git("commit", "-qm", "fixture", "--allow-empty")

    def gate(self, body):
        self.write(
            "scripts/ci-local",
            "#!/bin/bash\nset -euo pipefail\nCHECK_NAMES=(probe)\nCHECK_COMMANDS=('true')\n# END REPO CONFIG\nhead=$(git rev-parse HEAD)\nlogs=$(git rev-parse --absolute-git-dir)/ci-local/$head\nmkdir -p \"$logs\"\n"
            + body,
        )

    def execute(self):
        self.write(audit.CONFIG, json.dumps(self.config))
        self.commit()
        config, checks, gaps = audit.configuration(self.root)
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("HARNESS_AUDIT_ACTIVE", None)
            return audit.audit(self.root, config, checks, gaps)

    def test_fresh_execution_binds_head_tree_and_comparison_base(self):
        report = self.execute()
        self.assertEqual(report["gaps"], [])
        self.assertEqual(report["head"], self.git("rev-parse", "HEAD"))
        self.assertEqual(report["tree"], self.git("rev-parse", "HEAD^{tree}"))
        self.assertEqual(report["base_tip"], self.git("rev-parse", "origin/main"))
        self.assertTrue(all(report["checks"][0]["states"].values()))
        self.assertIn(report["base_tip"], (Path(report["artifact"]) / "probe.log").read_text())

    def test_monthly_run_requests_full_selection_even_on_a_docs_comparison(self):
        self.gate(
            'if [[ "${CI_LOCAL_FULL_SUITE:-}" != 1 ]]; then printf "PASS docs-format (0s)\\n"; exit 0; fi\n'
            'printf "fresh checker\\n" > "$logs/probe.log"\n'
            'printf "PASS probe (0s)\\n"\n'
        )
        with patch.dict(os.environ, {"CI_LOCAL_FULL_SUITE": "0"}):
            report = self.execute()
        self.assertEqual(report["gaps"], [])
        self.assertTrue(all(report["checks"][0]["states"].values()))

    def test_missing_tool_and_unproved_ruleset_are_owned_gaps(self):
        row = self.config["checks"][0]
        row["tools"] = [["nonexistent-audit-tool-xyz", "--version"]]
        row["kind"] = "ruleset"
        report = self.execute()
        states = report["checks"][0]["states"]
        self.assertFalse(states["installed"])
        self.assertFalse(states["applied"])
        self.assertTrue(all(gap["owner"] == "example-owner" for gap in report["gaps"]))

    def test_old_log_cannot_make_a_new_execution_claim(self):
        self.gate("printf 'PASS probe (0s)\\n'\n")
        self.commit()
        head = self.git("rev-parse", "HEAD")
        stale = self.write(f".git/ci-local/{head}/probe.log", "old green result\n")
        os.utime(stale, (1, 1))
        config, checks, gaps = audit.configuration(self.root)
        report = audit.audit(self.root, config, checks, gaps)
        self.assertFalse(report["checks"][0]["states"]["executed"])
        self.assertFalse(report["checks"][0]["states"]["passed"])

    def test_skip_and_empty_suite_are_not_passes(self):
        for text in (
            "SKIPPED absent scanner",
            "No test files found",
            "Checked 0 files",
            "Tests 8 skipped (8)",
            "Tests 49 passed | 8 skipped (57)",
            "OK (skipped=1)",
            "# tests 8\n# pass 0\n# skipped 8",
        ):
            with self.subTest(text=text):
                self.gate(
                    f"printf '%s\\n' '{text}' > \"$logs/probe.log\"\nprintf 'PASS probe (0s)\\n'\n"
                )
                report = self.execute()
                self.assertFalse(report["checks"][0]["states"]["passed"])

    def test_command_bounds_network_requests_and_preserves_explicit_probe_timeout(self):
        result = subprocess.CompletedProcess(["gh", "repo", "view"], 0, "", "")
        with patch.object(audit.subprocess, "run", return_value=result) as child:
            audit.command(["gh", "repo", "view"], self.root)
            self.assertEqual(child.call_args.kwargs.get("timeout"), 60)
            audit.command(["bash", "fixture"], self.root, timeout=180)
            self.assertEqual(child.call_args.kwargs["timeout"], 180)

    def test_ruleset_requires_actual_refusal_and_allowed_evidence(self):
        row = self.config["checks"][0]
        row["kind"] = "ruleset"
        row["applied"] = {
            "command": "printf 'allowed\\n'",
            "required_output": ["refused", "allowed"],
        }
        self.assertFalse(self.execute()["checks"][0]["states"]["applied"])
        row["applied"]["command"] = "printf 'refused\\nallowed\\n'"
        self.assertTrue(self.execute()["checks"][0]["states"]["applied"])

    def test_skipped_or_empty_ruleset_probe_cannot_supply_applied_evidence(self):
        row = self.config["checks"][0]
        row["kind"] = "ruleset"
        for suffix in (
            "SKIPPED required scanner",
            "OK (skipped=1)",
            "1 skipped",
            "No test files found",
            "0 tests",
            "Checked 0 files",
        ):
            with self.subTest(suffix=suffix):
                output = "refused\nallowed\n" + suffix + "\n"
                row["applied"] = {
                    "command": "printf %s " + shlex.quote(output),
                    "required_output": ["refused", "allowed"],
                }
                report = self.execute()
                self.assertFalse(report["checks"][0]["states"]["applied"])
                self.assertTrue(
                    any(
                        gap["check"] == "probe" and gap["state"] == "applied"
                        for gap in report["gaps"]
                    )
                )

    def test_dirty_and_recursive_runs_are_refused(self):
        config, checks, gaps = audit.configuration(self.root)
        self.write("untracked.txt", "unverified\n")
        with self.assertRaisesRegex(ValueError, "local edits"):
            audit.audit(self.root, config, checks, gaps)
        with patch.dict(os.environ, {"HARNESS_AUDIT_ACTIVE": "1"}):
            with self.assertRaisesRegex(ValueError, "Recursive"):
                audit.audit(self.root, config, checks, gaps)

    def test_secret_paths_and_escaping_links_are_refused_without_opening_them(self):
        with self.assertRaisesRegex(ValueError, "Withheld"):
            audit.config_hashes(self.root, [".env.local"])
        (self.root / "outside").symlink_to(self.root.parent, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "leaves"):
            audit.safe_path(self.root, "outside/config.json")

    def test_configuration_hashes_only_committed_inputs_without_opening_local_files(
        self,
    ):
        self.write("config/public.json", "{}\n")
        self.write(".gitignore", "config/local*\nconfig/.terraform/\n")
        self.commit()
        withheld = [
            self.write("config/local.tfvars", "synthetic private fixture\n"),
            self.write("config/local.tfstate", "synthetic state fixture\n"),
            self.write("config/.terraform/backend.json", "synthetic backend fixture\n"),
            self.write("config/untracked.json", "uncommitted fixture\n"),
        ]
        real_digest = audit.digest
        opened = []

        def observed(path):
            self.assertNotIn(path, withheld, "audit attempted to read local private input")
            opened.append(path.relative_to(self.root).as_posix())
            return real_digest(path)

        with patch.object(audit, "digest", side_effect=observed):
            hashes = audit.config_hashes(self.root, ["config"])
            self.assertEqual(set(hashes), {"config/public.json"})
            self.assertEqual(opened, ["config/public.json"])
            with self.assertRaisesRegex(ValueError, "committed"):
                audit.config_hashes(self.root, ["config/untracked.json"])
        self.assertEqual(opened, ["config/public.json"])

    def test_configuration_refuses_tracked_state_values_and_links_before_opening(self):
        self.write("config/public.json", "{}\n")
        self.write("config/private.tfvars", "synthetic private fixture\n")
        self.commit()
        with patch.object(audit, "digest") as opened:
            with self.assertRaisesRegex(ValueError, "Withheld"):
                audit.config_hashes(self.root, ["config"])
            opened.assert_not_called()
        self.git("rm", "config/private.tfvars")
        self.commit()
        (self.root / "config/link.json").symlink_to(self.root / "fixture.json")
        self.commit()
        with patch.object(audit, "digest") as opened:
            with self.assertRaisesRegex(ValueError, "linked"):
                audit.config_hashes(self.root, ["config"])
            opened.assert_not_called()

    def test_reset_cannot_remove_tracked_product_configuration(self):
        with self.assertRaisesRegex(ValueError, "tracked"):
            audit.reset_caches(self.root, ["fixture.json"])
        self.assertTrue((self.root / "fixture.json").is_file())

    def test_optional_adapters_do_not_claim_absent_consumer_guards(self):
        self.assertEqual(legacy.chain_cases(self.root), [])
        self.assertEqual(legacy.verify_cases(self.root), [])

    def test_actual_shared_pre_push_runs_four_refusal_and_allowed_cases(self):
        source = self.root / "hook-source"
        for original, copied in (
            ("ci-local.sh", "scripts/ci-local"),
            ("ci-local-pre-push.sh", ".githooks/pre-push"),
        ):
            destination = source / copied
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(HERE / original, destination)
        self.assertEqual(
            legacy.prepush_cases(source),
            ["forbidden-edit", "missing-evidence", "stale-lock", "allowed"],
        )

    def test_consumer_config_refusal_fixtures_use_the_canonical_auditor(self):
        source = self.root / "consumer-source"
        for original, copied in (
            ("harness-audit.py", "harness-audit"),
            ("legacy-guards-test.py", "legacy-guards-test.py"),
        ):
            destination = source / "scripts" / copied
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(HERE / original, destination)
        self.assertEqual(
            legacy.config_cases(source),
            ["config/allowed", "config/missing-check", "config/stale-lock"],
        )

    def test_manifest_repository_mismatch_prevents_every_issue_write(self):
        self.config["repository"] = "example-owner/repo"
        report = self.execute()
        calls = []

        def github(args, root, **kwargs):
            calls.append(args)
            return subprocess.CompletedProcess(args, 0, "other-owner/repo\n", "")

        with patch.object(audit, "command", side_effect=github):
            with self.assertRaisesRegex(ValueError, "differs"):
                audit.update_issue(self.root, report, "example-owner")
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][1:3], ["repo", "view"])

    def test_default_head_audit_supplies_a_fresh_owned_review_body(self):
        self.gate(
            "test -f \"$CI_LOCAL_PR_BODY\"\nprintf 'fresh checker\\n' > \"$logs/probe.log\"\nprintf 'PASS probe (0s)\\n'\n"
        )
        self.commit()
        self.git("update-ref", "refs/remotes/origin/main", "HEAD")
        config, checks, gaps = audit.configuration(self.root)
        report = audit.audit(self.root, config, checks, gaps)
        self.assertEqual(report["gaps"], [])
        body = (Path(report["artifact"]) / "audit-body.md").read_text()
        self.assertIn(report["head"], body)
        self.assertIn("**🟢 Undo**", body)
        self.assertNotIn("tests passed", body)
        paths = self.write("audit-paths.txt", "")
        map_path = self.write(
            "audit-map.yaml",
            "version: 1\nprecedence: highest-floor-wins\nentries:\n- select:\n    paths: ['**']\n  floor: Migrate\n  put_right: Restore the source and revalidate consumers.\n  answerer: Owner\n",
        )
        checker = HERE.parents[1] / ".github/scripts/decision4.py"
        decision = subprocess.run(
            [
                sys.executable,
                str(checker),
                "--body-file",
                str(Path(report["artifact"]) / "audit-body.md"),
                "--files",
                str(paths),
                "--map",
                str(map_path),
            ],
            cwd=self.root,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(decision.returncode, 0, decision.stdout + decision.stderr)

    def test_existing_issue_is_updated_once_and_each_gap_owner_is_assigned(self):
        report = self.execute()
        report["gaps"] = [
            {
                "check": "scanner",
                "state": "applied",
                "owner": "scanner-owner",
                "reason": "No refusal proof",
            }
        ]
        calls = []

        def github(argv, root, **kwargs):
            calls.append(argv)
            if argv[1:3] == ["repo", "view"]:
                output = "example/project\n"
            elif argv[1:3] == ["issue", "list"]:
                output = json.dumps([{"number": 7, "title": audit.ISSUE_TITLE, "state": "OPEN"}])
            else:
                output = "https://github.com/example/project/issues/7\n"
            return subprocess.CompletedProcess(argv, 0, output, "")

        with patch.object(audit, "command", side_effect=github):
            audit.update_issue(self.root, report, "example-owner")
        edits = [argv for argv in calls if argv[1:3] == ["issue", "edit"]]
        self.assertEqual(len(edits), 1)
        self.assertFalse(any(argv[1:3] == ["issue", "create"] for argv in calls))
        self.assertIn("scanner-owner", edits[0])
        body = (Path(report["artifact"]) / "issue.md").read_text()
        self.assertIn("**scanner / applied:** Owner @scanner-owner", body)

    def test_sync_dry_run_changes_nothing_and_write_preserves_local_ownership(self):
        target = self.root / "consumer"
        target.mkdir()
        local = target / audit.CONFIG
        local.write_text('{"owner":"local-owner"}\n')
        payloads = {path: b"#!/usr/bin/env python3\n" for path in sync.ASSETS.values()}
        self.assertEqual(len(sync.sync(target, payloads, "0" * 40, False)), 3)
        self.assertFalse((target / "scripts").exists())
        self.assertEqual(len(sync.sync(target, payloads, "0" * 40, True)), 3)
        self.assertEqual(json.loads(local.read_text())["owner"], "local-owner")
        lock = json.loads((target / audit.LOCK).read_text())
        for name, expected in lock["files"].items():
            self.assertEqual(audit.digest(target / name), expected)
            self.assertTrue((target / name).stat().st_mode & 0o111)
        self.assertEqual(sync.sync(target, payloads, "0" * 40, False), [])

    def test_sync_refuses_a_link_before_writing_any_asset(self):
        target = self.root / "consumer"
        (target / "scripts").mkdir(parents=True)
        (target / "scripts/legacy-guards-test.py").symlink_to(self.root / "fixture.json")
        payloads = {path: b"safe fixture\n" for path in sync.ASSETS.values()}
        with self.assertRaisesRegex(ValueError, "linked"):
            sync.sync(target, payloads, "0" * 40, True)
        self.assertFalse((target / "scripts/harness-audit").exists())
        self.assertEqual((self.root / "fixture.json").read_text(), "{}\n")

    def test_legacy_registration_is_an_actual_hook_command_not_a_name_in_permissions(self):
        hook = self.write(".claude/hooks/guard.sh", "#!/bin/sh\nexit 0\n")
        hook.chmod(0o755)
        self.write(
            ".claude/settings.json",
            json.dumps({"hooks": {}, "permissions": {"deny": ["Read(.claude/hooks/guard.sh)"]}}),
        )
        output = self.root / ".git/legacy-evidence"
        output.mkdir()
        (output / "probe.log").write_text("PASS refused\nPASS allowed\n")
        entry = {
            "path": ".claude/hooks/guard.sh",
            "kind": "guard",
            "via": [".claude/settings.json"],
            "via_check": "probe",
            "required_output": ["PASS refused", "PASS allowed"],
            "invoked_by": "PreToolUse",
            "reason": "Fixture guard",
        }
        checks = [{"id": "probe", "states": {"passed": True}}]
        result = audit.legacy_evidence(self.root, entry, output, checks, "example-owner")
        self.assertFalse(result["states"]["configured"])
        self.assertFalse(result["states"]["applied"])
        self.write(
            ".claude/settings.json",
            json.dumps(
                {
                    "hooks": {
                        "PreToolUse": [
                            {"hooks": [{"command": '"$CLAUDE_PROJECT_DIR"/.claude/hooks/guard.sh'}]}
                        ]
                    }
                }
            ),
        )
        self.assertTrue(
            audit.legacy_evidence(self.root, entry, output, checks, "example-owner")["states"][
                "applied"
            ]
        )
        hook.chmod(0o644)
        result = audit.legacy_evidence(self.root, entry, output, checks, "example-owner")
        self.assertFalse(result["states"]["installed"])
        self.assertFalse(result["states"]["applied"])


if __name__ == "__main__":
    unittest.main()
