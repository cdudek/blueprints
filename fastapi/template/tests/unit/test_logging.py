import json
import logging
from collections.abc import Iterator

import pytest
import structlog
from pydantic import SecretStr

from app.config.logging import MASK, configure_logging

PLANTED = "planted-value-that-must-never-appear"


@pytest.fixture
def json_logs() -> Iterator[None]:
    """Restores logging afterwards. Each test configures inside its body, where capsys's stream
    is the one the handler must bind to."""
    root = logging.getLogger()
    handlers, level = root.handlers[:], root.level
    yield
    root.handlers, root.level = handlers, level
    structlog.reset_defaults()


@pytest.mark.usefixtures("json_logs")
def test_sensitive_keys_and_secret_values_are_masked(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging("INFO")
    structlog.get_logger("app").info(
        "charging", authorization=f"Bearer {PLANTED}", amount_cents=100
    )
    logging.getLogger("app.billing").warning(
        "provider call",
        extra={
            "payments_api_key": PLANTED,
            "value": SecretStr(PLANTED),
            "nested": {"Cookie": PLANTED},
        },
    )

    out = capsys.readouterr().err
    assert PLANTED not in out
    first, second = (json.loads(line) for line in out.splitlines())
    assert first["authorization"] == MASK
    assert first["amount_cents"] == 100
    assert second["payments_api_key"] == MASK
    assert second["value"] == MASK
    assert second["nested"] == {"Cookie": MASK}


@pytest.mark.usefixtures("json_logs")
def test_probe_requests_stay_out_of_the_access_log(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging("INFO")
    access = logging.getLogger("uvicorn.access")
    access.info('%s - "%s %s HTTP/1.1" %d', "10.0.0.1", "GET", "/healthz", 200)
    access.info('%s - "%s %s HTTP/1.1" %d', "10.0.0.1", "GET", "/v1/orders", 200)

    lines = capsys.readouterr().err.splitlines()
    assert len(lines) == 1
    assert "/v1/orders" in lines[0]
