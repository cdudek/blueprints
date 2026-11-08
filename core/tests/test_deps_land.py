"""Auto-merge exclusions are evaluated from the proposed tree and body."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('deps_land', ROOT / 'references/deps-land.py')
deps = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deps)


class EligibilityTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'boundary-map.yaml').write_text('version: 1\nentries:\n- select:\n    paths: ["**"]\n  floor: Repair\n')
        (self.root / 'sdlc.json').write_text('{"tiers": false}')
        self.pr = {'body': '**🟡 Repair** — Restore pins.', 'labels': []}

    def reason(self, paths=None):
        return deps.owner_reason(self.pr, paths or ['package-lock.json'], self.root)

    def test_repair_dependency_update_is_eligible(self):
        self.assertEqual(self.reason(), '')

    def test_terraform_paths_and_workflows_never_arm(self):
        for path in ['terraform/main.tf', '.github/workflows/terraform.yml', '.github/workflows/heapthat-terraform.yml']:
            self.assertIn('Terraform', self.reason([path]))

    def test_tiers_and_approval_labels_never_arm(self):
        self.pr['labels'] = [{'name': 'ask'}]
        self.assertIn('approval', self.reason())
        self.pr['labels'] = []
        (self.root / 'sdlc.json').write_text('{"tiers": true}')
        self.assertIn('approval', self.reason())

    def test_high_classes_uncertain_maps_and_unmapped_paths_never_arm(self):
        for body in ['**🟠 Migrate**', '**🔴 Answer**', 'unknown']:
            self.pr['body'] = body
            self.assertTrue(self.reason())
        self.pr['body'] = '**🟡 Repair**'
        for entry in ['paths: ["src/**"]\n  floor: Repair', 'paths: ["**"]\n  floor: Migrate', 'paths: ["**"]\n    environments: [production]\n  floor: Repair']:
            (self.root / 'boundary-map.yaml').write_text('entries:\n- select:\n    ' + entry + '\n')
            self.assertTrue(self.reason())


if __name__ == '__main__':
    unittest.main()
