"""Generates .importlinter from architecture.toml and quality/arch-baseline.toml.

Door contracts protect every file of a module except its doors, read from the module folders, so a
new file is covered as soon as it exists. `--check` fails when the file differs from the output.

Usage: python -m scripts.arch.generate [--check]
"""

import argparse
import json
import sys
import tomllib
from collections.abc import Iterator
from pathlib import Path

from scripts.arch.policy import ROOT, Policy, load_policy

TARGET = ROOT / ".importlinter"
SCHEMA = ROOT / "architecture.schema.json"
BASELINE = ROOT / "quality" / "arch-baseline.toml"
HEADER = (
    "# Generated from architecture.toml by `make arch-generate`. Do not edit: a test fails when\n"
    "# this file and the policy disagree. Baselines come from quality/arch-baseline.toml.\n"
)


def _humanize(names: list[str]) -> str:
    return names[0] if len(names) == 1 else f"{', '.join(names[:-1])} and {names[-1]}"


def _block(key: str, values: list[str]) -> str:
    return f"{key} =\n" + "".join(f"    {value}\n" for value in values)


def _module_files(policy: Policy, src: Path, name: str) -> list[str]:
    doors = {"__init__", *policy.modules[name].role_doors}
    folder = src / policy.root_package / "modules" / name
    return sorted(path.stem for path in folder.glob("*.py") if path.stem not in doors)


type Contract = tuple[str, str, str, dict[str, list[str]], bool]


def contracts(policy: Policy, src: Path) -> Iterator[Contract]:
    """(id, name, type, options, baselinable) for every contract, in file order. Role doors and
    no-framework-in-core are never baselinable."""
    root = policy.root_package

    def app(name: str) -> str:
        return f"{root}.{name}"

    yield (
        "layers",
        "Dependencies point one way: roots, api, workflows, modules, infrastructure",
        "layers",
        {"layers": [" | ".join(app(n) for n in layer) for layer in policy.layers]},
        True,
    )
    for name in policy.modules:
        yield (
            f"{name}-door",
            f"Other code enters {name} only through its door",
            "protected",
            {
                "protected_modules": [
                    app(f"modules.{name}.{f}") for f in _module_files(policy, src, name)
                ],
                "allowed_importers": [
                    app(f"modules.{name}"),
                    *(app(r) for r in policy.composition_roots),
                ],
            },
            True,
        )
    for role, door in policy.role_doors.items():
        owners = [n for n, m in policy.modules.items() if role in m.role_doors]
        importers = [app(i) for i in door.importers]
        if not door.module_may_import:
            yield (
                f"{role}-doors",
                f"{role.capitalize()} doors are imported only by {_humanize(importers)}",
                "protected",
                {
                    "protected_modules": [app(f"modules.{n}.{role}") for n in owners],
                    "allowed_importers": importers,
                },
                False,
            )
            continue
        for name in owners:
            yield (
                f"{name}-{role}-door",
                f"{name}.{role} is imported only by {_humanize([name, *importers])}",
                "protected",
                {
                    "protected_modules": [app(f"modules.{name}.{role}")],
                    "allowed_importers": [app(f"modules.{name}"), *importers],
                },
                False,
            )
    yield (
        "rules-pure",
        "rules.py imports no framework, I/O or infrastructure, directly or indirectly",
        "forbidden",
        {
            "source_modules": [app(f"modules.{n}.rules") for n in policy.modules],
            "forbidden_modules": policy.rules.forbidden,
        },
        True,
    )
    yield (
        "no-framework-in-core",
        "service, repository and rules do not import the web framework",
        "forbidden",
        {
            "source_modules": [
                app(f"modules.{n}.{part}")
                for n in policy.modules
                for part in ("service", "repository", "rules")
            ],
            "forbidden_modules": policy.core.forbidden,
        },
        False,
    )


def load_baseline(path: Path = BASELINE) -> dict[str, list[str]]:
    if not path.exists():
        return {}
    ignores: dict[str, list[str]] = tomllib.loads(path.read_text(encoding="utf-8")).get(
        "ignore_imports", {}
    )
    return ignores


def render(policy: Policy, src: Path, baseline: dict[str, list[str]]) -> str:
    out = [
        HEADER,
        "\n[importlinter]\n",
        f"root_package = {policy.root_package}\n",
        "include_external_packages = True\n",
    ]
    known = set()
    for contract_id, name, kind, options, baselinable in contracts(policy, src):
        known.add(contract_id)
        out += [
            f"\n[importlinter:contract:{contract_id}]\n",
            f"name = {name}\n",
            f"type = {kind}\n",
        ]
        out += [_block(key, values) for key, values in options.items()]
        if baseline.get(contract_id):
            if not baselinable:
                raise ValueError(f"baseline: {contract_id} is never baselinable")
            out.append(_block("ignore_imports", sorted(baseline[contract_id])))
    if unknown := sorted(set(baseline) - known):
        raise ValueError(f"baseline: no contract named {', '.join(unknown)}")
    return "".join(out)


def write_schema() -> str:
    """The editor schema of architecture.toml, from the pydantic model."""
    return json.dumps(Policy.model_json_schema(), indent=2, sort_keys=True) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="fail when .importlinter differs")
    args = parser.parse_args(argv)
    outputs = {TARGET: render(load_policy(), ROOT / "src", load_baseline()), SCHEMA: write_schema()}
    if args.check:
        stale = [p.name for p, text in outputs.items() if p.read_text(encoding="utf-8") != text]
        for name in stale:
            sys.stderr.write(f"{name} differs from architecture.toml: run make arch-generate\n")
        return 1 if stale else 0
    for path, text in outputs.items():
        path.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
