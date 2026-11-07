"""The suppression ratchet: suppressions may not grow, compared with the merge base.

Counts per file and code: lint suppression comments (`noqa`), type-checker ignores, ruff
per-file-ignores entries in pyproject.toml, and the lines of .gitleaksignore. Only real comment
tokens count, never text inside strings. A file absent at the merge base is being adopted and is
not compared. A git error fails closed.

Usage: python scripts/quality/suppressions.py --base <ref>
"""

import argparse
import io
import re
import sys
import tokenize
import tomllib
from collections import Counter
from collections.abc import Callable, Iterable
from pathlib import Path

from scripts.quality.git import current_files, files_at, merge_base, read_at

NOQA = re.compile(r"#\s*noqa\b(?::\s*(?P<codes>[A-Z]+\d+(?:[\s,]+[A-Z]+\d+)*))?")
TYPE_IGNORE = re.compile(r"#\s*type:\s*ignore\b(?:\[(?P<codes>[^\]]+)\])?")
WATCHED = (".py", ".pyi", "pyproject.toml", ".gitleaksignore")


def _codes(match: re.Match[str]) -> list[str]:
    codes = match["codes"]
    return re.split(r"[\s,]+", codes.strip()) if codes else ["*"]


def _python(path: str, text: str) -> Counter[str]:
    counts: Counter[str] = Counter()
    for token in tokenize.generate_tokens(io.StringIO(text).readline):
        if token.type != tokenize.COMMENT:
            continue
        for pattern, kind in ((NOQA, "noqa"), (TYPE_IGNORE, "type-ignore")):
            for match in pattern.finditer(token.string):
                counts.update(f"{path}|{kind}:{code}" for code in _codes(match))
    return counts


def _pyproject(path: str, text: str) -> Counter[str]:
    lint = tomllib.loads(text).get("tool", {}).get("ruff", {}).get("lint", {})
    return Counter(
        f"{path}|per-file-ignores:{glob}:{code}"
        for glob, codes in lint.get("per-file-ignores", {}).items()
        for code in codes
    )


def _gitleaksignore(path: str, text: str) -> Counter[str]:
    lines = [line for line in text.splitlines() if line.strip() and not line.startswith("#")]
    return Counter({f"{path}|gitleaksignore": len(lines)}) if lines else Counter()


def count_file(path: str, text: str) -> Counter[str]:
    if path.endswith((".py", ".pyi")):
        return _python(path, text)
    if path.endswith("pyproject.toml"):
        return _pyproject(path, text)
    if path.endswith(".gitleaksignore"):
        return _gitleaksignore(path, text)
    return Counter()


def count(paths: Iterable[str], read: Callable[[str], str]) -> Counter[str]:
    total: Counter[str] = Counter()
    for path in paths:
        if path.endswith(WATCHED):
            total += count_file(path, read(path))
    return total


def increases(base: Counter[str], now: Counter[str], adopted: set[str]) -> list[str]:
    findings = []
    for key in sorted(now):
        path, what = key.split("|", 1)
        if path not in adopted and now[key] > base[key]:
            findings.append(f"{path}: {what} grew from {base[key]} to {now[key]}")
    return findings


def main(argv: list[str] | None = None, cwd: Path | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0] if __doc__ else None)
    parser.add_argument("--base", required=True, help="the target branch, e.g. origin/main")
    args = parser.parse_args(argv)
    root = cwd or Path.cwd()
    try:
        base_ref = merge_base(args.base, root)
        base_files = files_at(base_ref, root)
        base = count(base_files, lambda path: read_at(base_ref, path, root))
        files = current_files(root)
        now = count(files, lambda path: (root / path).read_text(encoding="utf-8"))
    except (
        RuntimeError,
        OSError,
        SyntaxError,
        tokenize.TokenError,
        tomllib.TOMLDecodeError,
    ) as exc:
        sys.stderr.write(f"suppressions: failing closed: {exc}\n")
        return 2
    findings = increases(base, now, adopted=set(files) - set(base_files))
    for finding in findings:
        sys.stderr.write(f"suppressions: {finding}\n")
    if findings:
        sys.stderr.write(
            "suppressions: fix the code instead; an accepted increase needs a policy-log entry\n"
        )
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
