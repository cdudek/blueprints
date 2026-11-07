from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.config.settings import get_settings
from app.main import app

pytestmark = pytest.mark.usefixtures("_app_db")


@pytest.fixture
def _app_db(database_url: str, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_unknown_order_is_a_problem_detail() -> None:
    with TestClient(app) as client:
        response = client.get(
            "/v1/orders/00000000-0000-0000-0000-000000000000", headers={"X-User-Id": "alice"}
        )

    assert response.status_code == 404
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json()["type"] == "urn:problem:order_not_found"


def test_anonymous_caller_is_refused() -> None:
    with TestClient(app) as client:
        response = client.get("/v1/orders/00000000-0000-0000-0000-000000000000")

    assert response.status_code == 401
