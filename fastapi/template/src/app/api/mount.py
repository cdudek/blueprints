"""Mounts every router and error handler. The only importer of `router.py` doors."""

from fastapi import FastAPI

from app.api import errors, health, orders
from app.api.middleware import request_id
from app.modules.billing import router as billing_router
from app.modules.orders import router as orders_router


def mount(app: FastAPI) -> None:
    errors.install(app)
    app.middleware("http")(request_id)
    app.include_router(health.router)
    app.include_router(orders.router)
    app.include_router(orders_router.router)
    app.include_router(billing_router.router)
