"""Writes today's import-contract violations to quality/arch-baseline.toml (brownfield adoption).

A violation of a never-baselinable contract (role doors, no-framework-in-core) is listed and
refused: nothing is written. One line per import pair: the import the source makes, which is the
first link of an indirect chain.

Usage: python -m scripts.arch.baseline
"""

import itertools
import sys
import tempfile
from collections.abc import Iterator, Mapping
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any

from importlinter import configuration
from importlinter.application import use_cases

from scripts.arch.generate import BASELINE, contracts, render
from scripts.arch.policy import ROOT, load_policy


def _is_link(value: Any) -> bool:
    return isinstance(value, Mapping) and {"importer", "imported", "line_numbers"} <= set(value)


def links(metadata: Any) -> Iterator[str]:
    """Import pairs from a contract check: every direct link, and the first link of a chain."""
    if is_dataclass(metadata) and not isinstance(metadata, type):
        metadata = asdict(metadata)
    if _is_link(metadata):
        yield f"{metadata['importer']} -> {metadata['imported']}"
    elif isinstance(metadata, Mapping):
        for value in metadata.values():
            yield from links(value)
    elif isinstance(metadata, list | tuple | set):
        items = list(metadata)
        chain = (
            len(items) > 1
            and all(_is_link(i) for i in items)
            and all(a["imported"] == b["importer"] for a, b in itertools.pairwise(items))
        )
        for item in items[:1] if chain else items:
            yield from links(item)


def broken(config: Path) -> dict[str, set[str]]:
    """Contract name -> violating import pairs, from an import-linter config file."""
    configuration.configure()
    options = use_cases.read_user_options(str(config))
    use_cases._register_contract_types(options)  # the documented CLI does the same before a report
    report = use_cases.create_report(options, cache_dir=None)
    return {
        contract.name: set(links(check.metadata))
        for contract, check in report.get_contracts_and_checks()
        if not check.kept
    }


def main() -> int:
    policy = load_policy()
    ids = {name: (cid, ok) for cid, name, _, _, ok in contracts(policy, ROOT / "src")}
    with tempfile.TemporaryDirectory() as tmp:
        config = Path(tmp) / ".importlinter"
        config.write_text(render(policy, ROOT / "src", {}), encoding="utf-8")
        found = broken(config)
    refused = sorted(name for name in found if not ids[name][1])
    if refused:
        sys.stderr.write("never baselinable, fix these first:\n")
        sys.stderr.write(
            "".join(f"  {name}: {', '.join(sorted(found[name]))}\n" for name in refused)
        )
        return 1
    lines = ["[ignore_imports]\n"] + [
        f'"{ids[name][0]}" = [\n' + "".join(f'    "{pair}",\n' for pair in sorted(pairs)) + "]\n"
        for name, pairs in sorted(found.items(), key=lambda item: ids[item[0]][0])
    ]
    header = BASELINE.read_text(encoding="utf-8").split("[ignore_imports]")[0]
    BASELINE.write_text(header + "".join(lines), encoding="utf-8")
    sys.stdout.write(f"baselined {sum(len(p) for p in found.values())} import pairs\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
