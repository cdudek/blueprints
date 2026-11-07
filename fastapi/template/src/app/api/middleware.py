"""Request IDs: taken from `X-Request-ID` when it is well formed, generated otherwise, bound to
every log line of the request and returned in the response."""

import re
import uuid
from collections.abc import Awaitable, Callable

import structlog
from fastapi import Request, Response

VALID = re.compile(r"[A-Za-z0-9._-]{1,64}")


async def request_id(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    incoming = request.headers.get("x-request-id", "")
    rid = incoming if VALID.fullmatch(incoming) else uuid.uuid4().hex
    with structlog.contextvars.bound_contextvars(request_id=rid):
        response = await call_next(request)
    response.headers["x-request-id"] = rid
    return response
