"""Baselines only shrink: quality/arch-baseline.toml may lose lines, never gain one, compared with
the merge base. A file absent at the merge base is being adopted. An added line needs a
policy-log entry with its exact text. An unparseable file or a git error fails closed.

Usage: python -m scripts.quality.baseline_shrinks --base <ref>
"""

import argparse
import sys
import tomllib
from pathlib import Path

from scripts.quality.git import files_at, merge_base, read_at
from scripts.quality.policy_log import logged_changes

BASELINE = "quality/arch-baseline.toml"


def lines(text: str) -> set[str]:
    ignores = tomllib.loads(text).get("ignore_imports", {})
    return {
        f"baseline line added: {cid}: {pair}" for cid, pairs in ignores.items() for pair in pairs
    }


def main(argv: list[str] | None = None, cwd: Path | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True)
    args = parser.parse_args(argv)
    root = cwd or Path.cwd()
    try:
        base = merge_base(args.base, root)
        if BASELINE not in files_at(base, root):
            return 0
        added = lines((root / BASELINE).read_text(encoding="utf-8")) - lines(
            read_at(base, BASELINE, root)
        )
        unlogged = sorted(added - logged_changes(root))
    except (RuntimeError, OSError, ValueError) as exc:  # TOMLDecodeError is a ValueError
        sys.stderr.write(f"baseline-shrinks: failing closed: {exc}\n")
        return 2
    for change in unlogged:
        sys.stderr.write(f"baseline-shrinks: {change}\n")
    return 1 if unlogged else 0


if __name__ == "__main__":
    sys.exit(main())
