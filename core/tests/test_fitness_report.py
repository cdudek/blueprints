"""Missing, fixture-only and changed results must never become PR proof."""

import importlib.util
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "references/fitness-report.py"
spec = importlib.util.spec_from_file_location("fitness", SCRIPT)
fitness = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fitness)


class FitnessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.log = self.folder / "arch.log"
        self.log.write_text("arch.score: 100; baseline: 100; cycles: 0\n")
        self.policy = {
            "fitness": [
                {"id": "arch.score", "target": "arch", "gate": "score >= 90 and base"},
            ],
            "not_applicable": {"perf.web": "no HTTP product pages"},
        }
        self.checks = {
            "head": "head",
            "base": "base",
            "checks": {
                "arch": {
                    "exit_code": 0,
                    "kind": "actual-check",
                    "log": "arch.log",
                    "sha256": fitness.digest(self.log),
                }
            },
        }

    def aggregate(self):
        return fitness.aggregate(self.policy, self.checks, self.folder)

    def test_report_contains_real_output_and_stack_na_reason(self):
        report = self.aggregate()
        self.assertEqual(len(report["rows"]), 2)
        self.assertIn("arch.score: 100", report["rows"][0]["value"]["output"])
        self.assertIsNone(report["rows"][-1]["pass"])

    def test_fixture_success_cannot_replace_actual_result(self):
        self.checks["checks"]["arch"]["kind"] = "fixture"
        with self.assertRaisesRegex(ValueError, "fixtures are not PR evidence"):
            self.aggregate()

    def test_missing_or_failed_dimension_fails_closed(self):
        for checks in ({}, {"arch": {"exit_code": 1}}):
            self.checks["checks"] = checks
            with self.assertRaisesRegex(ValueError, "no successful actual"):
                self.aggregate()

    def test_modified_dimension_log_is_rejected(self):
        self.log.write_text("invented result")
        with self.assertRaisesRegex(ValueError, "changed"):
            self.aggregate()

    def test_docs_only_product_dimensions_are_honestly_skipped(self):
        self.checks.update(selection="docs-only", changed_paths=["README.md"])
        self.checks["checks"] = {}
        row = self.aggregate()["rows"][0]
        self.assertIsNone(row["pass"])
        self.assertIn("not executed", row["skipped"])
        self.assertNotIn("not_applicable", row)

    def test_mixed_change_cannot_claim_docs_only_skip(self):
        self.checks.update(
            selection="docs-only", changed_paths=["README.md", "src/code.ts"]
        )
        with self.assertRaisesRegex(ValueError, "changed-path evidence"):
            self.aggregate()


if __name__ == "__main__":
    unittest.main()
