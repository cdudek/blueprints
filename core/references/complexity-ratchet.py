#!/usr/bin/env python3
"""CQ-19: exact function fingerprints; changed hotspots must become simpler.

Usage: python3 scripts/complexity-ratchet.py [--base TREE] [--record]
Policy: .fitness/complexity.json (paths, exclude); baseline: complexity-baseline.json.
Lizard is a required local tool. No source or environment file is executed.
"""

import argparse
import csv
import fnmatch
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess

BASELINE = Path(".fitness/complexity-baseline.json")
POLICY = Path(".fitness/complexity.json")


def included(file, root, policy):
    relative = file.relative_to(root).as_posix()
    if file.suffix not in {".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", ".swift"}:
        return False
    if any(part.startswith(".env") for part in file.parts):
        return False
    if any(fnmatch.fnmatch(relative, pattern) for pattern in policy.get("exclude", [])):
        return False
    return file.is_file() and not file.is_symlink()


def source_files(root, policy):
    files = []
    for folder in policy["paths"]:
        path = root / folder
        if not path.exists():
            raise ValueError(f"missing complexity source path: {folder}")
        candidates = [path] if path.is_file() else path.rglob("*")
        for file in candidates:
            if included(file, root, policy):
                files.append(file.relative_to(root).as_posix())
    return sorted(set(files))


def collect(root, policy):
    # Lizard's CSV includes file, full symbol, start and end, with quoted paths.
    files = source_files(root, policy)
    result = (
        subprocess.run(
            [os.environ.get("LIZARD", "lizard"), "--csv", *sorted(set(files))],
            cwd=root,
            capture_output=True,
            text=True,
            check=True,
        )
        if files
        else None
    )
    rows, seen = {}, {}
    for row in csv.reader(io.StringIO(result.stdout if result else "")):
        file, symbol = row[6], row[8]
        identity = (file, symbol)
        seen[identity] = seen.get(identity, 0) + 1
        # Occurrence is part of the symbol for overloads and anonymous functions.
        key = f"{file}|{symbol}#{seen[identity]}"
        metric = int(row[1])
        if metric <= 10:
            continue
        source = (root / file).read_text().splitlines(keepends=True)
        body = "".join(source[int(row[9]) - 1 : int(row[10])])
        rows[key] = {
            "file": file,
            "symbol": f"{symbol}#{seen[identity]}",
            "metric": metric,
            "sha256": hashlib.sha256(body.encode()).hexdigest(),
        }
    return rows


def compare(current, previous, label):
    problems = []
    for key, finding in current.items():
        old = previous.get(key)
        if old is None:
            problems.append(f"{label}: new complex function {key}")
        elif finding["metric"] > old["metric"]:
            problems.append(f"{label}: complexity rose for {key}")
        elif finding["metric"] == old["metric"] and finding["sha256"] != old["sha256"]:
            problems.append(
                f"{label}: changed complex function must get simpler: {key}"
            )
    return problems


def read_baseline(path):
    data = json.loads(path.read_text())
    if data.get("version") != 1 or not isinstance(data.get("functions"), dict):
        raise ValueError(f"invalid complexity baseline: {path}")
    for key, row in data["functions"].items():
        if key != f"{row['file']}|{row['symbol']}" or row["metric"] <= 10:
            raise ValueError(f"invalid fingerprint: {key}")
        if len(row["sha256"]) != 64:
            raise ValueError(f"invalid function digest: {key}")
    return data["functions"]


def verify(current, baseline, path, base, policy, record):
    problems = compare(current, baseline, "CQ-19") if path.exists() else []
    if base:
        base = base.resolve()
        previous = (
            read_baseline(base / BASELINE)
            if (base / BASELINE).exists()
            else collect(base, policy)
        )
        problems += compare(
            current if record else baseline, previous, "baseline may only shrink"
        )
        # Compare actual base source too: stale allowances cannot resurrect deleted debt.
        problems += compare(current, collect(base, policy), "merge base")
    if problems:
        raise ValueError("\n".join(problems))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--base", type=Path)
    parser.add_argument("--record", action="store_true")
    args = parser.parse_args()
    root = args.root.resolve()
    policy = json.loads((root / POLICY).read_text())
    current = collect(root, policy)
    path = root / BASELINE
    baseline = read_baseline(path) if path.exists() else {}
    verify(current, baseline, path, args.base, policy, args.record)
    if args.record:
        path.parent.mkdir(exist_ok=True)
        path.write_text(
            json.dumps({"version": 1, "functions": current}, indent=2, sort_keys=True)
            + "\n"
        )
    elif not path.exists():
        raise ValueError(
            "complexity baseline missing; record it from the merge base first"
        )
    elif baseline != current:
        raise ValueError(
            "complexity baseline has stale allowances; run --record to shrink it"
        )
    print(
        f"PASS CQ-19: {len(current)} exact hotspots; max {max((r['metric'] for r in current.values()), default=0)}"
    )


if __name__ == "__main__":
    main()
