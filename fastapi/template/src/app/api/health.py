"""Probes. `/healthz` checks the process only."""

from fastapi import APIRouter

router = APIRouter(include_in_schema=False)


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
