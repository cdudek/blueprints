"""JSON logs through structlog, for app code and for stdlib loggers alike.

Values under a sensitive key, and every `SecretStr`, are masked before rendering. Free text in a
message is not inspected: never put a secret into a message. Probes are left out of access logs.
"""

import logging
import re
from collections.abc import MutableMapping
from typing import Any

import structlog
from pydantic import SecretStr

from app.config.telemetry import add_trace_ids

SENSITIVE = re.compile(r"password|secret|token|api_key|authorization|cookie", re.IGNORECASE)
MASK = "[redacted]"
PROBES = ("/healthz", "/readyz")


def _mask(key: str, value: Any) -> Any:
    if isinstance(value, SecretStr) or SENSITIVE.search(key):
        return MASK
    if isinstance(value, dict):
        return {k: _mask(str(k), v) for k, v in value.items()}
    return value


def redact(_logger: Any, _method: str, event: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    return {key: _mask(key, value) for key, value in event.items()}


class _NoProbes(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return not any(f" {probe} " in record.getMessage() for probe in PROBES)


def configure_logging(level: str = "INFO") -> None:
    shared: list[Any] = [
        structlog.contextvars.merge_contextvars,
        add_trace_ids,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.stdlib.ExtraAdder(),
        redact,
    ]
    structlog.configure(
        processors=[*shared, structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
    handler = logging.StreamHandler()
    handler.setFormatter(
        structlog.stdlib.ProcessorFormatter(
            foreign_pre_chain=shared,
            processors=[
                structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                structlog.processors.format_exc_info,
                structlog.processors.JSONRenderer(),
            ],
        )
    )
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logging.getLogger(name).handlers.clear()
        logging.getLogger(name).propagate = True
    logging.getLogger("uvicorn.access").addFilter(_NoProbes())
