"""Shared runner behavioural fixtures; Git is real, checks and transport are local."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class RunnerTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.work = self.root / 'work'
        self.work.mkdir()
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.env = {k: v for k, v in os.environ.items() if not k.startswith('GIT_')}
        self.env.update(PATH=f'{self.bin}:{os.environ["PATH"]}', CI_LOCAL_BASE_REF='origin/main',
                        GIT_CONFIG_GLOBAL='/dev/null', GIT_CONFIG_SYSTEM='/dev/null')
        (self.work / 'scripts').mkdir()
        (self.work / '.githooks').mkdir()
        source = (ROOT / 'references/ci-local.sh').read_text().split('# END REPO CONFIG\n', 1)[1]
        config = "#!/usr/bin/env bash\nset -euo pipefail\nCHECK_NAMES=(code)\nCHECK_COMMANDS=('test \"${FAIL_CODE:-}\" != 1')\nCHECK_TOOLS=('')\nDECISION4_COMMAND='python3 scripts/checker.py'\n# END REPO CONFIG\n"
        (self.work / 'scripts/ci-local').write_text(config + source)
        (self.work / 'scripts/ci-local').chmod(0o755)
        (self.work / '.githooks/pre-push').write_text((ROOT / 'references/ci-local-pre-push.sh').read_text())
        (self.work / '.githooks/pre-push').chmod(0o755)
        (self.work / 'scripts/checker.py').write_text("import pathlib, sys; sys.exit(0 if pathlib.Path(sys.argv[2]).read_text() == 'valid\\n' else 1)\n")
        (self.work / 'README.md').write_text('# Example\n')
        (self.work / 'boundary-map.yaml').write_text('version: 1\n')
        self.git('init', '-b', 'main')
        self.git('config', 'user.name', 'Test')
        self.git('config', 'user.email', 'test@example.invalid')
        self.commit()
        self.git('init', '--bare', str(self.root / 'remote.git'))
        self.git('remote', 'add', 'origin', str(self.root / 'remote.git'))
        self.git('push', '-u', 'origin', 'main')
        self.git('config', 'core.hooksPath', '.githooks')
        self.body = self.root / 'body.md'
        self.body.write_text('valid\n')

    def run_cmd(self, *args, **env):
        return subprocess.run(args, cwd=self.work, env={**self.env, **env}, text=True, capture_output=True)

    def git(self, *args):
        r = self.run_cmd('git', *args)
        self.assertEqual(r.returncode, 0, r.stderr)
        return r.stdout.strip()

    def commit(self):
        self.git('add', '.')
        self.git('commit', '-m', 'fixture')

    def edit(self, path, text):
        file = self.work / path
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(text)
        self.commit()

    def gate(self, *args, **env):
        return self.run_cmd('bash', 'scripts/ci-local', *args, **env)

    def test_docs_positive_runs_only_format_and_links(self):
        self.edit('README.md', '# Docs\n[Map](boundary-map.yaml)\n')
        r = self.gate('--check', FAIL_CODE='1')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('PASS docs-format', r.stdout)
        self.assertIn('PASS docs-links', r.stdout)
        self.assertNotIn('PASS code', r.stdout)

    def test_mixed_and_unknown_paths_run_full_gate(self):
        for path in ['docs/tool.py', 'changes/policy.json', 'src/code.ts', 'unrecognised.config']:
            with self.subTest(path=path):
                self.edit(path, 'code\n')
                r = self.gate('--check', FAIL_CODE='1')
                self.assertEqual(r.returncode, 1)
                self.assertIn('FAIL code', r.stderr)

    def test_empty_diff_runs_full_gate(self):
        self.assertEqual(self.gate('--check', FAIL_CODE='1').returncode, 1)

    def test_bad_format_and_links_fail_docs_gate(self):
        self.edit('README.md', '# Missing newline')
        self.assertIn('FAIL docs-format', self.gate('--check').stderr)
        self.edit('README.md', '# Docs\n[Broken](missing-file.md)\n')
        self.assertIn('FAIL docs-links', self.gate('--check').stderr)

    def test_deleted_link_target_is_not_hidden_by_baseline(self):
        self.git('config', 'core.hooksPath', '/dev/null')
        self.edit('target.md', '# Target\n')
        self.edit('README.md', '# Docs\n[Target](target.md)\n')
        self.git('push', 'origin', 'main')
        self.git('rm', 'target.md')
        self.edit('README.md', '# Updated\n[Target](target.md)\n')
        self.assertIn('FAIL docs-links', self.gate('--check').stderr)

    def test_dirty_worktree_fails(self):
        (self.work / 'untracked').write_text('dirty')
        self.assertEqual(self.gate('--check').returncode, 1)

    def test_proposed_body_is_required_and_invalid_body_refused(self):
        self.assertEqual(self.gate('--proposed-body').returncode, 1)
        self.body.write_text('invalid\n')
        self.assertEqual(self.gate('--proposed-body', CI_LOCAL_PR_BODY=str(self.body)).returncode, 1)
        self.body.write_text('valid\n')
        self.assertEqual(self.gate('--proposed-body', CI_LOCAL_PR_BODY=str(self.body)).returncode, 0)

    def test_body_requirement_cannot_be_bypassed_by_check_receipt(self):
        self.git('checkout', '-b', 'first-push')
        self.assertEqual(self.gate('--check').returncode, 0)
        self.assertNotEqual(self.run_cmd('git', 'push', 'origin', 'first-push').returncode, 0)
        self.assertEqual(self.run_cmd('git', 'push', 'origin', 'first-push', CI_LOCAL_PR_BODY=str(self.body)).returncode, 0)

    def test_existing_branch_push_does_not_require_proposed_body(self):
        self.edit('README.md', '# Updated\n')
        self.assertEqual(self.run_cmd('git', 'push', 'origin', 'main').returncode, 0)

    def test_legacy_body_environment_still_works(self):
        self.assertEqual(self.gate('--proposed-body', CI_LOCAL_BODY_FILE=str(self.body)).returncode, 0)

    def test_ordinary_check_with_body_validates_it(self):
        self.body.write_text('invalid\n')
        self.assertEqual(self.gate('--check', CI_LOCAL_PR_BODY=str(self.body)).returncode, 1)

    def enable_evidence(self, fail_review=False, fail_fitness=False):
        script = self.work / 'scripts/ci-local'
        source = script.read_text().replace('# END REPO CONFIG\n',
            "AI_REVIEW_COMMAND='python3 scripts/reviewer.py'\n"
            "FITNESS_COMMAND='python3 scripts/report.py'\n# END REPO CONFIG\n", 1)
        script.write_text(source)
        self.edit('scripts/reviewer.py', 'import sys\n' + f'sys.exit({int(fail_review)})\n')
        self.edit('scripts/report.py', 'import json, pathlib, sys\n'
                  'folder = pathlib.Path(sys.argv[sys.argv.index("--evidence") + 1])\n'
                  'checks = json.loads((folder / "checks.json").read_text())\n'
                  'decision = json.loads((folder / "decision4-result.json").read_text())\n'
                  'assert checks["head"] == decision["head"] and decision["pass"]\n'
                  f'sys.exit({int(fail_fitness)})\n')

    def test_complete_evidence_reuses_actual_check_manifest_and_decision(self):
        self.enable_evidence()
        result = self.gate('--check', CI_LOCAL_PR_BODY=str(self.body))
        self.assertEqual(result.returncode, 0, result.stderr)
        import json
        folder = self.work / '.git/ci-local' / self.git('rev-parse', 'HEAD')
        checks = json.loads((folder / 'checks.json').read_text())
        self.assertEqual(checks['checks']['code']['kind'], 'actual-check')
        self.assertEqual(checks['checks']['code']['exit_code'], 0)

    def test_review_failure_never_writes_success_marker(self):
        self.enable_evidence(fail_review=True)
        result = self.gate('--check', CI_LOCAL_PR_BODY=str(self.body))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('FAIL AI review', result.stderr)
        self.assertFalse((self.work / '.git/ci-local' / (self.git('rev-parse', 'HEAD') + '.ok')).exists())

    def test_incomplete_fitness_never_writes_success_marker(self):
        self.enable_evidence(fail_fitness=True)
        result = self.gate('--check', CI_LOCAL_PR_BODY=str(self.body))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('FAIL complete fitness', result.stderr)


if __name__ == '__main__':
    unittest.main()
