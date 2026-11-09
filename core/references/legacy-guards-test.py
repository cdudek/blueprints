#!/usr/bin/env python3
"""Exercise installed legacy guards in disposable repositories, never production services."""

from __future__ import annotations

import argparse
import hashlib
import importlib.machinery
import importlib.util
import json
import os
import shlex
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


def run(root: Path, argv: list[str], payload: object = None) -> subprocess.CompletedProcess[str]:
    env = {
        key: value
        for key, value in os.environ.items()
        if not key.startswith(("GIT_", "CI_LOCAL_", "HARNESS_AUDIT_"))
    }
    env["CLAUDE_PROJECT_DIR"] = str(root)
    env.pop("CI_LOCAL_PR_BODY", None)
    env.pop("CI_LOCAL_BODY_FILE", None)
    return subprocess.run(
        argv,
        cwd=root,
        env=env,
        text=True,
        capture_output=True,
        input=json.dumps(payload) if payload is not None else None,
        check=False,
    )


def git(root: Path, *args: str) -> str:
    result = run(
        root,
        ["git", "-c", "user.name=Guard Fixture", "-c", "user.email=fixture@example.invalid", *args],
    )
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def write(root: Path, name: str, data: str) -> Path:
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(data)
    return path


def source_text(root: Path, name: str) -> str:
    path = root / name
    assert not path.is_symlink() and path.resolve().is_relative_to(root.resolve()), (
        "Linked guard source refused"
    )
    assert not any(
        part.startswith(".env") or part in {"secrets", ".secrets"}
        for part in path.resolve().relative_to(root.resolve()).parts
    ), "Credential source refused"
    return path.read_text()


def prepush_cases(source: Path) -> list[str]:
    required = [source / ".githooks/pre-push", source / "scripts/ci-local"]
    assert all(path.is_file() for path in required), (
        "Installed pre-push hook and ci-local are required"
    )
    passed = []
    for case in ("forbidden-edit", "missing-evidence", "stale-lock", "allowed"):
        with tempfile.TemporaryDirectory(prefix="legacy-guard-") as directory:
            parent = Path(directory)
            root = parent / "repo"
            root.mkdir()
            gate = source_text(source, "scripts/ci-local")
            assert "# END REPO CONFIG\n" in gate, "Unsupported shared runner format"
            # Keep the actual runner body; replace expensive product commands with a controlled checker.
            checker = f"test -f {shlex.quote(str(parent / 'allow'))} && printf 'ran\\n' >> {shlex.quote(str(parent / 'ran'))}"
            config = (
                "#!/usr/bin/env bash\nset -euo pipefail\nCHECK_NAMES=(fixture)\n"
                f"CHECK_COMMANDS=({shlex.quote(checker)})\nCHECK_TOOLS=('')\n"
                "DECISION4_COMMAND='false'\nPOST_PUSH_COMMAND=''\n# END REPO CONFIG\n"
            )
            write(root, "scripts/ci-local", config + gate.split("# END REPO CONFIG\n", 1)[1]).chmod(
                0o755
            )
            write(root, ".githooks/pre-push", source_text(source, ".githooks/pre-push")).chmod(
                0o755
            )
            # Shared evidence helpers can evolve without replacing them with test doubles.
            for path in (source / "scripts").glob("ci[-_]*"):
                if path.is_file() and not path.is_symlink() and path.name != "ci-local":
                    shutil.copy2(path, root / "scripts" / path.name)
            for name in (".ci-local.lock", ".decision4.lock", "boundary-map.yaml"):
                if (source / name).is_file():
                    write(root, name, source_text(source, name))
            write(root, "src/probe.ts", "export const value = 1;\n")
            write(root, ".gitignore", "__pycache__/\n*.py[cod]\n")
            git(root, "init", "-q", "-b", "main")
            git(root, "add", ".")
            git(root, "commit", "-qm", "fixture")
            git(root, "update-ref", "refs/remotes/origin/main", "HEAD")
            git(root, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main")
            head = git(root, "rev-parse", "HEAD")
            marker = root / ".git/ci-local" / (head + ".ok")
            allow = parent / "allow"
            if case != "missing-evidence":
                allow.write_text("yes\n")
                result = run(root, ["bash", "scripts/ci-local", "--check"])
                assert result.returncode == 0 and marker.is_file(), result.stdout + result.stderr
            if case == "forbidden-edit":
                write(root, "src/probe.ts", "export const value = 2;\n")
            if case == "stale-lock":
                write(root, "src/probe.ts", "export const value = 3;\n")
                git(root, "commit", "-qam", "move head")
                allow.unlink()
            current = git(root, "rev-parse", "HEAD")
            # An existing branch update isolates receipt enforcement from first-push PR-body validation.
            payload = f"refs/heads/main {current} refs/heads/main {head}\n"
            env = {
                key: value
                for key, value in os.environ.items()
                if not key.startswith(("GIT_", "CI_LOCAL_", "HARNESS_AUDIT_"))
            }
            env.pop("CI_LOCAL_PR_BODY", None)
            env.pop("CI_LOCAL_BODY_FILE", None)
            result = subprocess.run(
                ["bash", ".githooks/pre-push"],
                cwd=root,
                env=env,
                input=payload,
                text=True,
                capture_output=True,
                check=False,
            )
            if case == "allowed":
                assert result.returncode == 0, result.stdout + result.stderr
                assert (parent / "ran").read_text().splitlines() == ["ran"], (
                    "Hook reran a verified head"
                )
            else:
                assert result.returncode != 0, f"{case}: publication was incorrectly allowed"
                if case in {"missing-evidence", "stale-lock"}:
                    assert not (root / ".git/ci-local" / (current + ".ok")).exists()
            passed.append(case)
    return passed


def chain_cases(source: Path) -> list[str]:
    hooks = source / ".claude/hooks"
    if not (hooks / "chain-gate.sh").is_file():
        return []
    passed = []
    for case in ("forbidden-edit", "missing-evidence", "stale-lock", "allowed"):
        with tempfile.TemporaryDirectory(prefix="chain-guard-") as directory:
            root = Path(directory)
            for name in ("chain-gate.sh", "sdlc-config.sh"):
                write(root, ".claude/hooks/" + name, source_text(source, ".claude/hooks/" + name))
            write(root, "sdlc.json", json.dumps({"changesDir": "changes", "docs": "docs/sdlc.md"}))
            change = "changes/2026-11-01-guard"
            write(
                root,
                change + "/decisions.json",
                json.dumps(
                    {
                        "size": "M",
                        "kind": "feature",
                        "milestone": {"kind": "single", "slug": "guard"},
                    }
                ),
            )
            for name in ("intent.md", "facts.md"):
                write(root, change + "/" + name, "---\nstatus: approved\n---\n")
            write(
                root,
                change + "/plan.md",
                "---\nstatus: approved\n---\n\n## Goal handover\n\nDeliver the guard fixture.\n",
            )
            write(root, change + "/lock.json", "{}\n")
            transcript = write(
                root,
                "transcript.jsonl",
                json.dumps(
                    {"type": "attachment", "attachment": {"type": "goal_status", "met": False}}
                )
                + "\n",
            )
            git(root, "init", "-q", "-b", "feat/guard")
            path = "src/app.ts"
            if case == "forbidden-edit":
                path = change + "/facts.md"
            if case == "missing-evidence":
                (root / change / "lock.json").unlink()
            if case == "stale-lock":
                write(
                    root,
                    change + "/plan.md",
                    "---\nstatus: draft\n---\n\n## Goal handover\n\nChanged plan.\n",
                )
            result = run(
                root,
                ["bash", ".claude/hooks/chain-gate.sh"],
                {"tool_input": {"file_path": path}, "transcript_path": str(transcript)},
            )
            assert result.returncode == (0 if case == "allowed" else 2), (
                result.stdout + result.stderr
            )
            passed.append("chain/" + case)
    return passed


def verify_cases(source: Path) -> list[str]:
    if not (source / "scripts/verify_gate.py").is_file():
        return []
    passed = []
    change_id = "2026-11-01-guard"
    for case in ("forbidden-edit", "missing-evidence", "stale-lock", "allowed"):
        with tempfile.TemporaryDirectory(prefix="criteria-guard-") as directory:
            root = Path(directory)
            for name in ("verify_gate.py", "marks.py", "sdlc_version.py"):
                write(root, "scripts/" + name, source_text(source, "scripts/" + name))
            write(
                root,
                "sdlc.json",
                json.dumps({"changesDir": "changes", "checks": {"feature": ["true"]}}),
            )
            write(root, ".gitignore", "/changes/*/verify/\n__pycache__/\n*.py[cod]\n")
            prefix = "changes/" + change_id + "/"
            write(
                root, prefix + "facts.md", "---\nstatus: approved\n---\n\n- [ ] **F1** It works.\n"
            )
            write(root, prefix + "done.json", '{"facts":["F1"]}\n')
            git(root, "init", "-q", "-b", "main")
            git(root, "add", ".")
            git(root, "commit", "-qm", "fixture")
            if case != "missing-evidence":
                approved = run(
                    root, [sys.executable, "scripts/verify_gate.py", "approve", change_id]
                )
                assert approved.returncode == 0, approved.stdout + approved.stderr
                git(root, "add", ".")
                git(root, "commit", "-qm", "approved criteria")
            if case == "forbidden-edit":
                write(
                    root,
                    prefix + "facts.md",
                    "---\nstatus: approved\n---\n\n- [ ] **F2** Changed criteria.\n",
                )
                git(root, "commit", "-qam", "move criteria")
            if case == "stale-lock":
                lock_path = root / (prefix + "lock.json")
                lock = json.loads(lock_path.read_text())
                lock["criteria"]["checks"] = "0" * 64
                lock_path.write_text(json.dumps(lock) + "\n")
                git(root, "commit", "-qam", "stale criteria fingerprint")
            result = run(root, [sys.executable, "scripts/verify_gate.py", "feature", change_id])
            if case == "allowed":
                assert result.returncode == 0 and "VERIFY PASS feature" in result.stdout, (
                    result.stdout + result.stderr
                )
            else:
                reason = "not-approved" if case == "missing-evidence" else "protected-path"
                assert (
                    result.returncode == 3 and f"VERIFY BLOCKED reason={reason}" in result.stdout
                ), result.stdout + result.stderr
            passed.append("verify/" + case)
    return passed


def load_auditor(path: Path) -> Any:
    loader = importlib.machinery.SourceFileLoader("fixture_harness_audit", str(path))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    previous = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = previous
    return module


def config_cases(source: Path) -> list[str]:
    module = load_auditor(source / "scripts/harness-audit")
    with tempfile.TemporaryDirectory(prefix="audit-config-") as directory:
        root = Path(directory)
        for name in ("harness-audit", "legacy-guards-test.py"):
            write(root, "scripts/" + name, source_text(source, "scripts/" + name))
        gate = "#!/bin/bash\nCHECK_NAMES=(fixture)\nCHECK_COMMANDS=('true')\n# END REPO CONFIG\n"
        write(root, "scripts/ci-local", gate)
        write(root, "fixture.json", "{}\n")
        config = {
            "version": 1,
            "owner": "example-owner",
            "default_branch": "main",
            "legacy": [],
            "checks": [
                {
                    "id": "fixture",
                    "owner": "example-owner",
                    "kind": "execution",
                    "tools": [[sys.executable, "--version"]],
                    "configs": ["fixture.json"],
                    "rules": ["fixture execution"],
                    "reason": "Controlled test fixture",
                }
            ],
        }
        write(root, ".harness-audit.json", json.dumps(config))
        files = {
            "scripts/" + name: hashlib.sha256((root / "scripts" / name).read_bytes()).hexdigest()
            for name in ("harness-audit", "legacy-guards-test.py")
        }
        write(
            root,
            ".harness-audit.lock",
            json.dumps(
                {
                    "version": 1,
                    "repository": module.SOURCE_REPOSITORY,
                    "source": module.SOURCE_DIRECTORY,
                    "pin": "0" * 40,
                    "files": files,
                }
            ),
        )
        git(root, "init", "-q", "-b", "main")
        git(root, "add", ".")
        assert module.configuration(root)[2] == [], "Valid configuration was refused"
        write(
            root,
            "scripts/ci-local",
            gate.replace("(fixture)", "(fixture omitted)").replace("('true')", "('true' 'true')"),
        )
        assert any(gap.check == "omitted" for gap in module.configuration(root)[2])
        write(root, "scripts/ci-local", gate)
        with (root / "scripts/harness-audit").open("a") as destination:
            destination.write("\n# drift\n")
        assert any(gap.check == "scripts/harness-audit" for gap in module.configuration(root)[2])
    return ["config/allowed", "config/missing-check", "config/stale-lock"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--case", choices=("all", "prepush", "chain", "verify", "config"), default="all"
    )
    args = parser.parse_args()
    source = Path.cwd()
    passed = []
    if args.case in {"all", "prepush"}:
        passed.extend(prepush_cases(source))
    if args.case in {"all", "chain"}:
        passed.extend(chain_cases(source))
    if args.case in {"all", "verify"}:
        passed.extend(verify_cases(source))
    if args.case in {"all", "config"}:
        passed.extend(config_cases(source))
    for name in passed:
        print("PASS " + name)
    if not passed:
        print("FAIL no applicable legacy fixtures", file=sys.stderr)
        return 1
    print(f"PASS legacy guards: {len(passed)} real refusal/allowed fixtures")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (AssertionError, OSError, ValueError, subprocess.TimeoutExpired) as error:
        print(f"FAIL legacy guard fixture: {error}", file=sys.stderr)
        sys.exit(1)
