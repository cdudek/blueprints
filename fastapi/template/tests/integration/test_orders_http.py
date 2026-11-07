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


def test_post_order_places_it_and_reads_back() -> None:
    with TestClient(app) as client:
        headers = {"X-User-Id": "alice"}
        created = client.post(
            "/v1/orders", json={"amount_cents": 900, "currency": "EUR"}, headers=headers
        )
        read = client.get(f"/v1/orders/{created.json()['id']}", headers=headers)

    assert created.status_code == 201
    assert read.json() == created.json()


def test_post_order_refuses_unknown_fields() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/v1/orders",
            json={"amount_cents": 900, "currency": "EUR", "status": "paid"},
            headers={"X-User-Id": "alice"},
        )

    assert response.status_code == 422


def test_the_order_owner_reads_its_payment_and_others_cannot() -> None:
    with TestClient(app) as client:
        created = client.post(
            "/v1/orders",
            json={"amount_cents": 900, "currency": "EUR"},
            headers={"X-User-Id": "alice"},
        ).json()
        own = client.get(f"/v1/orders/{created['id']}/payment", headers={"X-User-Id": "alice"})
        other = client.get(f"/v1/orders/{created['id']}/payment", headers={"X-User-Id": "bob"})

    assert own.status_code == 200
    assert own.json()["status"] == "requested"
    assert other.status_code == 404
