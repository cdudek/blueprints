#!/usr/bin/env python3
"""Synchronize the canonical auditor into a consumer worktree; dry-run by default."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ASSETS = {
    "harness-audit.py": "scripts/harness-audit",
    "legacy-guards-test.py": "scripts/legacy-guards-test.py",
}


def git(root: Path, *args: str) -> bytes:
    return subprocess.check_output(["git", "-C", str(root), *args])


def sync(target: Path, payloads: dict[str, bytes], pin: str, write: bool) -> list[str]:
    """Only the two owned assets and their lock may change; repo commands/owners stay local."""
    if not re.fullmatch(r"[0-9a-f]{40}", pin):
        raise ValueError("A full immutable source commit is required")
    if set(payloads) != set(ASSETS.values()):
        raise ValueError("Only the two canonical executable assets may be synchronized")
    lock = {
        "version": 1,
        "repository": "cdudek/blueprints",
        "pin": pin,
        "source": "core/references",
        "files": {path: hashlib.sha256(data).hexdigest() for path, data in payloads.items()},
    }
    files = {**payloads, ".harness-audit.lock": (json.dumps(lock, indent=2) + "\n").encode()}
    changes = []
    plans = []
    for name, data in files.items():
        path = target / name
        if path.is_symlink() or not path.resolve().is_relative_to(target.resolve()):
            raise ValueError(f"Refusing a linked destination: {name}")
        same = path.is_file() and path.read_bytes() == data
        executable = name.startswith("scripts/")
        if same and (not executable or path.stat().st_mode & 0o111):
            continue
        changes.append(name)
        temporary = path.with_name(path.name + ".audit-sync-tmp")
        if temporary.exists() or temporary.is_symlink():
            raise ValueError(f"A prior sync temporary file needs inspection: {temporary.name}")
        plans.append((path, temporary, data, executable))
    if write:
        staged = []
        try:
            for path, temporary, data, executable in plans:
                path.parent.mkdir(parents=True, exist_ok=True)
                staged.append((path, temporary))
                temporary.write_bytes(data)
                temporary.chmod(0o755 if executable else 0o644)
            for path, temporary in staged:
                temporary.replace(path)
        finally:
            for _, temporary in staged:
                if temporary.exists():
                    temporary.unlink()
    return changes


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", type=Path, help="consumer repository worktree")
    parser.add_argument("--write", action="store_true", help="apply the displayed sync")
    parser.add_argument("--pin", help="merged source commit; defaults to this checkout's HEAD")
    args = parser.parse_args()
    source = Path(__file__).resolve().parent
    source_root = Path(git(source, "rev-parse", "--show-toplevel").decode().strip())
    target = args.target.resolve()
    if Path(git(target, "rev-parse", "--show-toplevel").decode().strip()).resolve() != target:
        raise ValueError("Target must be the consumer worktree root")
    pin = args.pin or git(source_root, "rev-parse", "HEAD").decode().strip()
    if not re.fullmatch(r"[0-9a-f]{40}", pin):
        raise ValueError("A full immutable source commit is required")
    payloads = {}
    for name, destination in ASSETS.items():
        relative = (source / name).relative_to(source_root).as_posix()
        committed = git(source_root, "show", pin + ":" + relative)
        if committed != (source / name).read_bytes():
            raise ValueError(f"Canonical asset differs from source pin: {name}")
        payloads[destination] = committed
    changes = sync(target, payloads, pin, args.write)
    for name in changes:
        print(("SYNC " if args.write else "DRIFT ") + name)
    print(
        f"{'Applied' if args.write else 'Proposed'} {len(changes)} changes; local manifest and gate wiring are preserved"
    )
    return int(bool(changes) and not args.write)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f"FAIL harness sync: {error}", file=sys.stderr)
        sys.exit(2)
