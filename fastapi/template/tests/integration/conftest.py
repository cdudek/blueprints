"""Real Postgres. The server comes from DATABASE_URL (the compose database locally, a service
container in CI). One migrated template database per session; each test module gets its own clone
(`CREATE DATABASE ... TEMPLATE`), dropped afterwards.

- `tx`: a transaction per test, rolled back. For repository and service tests.
- `bound_db`: binds `in_transaction()` to the module's database; data really commits. For
  workflow, worker and concurrency tests, where a second connection must see the data.
"""

import uuid
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from procrastinate import App
from sqlalchemy import create_engine as create_sync_engine
from sqlalchemy import text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app import worker
from app.clients.payments import get_payments
from app.clients.payments.providers.fixture import FixturePayments
from app.config.settings import get_settings
from app.db.engine import create_engine
from app.db.transaction import Tx, bind_engine

TEMPLATE_ROOT = Path(__file__).resolve().parents[2]


def _admin_execute(server: URL, *statements: str) -> None:
    engine = create_sync_engine(server.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with engine.connect() as conn:
        for statement in statements:
            conn.execute(text(statement))
    engine.dispose()


def migrate(url: str, revision: str = "head") -> None:
    cfg = Config(TEMPLATE_ROOT / "alembic.ini")
    cfg.attributes["database_url"] = url
    cfg.attributes["configure_logger"] = False
    command.upgrade(cfg, revision)


@pytest.fixture(scope="session")
def server_url() -> URL:
    return make_url(get_settings().database_url)


@pytest.fixture(scope="session")
def template_db(server_url: URL) -> Iterator[str]:
    name = f"test_template_{uuid.uuid4().hex[:8]}"
    _admin_execute(server_url, f'CREATE DATABASE "{name}"')
    url = server_url.set(database=name)
    migrate(url.render_as_string(hide_password=False))
    yield name
    _admin_execute(server_url, f'DROP DATABASE "{name}" WITH (FORCE)')


@pytest.fixture(scope="module")
def database_url(server_url: URL, template_db: str) -> Iterator[str]:
    name = f"test_{uuid.uuid4().hex[:12]}"
    _admin_execute(server_url, f'CREATE DATABASE "{name}" TEMPLATE "{template_db}"')
    yield server_url.set(database=name).render_as_string(hide_password=False)
    _admin_execute(server_url, f'DROP DATABASE "{name}" WITH (FORCE)')


@pytest.fixture
async def engine(database_url: str) -> AsyncIterator[AsyncEngine]:
    engine = create_engine(database_url)
    yield engine
    await engine.dispose()


@pytest.fixture
async def tx(engine: AsyncEngine) -> AsyncIterator[Tx]:
    async with engine.connect() as conn:
        outer = await conn.begin()
        session = AsyncSession(
            bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False
        )
        yield Tx(session)
        await session.close()
        await outer.rollback()


@pytest.fixture
def bound_db(engine: AsyncEngine) -> AsyncEngine:
    bind_engine(engine)
    return engine


@pytest.fixture
def payments() -> Iterator[FixturePayments]:
    """The process-wide fixture provider, fresh per test: the oracle of charges."""
    get_payments.cache_clear()
    provider = get_payments()
    assert isinstance(provider, FixturePayments)
    yield provider
    get_payments.cache_clear()


@pytest.fixture
async def jobs(
    bound_db: AsyncEngine, database_url: str, monkeypatch: pytest.MonkeyPatch
) -> AsyncIterator[App]:
    """The worker's app, opened on this module's database."""
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()
    async with worker.app.open_async():
        yield worker.app
    get_settings.cache_clear()


async def run_worker(app: App) -> None:
    """Runs every job that is due, then returns."""
    await app.run_worker_async(wait=False, install_signal_handlers=False, listen_notify=False)
