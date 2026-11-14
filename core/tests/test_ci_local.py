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
        source = (ROOT / 'references/ci-local.sh').read_text().split('# END REPO CONFIG\n', 1)[1]
        config = "#!/usr/bin/env bash\nset -euo pipefail\nCHECK_NAMES=(code heavy)\nCHECK_COMMANDS=('test \"${FAIL_CODE:-}\" != 1' 'echo ran >> \"${HEAVY_LOG:-/dev/null}\"')\nCHECK_TOOLS=('' '')\nLOCAL_ONLY_CHECKS=(heavy)\n# END REPO CONFIG\n"
        (self.work / 'scripts/ci-local').write_text(config + source)
        (self.work / 'scripts/ci-local').chmod(0o755)
        (self.work / 'README.md').write_text('# Example\n')
        (self.work / 'boundary-map.yaml').write_text('version: 1\n')
        self.git('init', '-b', 'main')
        self.git('config', 'user.name', 'Test')
        self.git('config', 'user.email', 'test@example.invalid')
        self.commit()
        self.git('init', '--bare', str(self.root / 'remote.git'))
        self.git('remote', 'add', 'origin', str(self.root / 'remote.git'))
        self.git('push', '-u', 'origin', 'main')

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
        r = self.gate(FAIL_CODE='1')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('PASS docs-format', r.stdout)
        self.assertIn('PASS docs-links', r.stdout)
        self.assertNotIn('PASS code', r.stdout)

    def test_explicit_full_suite_overrides_docs_scope_without_leaking_to_checks(self):
        script = self.work / 'scripts/ci-local'
        lines = script.read_text().splitlines()
        lines = [
            'CHECK_COMMANDS=(\'test "${FAIL_CODE:-}" != 1 && test "${CI_LOCAL_FULL_SUITE-unset}" = unset\' true)'
            if line.startswith('CHECK_COMMANDS=') else line for line in lines
        ]
        script.write_text('\n'.join(lines) + '\n')
        self.commit()
        self.git('update-ref', 'refs/remotes/origin/main', 'HEAD')
        self.edit('README.md', '# Docs-only audit comparison\n')
        failed = self.gate(CI_LOCAL_FULL_SUITE='1', FAIL_CODE='1')
        self.assertEqual(failed.returncode, 1, failed.stdout + failed.stderr)
        self.assertIn('FAIL code', failed.stderr)
        passed = self.gate(CI_LOCAL_FULL_SUITE='1')
        self.assertEqual(passed.returncode, 0, passed.stdout + passed.stderr)
        self.assertIn('PASS code', passed.stdout)
        import json
        evidence = self.work / '.git/ci-local' / self.git('rev-parse', 'HEAD') / 'checks.json'
        self.assertEqual(json.loads(evidence.read_text())['selection'], 'full')
        self.assertEqual(self.gate(CI_LOCAL_FULL_SUITE='invalid').returncode, 2)

    def test_mixed_and_unknown_paths_run_full_gate(self):
        for path in ['docs/tool.py', 'changes/policy.json', 'src/code.ts', 'unrecognised.config']:
            with self.subTest(path=path):
                self.edit(path, 'code\n')
                r = self.gate(FAIL_CODE='1')
                self.assertEqual(r.returncode, 1)
                self.assertIn('FAIL code', r.stderr)

    def test_empty_diff_runs_full_gate(self):
        self.assertEqual(self.gate(FAIL_CODE='1').returncode, 1)

    def test_bad_format_and_links_fail_docs_gate(self):
        self.edit('README.md', '# Missing newline')
        self.assertIn('FAIL docs-format', self.gate().stderr)
        self.edit('README.md', '# Docs\n[Broken](missing-file.md)\n')
        self.assertIn('FAIL docs-links', self.gate().stderr)

    def test_deleted_link_target_is_not_hidden_by_baseline(self):
        self.edit('target.md', '# Target\n')
        self.edit('README.md', '# Docs\n[Target](target.md)\n')
        self.git('push', 'origin', 'main')
        self.git('rm', 'target.md')
        self.edit('README.md', '# Updated\n[Target](target.md)\n')
        self.assertIn('FAIL docs-links', self.gate().stderr)

    def test_dirty_worktree_fails(self):
        (self.work / 'untracked').write_text('dirty')
        self.assertEqual(self.gate().returncode, 1)

    def test_plain_run_runs_every_check_including_local_only(self):
        log = self.root / 'heavy.log'
        r = self.gate(HEAVY_LOG=str(log))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('PASS code', r.stdout)
        self.assertIn('PASS heavy', r.stdout)
        self.assertEqual(log.read_text(), 'ran\n')

    def test_ci_skips_local_only_checks(self):
        log = self.root / 'heavy.log'
        r = self.gate('--ci', HEAVY_LOG=str(log))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('PASS code', r.stdout)
        self.assertIn('SKIP heavy (local only)', r.stdout)
        self.assertNotIn('PASS heavy', r.stdout)
        self.assertFalse(log.exists())

    def test_ci_needs_no_clean_worktree_and_no_branch(self):
        (self.work / 'untracked').write_text('from an Actions setup step')
        self.git('checkout', '--detach')
        self.assertEqual(self.gate('--ci').returncode, 0)

    def test_failing_check_fails_both_modes(self):
        for args in ([], ['--ci']):
            with self.subTest(args=args):
                r = self.gate(*args, FAIL_CODE='1')
                self.assertEqual(r.returncode, 1)
                self.assertIn('FAIL code', r.stderr)

    def test_missing_tool_warns_locally_and_fails_in_ci(self):
        script = self.work / 'scripts/ci-local'
        script.write_text(script.read_text().replace("CHECK_TOOLS=('' '')", "CHECK_TOOLS=('no-such-tool-xyz' '')"))
        self.commit()
        self.assertEqual(self.gate().returncode, 0)
        r = self.gate('--ci')
        self.assertEqual(r.returncode, 1)
        self.assertIn('FAIL code: no-such-tool-xyz is not installed', r.stderr)

    def test_removed_and_unknown_flags_are_refused(self):
        for flag in ('--check', '--no-push', '--decision4', '--proposed-body', '--bogus'):
            with self.subTest(flag=flag):
                self.assertEqual(self.gate(flag).returncode, 2)
        self.assertEqual(self.gate('--help').returncode, 0)

    def test_no_mode_calls_gh_or_pushes(self):
        marker = self.root / 'gh-called'
        gh = self.bin / 'gh'
        gh.write_text(f'#!/bin/sh\ntouch {marker}\nexit 99\n')
        gh.chmod(0o755)
        hook = self.root / 'remote.git/hooks/pre-receive'
        hook.write_text('#!/bin/sh\nexit 1\n')
        hook.chmod(0o755)
        self.git('checkout', '-b', 'feature')
        self.edit('src/code.ts', 'code\n')
        for args in ([], ['--ci']):
            with self.subTest(args=args):
                self.assertEqual(self.gate(*args).returncode, 0)
        self.assertFalse(marker.exists())
        self.assertEqual(self.git('ls-remote', 'origin', 'refs/heads/feature'), '')

    def test_script_has_no_publication_code(self):
        source = (ROOT / 'references/ci-local.sh').read_text()
        for needle in ('gh ', 'git push', '/statuses', 'AI_REVIEW', 'CI_LOCAL_PR'):
            self.assertNotIn(needle, source)


if __name__ == '__main__':
    unittest.main()
