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

    def test_non_path_ground_is_not_a_changed_path_match(self):
        kinds = [
            "credentials",
            "data_stores",
            "config_keys",
            "environments",
            "external_apis",
        ]
        for selectors in [{kind: ["production"]} for kind in kinds] + [
            {kind: ["production"] for kind in kinds}
        ]:
            mapping = {
                "version": 1,
                "entries": [
                    {"select": {"paths": ["docs/**"]}, "floor": "Undo"},
                    {"select": selectors, "floor": "Answer"},
                ],
            }
            for paths, expected in [
                (["docs/readme.md"], "Undo"),
                ([], "Undo"),
                (["unmapped.txt"], "Repair"),
            ]:
                with self.subTest(selectors=selectors, paths=paths):
                    floor, messages = CHECK.map_floor(mapping, paths)
                    self.assertEqual(floor, expected)
                    self.assertIn(
                        "map note: non-path ground, read by a person: "
                        + ", ".join(selectors)
                        + " -> Answer",
                        messages,
                    )

    def test_path_and_credentials_keep_conservative_floor(self):
        mapping = {
            "version": 1,
            "entries": [
                {
                    "select": {
                        "paths": ["docs/**"],
                        "credentials": ["production-token"],
                    },
                    "floor": "Answer",
                }
            ],
        }
        floor, messages = CHECK.map_floor(mapping, ["docs/readme.md"])
        self.assertEqual(floor, "Answer")
        self.assertIn(
            "map gap: non-path selectors need owner review: paths, credentials",
            messages,
        )
        self.assertIn("floor Answer: docs/readme.md", messages)
        floor, messages = CHECK.map_floor(mapping, ["src/app.py"])
        self.assertEqual(floor, "Repair")
        self.assertNotIn("floor Answer: src/app.py", messages)

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
