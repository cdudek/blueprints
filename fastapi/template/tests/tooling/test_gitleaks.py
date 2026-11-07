"""gitleaks catches a planted key in staged changes and in history; a clean twin passes.

The key is built at run time, so this repository never contains one.
"""

import secrets
import shutil
import string
import subprocess
from pathlib import Path

import pytest
from scripts.quality.git import GIT

GITLEAKS = shutil.which("gitleaks")


def fake_token() -> str:
    alphabet = string.ascii_letters + string.digits
    return "ghp_" + "".join(secrets.choice(alphabet) for _ in range(36))


def run(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    assert GITLEAKS is not None, "install gitleaks 8.30.1 (see README); the secret scan needs it"
    return subprocess.run(
        [GITLEAKS, *args, "--redact", "--no-banner"],
        cwd=repo,
        capture_output=True,
        text=True,
        check=False,
    )


def git(repo: Path, *args: str) -> None:
    subprocess.run(
        [GIT, "-c", "user.name=t", "-c", "user.email=t@example.invalid", *args],
        cwd=repo,
        check=True,
        capture_output=True,
    )


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    git(tmp_path, "init", "-q", "-b", "main")
    (tmp_path / "README.md").write_text("clean\n")
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-q", "-m", "clean")
    return tmp_path


def test_the_pre_commit_hook_stops_a_staged_key(repo: Path) -> None:
    (repo / "client.py").write_text(f'TOKEN = "{fake_token()}"\n')
    git(repo, "add", "client.py")

    result = run(repo, "git", "--pre-commit", "--staged")

    assert result.returncode == 1
    assert "leaks found" in result.stderr


def test_the_history_scan_finds_a_committed_key(repo: Path) -> None:
    (repo / "client.py").write_text(f'TOKEN = "{fake_token()}"\n')
    git(repo, "add", "client.py")
    git(repo, "commit", "-q", "-m", "oops")
    (repo / "client.py").write_text("TOKEN = None\n")
    git(repo, "commit", "-q", "-am", "removed, but still in history")

    assert run(repo, "git").returncode == 1


def test_a_clean_history_passes(repo: Path) -> None:
    assert run(repo, "git").returncode == 0
