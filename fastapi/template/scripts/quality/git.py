"""Thin git helpers for the quality scripts. Any git error raises: callers fail closed."""

import shutil
import subprocess
from pathlib import Path

GIT = shutil.which("git") or "git"


def git(*args: str, cwd: Path) -> str:
    result = subprocess.run([GIT, *args], cwd=cwd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout


def merge_base(base: str, cwd: Path) -> str:
    return git("merge-base", "HEAD", base, cwd=cwd).strip()


def files_at(ref: str, cwd: Path) -> list[str]:
    """Paths relative to `cwd` as they were at `ref`."""
    return git("ls-tree", "-r", "--name-only", ref, ".", cwd=cwd).splitlines()


def read_at(ref: str, path: str, cwd: Path) -> str:
    return git("show", f"{ref}:./{path}", cwd=cwd)


def current_files(cwd: Path) -> list[str]:
    """Tracked and new files, without ignored ones."""
    listed = git("ls-files", "--cached", "--others", "--exclude-standard", cwd=cwd).splitlines()
    return [path for path in listed if (cwd / path).is_file()]
