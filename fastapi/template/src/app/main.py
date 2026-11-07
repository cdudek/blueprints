"""The web root: builds the FastAPI app and mounts the routers."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import health
from app.config.settings import get_settings


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    get_settings()  # a bad configuration fails at startup, not on the first request
    yield


app = FastAPI(title="FastAPI blueprint", version="1.0.0", lifespan=lifespan)
app.include_router(health.router)
