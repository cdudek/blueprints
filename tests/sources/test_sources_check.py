"""Offline fixtures for source parsing, comparison, pagination and issue reconciliation."""

import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).parent / "fixtures"
SPEC = importlib.util.spec_from_file_location(
    "sources_check", ROOT / ".github/scripts/sources_check.py"
)
CHECK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECK)


class FakeAPI:
    def __init__(self, issues=(), tags=None):
        self.issues = list(issues)
        self.tags = tags or json.loads((FIXTURES / "tags.json").read_text())
        self.writes = []

    def pages(self, path):
        if "/tags?" in path:
            return self.tags[path.removeprefix("/repos/").split("/tags?")[0]]
        return self.issues

    def request(self, method, path, payload):
        self.writes.append((method, path, payload))


def issue(state="open", number=7, **extra):
    return {"number": number, "title": "Source updates", "state": state, **extra}


class SourceCheckTests(unittest.TestCase):
    def test_registry_and_numeric_order(self):
        entries = CHECK.sources((FIXTURES / "sources.md").read_text())
        self.assertEqual(
            CHECK.updates_for(FakeAPI(), entries),
            [("github-tags/example", "v1.9.0", "v1.10.0")],
        )

    def test_real_registry_parses(self):
        self.assertGreater(
            len(CHECK.sources((ROOT / "core/references/sources.md").read_text())), 0
        )

    def test_bad_markers_and_versions_fail(self):
        for text in (
            "no entries",
            "<!-- source: github-tags owner -->\nSource v1.0.0",
            "<!-- source: github-tags owner/repo -->",
            "<!-- source: github-tags owner/repo -->\n\nSource v1.0.0",
            "<!-- source: github-tags owner/repo -->\nSource main",
            "<!-- source: github-tags owner/repo -->\nSource v1.0.0\n" * 2,
        ):
            with self.subTest(text=text), self.assertRaises(ValueError):
                CHECK.sources(text)

    def test_major_updates_but_no_downgrade_or_prerelease(self):
        api = FakeAPI(
            tags={"owner/repo": [{"name": "v2.0.0"}, {"name": "v3.0.0-beta"}]}
        )
        self.assertEqual(
            CHECK.updates_for(api, [("owner/repo", "v1.0.0")]),
            [("owner/repo", "v1.0.0", "v2.0.0")],
        )
        self.assertEqual(CHECK.updates_for(api, [("owner/repo", "v9.0.0")]), [])

    def test_missing_stable_tags_fails_before_issue_writes(self):
        api = FakeAPI(tags={"owner/repo": [{"name": "v2.0.0-rc.1"}]})
        with self.assertRaises(ValueError):
            CHECK.updates_for(api, [("owner/repo", "v1.0.0")])
        self.assertEqual(api.writes, [])

    def test_api_failure_does_not_become_empty_result(self):
        class Unavailable(FakeAPI):
            def pages(self, path):
                raise OSError("API unavailable")

        api = Unavailable()
        with self.assertRaises(OSError):
            CHECK.updates_for(api, [("owner/repo", "v1.0.0")])
        self.assertEqual(api.writes, [])

    def test_pagination_does_not_miss_later_tags(self):
        class Paginated(CHECK.GitHub):
            def __init__(self):
                self.paths = []

            def request(self, method, path, payload=None):
                self.paths.append(path)
                return (
                    [{"name": "v1.0.0"}] * 100
                    if path.endswith("&page=1")
                    else [{"name": "v2.0.0"}]
                )

        api = Paginated()
        self.assertEqual(
            CHECK.updates_for(api, [("owner/repo", "v1.0.0")]),
            [("owner/repo", "v1.0.0", "v2.0.0")],
        )
        self.assertEqual(len(api.paths), 2)

    def test_create_update_and_reopen_one_issue(self):
        updates = [("owner/repo", "v1.0.0", "v2.0.0")]
        for existing, method, path in (
            ([], "POST", "/repos/owner/blueprints/issues"),
            ([issue()], "PATCH", "/repos/owner/blueprints/issues/7"),
            ([issue("closed")], "PATCH", "/repos/owner/blueprints/issues/7"),
        ):
            api = FakeAPI(existing)
            CHECK.sync_issue(api, "owner/blueprints", updates)
            self.assertEqual(len(api.writes), 1)
            self.assertEqual(api.writes[0][:2], (method, path))
            self.assertIn("`v1.0.0` → `v2.0.0`", api.writes[0][2]["body"])

    def test_close_when_current_and_do_not_create_empty_issue(self):
        for existing, expected in (([], 0), ([issue()], 1), ([issue("closed")], 0)):
            api = FakeAPI(existing)
            CHECK.sync_issue(api, "owner/blueprints", [])
            self.assertEqual(len(api.writes), expected)
            if expected:
                self.assertEqual(api.writes[0][2], {"state": "closed"})

    def test_ignore_pull_requests_and_unrelated_issues(self):
        api = FakeAPI([issue(pull_request={}), {**issue(number=9), "title": "Other"}])
        CHECK.sync_issue(api, "owner/blueprints", [])
        self.assertEqual(api.writes, [])

    def test_consolidate_duplicate_issues(self):
        api = FakeAPI([issue("closed"), issue(number=8), issue(number=9)])
        CHECK.sync_issue(api, "owner/blueprints", [("owner/repo", "v1.0.0", "v2.0.0")])
        self.assertEqual(api.writes[0][1], "/repos/owner/blueprints/issues/8")
        self.assertEqual(
            api.writes[1],
            ("PATCH", "/repos/owner/blueprints/issues/9", {"state": "closed"}),
        )
