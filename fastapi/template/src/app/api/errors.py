"""Maps domain errors to problem-detail JSON (RFC 9457)."""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.shared.errors import DomainError, ErrorKind

STATUS_BY_KIND: dict[ErrorKind, int] = {
    "not_found": 404,
    "conflict": 409,
    "invalid": 422,
    "forbidden": 403,
}


def problem(exc: DomainError) -> JSONResponse:
    status = STATUS_BY_KIND[exc.kind]
    return JSONResponse(
        {
            "type": f"urn:problem:{exc.code}",
            "title": exc.code,
            "status": status,
            "detail": exc.detail,
        },
        status_code=status,
        media_type="application/problem+json",
    )


def install(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def domain_error(_request: Request, exc: DomainError) -> JSONResponse:
        return problem(exc)
