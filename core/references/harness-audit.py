#!/usr/bin/env python3
"""Run a fresh local harness audit and optionally maintain its single owner-assigned issue."""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import quote

ISSUE_TITLE = "Monthly whole-harness audit"
CONFIG = ".harness-audit.json"
LOCK = ".harness-audit.lock"
SOURCE_REPOSITORY = "cdudek/blueprints"
SOURCE_DIRECTORY = "core/references"
STATES = ("installed", "configured", "executed", "passed", "applied")
NO_EXECUTION = r"(?:\bSKIPPED\b|\b0 tests\b|Checked 0 files|No test files found)"
HANDLE = re.compile(r"[A-Za-z0-9][A-Za-z0-9-]{0,38}\Z")


@dataclasses.dataclass
class Gap:
    check: str
    state: str
    owner: str
    reason: str


def command(args: list[str], root: Path, **kwargs: Any) -> subprocess.CompletedProcess[str]:
    kwargs.setdefault("timeout", 60)
    return subprocess.run(args, cwd=root, text=True, capture_output=True, check=False, **kwargs)


def git(root: Path, *args: str) -> str:
    result = command(["git", *args], root)
    if result.returncode:
        raise ValueError(f"git {' '.join(args[:2])} failed: {result.stderr.strip()}")
    return result.stdout.strip()


def owner(value: object) -> str:
    if not isinstance(value, str) or not HANDLE.fullmatch(value.removeprefix("@")):
        raise ValueError("Every audit row needs an explicit GitHub owner handle")
    return value.removeprefix("@")


def safe_path(root: Path, name: str) -> Path:
    relative = Path(name)
    if relative.is_absolute() or not relative.parts or ".." in relative.parts:
        raise ValueError(f"Not a repository-relative path: {name}")
    if any(
        part.startswith(".env")
        or part in {".git", "secrets", ".secrets", ".npmrc", ".pypirc", ".terraform"}
        for part in relative.parts
    ):
        raise ValueError(f"Withheld environment/credential path: {name}")
    if re.search(
        r"(?:^id_(?:rsa|ed25519)$|\.(?:pem|key|p12|pfx)$|^(?:credentials|service-account).*\.json$)",
        relative.name,
        re.I,
    ):
        raise ValueError(f"Withheld credential path: {name}")
    if re.search(
        r"(?:\.tfstate(?:\..*)?$|\.tfvars(?:\.json)?$|\.tfplan$|^(?:tfplan(?:\.json)?|plan\.txt)$)",
        relative.name,
        re.I,
    ):
        raise ValueError(f"Withheld state/value path: {name}")
    path = root / relative
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError(f"Path leaves the repository: {name}")
    if any(
        (root / Path(*relative.parts[:end])).is_symlink()
        for end in range(1, len(relative.parts) + 1)
    ):
        raise ValueError(f"Refusing linked repository input: {name}")
    return path


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def gate_checks(root: Path) -> dict[str, str]:
    """Read the repository's actual config block; never maintain a second command list."""
    source = (root / "scripts/ci-local").read_text()
    if "# END REPO CONFIG\n" not in source:
        raise ValueError("ci-local has no supported repository configuration block")
    config = source.split("# END REPO CONFIG\n", 1)[0]
    dump = """
for ((i=0; i<${#CHECK_NAMES[@]}; i++)); do
  printf '%s\\0%s\\0' "${CHECK_NAMES[$i]}" "${CHECK_COMMANDS[$i]}"
done
"""
    result = command(["bash", "-euo", "pipefail", "-c", config + dump], root)
    if result.returncode:
        raise ValueError(f"Cannot read ci-local check declarations: {result.stderr.strip()}")
    parts = result.stdout.rstrip("\0").split("\0")
    if len(parts) % 2 or not parts or not parts[0]:
        raise ValueError("Invalid ci-local check declarations")
    checks = dict(zip(parts[::2], parts[1::2], strict=True))
    if len(checks) != len(parts) // 2:
        raise ValueError("Duplicate ci-local check name")
    if "ci_docs()" in source:
        checks.update({"docs-format": "ci_docs format", "docs-links": "ci_docs links"})
    return checks


def legacy_paths(root: Path) -> set[str]:
    paths = git(root, "ls-files", "-z").split("\0")
    return {
        path
        for path in paths
        if path
        and (
            path.startswith((".claude/hooks/", ".githooks/"))
            or re.search(r"(^|/)(check[-_][^/]+|verify_gate\.py|ci[-_]scope\.[^/]+)$", path)
        )
    }


def configuration(root: Path) -> tuple[dict[str, Any], dict[str, str], list[Gap]]:
    config = json.loads((root / CONFIG).read_text())
    if config.get("version") != 1:
        raise ValueError("Unsupported harness audit manifest version")
    responsible = owner(config.get("owner"))
    checks = gate_checks(root)
    rows = config.get("checks", [])
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise ValueError("Manifest checks must be objects")
    ids = [row.get("id") for row in rows]
    if any(
        not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", name) for name in ids
    ) or len(ids) != len(set(ids)):
        raise ValueError("Manifest check IDs must be unique strings")
    gaps = [
        Gap(name, "configured", responsible, "Claimed local check has no audit row")
        for name in sorted(set(checks) - set(ids))
    ]
    gaps.extend(
        Gap(name, "configured", responsible, "Audit row is absent from ci-local")
        for name in sorted(set(ids) - set(checks))
    )
    for row in rows:
        owner(row.get("owner", responsible))
        if row.get("kind") not in {"ruleset", "suite", "execution"}:
            raise ValueError(f"{row['id']}: declare ruleset, suite or execution kind")
        if not row.get("rules") or not row.get("configs") or not row.get("tools"):
            gaps.append(
                Gap(
                    row["id"],
                    "configured",
                    owner(row.get("owner", responsible)),
                    "Tools, configuration paths and the claimed rules/suite must be explicit",
                )
            )
        for name in row.get("configs", []):
            try:
                configured_path = safe_path(root, name)
                if not configured_path.exists():
                    raise ValueError(f"Configuration is missing: {name}")
            except ValueError as error:
                gaps.append(
                    Gap(row["id"], "configured", owner(row.get("owner", responsible)), str(error))
                )
    if "repository" in config and not re.fullmatch(
        r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", str(config["repository"])
    ):
        raise ValueError("Audit repository must be owner/name")
    required = config.get("required_statuses", ["local-ci", "decision4"])
    if (
        not isinstance(required, list)
        or any(not isinstance(value, str) or not value for value in required)
        or not {"local-ci", "decision4"} <= set(required)
    ):
        raise ValueError("Required statuses must include local-ci and decision4")
    branches = config.get("protected_branches", [])
    if not isinstance(branches, list) or any(
        not isinstance(branch, str)
        or command(["git", "check-ref-format", "refs/heads/" + branch], root).returncode
        for branch in branches
    ):
        raise ValueError("Protected branches must be valid explicit branch names")
    inventory = config.get("legacy", [])
    recorded = [entry["path"] for entry in inventory]
    if len(recorded) != len(set(recorded)):
        raise ValueError("Duplicate legacy inventory path")
    for entry in inventory:
        owner(entry.get("owner", responsible))
        if not entry.get("reason") or not entry.get("invoked_by") or not entry.get("via"):
            gaps.append(
                Gap(
                    entry["path"],
                    "configured",
                    responsible,
                    "Legacy inventory needs its role and invocation evidence",
                )
            )
    for path in sorted(legacy_paths(root) - set(recorded)):
        gaps.append(Gap(path, "configured", responsible, "Older hook/check is not inventoried"))
    for path in sorted(set(recorded) - set(git(root, "ls-files", "-z").split("\0"))):
        gaps.append(Gap(path, "installed", responsible, "Inventoried source is missing"))
    lock = json.loads((root / LOCK).read_text())
    if (
        lock.get("version") != 1
        or lock.get("repository") != SOURCE_REPOSITORY
        or lock.get("source") != SOURCE_DIRECTORY
    ):
        raise ValueError("Audit source lock must identify the canonical plugin source and version")
    if not re.fullmatch(r"[0-9a-f]{40}", lock.get("pin", "")):
        raise ValueError("Audit source lock needs a full immutable commit pin")
    for name, expected in lock.get("files", {}).items():
        locked_path = safe_path(root, name)
        if not locked_path.is_file() or digest(locked_path) != expected:
            gaps.append(
                Gap(name, "configured", responsible, "Synced auditor/fixture source drifted")
            )
    required = {"scripts/harness-audit", "scripts/legacy-guards-test.py"}
    if not required <= set(lock.get("files", {})):
        raise ValueError("Audit source lock must cover both synced executables")
    return config, checks, gaps


def config_hashes(root: Path, names: list[str]) -> dict[str, str]:
    """Hash permitted committed inputs, never ignored or untracked local artifacts."""
    tracked = set(git(root, "ls-files", "--cached", "-z").split("\0")) - {""}
    hashes = {}
    for name in names:
        path = safe_path(root, name)
        relative = path.relative_to(root).as_posix()
        if path.is_dir():
            files = [
                safe_path(root, item) for item in sorted(tracked) if item.startswith(relative + "/")
            ]
            if not files:
                raise ValueError(f"Configuration directory has no committed files: {name}")
            if any(not item.is_file() for item in files):
                raise ValueError(f"Committed configuration file is missing: {name}")
            hashes.update({item.relative_to(root).as_posix(): digest(item) for item in files})
        elif path.is_file():
            if relative not in tracked:
                raise ValueError(f"Configuration is not committed: {name}")
            hashes[name] = digest(path)
        else:
            raise ValueError(f"Configuration is missing: {name}")
    return hashes


def reset_caches(root: Path, patterns: list[str]) -> None:
    for pattern in patterns:
        safe_path(root, pattern)
        for path in root.glob(pattern):
            relative = path.relative_to(root).as_posix()
            safe_path(root, relative)
            if path.is_symlink() or git(root, "ls-files", "--", relative):
                raise ValueError(f"Refusing to erase tracked or linked cache: {relative}")
            if path.is_dir():
                shutil.rmtree(path)
            elif path.exists():
                path.unlink()


def incomplete_execution(output: str) -> bool:
    """Detect empty/skipped proof in human summaries, unittest and TAP output."""
    text = re.sub(r"\x1b\[[0-9;]*m", "", output)
    return bool(
        re.search(
            NO_EXECUTION + r"|\b[1-9]\d* (?:skipped|todo)\b|\bskipped=[1-9]\d*\b"
            r"|(?m:^(?:#|ℹ)\s+(?:tests 0|pass 0|(?:skipped|todo) [1-9]\d*)\b)",
            text,
        )
    )


def probe(root: Path, spec: dict[str, Any], log: Path) -> bool:
    result = command(["bash", "-euo", "pipefail", "-c", spec["command"]], root, timeout=180)
    output = result.stdout + result.stderr
    log.write_text(output)
    if incomplete_execution(output):
        return False
    required = spec.get("required_output", [])
    return result.returncode == 0 and bool(required) and all(text in output for text in required)


def legacy_evidence(
    root: Path,
    entry: dict[str, Any],
    output: Path,
    checker_results: list[dict[str, Any]],
    responsible: str,
) -> dict[str, Any]:
    """A registration claim cannot stand in for actually exercising an older guard."""
    name = entry["path"]
    responsible = owner(entry.get("owner", responsible))
    path = safe_path(root, name)
    states = dict.fromkeys(STATES, False)
    states["installed"] = path.is_file()
    if name.startswith(".githooks/") or (
        name.startswith(".claude/hooks/")
        and path.suffix == ".sh"
        and entry.get("kind") != "support"
    ):
        states["installed"] = states["installed"] and os.access(path, os.X_OK)
    hashes = {}
    for registration in entry.get("via", []):
        if registration == "git:core.hooksPath":
            configured = command(["git", "config", "--get", "core.hooksPath"], root)
            hook_dir = Path(configured.stdout.strip())
            if configured.returncode == 0:
                hook_dir = hook_dir if hook_dir.is_absolute() else root / hook_dir
                states["configured"] |= (hook_dir / path.name).resolve() == path.resolve()
        else:
            via = safe_path(root, registration)
            if via.is_file():
                hashes[registration] = digest(via)
                text = via.read_text()
                if registration == ".claude/settings.json":
                    hooks = json.loads(text).get("hooks", {})
                    commands = [
                        hook.get("command", "")
                        for groups in hooks.values()
                        for group in groups
                        for hook in group.get("hooks", [])
                    ]
                    states["configured"] |= any(
                        ".claude/hooks/" + path.name in item for item in commands
                    )
                elif via.name == "package.json":
                    commands = json.loads(text).get("scripts", {}).values()
                    states["configured"] |= any(path.name in item for item in commands)
                else:
                    states["configured"] |= path.name in text
    if states["installed"]:
        hashes[name] = digest(path)
    check = entry.get("via_check", "")
    required = entry.get("required_output", [])
    valid_checks = {row["id"] for row in checker_results}
    log = output / (check + ".log") if check in valid_checks else None
    if log is not None and log.is_file() and required:
        text = log.read_text()
        states["executed"] = all(marker in text for marker in required)
        states["passed"] = states["executed"] and any(
            row["id"] == check and row["states"]["passed"] for row in checker_results
        )
    states["applied"] = (
        states["installed"] and states["configured"] and states["passed"] and bool(required)
    )
    return {
        "id": "legacy:" + name,
        "owner": responsible,
        "kind": entry.get("kind", "guard"),
        "states": states,
        "config_sha256": hashes,
        "invoked_by": entry["invoked_by"],
        "reason": entry["reason"],
    }


def github_repository(root: Path, expected: str | None = None) -> str:
    environment = {key: value for key, value in os.environ.items() if key != "GH_REPO"}
    result = command(
        ["gh", "repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"],
        root,
        env=environment,
    )
    repository = result.stdout.strip()
    if result.returncode or not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise ValueError("Cannot resolve GitHub repository from this checkout")
    if expected is not None and repository.casefold() != expected.casefold():
        raise ValueError("Checkout repository differs from the audit manifest")
    return repository


def branch_policy(root: Path, config: dict[str, Any]) -> tuple[dict[str, Any], list[Gap]]:
    """Read active platform enforcement; declarations in local files are not proof."""
    responsible = owner(config["owner"])
    evidence: dict[str, Any] = {"branches": []}
    gaps: list[Gap] = []
    try:
        repository = github_repository(root, config.get("repository"))
        evidence["repository"] = repository
    except (ValueError, OSError, subprocess.TimeoutExpired) as error:
        return evidence, [Gap("github-protection", "applied", responsible, str(error))]
    required = set(config.get("required_statuses", ["local-ci", "decision4"]))
    branches = list(
        dict.fromkeys([config["default_branch"], *config.get("protected_branches", [])])
    )
    for branch in branches:
        contexts: set[str] = set()
        sources: list[dict[str, Any]] = []
        for suffix, kind in (
            (f"rules/branches/{quote(branch, safe='')}", "rulesets"),
            (f"branches/{quote(branch, safe='')}/protection/required_status_checks", "classic"),
        ):
            endpoint = f"repos/{repository}/{suffix}"
            try:
                result = command(["gh", "api", endpoint], root, timeout=60)
                if result.returncode:
                    sources.append({"kind": kind, "verified": False, "error": "API unavailable"})
                    continue
                payload = json.loads(result.stdout)
                if kind == "rulesets":
                    if not isinstance(payload, list):
                        raise ValueError("Unexpected active rules response")
                    for rule in payload:
                        if rule.get("type") == "required_status_checks":
                            contexts.update(
                                item["context"]
                                for item in rule.get("parameters", {}).get(
                                    "required_status_checks", []
                                )
                            )
                else:
                    contexts.update(payload.get("contexts", []))
                    contexts.update(item["context"] for item in payload.get("checks", []))
                sources.append({"kind": kind, "verified": True, "response": payload})
            except (
                ValueError,
                TypeError,
                KeyError,
                AttributeError,
                OSError,
                subprocess.TimeoutExpired,
            ) as error:
                sources.append({"kind": kind, "verified": False, "error": type(error).__name__})
        missing = sorted(required - contexts)
        evidence["branches"].append(
            {
                "branch": branch,
                "required": sorted(required),
                "observed": sorted(contexts),
                "applied": not missing,
                "sources": sources,
            }
        )
        if missing:
            gaps.append(
                Gap(
                    "github-protection:" + branch,
                    "applied",
                    responsible,
                    "Required statuses not verified active: " + ", ".join(missing),
                )
            )
    return evidence, gaps


def audit(
    root: Path, config: dict[str, Any], checks: dict[str, str], gaps: list[Gap]
) -> dict[str, Any]:
    if os.environ.get("HARNESS_AUDIT_ACTIVE"):
        raise ValueError("Recursive whole-harness audit refused; gate only --verify-config")
    if git(root, "status", "--porcelain", "--untracked-files=normal"):
        raise ValueError("Commit or remove local edits before a whole-harness audit")
    head = git(root, "rev-parse", "HEAD")
    tree = git(root, "rev-parse", "HEAD^{tree}")
    branch = config["default_branch"]
    if command(["git", "check-ref-format", "refs/heads/" + branch], root).returncode:
        raise ValueError("Invalid audit default branch")
    base_tip = git(root, "rev-parse", "origin/" + branch)
    base = git(root, "merge-base", "HEAD", base_tip)
    common = Path(git(root, "rev-parse", "--path-format=absolute", "--git-common-dir"))
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = common / "harness-audit" / (stamp + "-" + uuid.uuid4().hex[:8])
    output.mkdir(parents=True)
    reset_caches(root, config.get("reset", []))
    started_ns = time.time_ns()
    environment = {
        **os.environ,
        "HARNESS_AUDIT_ACTIVE": "1",
        "CI_LOCAL_BASE_REF": base_tip,
        "CI_LOCAL_FULL_SUITE": "1",
    }
    if head == base_tip:
        # The owned runner also verifies review/Decision4 in --check mode. A default-head
        # monthly run has no PR body; supply an honest no-change review context instead.
        review_body = output / "audit-body.md"
        review_body.write_text(
            "## What\n\n- **Audit:** Verify this existing default-branch head; no source change is proposed.\n\n"
            "## Why\n\n- **Operation:** Monthly local whole-harness verification.\n\n"
            f"## Proof\n\n- **Head:** `{head}`; comparison base is this same commit.\n"
            "- **Results:** The owned runner will append its actual review and fitness evidence.\n\n"
            "## How hard is it to undo this PR after merging?\n\n"
            "**🟢 Undo** — No source change is proposed; discard the local audit output if needed.\n\n"
            f"- **Responsible for recovery:** @{owner(config['owner'])}.\n"
            "- **Classification change:** None.\n\n🤖 Generated with Codex\n"
        )
        environment["CI_LOCAL_PR_BODY"] = str(review_body)
        environment.pop("CI_LOCAL_BODY_FILE", None)
    with (output / "gate.log").open("w") as log:
        gate = subprocess.run(
            ["bash", "scripts/ci-local", "--check"],
            cwd=root,
            env=environment,
            text=True,
            stdout=log,
            stderr=subprocess.STDOUT,
            check=False,
        )
    summary = (output / "gate.log").read_text()
    git_dir = Path(git(root, "rev-parse", "--absolute-git-dir"))
    results = []
    for row in config["checks"]:
        name = row["id"]
        if name not in checks:
            continue
        responsible = owner(row.get("owner", config["owner"]))
        state = dict.fromkeys(STATES, False)
        state["installed"] = bool(row.get("tools"))
        tools = []
        for argv in row.get("tools", []):
            if not isinstance(argv, list) or not argv or any(not isinstance(v, str) for v in argv):
                raise ValueError(f"{name}: tool probe must be an argument array")
            if argv[-1] not in {"--version", "-V", "version"} or any(
                value in {"-c", "-e", "--eval"} or re.search(r"(^|[/=])\.env", value)
                for value in argv
            ):
                raise ValueError(f"{name}: tool commands must be version probes")
            try:
                result = command(argv, root, timeout=60)
                tools.append(
                    {
                        "command": argv,
                        "exit": result.returncode,
                        "version": (result.stdout + result.stderr).strip()[:300],
                    }
                )
                state["installed"] = state["installed"] and result.returncode == 0
            except (OSError, subprocess.TimeoutExpired) as error:
                tools.append({"command": argv, "exit": None, "error": str(error)})
                state["installed"] = False
        hashes = {}
        try:
            hashes = config_hashes(root, row.get("configs", []))
            state["configured"] = bool(hashes) and bool(row.get("rules"))
        except ValueError as error:
            gaps.append(Gap(name, "configured", responsible, str(error)))
        source_log = git_dir / "ci-local" / head / (name + ".log")
        fresh = source_log.is_file() and source_log.stat().st_mtime_ns >= started_ns
        state["executed"] = fresh and bool(
            re.search(rf"^(PASS|FAIL) {re.escape(name)}(?: |$)", summary, re.M)
        )
        state["passed"] = state["executed"] and bool(
            re.search(rf"^PASS {re.escape(name)} \(", summary, re.M)
        )
        log_hash = None
        if fresh:
            log_text = source_log.read_text()
            shutil.copy2(source_log, output / (name + ".log"))
            log_hash = digest(source_log)
            if incomplete_execution(log_text):
                state["passed"] = False
        if row.get("kind") == "ruleset":
            if row.get("applied"):
                try:
                    state["applied"] = probe(root, row["applied"], output / (name + "-rules.log"))
                except (OSError, subprocess.TimeoutExpired) as error:
                    gaps.append(Gap(name, "applied", responsible, str(error)))
        else:
            # Suites/artifact builds have no policy ruleset; the explicit claim is bound to fresh execution.
            state["applied"] = state["configured"] and state["passed"] and bool(row.get("reason"))
        for key, passed in state.items():
            if not passed:
                gaps.append(
                    Gap(name, key, responsible, "No successful fresh evidence for this state")
                )
        results.append(
            {
                "id": name,
                "owner": responsible,
                "command": checks[name],
                "kind": row["kind"],
                "rules": row["rules"],
                "states": state,
                "config_sha256": hashes,
                "tools": tools,
                "log_sha256": log_hash,
            }
        )
    local_results = list(results)
    for entry in config.get("legacy", []):
        try:
            legacy_result = legacy_evidence(root, entry, output, local_results, config["owner"])
        except (ValueError, TypeError, KeyError, OSError, UnicodeError, AttributeError) as error:
            legacy_result = {
                "id": "legacy:" + entry["path"],
                "owner": owner(entry.get("owner", config["owner"])),
                "kind": entry.get("kind", "guard"),
                "states": dict.fromkeys(STATES, False),
                "error": "Registration/source inspection failed: " + type(error).__name__,
            }
        results.append(legacy_result)
        for key, passed in legacy_result["states"].items():
            if not passed:
                gaps.append(
                    Gap(
                        legacy_result["id"],
                        key,
                        legacy_result["owner"],
                        "Older hook/check has no fresh registration-and-fixture evidence",
                    )
                )
    if gate.returncode:
        gaps.append(
            Gap(
                "whole-gate",
                "passed",
                owner(config["owner"]),
                f"ci-local exited {gate.returncode}; reproduce only the named failing checker",
            )
        )
    if git(root, "rev-parse", "HEAD") != head or git(
        root, "status", "--porcelain", "--untracked-files=normal"
    ):
        gaps.append(
            Gap(
                "whole-gate",
                "executed",
                owner(config["owner"]),
                "HEAD or worktree moved during audit",
            )
        )
    policy, policy_gaps = branch_policy(root, config)
    gaps.extend(policy_gaps)
    report = {
        "repository": config.get("repository"),
        "gate_rulesets": policy,
        "version": 1,
        "head": head,
        "tree": tree,
        "base_tip": base_tip,
        "merge_base": base,
        "started": stamp,
        "checks": results,
        "gaps": [dataclasses.asdict(gap) for gap in gaps],
        "artifact": str(output),
    }
    (output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


def issue_body(report: dict[str, Any]) -> str:
    lines = [
        "## What",
        "",
        "- **Audit:** Fresh local whole-harness run; one continuing issue per repository.",
    ]
    for gap in report["gaps"]:
        reason = " ".join(gap["reason"].split())[:350]
        lines.append(f"- **{gap['check']} / {gap['state']}:** Owner @{gap['owner']}; {reason}.")
    if not report["gaps"]:
        lines.append(
            "- **Gaps:** None observed in the installed/configured/executed/passed/applied checks."
        )
    lines += [
        "",
        "## Why",
        "",
        "- **Monthly reminder:** An agent runs `scripts/harness-audit --issue` on the owner's Mac each month; no scheduled Actions, cron or launchd job.",
        "",
        "## Proof",
        "",
        f"- **Checked head:** `{report['head']}`; comparison base `{report['base_tip']}`.",
        f"- **Fresh run:** `{report['started']}`; {len(report['checks'])} declared checkers, {len(report['gaps'])} gaps.",
        "- **Local evidence:** The common Git directory contains `harness-audit/<run>/report.json`, source/config hashes and fresh checker logs.",
        "- **Failure loop:** Read the named checker log, reproduce that checker locally, fix it, then run the full gate once before pushing.",
        "",
        "🤖 Generated with Codex",
        "",
    ]
    return "\n".join(lines)


def update_issue(root: Path, report: dict[str, Any], responsible: str) -> str:
    repo = github_repository(
        root, report.get("repository") or report.get("gate_rulesets", {}).get("repository")
    )
    result = command(
        [
            "gh",
            "issue",
            "list",
            "--repo",
            repo,
            "--state",
            "all",
            "--limit",
            "100",
            "--search",
            f'"{ISSUE_TITLE}" in:title',
            "--json",
            "number,title,state",
        ],
        root,
    )
    if result.returncode:
        raise ValueError("Cannot list the continuing harness audit issue")
    matches = [item for item in json.loads(result.stdout) if item["title"] == ISSUE_TITLE]
    if len(matches) > 1:
        raise ValueError("Duplicate continuing audit issues; owner must select the canonical issue")
    body = Path(report["artifact"]) / "issue.md"
    body.write_text(issue_body(report))
    if matches:
        if matches[0].get("state") == "CLOSED" and report["gaps"]:
            reopened = command(
                ["gh", "issue", "reopen", str(matches[0]["number"]), "--repo", repo], root
            )
            if reopened.returncode:
                raise ValueError("Cannot reopen the continuing audit issue for observed gaps")
        args = ["gh", "issue", "edit", str(matches[0]["number"]), "--repo", repo]
    else:
        args = ["gh", "issue", "create", "--repo", repo, "--title", ISSUE_TITLE]
    assignees = sorted({owner(responsible)} | {owner(gap["owner"]) for gap in report["gaps"]})
    for handle in assignees:
        args += ["--add-assignee" if matches else "--assignee", handle]
    result = command(args + ["--body-file", str(body)], root)
    if result.returncode:
        raise ValueError(f"Audit issue update failed: {result.stderr.strip()}")
    return result.stdout.strip()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--verify-config",
        action="store_true",
        help="cheap gate check; never runs the whole harness",
    )
    parser.add_argument(
        "--issue",
        action="store_true",
        help="open/update the repository's one owner-assigned audit issue",
    )
    args = parser.parse_args()
    root = Path(git(Path.cwd(), "rev-parse", "--show-toplevel"))
    config, checks, gaps = configuration(root)
    if args.verify_config:
        for gap in gaps:
            print(f"FAIL {gap.check}: {gap.reason}; owner @{gap.owner}")
        print(f"{'FAIL' if gaps else 'PASS'} harness configuration: {len(checks)} checkers")
        return int(bool(gaps))
    report = audit(root, config, checks, gaps)
    print(f"Local audit report: {report['artifact']}/report.json")
    if args.issue:
        print(update_issue(root, report, config["owner"]))
    print(
        f"{'FAIL' if report['gaps'] else 'PASS'} harness audit: {len(report['gaps'])} gaps; {report['artifact']}"
    )
    return int(bool(report["gaps"]))


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, subprocess.TimeoutExpired, KeyError, TypeError) as error:
        print(f"FAIL harness audit: {error}", file=sys.stderr)
        sys.exit(2)
