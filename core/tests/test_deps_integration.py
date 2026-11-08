"""Integration checks with real Git worktrees and a stubbed GitHub CLI."""
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

# Importing the extensionless driver must not dirty a checked worktree.
sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[1]


def module(path):
    loader = importlib.machinery.SourceFileLoader("deps_land", str(path))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    loaded = importlib.util.module_from_spec(spec)
    loader.exec_module(loaded)
    return loaded


class DepsLandTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.work = self.root / "repo"
        self.work.mkdir()
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.log = self.root / "calls"
        self.env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
        self.env.update(PATH=str(self.bin) + os.pathsep + os.environ["PATH"],
                        GIT_CONFIG_GLOBAL="/dev/null", GIT_CONFIG_SYSTEM="/dev/null",
                        DEPS_LOG=str(self.log), DEPS_DATA=str(self.root / "prs.json"))
        self.git("init", "-b", "main")
        self.git("config", "user.name", "Test")
        self.git("config", "user.email", "test@example.invalid")
        (self.work / "scripts").mkdir()
        source = (ROOT / "references/deps-land.py").read_text()
        source = source.replace(next(line for line in source.splitlines() if line.startswith("INSTALL =")),
                                'INSTALL = "printf install >> \\\"$DEPS_LOG\\\""')
        (self.work / "scripts/deps-land").write_text(source)
        (self.work / "scripts/ci-local").write_text('echo "gate $CI_LOCAL_PR $*" >> "$DEPS_LOG"; test "${FAIL_GATE:-}" != "$CI_LOCAL_PR"\n')
        (self.work / "boundary-map.yaml").write_text('version: 1\nentries:\n- select:\n    paths: ["**"]\n  floor: Repair\n')
        (self.work / "sdlc.json").write_text('{"tiers": false}')
        self.git("add", ".")
        self.git("commit", "-m", "base")
        self.sha = self.git("rev-parse", "HEAD")
        self.git("init", "--bare", str(self.root / "origin.git"))
        self.git("remote", "add", "origin", str(self.root / "origin.git"))
        self.git("push", "origin", "main")
        for number in range(1, 5):
            self.git("push", "origin", f"HEAD:refs/pull/{number}/head")
        gh = self.bin / "gh"
        gh.write_text('''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
args = sys.argv[1:]
with open(os.environ['DEPS_LOG'], 'a') as file: file.write('gh ' + ' '.join(args) + '\\n')
if args[:2] == ['pr', 'list']: print(Path(os.environ['DEPS_DATA']).read_text())
elif args[0] == 'api': print('[[{"filename":"package-lock.json"}]]')
elif args[:2] == ['pr', 'view']:
    if 'mergeStateStatus,state' in args: print('{"state":"MERGED","mergeStateStatus":"CLEAN"}')
    else:
        prs = json.loads(Path(os.environ['DEPS_DATA']).read_text())
        print(json.dumps(next(pr for pr in prs if str(pr['number']) == args[2])))
elif args[:2] == ['pr', 'merge']:
    if os.environ.get('FAIL_MERGE'): sys.exit(1)
else: sys.exit(2)
''')
        gh.chmod(0o755)

    def git(self, *args):
        return subprocess.check_output(["git", *args], cwd=self.work, env=self.env,
                                       stderr=subprocess.DEVNULL, text=True).strip()

    def pr(self, number, title):
        return dict(number=number, title=title, body="## How hard is it to undo this PR after merging?\n\n**🟡 Repair** — Restore pins.\n", labels=[],
                    headRefOid=self.sha, isDraft=False, url=f"https://example.invalid/pr/{number}")

    def run_script(self, prs, **env):
        Path(self.env["DEPS_DATA"]).write_text(json.dumps(prs))
        return subprocess.run(["python3", "scripts/deps-land"], cwd=self.work,
                              env={**self.env, **env}, text=True, capture_output=True)

    def test_merges_only_verified_minor_heads_and_reports_majors_and_unknowns(self):
        result = self.run_script([self.pr(1, "Bump x from 1.2.0 to 1.3.0"),
                                  self.pr(2, "Bump y from 1.0.0 to 2.0.0"),
                                  self.pr(3, "Bump opaque digest")])
        self.assertEqual(result.returncode, 0, result.stderr)
        log = self.log.read_text()
        self.assertIn("pr list --author app/dependabot", log)
        self.assertIn("gate 1 --no-push", log)
        self.assertIn("gate 2 --no-push", log)
        self.assertIn("gate 3 --no-push", log)
        self.assertIn(f"pr merge 1 --squash --auto --match-head-commit {self.sha}", log)
        self.assertNotIn("pr merge 2", log)
        self.assertNotIn("pr merge 3", log)
        self.assertIn("OWNER (major; gate passed)", result.stdout)
        self.assertEqual({path.name for path in (self.work / ".worktrees").iterdir()}, {"deps-2", "deps-3"})

    def test_failed_gate_blocks_merge_and_preserves_worktree(self):
        result = self.run_script([self.pr(1, "Bump x from 1.2 to 1.3")], FAIL_GATE="1")
        self.assertEqual(result.returncode, 1)
        self.assertNotIn("pr merge", self.log.read_text())
        self.assertEqual({path.name for path in (self.work / ".worktrees").iterdir()}, {"deps-1"})

    def test_changed_head_and_existing_worktree_are_preserved(self):
        pr = self.pr(1, "Bump x from 1.2 to 1.3")
        pr["headRefOid"] = "f" * 40
        self.assertEqual(self.run_script([pr]).returncode, 1)
        work = self.work / ".worktrees/deps-1"
        work.mkdir()
        (work / "keep").write_text("owned by someone else")
        self.assertEqual(self.run_script([self.pr(1, "Bump x from 1.2 to 1.3")]).returncode, 1)
        self.assertTrue((work / "keep").exists())
        self.assertNotIn("pr merge", self.log.read_text())

    def test_failed_merge_preserves_worktree_and_empty_list_succeeds(self):
        result = self.run_script([self.pr(1, "Bump x from 1.2 to 1.3")], FAIL_MERGE="1")
        self.assertEqual(result.returncode, 1)
        self.assertEqual({path.name for path in (self.work / ".worktrees").iterdir()}, {"deps-1"})
        self.assertEqual(self.run_script([]).returncode, 0)

    def test_no_push_gate_attests_detached_bot_head_and_rejects_mismatch(self):
        source = (ROOT / "references/ci-local.sh").read_text()
        common = source.split("# END REPO CONFIG\n", 1)[1]
        config = "#!/usr/bin/env bash\nset -euo pipefail\nCHECK_NAMES=(fixture)\nCHECK_COMMANDS=('true')\nCHECK_TOOLS=('')\nSLOW_CHECKS=()\nDECISION4_COMMAND=true\n# END REPO CONFIG\n"
        (self.work / "scripts/ci-local").write_text(config + common)
        self.git("add", "scripts/ci-local")
        self.git("commit", "-m", "gate fixture")
        sha = self.git("rev-parse", "HEAD")
        self.git("checkout", "--detach")
        gh = self.bin / "gh"
        gh.write_text('''#!/usr/bin/env python3
import json, os, sys
args = sys.argv[1:]
with open(os.environ['DEPS_LOG'], 'a') as file: file.write('gh ' + ' '.join(args) + '\\n')
if args[:2] == ['repo', 'view']: print('example/repo')
elif args[:2] == ['pr', 'view']:
    if '--jq' in args: print(os.environ['EXPECTED_SHA'])
    else: print(json.dumps({'body':'Decision-Class: Undo', 'headRefOid':os.environ['EXPECTED_SHA'], 'baseRefOid':os.environ['EXPECTED_SHA'], 'baseRefName':'main'}))
elif args[0] == 'api':
    if args[-1] != 'success' and '/files' in ' '.join(args): print('package-lock.json')
else: sys.exit(2)
''')
        env = {**self.env, "CI_LOCAL_PR": "1", "EXPECTED_SHA": sha, "CI_LOCAL_BASE_REF": "origin/main"}
        # Any attempted push is a failure, even if the tree and commit are unchanged.
        hook = self.root / "origin.git/hooks/pre-receive"
        hook.write_text("#!/bin/sh\nexit 1\n")
        hook.chmod(0o755)
        result = subprocess.run(["bash", "scripts/ci-local", "--no-push"], cwd=self.work,
                                env=env, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        log = self.log.read_text()
        self.assertIn(f"statuses/{sha}", log)
        self.assertIn("context=local-ci -f state=success", log)
        self.assertIn("context=decision4 -f state=success", log)
        self.log.write_text("")
        result = subprocess.run(["bash", "scripts/ci-local", "--no-push"], cwd=self.work,
                                env={**env, "EXPECTED_SHA": "f" * 40}, text=True, capture_output=True)
        self.assertEqual(result.returncode, 1)
        self.assertNotIn("statuses/", self.log.read_text())

    def test_group_versions_and_major_labels(self):
        deps = module(ROOT / "references/deps-land.py")
        pr = self.pr(1, "Bump the npm group with 2 updates")
        pr["body"] = "| foo | `1.2.3` | `1.4.0` |\n| bar | `2.0.0` | `3.0.0` |"
        self.assertEqual(deps.update_kind(pr), "major")
        pr["body"] = "| foo | `1.2.3` | `1.4.0` |"
        self.assertEqual(deps.update_kind(pr), "minor/patch")
        pr["body"] = "Updates `foo` from 1.2.3 to 1.4.0\nUpdates `bar` from 2.0.0 to 3.0.0"
        self.assertEqual(deps.update_kind(pr), "major")
        pr["body"] = "Updates `foo` from 1.2.3 to 1.4.0"
        self.assertEqual(deps.update_kind(pr), "minor/patch")
        pr["labels"] = [{"name": "major"}]
        self.assertEqual(deps.update_kind(pr), "major")


if __name__ == "__main__":
    unittest.main()
