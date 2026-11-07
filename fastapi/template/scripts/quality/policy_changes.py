"""The policy never loosens silently. Compared with the merge base, every loosening of
architecture.toml or of the lint and type settings in pyproject.toml is listed; one without a
policy-log entry carrying its exact text fails. A file absent at the merge base is being adopted.
Baseline lines and suppression counts have their own checks (baseline_shrinks, suppressions).

Usage: python -m scripts.quality.policy_changes --base <ref>
"""

import argparse
import sys
import tomllib
from pathlib import Path
from typing import Any

from scripts.quality.git import files_at, merge_base, read_at
from scripts.quality.policy_log import logged_changes

# ruff's defaults for the size and complexity rules the template selects.
THRESHOLDS = {
    ("mccabe", "max-complexity"): 10,
    ("pylint", "max-args"): 5,
    ("pylint", "max-branches"): 12,
    ("pylint", "max-returns"): 6,
    ("pylint", "max-statements"): 50,
    ("pylint", "max-positional-args"): 5,
}


def _added(kind: str, base: list[Any], now: list[Any]) -> list[str]:
    return [f"{kind} added: {item}" for item in now if item not in base]


def _removed(kind: str, base: list[Any], now: list[Any]) -> list[str]:
    return [f"{kind} removed: {item}" for item in base if item not in now]


def _allowed_imports(layers: list[list[str]]) -> list[str]:
    return [
        f"{upper} -> {lower}"
        for i, layer in enumerate(layers)
        for upper in layer
        for below in layers[i + 1 :]
        for lower in below
    ]


def architecture_loosenings(base: dict[str, Any], now: dict[str, Any]) -> list[str]:
    changes = _added("public route", base.get("public_routes", []), now.get("public_routes", []))
    changes += _added(
        "composition root", base.get("composition_roots", []), now.get("composition_roots", [])
    )
    changes += _added(
        "layer edge",
        _allowed_imports(base.get("layers", [])),
        _allowed_imports(now.get("layers", [])),
    )
    for role, door in now.get("role_doors", {}).items():
        before = base.get("role_doors", {}).get(role)
        if before is None:
            continue
        changes += _added(f"{role} door importer", before["importers"], door["importers"])
        if door.get("module_may_import") and not before.get("module_may_import"):
            changes.append(f"{role} door: its own module may now import it")
    for section in ("rules", "core"):
        changes += _removed(
            f"{section} forbidden import",
            base.get(section, {}).get("forbidden", []),
            now.get(section, {}).get("forbidden", []),
        )
    changes += _removed("module", list(base.get("modules", {})), list(now.get("modules", {})))
    return changes


def _get(data: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        data = data.get(key, {}) if isinstance(data, dict) else {}
    return data


def lint_loosenings(base: dict[str, Any], now: dict[str, Any]) -> list[str]:
    lint_base, lint_now = _get(base, "tool", "ruff", "lint"), _get(now, "tool", "ruff", "lint")
    changes = []
    for (group, key), default in THRESHOLDS.items():
        before = _get(lint_base, group).get(key, default)
        after = _get(lint_now, group).get(key, default)
        if after > before:
            changes.append(f"lint threshold raised: {group}.{key} {before} -> {after}")
    changes += _removed("ruff rule family", lint_base.get("select", []), lint_now.get("select", []))
    changes += _added(
        "ruff exclude",
        _get(base, "tool", "ruff").get("extend-exclude", []),
        _get(now, "tool", "ruff").get("extend-exclude", []),
    )
    mypy_base, mypy_now = _get(base, "tool", "mypy"), _get(now, "tool", "mypy")
    if mypy_base.get("strict") and not mypy_now.get("strict"):
        changes.append("mypy strict disabled")
    changes += _added("mypy exclude", mypy_base.get("exclude", []), mypy_now.get("exclude", []))
    deptry_base = _get(base, "tool", "deptry", "per_rule_ignores")
    for rule, packages in _get(now, "tool", "deptry", "per_rule_ignores").items():
        changes += _added(f"deptry {rule} ignore", deptry_base.get(rule, []), packages)
    return changes


CHECKS = {"architecture.toml": architecture_loosenings, "pyproject.toml": lint_loosenings}


def main(argv: list[str] | None = None, cwd: Path | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True)
    args = parser.parse_args(argv)
    root = cwd or Path.cwd()
    try:
        base = merge_base(args.base, root)
        tracked = set(files_at(base, root))
        changes = []
        for name, check in CHECKS.items():
            if name in tracked and (root / name).exists():
                changes += check(
                    tomllib.loads(read_at(base, name, root)),
                    tomllib.loads((root / name).read_text(encoding="utf-8")),
                )
        logged = logged_changes(root)
    except (RuntimeError, OSError, ValueError) as exc:  # TOMLDecodeError is a ValueError
        sys.stderr.write(f"policy-changes: failing closed: {exc}\n")
        return 2
    for change in changes:
        state = "logged" if change in logged else "NOT LOGGED"
        sys.stderr.write(f"policy-changes: {change} ({state})\n")
    return 1 if any(change not in logged for change in changes) else 0


if __name__ == "__main__":
    sys.exit(main())
