"""Mounts every router and error handler. The only importer of `router.py` doors."""

from fastapi import FastAPI

from app.api import errors, health
from app.modules.orders import router as orders_router


def mount(app: FastAPI) -> None:
    errors.install(app)
    app.include_router(health.router)
    app.include_router(orders_router.router)
