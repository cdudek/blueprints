"""Offline good/bad fixtures exercise every shared-check rule, including schema errors."""

import importlib.util
import json
import unittest
from pathlib import Path

import jsonschema
import yaml

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "decision4", ROOT / ".github/scripts/decision4.py"
)
CHECK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECK)


class Decision4Tests(unittest.TestCase):
    def test_fixtures(self):
        mapping = yaml.safe_load((HERE / "boundary-map.yaml").read_text())
        for case in json.loads((HERE / "cases.json").read_text()):
            with self.subTest(case=case["name"]):
                try:
                    errors, messages = CHECK.check(
                        case["body"], case["paths"], case.get("map", mapping)
                    )
                except jsonschema.ValidationError:
                    self.assertEqual(case["name"], "invalid-map")
                    continue
                self.assertEqual(not errors, case["valid"], errors)
                if "contains" in case:
                    self.assertIn(case["contains"], "\n".join(messages))

    def test_base_map_cannot_be_lowered_by_pr(self):
        cases = json.loads((HERE / "cases.json").read_text())
        undo = next(case["body"] for case in cases if case["name"] == "undo")
        old = {
            "version": 1,
            "entries": [{"select": {"paths": ["**"]}, "floor": "Migrate"}],
        }
        new = {
            "version": 1,
            "entries": [{"select": {"paths": ["**"]}, "floor": "Undo"}],
        }
        errors, messages = CHECK.check(undo, ["policy.yaml"], new, old)
        self.assertTrue(errors)
        self.assertIn("floor Migrate", "\n".join(messages))

    def test_embedded_schema_matches_pinned_upstream(self):
        import hashlib

        canonical = json.dumps(CHECK.SCHEMA, sort_keys=True).encode()
        self.assertEqual(
            hashlib.sha256(canonical).hexdigest(),
            "d6e2616262c4e3e7d4f2a85d62a348181f4bab21ce5a50f0f899a3b86fca4b9e",
        )


if __name__ == "__main__":
    unittest.main()
