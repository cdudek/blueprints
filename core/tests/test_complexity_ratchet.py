"""Real-source regression fixtures: aggregate metrics cannot hide a changed hotspot."""

import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "references/complexity-ratchet.py"
spec = importlib.util.spec_from_file_location("complexity", SCRIPT)
complexity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(complexity)


class ComplexityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "src").mkdir()
        (self.root / ".fitness").mkdir()
        (self.root / complexity.POLICY).write_text(
            json.dumps({"paths": ["src"], "exclude": []})
        )

    def source(self, branches=12, suffix=""):
        text = "function hotspot(x) {\n"
        text += "".join(f"  if (x === {i}) return {i};\n" for i in range(branches))
        (self.root / "src/main.ts").write_text(text + f"  return 0; {suffix}\n}}\n")

    def gate(self, *args):
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--root", str(self.root), *args],
            capture_output=True,
            text=True,
        )

    def record(self):
        result = self.gate("--record")
        self.assertEqual(result.returncode, 0, result.stderr)

    def anonymous_source(self, branches):
        functions = []
        for count in branches:
            body = "".join(f"if (x === {i}) return {i};\n" for i in range(count))
            functions.append("consume((x) => {\n" + body + "return 0;\n});\n")
        (self.root / "src/main.ts").write_text("\n".join(functions))

    def test_simple_callback_never_renumbers_anonymous_hotspot(self):
        self.anonymous_source([12])
        self.record()
        self.anonymous_source([1, 12])
        result = self.gate()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_deleting_anonymous_sibling_shrinks_without_renumbering_survivor(self):
        self.anonymous_source([12, 14])
        self.record()
        self.anonymous_source([14])
        self.record()
        self.assertEqual(self.gate().returncode, 0)

    def test_anonymous_survivor_can_get_simpler_after_sibling_deletion(self):
        self.anonymous_source([12, 14])
        self.record()
        self.anonymous_source([14])
        self.record()
        self.anonymous_source([11])
        self.record()
        self.assertEqual(self.gate().returncode, 0)

    def test_new_complex_callback_cannot_steal_an_unchanged_allowance(self):
        self.anonymous_source([12])
        self.record()
        self.anonymous_source([14, 12])
        self.assertIn("new complex function", self.gate().stderr)

    def test_anonymous_deletion_stays_bound_to_actual_merge_base(self):
        import shutil
        self.anonymous_source([12, 14])
        self.record()
        base = self.root / "base"
        shutil.copytree(self.root / "src", base / "src")
        shutil.copytree(self.root / ".fitness", base / ".fitness")
        self.anonymous_source([14])
        result = self.gate("--record", "--base", str(base))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.gate("--base", str(base)).returncode, 0)

    def test_unchanged_exact_hotspot_passes(self):
        self.source()
        self.record()
        self.assertEqual(self.gate().returncode, 0)

    def test_changed_same_complexity_fails(self):
        self.source()
        self.record()
        self.source(suffix="// changed without reducing complexity")
        result = self.gate()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must get simpler", result.stderr)

    def test_new_hotspot_cannot_replace_deleted_one_at_same_count(self):
        self.source()
        self.record()
        path = self.root / "src/main.ts"
        path.write_text(path.read_text().replace("hotspot", "replacement"))
        self.assertIn("new complex function", self.gate().stderr)

    def test_changed_hotspot_can_shrink_while_still_complex(self):
        self.source(14)
        self.record()
        self.source(11)
        self.record()
        self.assertEqual(self.gate().returncode, 0)

    def test_empty_baseline_cannot_grow_in_record_mode(self):
        self.source(1)
        self.record()
        self.source(12)
        self.assertIn("new complex function", self.gate("--record").stderr)

    def test_baseline_removal_requires_reducing_source(self):
        self.source()
        self.record()
        (self.root / complexity.BASELINE).write_text('{"version": 1, "functions": {}}')
        self.assertIn("new complex function", self.gate().stderr)

    def test_fixture_paths_and_quoted_csv_remain_exact(self):
        self.source()
        source = self.root / "src/main.ts"
        source.rename(self.root / "src/with,comma.ts")
        self.record()
        rows = complexity.read_baseline(self.root / complexity.BASELINE)
        self.assertEqual(next(iter(rows.values()))["file"], "src/with,comma.ts")

    def test_forged_changed_baseline_fails_against_merge_base(self):
        self.source()
        self.record()
        base = self.root / "base"
        import shutil

        shutil.copytree(self.root / "src", base / "src")
        shutil.copytree(self.root / ".fitness", base / ".fitness")
        self.source(suffix="// same metric but changed")
        rows = complexity.collect(self.root, {"paths": ["src"]})
        (self.root / complexity.BASELINE).write_text(
            json.dumps({"version": 1, "functions": rows})
        )
        result = self.gate("--base", str(base))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("baseline may only shrink", result.stderr)


if __name__ == "__main__":
    unittest.main()
