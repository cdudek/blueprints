"""The one engine factory. Every process (web, worker, migrate, tests) builds its engine here."""

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine


def create_engine(url: str) -> AsyncEngine:
    return create_async_engine(url, pool_pre_ping=True)
