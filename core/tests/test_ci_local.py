"""Shared runner behavioural fixtures; Git is real, checks and transport are local."""
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile
import time
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
        self.env.pop('GITHUB_ACTIONS', None)
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

    def configure(self, checks, extra=''):
        """Replace the repo config block with `checks` ({name: command}) plus extra bash lines, and commit."""
        script = self.work / 'scripts/ci-local'
        body = script.read_text().split('# END REPO CONFIG\n', 1)[1]
        names = ' '.join(checks)
        commands = ' '.join(shlex.quote(c) for c in checks.values())
        script.write_text(f"#!/usr/bin/env bash\nset -euo pipefail\nCHECK_NAMES=({names})\nCHECK_COMMANDS=({commands})\n"
                          f"CHECK_TOOLS=({' '.join([chr(39)*2] * len(checks))})\n{extra}\n# END REPO CONFIG\n{body}")
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

    def test_failing_check_prints_the_last_80_log_lines(self):
        self.configure({'code': 'for i in $(seq 100); do echo "line$i"; done; exit 1'})
        r = self.gate()
        self.assertEqual(r.returncode, 1)
        self.assertIn('line100\n', r.stdout)
        self.assertIn('line21\n', r.stdout)
        self.assertNotIn('line20\n', r.stdout)
        self.assertNotIn('::group::', r.stdout)
        r = self.gate('--ci', GITHUB_ACTIONS='true')
        self.assertIn('::group::code log (last 80 lines)\nline21\n', r.stdout)
        self.assertRegex(r.stdout, r'line100\n::endgroup::')

    def test_checks_run_cheapest_first_and_serial_checks_keep_their_slot(self):
        log = self.root / 'order.log'
        self.configure({n: f'echo {n} >> "$ORDER_LOG"' for n in 'abc'})
        durations = self.work / '.git/ci-local/durations.json'
        durations.parent.mkdir(exist_ok=True)
        durations.write_text(json.dumps({'a': 9, 'b': 5, 'c': 3}))
        self.assertEqual(self.gate(ORDER_LOG=str(log)).returncode, 0)
        self.assertEqual(log.read_text().split(), ['c', 'b', 'a'])
        self.assertEqual(sorted(json.loads(durations.read_text())), ['a', 'b', 'c', 'docs-format', 'docs-links'])
        log.unlink()
        durations.write_text(json.dumps({'a': 9, 'b': 5, 'c': 3}))
        self.configure({n: f'echo {n} >> "$ORDER_LOG"' for n in 'abc'}, 'CHECK_SERIAL=(a)')
        self.assertEqual(self.gate(ORDER_LOG=str(log)).returncode, 0)
        self.assertEqual(log.read_text().split(), ['a', 'c', 'b'])
        log.unlink()
        durations.unlink()
        self.assertEqual(self.gate(ORDER_LOG=str(log)).returncode, 0)
        self.assertEqual(log.read_text().split(), ['a', 'b', 'c'])

    def test_first_failure_stops_the_run_unless_keep_going(self):
        log = self.root / 'ran.log'
        self.configure({'first': 'exit 1', 'second': 'echo second >> "$RAN_LOG"'})
        r = self.gate(RAN_LOG=str(log))
        self.assertEqual(r.returncode, 1)
        self.assertIn('STOP at the first failure', r.stderr)
        self.assertFalse(log.exists())
        r = self.gate('--keep-going', RAN_LOG=str(log))
        self.assertEqual(r.returncode, 1)
        self.assertNotIn('STOP', r.stderr)
        self.assertEqual(log.read_text(), 'second\n')
        self.assertIn('Seconds per check: first=', r.stdout)

    def test_clean_start_removes_declared_paths_runner_leftovers_and_relative_env(self):
        self.configure({'code': 'test ! -e test-results && test -z "${PYTHONPATH:-}"'}, "CI_LOCAL_CLEAN_PATHS=(test-results)")
        (self.work / 'test-results').mkdir()
        (self.work / 'test-results/old.xml').write_text('stale')
        leftover = self.work / '.git/ci-local/containers/auth.json'
        leftover.parent.mkdir(parents=True)
        leftover.write_text('{}')
        r = self.gate(PYTHONPATH='relative/dir')
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertFalse(leftover.exists())
        self.configure({'code': 'true'}, "CI_LOCAL_CLEAN_PATHS=(../outside)")
        self.assertEqual(self.gate().returncode, 2)

    def heavy_gate(self, lock, **env):
        self.configure({'code': 'echo ran >> "$HEAVY_LOG"'}, 'HEAVY_CHECKS=(code)')
        return subprocess.Popen(['bash', 'scripts/ci-local'], cwd=self.work, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                env={**self.env, 'CI_LOCAL_LOCK': str(lock), 'CI_LOCAL_LOCK_POLL': '0.1', **env})

    def hold(self, lock, pid):
        lock.mkdir()
        (lock / 'pid').write_text(str(pid))

    def test_heavy_check_waits_for_a_live_holder_then_runs(self):
        lock, log = self.root / 'heavy.lock', self.root / 'heavy.log'
        holder = subprocess.Popen(['sleep', '60'])
        self.addCleanup(holder.kill)
        self.hold(lock, holder.pid)
        p = self.heavy_gate(lock, HEAVY_LOG=str(log))
        self.addCleanup(p.kill)
        time.sleep(1)
        self.assertIsNone(p.poll())
        self.assertFalse(log.exists())
        shutil.rmtree(lock)
        out, err = p.communicate(timeout=20)
        self.assertEqual(p.returncode, 0, out + err)
        self.assertIn(f'waiting for heavy lock held by pid {holder.pid}', out)
        self.assertEqual(log.read_text(), 'ran\n')
        self.assertFalse(lock.exists())

    def test_heavy_check_takes_over_a_dead_holders_lock(self):
        lock, log = self.root / 'heavy.lock', self.root / 'heavy.log'
        dead = subprocess.Popen(['true'])
        dead.wait()
        self.hold(lock, dead.pid)
        out, err = self.heavy_gate(lock, HEAVY_LOG=str(log)).communicate(timeout=20)
        self.assertNotIn('waiting', out)
        self.assertEqual(log.read_text(), 'ran\n')
        self.assertFalse(lock.exists())

    def test_heavy_lock_is_skipped_in_actions(self):
        lock, log = self.root / 'heavy.lock', self.root / 'heavy.log'
        holder = subprocess.Popen(['sleep', '60'])
        self.addCleanup(holder.kill)
        self.hold(lock, holder.pid)
        p = self.heavy_gate(lock, HEAVY_LOG=str(log), GITHUB_ACTIONS='true')
        out, err = p.communicate(timeout=20)
        self.assertEqual(p.returncode, 0, out + err)
        self.assertEqual(log.read_text(), 'ran\n')
        self.assertTrue(lock.exists())

    def cheap_config(self):
        self.configure({'a': 'echo a >> "$ORDER_LOG"; test "${FAIL_A:-}" != 1', 'big': 'echo big >> "$ORDER_LOG"', 'c': 'echo c >> "$ORDER_LOG"'},
                       'HEAVY_CHECKS=(big)')

    def test_cheap_skips_heavy_checks_keeps_order_and_ends_with_a_pass_line(self):
        log = self.root / 'order.log'
        self.cheap_config()
        durations = self.work / '.git/ci-local/durations.json'
        durations.parent.mkdir(exist_ok=True)
        durations.write_text(json.dumps({'a': 9, 'c': 3}))
        lock = self.root / 'heavy.lock'
        r = self.gate('--cheap', ORDER_LOG=str(log), CI_LOCAL_LOCK=str(lock))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(log.read_text().split(), ['c', 'a'])
        self.assertIn('SKIP big (heavy)', r.stdout)
        self.assertEqual(r.stdout.splitlines()[-1], f'CHEAP PASS {self.git("rev-parse", "HEAD")}')
        self.assertFalse(lock.exists())

    def test_cheap_writes_no_receipt(self):
        self.cheap_config()
        self.assertEqual(self.gate('--cheap', ORDER_LOG='/dev/null').returncode, 0)
        self.assertFalse((self.work / '.git/ci-local' / self.git('rev-parse', 'HEAD') / 'checks.json').exists())
        self.assertEqual(self.gate(ORDER_LOG='/dev/null').returncode, 0)
        self.assertTrue((self.work / '.git/ci-local' / self.git('rev-parse', 'HEAD') / 'checks.json').exists())

    def test_cheap_failure_stops_names_the_check_and_honours_keep_going(self):
        log = self.root / 'order.log'
        self.cheap_config()
        r = self.gate('--cheap', ORDER_LOG=str(log), FAIL_A='1')
        self.assertEqual(r.returncode, 1)
        self.assertIn('STOP at the first failure', r.stderr)
        self.assertEqual(r.stdout.splitlines()[-1], 'CHEAP FAIL check=a')
        self.assertEqual(log.read_text().split(), ['a'])
        log.unlink()
        r = self.gate('--cheap', '--keep-going', ORDER_LOG=str(log), FAIL_A='1')
        self.assertEqual(r.returncode, 1)
        self.assertEqual(log.read_text().split(), ['a', 'c'])
        self.assertEqual(r.stdout.splitlines()[-1], 'CHEAP FAIL check=a')

    def test_cheap_with_ci_is_an_error(self):
        r = self.gate('--cheap', '--ci')
        self.assertEqual(r.returncode, 2)
        self.assertIn('cannot be combined', r.stderr)

    def test_script_has_no_publication_code(self):
        source = (ROOT / 'references/ci-local.sh').read_text()
        for needle in ('gh ', 'git push', '/statuses', 'AI_REVIEW', 'CI_LOCAL_PR'):
            self.assertNotIn(needle, source)


if __name__ == '__main__':
    unittest.main()
