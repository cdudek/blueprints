"""Writes openapi.json, the HTTP contract snapshot (`make openapi`). A unit test fails on drift."""

import json
from pathlib import Path

from app.main import app

SNAPSHOT = Path(__file__).resolve().parents[1] / "openapi.json"


def render() -> str:
    return json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n"


if __name__ == "__main__":
    SNAPSHOT.write_text(render(), encoding="utf-8")
