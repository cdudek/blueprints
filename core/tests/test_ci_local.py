"""Shared runner behavioural fixtures; Git is real, checks and transport are local."""
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
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
        for flag in ('--no-push', '--decision4', '--proposed-body', '--bogus'):
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

    def staged(self, **checks):
        """Configure checks as {name: (stage, command)}; every command appends its name to $RAN_LOG."""
        self.configure({n: f'echo {n} >> "$RAN_LOG"; {c}' for n, (_, c) in checks.items()},
                       f"CHECK_STAGES=({' '.join(st for st, _ in checks.values())})")

    def test_stage_runs_only_its_checks_and_combines_with_ci_and_keep_going(self):
        log = self.root / 'ran.log'
        self.staged(lint=('static', 'exit 1'), format=('static', 'true'), unit=('unit', 'true'), smoke=('e2e-smoke', 'true'))
        r = self.gate('--ci', '--keep-going', '--stage', 'static', RAN_LOG=str(log))
        self.assertEqual(r.returncode, 1)
        self.assertEqual(sorted(log.read_text().split()), ['format', 'lint'])
        self.assertIn('PASS docs-format', r.stdout)
        log.unlink()
        r = self.gate('--ci', '--stage', 'unit', RAN_LOG=str(log))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(log.read_text(), 'unit\n')
        self.assertNotIn('docs-format', r.stdout)

    def test_stage_without_checks_says_so_and_passes(self):
        self.staged(unit=('unit', 'true'))
        r = self.gate('--ci', '--stage', 'build')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('no checks in stage build', r.stdout)

    def test_config_without_stages_is_all_static(self):
        log = self.root / 'ran.log'
        self.configure({'a': 'echo a >> "$RAN_LOG"', 'b': 'echo b >> "$RAN_LOG"'})
        self.assertIn('no checks in stage unit', self.gate('--stage', 'unit', RAN_LOG=str(log)).stdout)
        self.assertFalse(log.exists())
        self.assertEqual(self.gate('--stage', 'static', RAN_LOG=str(log)).returncode, 0)
        self.assertEqual(sorted(log.read_text().split()), ['a', 'b'])

    def test_docs_only_diff_runs_its_checks_in_static_only(self):
        self.staged(unit=('unit', 'true'))
        self.git('push', 'origin', 'main')
        self.edit('README.md', '# Docs\n')
        self.assertIn('no checks in stage unit', self.gate('--stage', 'unit').stdout)
        self.assertIn('PASS docs-format', self.gate('--stage', 'static').stdout)

    def test_bad_stage_names_and_counts_are_refused(self):
        self.staged(unit=('unit', 'true'))
        self.assertEqual(self.gate('--stage', 'bogus').returncode, 2)
        self.assertEqual(self.gate('--stage').returncode, 2)
        self.configure({'a': 'true', 'b': 'true'}, "CHECK_STAGES=(unit)")
        self.assertEqual(self.gate().returncode, 2)
        self.configure({'a': 'true'}, "CHECK_STAGES=(bogus)")
        self.assertEqual(self.gate().returncode, 2)

    def test_stage_run_leaves_the_full_receipt_alone(self):
        self.staged(unit=('unit', 'true'))
        self.assertEqual(self.gate(RAN_LOG='/dev/null').returncode, 0)
        sha = self.git('rev-parse', 'HEAD')
        receipt = self.work / '.git/ci-local' / sha / 'checks.json'
        before = receipt.read_text()
        self.assertEqual(self.gate('--stage', 'static', RAN_LOG='/dev/null').returncode, 0)
        self.assertEqual(receipt.read_text(), before)

    def test_check_runs_only_that_check_with_stage_setup_and_no_receipt(self):
        log = self.root / 'ran.log'
        self.staged(lint=('static', 'true'), unit=('unit', 'true'), smoke=('e2e-smoke', 'true'))
        r = self.gate('--ci', '--check', 'unit', RAN_LOG=str(log))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(log.read_text(), 'unit\n')
        self.assertIn('PASS unit', r.stdout)
        self.assertNotIn('docs-format', r.stdout)
        sha = self.git('rev-parse', 'HEAD')
        self.assertFalse((self.work / '.git/ci-local' / sha / 'checks.json').exists())
        self.assertTrue((self.work / '.git/ci-local/check' / sha / 'unit.log').exists())
        log.unlink()
        r = self.gate('--check', 'lint', '--check', 'smoke', RAN_LOG=str(log))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(sorted(log.read_text().split()), ['lint', 'smoke'])
        self.assertEqual(self.gate('--check', 'docs-links').returncode, 0)

    def test_check_failure_fails_and_unknown_name_fails(self):
        self.staged(lint=('static', 'exit 1'), unit=('unit', 'true'))
        r = self.gate('--ci', '--check', 'lint', RAN_LOG='/dev/null')
        self.assertEqual(r.returncode, 1)
        self.assertIn('FAIL lint', r.stderr)
        r = self.gate('--ci', '--check', 'lnt', RAN_LOG='/dev/null')
        self.assertEqual(r.returncode, 2)
        self.assertIn("Unknown check 'lnt'", r.stderr)
        self.assertEqual(self.gate('--check', 'unit', '--check', 'lnt', RAN_LOG='/dev/null').returncode, 2)
        self.assertEqual(self.gate('--check').returncode, 2)
        self.assertEqual(self.gate('--check', 'unit', '--stage', 'unit').returncode, 2)

    def test_check_names_match_exactly_never_as_globs_or_substrings(self):
        self.staged(lint=('static', 'true'), format=('static', 'true'))
        for bad in ('*', '?', 'l*', 'lint format', 'format lint', ' lint', 'lint ', ''):
            with self.subTest(name=bad):
                r = self.gate('--check', bad, RAN_LOG='/dev/null')
                self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
                self.assertIn('Unknown check', r.stderr)
        r = self.gate('--stage', '*')
        self.assertEqual(r.returncode, 2)
        self.assertIn('Unknown stage', r.stderr)

    def test_check_selection_that_runs_nothing_fails_unless_docs_only(self):
        self.staged(lint=('static', 'true'))
        r = self.gate('--check', 'lint', RAN_LOG='/dev/null')
        self.assertEqual(r.returncode, 0, r.stderr)
        # A selected check that is skipped (here: its tool is missing locally) leaves nothing executed.
        script = self.work / 'scripts/ci-local'
        script.write_text(script.read_text().replace("CHECK_TOOLS=('')", "CHECK_TOOLS=('no-such-tool-xyz')"))
        self.commit()
        r = self.gate('--check', 'lint', RAN_LOG='/dev/null')
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn('ran no checks', r.stderr)
        # Docs-only: every selected check is skipped for that reason and the run still passes.
        self.git('push', 'origin', 'main')
        self.edit('README.md', '# Docs\n')
        r = self.gate('--check', 'lint')
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn('SKIP lint (not selected for a docs-only change)', r.stdout)

    def test_ci_refuses_a_local_only_check_but_a_local_run_allows_it(self):
        log = self.root / 'heavy.log'
        r = self.gate('--ci', '--check', 'heavy', HEAVY_LOG=str(log))
        self.assertEqual(r.returncode, 2)
        self.assertIn('local only', r.stderr)
        self.assertFalse(log.exists())
        self.assertEqual(self.gate('--check', 'heavy', HEAVY_LOG=str(log)).returncode, 0)
        self.assertEqual(log.read_text(), 'ran\n')

    def test_check_in_a_docs_only_diff_is_skipped_not_a_typo(self):
        self.staged(unit=('unit', 'true'))
        self.git('push', 'origin', 'main')
        self.edit('README.md', '# Docs\n')
        r = self.gate('--ci', '--check', 'unit', RAN_LOG='/dev/null')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('SKIP unit (not selected for a docs-only change)', r.stdout)
        self.assertEqual(self.gate('--ci', '--check', 'docs-format').returncode, 0)

    def test_script_has_no_publication_code(self):
        source = (ROOT / 'references/ci-local.sh').read_text()
        for needle in ('gh ', 'git push', '/statuses', 'AI_REVIEW', 'CI_LOCAL_PR'):
            self.assertNotIn(needle, source)


DRIFT = ROOT / 'references/ci-workflow-drift.py'
CONFIG = """#!/usr/bin/env bash
set -euo pipefail
CHECK_NAMES=(format lint unit build e2e-smoke gates heavy)
CHECK_COMMANDS=(true true true true true true true)
CHECK_STAGES=(static static unit build e2e-smoke extras extras)
LOCAL_ONLY_CHECKS=(heavy)
# END REPO CONFIG
"""
# The job and check ids a matching workflow holds; docs-format and docs-links are runner built-ins.
MATCHING = {'static': ['format', 'lint', 'docs-format', 'docs-links'], 'unit': ['unit'],
            'build': ['build', 'e2e-smoke'], 'extras': ['gates']}


def workflow(jobs, needs=None):
    lines = ['name: CI', 'on: pull_request', 'jobs:']
    for job, checks in jobs.items():
        lines += [f'  {job}:', '    if: github.event.pull_request.draft == false', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v7']
        for check in checks:
            lines += [f'      - name: Step {check}', '        if: ${{ !cancelled() }}', f'        run: bash scripts/ci-local --ci --check {check}']
    needs = list(jobs) if needs is None else needs
    return '\n'.join(lines + ['  ci:', f'    needs: [{", ".join(needs)}]', '    if: always()', '    runs-on: ubuntu-latest', '    steps:',
                              '      - env:', '          NEEDS: ${{ toJSON(needs) }}', '        run: python3 -c "import os; os.environ[\'NEEDS\']"']) + '\n'


class DriftGuardTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'scripts').mkdir()
        (self.root / 'scripts/ci-local').write_text(CONFIG)

    def drift(self, text):
        path = self.root / 'ci.yml'
        path.write_text(text)
        return subprocess.run([sys.executable, str(DRIFT), '--root', str(self.root), '--workflow', str(path)], text=True, capture_output=True)

    def changed(self, edit):
        jobs = {job: list(checks) for job, checks in MATCHING.items()}
        edit(jobs)
        return self.drift(workflow(jobs))

    def test_matching_pair_passes(self):
        r = self.drift(workflow(MATCHING))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('PASS', r.stdout)

    def test_missing_step_fails(self):
        r = self.changed(lambda jobs: jobs['unit'].remove('unit'))
        self.assertEqual(r.returncode, 1)
        self.assertIn('check unit has no step', r.stderr)

    def test_extra_step_fails_whether_unknown_or_local_only(self):
        for extra in ('typo', 'heavy'):
            with self.subTest(extra=extra):
                r = self.changed(lambda jobs: jobs['extras'].append(extra))
                self.assertEqual(r.returncode, 1)
                self.assertIn(f'step for {extra} matches no CI check', r.stderr)

    def test_step_in_the_wrong_job_fails(self):
        def move(jobs):
            jobs['unit'].remove('unit')
            jobs['static'].append('unit')
        r = self.changed(move)
        self.assertEqual(r.returncode, 1)
        self.assertIn('check unit runs in job static, but its stage puts it in unit', r.stderr)

    def test_duplicate_step_and_bulk_step_fail(self):
        r = self.changed(lambda jobs: jobs['static'].append('lint'))
        self.assertIn('check lint has more than one step', r.stderr)
        bulk = workflow(MATCHING).replace('--check format', '--stage static')
        r = self.drift(bulk)
        self.assertEqual(r.returncode, 1)
        self.assertIn('without --check', r.stderr)

    def test_ci_job_must_need_every_job_with_checks(self):
        r = self.drift(workflow(MATCHING, needs=['static', 'unit', 'build']))
        self.assertEqual(r.returncode, 1)
        self.assertIn('job ci does not need extras', r.stderr)

    def test_stages_default_to_static_and_local_only_may_be_absent(self):
        (self.root / 'scripts/ci-local').write_text(CONFIG.replace('CHECK_STAGES=(static static unit build e2e-smoke extras extras)\n', ''))
        r = self.drift(workflow({'static': ['format', 'lint', 'unit', 'build', 'e2e-smoke', 'gates', 'docs-format', 'docs-links']}))
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_neutralised_check_steps_fail(self):
        base = workflow(MATCHING)
        step = '        run: bash scripts/ci-local --ci --check lint\n'
        cases = {
            'step continue-on-error': (step, step + '        continue-on-error: true\n', 'sets continue-on-error'),
            'step continue-on-error expression': (step, step + "        continue-on-error: ${{ github.event_name == 'pull_request' }}\n", 'sets continue-on-error'),
            'wrong if': ('if: ${{ !cancelled() }}\n        run: bash scripts/ci-local --ci --check lint', 'if: ${{ always() }}\n        run: bash scripts/ci-local --ci --check lint', 'an if other than'),
            'if false': ('if: ${{ !cancelled() }}\n        run: bash scripts/ci-local --ci --check lint', 'if: false\n        run: bash scripts/ci-local --ci --check lint', 'an if other than'),
            'or true': ('--check lint\n', '--check lint || true\n', 'must run exactly'),
            'or colon': ('--check lint\n', '--check lint || :;\n', 'must run exactly'),
            'semicolon true': ('--check lint\n', '--check lint; true\n', 'must run exactly'),
            'set +e': ('run: bash scripts/ci-local --ci --check lint\n', 'run: set +e; bash scripts/ci-local --ci --check lint\n', 'must run exactly'),
            'background': ('--check lint\n', '--check lint &\n', 'must run exactly'),
            'extra command': ('--check lint\n', '--check lint && echo done\n', 'must run exactly'),
            'multiline': ('run: bash scripts/ci-local --ci --check lint\n', 'run: |\n          bash scripts/ci-local --ci --check lint\n          echo done\n', 'must run exactly'),
        }
        for label, (old, new, message) in cases.items():
            with self.subTest(label):
                self.assertIn(old, base)
                r = self.drift(base.replace(old, new, 1))
                self.assertEqual(r.returncode, 1, r.stdout)
                self.assertIn(message, r.stderr)

    def test_job_level_continue_on_error_fails_but_false_is_fine(self):
        base = workflow(MATCHING)
        marker = '  unit:\n    if: github.event.pull_request.draft == false\n'
        self.assertIn(marker, base)
        r = self.drift(base.replace(marker, marker + '    continue-on-error: true\n', 1))
        self.assertEqual(r.returncode, 1)
        self.assertIn('job unit holds check steps and sets continue-on-error', r.stderr)
        r = self.drift(base.replace(marker, marker + '    continue-on-error: false\n', 1))
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_check_steps_need_ci_flag_and_jobs_need_the_draft_condition(self):
        base = workflow(MATCHING)
        r = self.drift(base.replace('scripts/ci-local --ci --check lint', 'scripts/ci-local --check lint'))
        self.assertEqual(r.returncode, 1)
        self.assertIn('must run exactly', r.stderr)
        for label, old, new in (('missing', '  unit:\n    if: github.event.pull_request.draft == false\n', '  unit:\n'),
                                ('wrong', '  unit:\n    if: github.event.pull_request.draft == false\n', '  unit:\n    if: always()\n')):
            with self.subTest(label):
                r = self.drift(base.replace(old, new, 1))
                self.assertEqual(r.returncode, 1)
                self.assertIn('job unit holds check steps and needs `if: github.event.pull_request.draft == false`', r.stderr)

    def test_ci_job_needs_exactly_the_check_jobs_and_checks_them_generically(self):
        base = workflow(MATCHING)
        r = self.drift(base.replace('needs: [static, unit, build, extras]', 'needs: [static, unit, build, extras, other]'))
        self.assertIn('job ci needs other, which holds no check steps', r.stderr)
        self.assertEqual(r.returncode, 1)
        generic = '      - env:\n          NEEDS: ${{ toJSON(needs) }}\n'
        self.assertIn(generic, base)
        r = self.drift(base.replace(generic, '      - env:\n'))
        self.assertIn('must check every needed job through env NEEDS', r.stderr)
        named = base.replace(generic, '      - env:\n          NEEDS: ${{ toJSON(needs) }}\n          UNIT: ${{ needs.unit.result }}\n')
        r = self.drift(named)
        self.assertEqual(r.returncode, 1)
        self.assertIn('job ci names job unit', r.stderr)
        listed = base.replace('run: python3', 'run: test "$NEEDS" && test "$STATIC" = success && python3')
        r = self.drift(listed)
        self.assertIn('job ci names job static', r.stderr)

    def test_a_step_without_an_if_still_passes(self):
        r = self.drift(workflow(MATCHING).replace('        if: ${{ !cancelled() }}\n', ''))
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_the_shipped_template_matches_its_own_check_ids(self):
        names = ['format', 'lint', 'typecheck', 'arch', 'slop', 'secrets', 'workflow-lint', 'unit', 'build', 'e2e-smoke', 'gates', 'migrate']
        stages = ['static'] * 7 + ['unit', 'build', 'e2e-smoke', 'extras', 'extras']
        (self.root / 'scripts/ci-local').write_text(CONFIG.replace('(format lint unit build e2e-smoke gates heavy)', f'({" ".join(names)})')
                                                    .replace('(true true true true true true true)', '(' + ' '.join(['true'] * len(names)) + ')')
                                                    .replace('(static static unit build e2e-smoke extras extras)', f'({" ".join(stages)})')
                                                    .replace('(heavy)', '()'))
        r = subprocess.run([sys.executable, str(DRIFT), '--root', str(self.root), '--workflow', str(ROOT / 'references/ci.yml')], text=True, capture_output=True)
        self.assertEqual(r.returncode, 0, r.stderr)


if __name__ == '__main__':
    unittest.main()
