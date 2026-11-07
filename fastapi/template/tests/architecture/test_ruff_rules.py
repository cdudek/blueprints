"""The guarantees ruff carries: each fixture fails with the exact message, its twin passes."""

import subprocess
import sys
from pathlib import Path

import pytest

from tests.architecture.conftest import FIXTURES, TEMPLATE

CASES = {
    "blocking_call": (
        "ASYNC",
        "tests/fixtures/arch/blocking_call/bad.py:5:5: ASYNC251 Async functions should not "
        "call `time.sleep`",
    ),
    "env_reads": (
        "TID251",
        "tests/fixtures/arch/env_reads/bad.py:3:16: TID251 `os.environ` is banned: Read "
        "settings through app.config.settings; only config/ reads the environment.",
    ),
}


RUFF = Path(sys.executable).with_name("ruff")  # the pinned ruff in this environment


def ruff(select: str, path: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            RUFF,
            "check",
            "--no-cache",
            "--output-format",
            "concise",
            "--select",
            select,
            path,
        ],
        cwd=TEMPLATE,
        capture_output=True,
        text=True,
        check=False,
    )


@pytest.mark.parametrize("name", CASES)
def test_the_fixture_fails_with_the_exact_message(name: str) -> None:
    select, message = CASES[name]

    result = ruff(select, f"tests/fixtures/arch/{name}/bad.py")

    assert result.returncode == 1
    assert result.stdout.splitlines()[0] == message


@pytest.mark.parametrize("name", CASES)
def test_the_clean_twin_passes(name: str) -> None:
    select, _ = CASES[name]

    assert ruff(select, f"tests/fixtures/arch/{name}/clean.py").returncode == 0
    assert (FIXTURES / name / "clean.py").is_file()
