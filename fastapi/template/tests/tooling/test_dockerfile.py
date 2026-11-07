"""Static checks of the Dockerfile contract; CI builds the images and runs the smoke test."""

import fnmatch
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCKERFILE = (ROOT / "Dockerfile").read_text(encoding="utf-8")


def stage(name: str) -> str:
    return DOCKERFILE.split(f" AS {name}\n", 1)[1].split("\nFROM ", 1)[0]


def test_three_runtime_targets_built_on_one_non_root_runtime() -> None:
    targets = {name: base for base, name in re.findall(r"^FROM (\S+) AS (\S+)$", DOCKERFILE, re.M)}

    assert {targets["web"], targets["worker"], targets["migrate"]} == {"runtime"}
    assert "USER app" in stage("runtime")


def test_base_images_are_pinned_and_uv_matches_the_lock_tooling() -> None:
    images = re.findall(r"^FROM (\S+)", DOCKERFILE, re.MULTILINE)

    assert "ghcr.io/astral-sh/uv:0.12.2" in images
    assert not any(image.endswith(":latest") for image in images)
    assert "uv sync --locked --no-install-project --no-editable" in DOCKERFILE
    assert "UV_NO_DEV=1" in DOCKERFILE


def test_every_command_is_exec_form_with_one_process() -> None:
    for name in ("web", "worker", "migrate"):
        cmd = re.search(r"^CMD (.+)$", stage(name), re.MULTILINE)
        assert cmd, name
        assert isinstance(json.loads(cmd.group(1)), list), f"{name}: exec form"
    assert "--workers" not in DOCKERFILE
    assert "gunicorn" not in DOCKERFILE


def test_every_copied_path_exists_and_passes_dockerignore() -> None:
    allowed = [
        line.removeprefix("!").rstrip("/")
        for line in (ROOT / ".dockerignore").read_text(encoding="utf-8").splitlines()
        if line.startswith("!")
    ]
    sources = [
        source
        for args in re.findall(r"^COPY (?!--from)(?:--\S+ )*(.+) \S+$", DOCKERFILE, re.MULTILINE)
        for source in args.split()
    ]

    assert sources
    for source in sources:
        assert (ROOT / source).exists(), source
        assert any(fnmatch.fnmatch(source, pattern) for pattern in allowed), source
