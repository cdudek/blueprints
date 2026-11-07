"""Probes, public and left out of access logs and tracing.

`/healthz` checks the process only. `/readyz` checks that the database answers and that the
migration this code needs (`REQUIRED_REVISION`) has been applied: compatibility, not the exact head,
so old instances stay ready while a newer version's expand migration runs.
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.db import schema_history
from app.db.transaction import in_transaction

router = APIRouter(include_in_schema=False)


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz")
async def readyz() -> JSONResponse:
    required = schema_history.REQUIRED_REVISION
    try:
        async with in_transaction() as tx:
            applied = await schema_history.is_applied(tx, required)
    except SQLAlchemyError:
        return JSONResponse({"status": "not ready", "reason": "database unavailable"}, 503)
    if not applied:
        return JSONResponse(
            {"status": "not ready", "reason": f"migration {required} not applied"}, 503
        )
    return JSONResponse({"status": "ready"})
