"""The web root: builds the FastAPI app, binds the engine and mounts the routers."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.mount import mount
from app.config.logging import configure_logging
from app.config.settings import get_settings
from app.db.engine import create_engine
from app.db.transaction import bind_engine


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()  # bad settings fail at startup
    configure_logging(settings.log_level)
    engine = create_engine(settings.database_url)
    bind_engine(engine)
    yield
    await engine.dispose()


app = FastAPI(title="FastAPI blueprint", version="1.0.0", lifespan=lifespan)
mount(app)
