"""Reflection rules over the running app, each with a violation fixture and a clean twin."""

import importlib

import pytest
from fastapi import FastAPI

from app.db.base import Base
from app.main import app
from app.schema import metadata
from tests.architecture import rules
from tests.architecture.conftest import FIXTURES

# Hand-written until architecture.toml (milestone 3) declares them.
TABLE_OWNERS = {"orders": "orders", "payment_requests": "billing", "schema_history": "db"}
PUBLIC_ROUTES = {"/healthz"}


def test_doors_export_only_operations_schemas_and_errors() -> None:
    assert rules.door_exports("app.modules") == []


def test_door_exports_fixture(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.syspath_prepend(str(FIXTURES / "door_exports" / "bad"))
    monkeypatch.syspath_prepend(str(FIXTURES / "door_exports" / "clean"))

    assert rules.door_exports("door_exports_bad.modules") == [
        "door_exports_bad.modules.orders.find_order: an exported function must carry @operation"
    ]
    assert rules.door_exports("door_exports_ok.modules") == []


def test_every_table_has_one_owner() -> None:
    assert metadata is Base.metadata
    assert rules.table_owners(Base, TABLE_OWNERS) == []


def test_table_owners_fixture(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.syspath_prepend(str(FIXTURES / "table_owners" / "bad"))
    monkeypatch.syspath_prepend(str(FIXTURES / "table_owners" / "clean"))
    importlib.import_module("table_owners_bad.modules.orders.models")
    importlib.import_module("table_owners_ok.modules.orders.models")
    bad = importlib.import_module("table_owners_bad")
    ok = importlib.import_module("table_owners_ok")

    assert rules.table_owners(bad.Base, {"payment_requests": "billing"}) == [
        "table payment_requests: owned by billing but defined by orders"
    ]
    assert rules.table_owners(ok.Base, {"payment_requests": "orders"}) == []


def test_every_route_is_authenticated() -> None:
    assert rules.routes_authenticated(app, PUBLIC_ROUTES) == []
    assert rules.routes_authenticated(app, set()) == [
        "GET /healthz: no require_* dependency and not listed as public"
    ], "the rule sees the routes of included routers"


def test_routes_fixture(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.syspath_prepend(str(FIXTURES / "routes_authenticated" / "bad"))
    monkeypatch.syspath_prepend(str(FIXTURES / "routes_authenticated" / "clean"))
    bad: FastAPI = importlib.import_module("routes_bad").app
    ok: FastAPI = importlib.import_module("routes_ok").app

    assert rules.routes_authenticated(bad, set()) == [
        "GET /v1/orders: no require_* dependency and not listed as public"
    ]
    assert rules.routes_authenticated(ok, {"/gone"}) == ["public route /gone: does not exist"]
    assert rules.routes_authenticated(ok, set()) == []
    assert rules.routes_authenticated(FastAPI(), set()) == [
        "no API routes found: the rule would pass vacuously"
    ]
