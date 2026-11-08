"""CLI selection, exact-head cache and PR-body review tally regression tests."""

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "references/ai-review.py"
spec = importlib.util.spec_from_file_location("ai_review", SCRIPT)
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


class ReviewTests(unittest.TestCase):
    def test_nested_commands_strip_worker_lifecycle_but_preserve_auth_context(self):
        with patch.dict(os.environ, {
            "ORCA_AGENT_HOOK_TOKEN": "fixture-hook",
            "ORCA_TERMINAL_HANDLE": "fixture-terminal",
            "ORCA_FUTURE_LIFECYCLE": "fixture-future",
            "CODEX_THREAD_ID": "fixture-thread",
            "AI_REVIEW_AUTH_FIXTURE": "fixture-auth",
        }):
            result = review.command([
                sys.executable, "-c",
                "import json, os; print(json.dumps({"
                "'hooks': [key for key in os.environ if key.startswith('ORCA_') or key == 'CODEX_THREAD_ID'],"
                "'auth': os.environ['AI_REVIEW_AUTH_FIXTURE']}))",
            ])
            self.assertEqual(json.loads(result.stdout), {"hooks": [], "auth": "fixture-auth"})
            self.assertEqual(os.environ["ORCA_AGENT_HOOK_TOKEN"], "fixture-hook")
            self.assertEqual(os.environ["CODEX_THREAD_ID"], "fixture-thread")

    def test_tally_is_collapsed_exact_and_preserves_attribution(self):
        receipt = {
            "reviewer": "codex",
            "head": "a" * 40,
            "tally": {level: 0 for level in review.SEVERITIES},
        }
        text = review.body_with_tally(
            "## What\n\n- **Change:** Example\n\n🤖 Generated with Codex\n", receipt
        )
        self.assertIn("<details>", text)
        self.assertIn("- **Head SHA:** " + "a" * 40, text)
        self.assertTrue(text.endswith("🤖 Generated with Codex\n"))
        self.assertEqual(review.body_with_tally(text, receipt), text)
        receipt["head"] = "b" * 40
        self.assertNotIn("a" * 40, review.body_with_tally(text, receipt))

    def test_invalid_tally_and_duplicate_block_fail(self):
        for result in (
            {},
            {"findings": [], "extra_nits": -1},
            {"findings": [{"severity": "unknown", "summary": "x"}], "extra_nits": 0},
        ):
            with self.assertRaises(ValueError):
                review.validate(result)
        with self.assertRaises(ValueError):
            review.body_with_tally(review.START + review.START, {})

    def test_codex_is_preferred_only_when_logged_in(self):
        with (
            patch.object(review.shutil, "which", return_value="cli"),
            patch.object(review.subprocess, "run") as run,
        ):
            run.return_value = subprocess.CompletedProcess([], 0)
            self.assertEqual(review.reviewer(), "codex")
            self.assertEqual(run.call_count, 1)

    def test_logged_out_codex_falls_back_to_authenticated_claude(self):
        with (
            patch.object(review.shutil, "which", return_value="cli"),
            patch.object(review.subprocess, "run") as run,
        ):
            run.side_effect = [
                subprocess.CompletedProcess([], 1),
                subprocess.CompletedProcess([], 0, '{"loggedIn": true}'),
            ]
            self.assertEqual(review.reviewer(), "claude")

    def test_no_logged_in_cli_fails_closed(self):
        with patch.object(review.shutil, "which", return_value=None):
            with self.assertRaisesRegex(ValueError, "logged-in"):
                review.reviewer()

    def test_cached_exact_head_never_invokes_another_reviewer(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            raw = {
                "head": "head",
                "base": "base",
                "reviewer": "codex",
                "findings": [],
                "extra_nits": 0,
                "tally": dict.fromkeys(review.SEVERITIES, 0),
            }
            review.cache_path(folder, "base", "head").write_text(json.dumps(raw))
            with patch.object(
                review, "reviewer", side_effect=AssertionError("fresh review required")
            ):
                self.assertEqual(review.review("base", "head", folder), raw)
                with self.assertRaisesRegex(AssertionError, "fresh review required"):
                    review.review("base", "changed-head", folder)
                raw["head"] = "forged-head"
                review.cache_path(folder, "base", "head").write_text(json.dumps(raw))
                with self.assertRaisesRegex(ValueError, "stale"):
                    review.review("base", "head", folder)

    def test_low_findings_are_capped_and_extra_nits_are_counted(self):
        findings = [{"severity": "low", "summary": "nit"}] * 5
        self.assertEqual(
            review.validate({"findings": findings, "extra_nits": 3})["low"], 8
        )
        with self.assertRaisesRegex(ValueError, "five-nit"):
            review.validate({"findings": findings + findings, "extra_nits": 0})

    def test_retargeted_head_reviews_each_base_once_and_preserves_both_receipts(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            brief = folder / "REVIEW.md"
            brief.write_text("Review the supplied change.")
            calls = []

            def cli(args, **kwargs):
                calls.append(args)
                if args[0] == "git":
                    return subprocess.CompletedProcess(args, 0, "fixture diff", "")
                Path(args[args.index("--output-last-message") + 1]).write_text(
                    '{"findings": [], "extra_nits": 0}'
                )
                return subprocess.CompletedProcess(args, 0, "fixture", "")

            previous = Path.cwd()
            try:
                os.chdir(folder)
                with (
                    patch.object(review, "reviewer", return_value="codex") as select,
                    patch.object(review, "command", side_effect=cli),
                ):
                    first = review.review("base-a", "same-head", folder / "proof")
                    second = review.review("base-b", "same-head", folder / "proof")
                    self.assertEqual(review.review("base-a", "same-head", folder / "proof"), first)
                    self.assertEqual(review.review("base-b", "same-head", folder / "proof"), second)
                    self.assertEqual(select.call_count, 2)
            finally:
                os.chdir(previous)
            self.assertEqual(first["base"], "base-a")
            self.assertEqual(second["base"], "base-b")
            self.assertEqual(sum(args[:2] == ["git", "diff"] for args in calls), 2)
            self.assertEqual(sum(args[0] == "codex" for args in calls), 2)

    def test_real_git_diff_is_read_once_and_cached_across_body_updates(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            (root / "REVIEW.md").write_text("Review bugs, security and compliance.")
            subprocess.run(["git", "-C", str(root), "add", "."], check=True)
            subprocess.run(
                [
                    "git",
                    "-C",
                    str(root),
                    "-c",
                    "user.name=fixture",
                    "-c",
                    "user.email=fixture@example.invalid",
                    "commit",
                    "-qm",
                    "base",
                ],
                check=True,
            )
            base = subprocess.check_output(
                ["git", "-C", str(root), "rev-parse", "HEAD"], text=True
            ).strip()
            (root / "README.md").write_text("# New document\n")
            subprocess.run(["git", "-C", str(root), "add", "."], check=True)
            subprocess.run(
                [
                    "git",
                    "-C",
                    str(root),
                    "-c",
                    "user.name=fixture",
                    "-c",
                    "user.email=fixture@example.invalid",
                    "commit",
                    "-qm",
                    "head",
                ],
                check=True,
            )
            head = subprocess.check_output(
                ["git", "-C", str(root), "rev-parse", "HEAD"], text=True
            ).strip()
            calls = []
            real_command = review.command

            def cli(args, **kwargs):
                calls.append(args)
                if args[0] == "codex":
                    Path(args[args.index("--output-last-message") + 1]).write_text(
                        '{"findings": [], "extra_nits": 0}'
                    )
                    self.assertIn("New document", kwargs["input"])
                    return subprocess.CompletedProcess(args, 0, "fixture", "")
                return real_command(args, **kwargs)

            previous = Path.cwd()
            try:
                os.chdir(root)
                with (
                    patch.object(review, "reviewer", return_value="codex"),
                    patch.object(review, "command", side_effect=cli),
                ):
                    first = review.review(base, head, root / "proof")
                    self.assertEqual(review.review(base, head, root / "proof"), first)
            finally:
                os.chdir(previous)
            self.assertEqual(sum(args[:2] == ["git", "diff"] for args in calls), 1)
            self.assertEqual(sum(args[0] == "codex" for args in calls), 1)


if __name__ == "__main__":
    unittest.main()
