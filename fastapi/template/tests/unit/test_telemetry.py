import json
import logging
from collections.abc import Iterator

import pytest
import structlog
from fastapi import FastAPI
from fastapi.testclient import TestClient
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from app.api.middleware import request_id
from app.config.logging import configure_logging
from app.config.telemetry import configure_tracing


def small_app() -> FastAPI:
    app = FastAPI()
    app.middleware("http")(request_id)

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        structlog.get_logger("probe").info("probe")
        return {"status": "ok"}

    @app.get("/work")
    async def work() -> dict[str, str]:
        structlog.get_logger("work").info("working")
        return {"status": "done"}

    return app


@pytest.fixture
def restore_logging() -> Iterator[None]:
    root = logging.getLogger()
    handlers, level = root.handlers[:], root.level
    yield
    root.handlers, root.level = handlers, level
    structlog.reset_defaults()


def test_tracing_is_off_without_an_endpoint() -> None:
    assert configure_tracing(small_app(), None) is None


@pytest.mark.usefixtures("restore_logging")
def test_requests_are_traced_and_probes_are_not(capsys: pytest.CaptureFixture[str]) -> None:
    app, exporter = small_app(), InMemorySpanExporter()
    provider = configure_tracing(app, None, exporter=exporter)
    assert provider is not None
    configure_logging("INFO")

    with TestClient(app) as client:
        client.get("/healthz")
        response = client.get("/work", headers={"X-Request-ID": "req-123"})
    provider.force_flush()

    names = [span.name for span in exporter.get_finished_spans()]
    assert any("/work" in name for name in names)
    assert not any("healthz" in name for name in names)
    assert response.headers["x-request-id"] == "req-123"
    work = [json.loads(line) for line in capsys.readouterr().err.splitlines() if "working" in line]
    assert work[0]["request_id"] == "req-123"
    assert len(work[0]["trace_id"]) == 32
    assert len(work[0]["span_id"]) == 16


def test_a_malformed_request_id_is_replaced() -> None:
    with TestClient(small_app()) as client:
        response = client.get("/healthz", headers={"X-Request-ID": "bad id\twith spaces"})

    assert response.headers["x-request-id"] != "bad id\twith spaces"
    assert len(response.headers["x-request-id"]) == 32
