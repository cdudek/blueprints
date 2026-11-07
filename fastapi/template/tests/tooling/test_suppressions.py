import subprocess
from collections import Counter
from pathlib import Path

import pytest
from scripts.quality.git import GIT
from scripts.quality.suppressions import count_file, increases, main

NOQA = "# " + "noqa"  # split so this file holds no suppression itself


def test_counts_comment_tokens_per_code_and_never_strings() -> None:
    source = f'x = 1  {NOQA}: E501, S101\ny = "{NOQA}: E501"\nz = f()  # type: ignore[arg-type]\n'

    assert count_file("a.py", source) == Counter(
        {"a.py|noqa:E501": 1, "a.py|noqa:S101": 1, "a.py|type-ignore:arg-type": 1}
    )


def test_a_bare_suppression_counts_as_star() -> None:
    assert count_file("a.py", f"x = 1  {NOQA}\n") == Counter({"a.py|noqa:*": 1})


def test_counts_per_file_ignores_and_gitleaksignore() -> None:
    pyproject = '[tool.ruff.lint.per-file-ignores]\n"tests/**" = ["S101", "S603"]\n'

    assert count_file("pyproject.toml", pyproject) == Counter(
        {
            "pyproject.toml|per-file-ignores:tests/**:S101": 1,
            "pyproject.toml|per-file-ignores:tests/**:S603": 1,
        }
    )
    assert count_file(".gitleaksignore", "# why\nabc:file:rule:1\n") == Counter(
        {".gitleaksignore|gitleaksignore": 1}
    )


def test_an_adopted_file_is_not_compared() -> None:
    now = Counter({"new.py|noqa:E501": 3, "old.py|noqa:E501": 2})
    base = Counter({"old.py|noqa:E501": 1})

    assert increases(base, now, adopted={"new.py"}) == ["old.py: noqa:E501 grew from 1 to 2"]


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
    (tmp_path / "service.py").write_text("x = 1\n")
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-q", "-m", "base")
    return tmp_path


def test_a_new_suppression_in_an_existing_file_fails(
    repo: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (repo / "service.py").write_text(f"x = 1  {NOQA}: E501\n")

    assert main(["--base", "main"], cwd=repo) == 1
    assert "service.py: noqa:E501 grew from 0 to 1" in capsys.readouterr().err


def test_an_unchanged_tree_passes(repo: Path) -> None:
    assert main(["--base", "main"], cwd=repo) == 0


def test_an_unknown_base_fails_closed(repo: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["--base", "no-such-branch"], cwd=repo) == 2
    assert "failing closed" in capsys.readouterr().err
