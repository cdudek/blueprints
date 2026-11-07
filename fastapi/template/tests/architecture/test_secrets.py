"""Declared secrets, settings, .env.example and the agent rules agree."""

import json
import shutil
import subprocess

from app.config.settings import Settings
from tests.architecture.conftest import TEMPLATE

BASH = shutil.which("bash") or "/bin/bash"


def test_secret_settings_equal_the_manifest() -> None:
    result = subprocess.run(
        [BASH, "tools/common/secrets/secrets", "env-names"],
        cwd=TEMPLATE,
        capture_output=True,
        text=True,
        check=True,
    )

    declared = sorted(result.stdout.split())
    assert declared, "the manifest declares no secret"
    assert declared == sorted(name.upper() for name in Settings.secret_fields())


def test_env_example_lists_every_setting_by_name_without_values() -> None:
    lines = [
        line
        for line in (TEMPLATE / ".env.example").read_text(encoding="utf-8").splitlines()
        if line and not line.startswith("#")
    ]

    assert all(line.endswith("=") for line in lines), "names only, never values"
    assert sorted(line.removesuffix("=") for line in lines) == sorted(
        name.upper() for name in Settings.model_fields
    )


def test_agent_settings_carry_every_common_rule() -> None:
    common = json.loads((TEMPLATE / "tools/common/agents/claude-settings.json").read_text())
    ours = json.loads((TEMPLATE / ".claude/settings.json").read_text())

    assert set(common["permissions"]["deny"]) <= set(ours["permissions"]["deny"])
    assert ours["sandbox"]["enabled"] is True
    assert set(common["sandbox"]["filesystem"]["denyRead"]) <= set(
        ours["sandbox"]["filesystem"]["denyRead"]
    )
