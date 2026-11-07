"""Readiness means schema compatibility: the migration the code needs is applied.

Each test gets an empty database migrated to a chosen revision, the way a deploy meets it.
"""

import uuid
from collections.abc import Iterator

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient
from sqlalchemy.engine import URL

from app.config.settings import get_settings
from app.db import schema_history
from app.main import app
from tests.integration.conftest import TEMPLATE_ROOT, admin_execute, migrate

SCRIPTS = ScriptDirectory.from_config(Config(TEMPLATE_ROOT / "alembic.ini"))
REVISIONS = [script.revision for script in reversed(list(SCRIPTS.walk_revisions()))]
OLDER, NEWER = REVISIONS[-2], REVISIONS[-1]


@pytest.fixture
def empty_db(server_url: URL, monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    name = f"test_ready_{uuid.uuid4().hex[:8]}"
    admin_execute(server_url, f'CREATE DATABASE "{name}"')
    url = server_url.set(database=name).render_as_string(hide_password=False)
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    yield url
    get_settings.cache_clear()
    admin_execute(server_url, f'DROP DATABASE "{name}" WITH (FORCE)')


def readyz() -> tuple[int, dict[str, str]]:
    with TestClient(app) as client:
        response = client.get("/readyz")
    return response.status_code, response.json()


def test_the_code_requires_a_known_revision() -> None:
    assert schema_history.REQUIRED_REVISION in REVISIONS


def test_an_old_instance_stays_ready_after_an_expand_migration(
    empty_db: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    migrate(empty_db, NEWER)
    monkeypatch.setattr(schema_history, "REQUIRED_REVISION", OLDER)

    assert readyz() == (200, {"status": "ready"})


def test_a_new_instance_is_not_ready_before_its_migration(
    empty_db: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    migrate(empty_db, OLDER)
    monkeypatch.setattr(schema_history, "REQUIRED_REVISION", NEWER)

    assert readyz() == (503, {"status": "not ready", "reason": f"migration {NEWER} not applied"})


def test_a_new_instance_is_ready_after_its_migration(
    empty_db: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    migrate(empty_db, NEWER)
    monkeypatch.setattr(schema_history, "REQUIRED_REVISION", NEWER)

    assert readyz() == (200, {"status": "ready"})


def test_not_ready_without_a_database(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://app:app@127.0.0.1:1/none")
    get_settings.cache_clear()
    try:
        assert readyz() == (503, {"status": "not ready", "reason": "database unavailable"})
    finally:
        get_settings.cache_clear()
