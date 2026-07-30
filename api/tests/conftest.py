import os

import pytest
import pytest_asyncio
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import DATABASE_URL, database_name
from app.db import get_db
from app.main import app

TEST_DATABASE_URL = DATABASE_URL.rsplit("/", 1)[0] + f"/{database_name}_test"
assert TEST_DATABASE_URL != DATABASE_URL, "test DB URL did not diverge from the app DB URL"
assert TEST_DATABASE_URL.endswith("_test"), f"refusing to migrate non-test database: {TEST_DATABASE_URL}"


def _alembic_config() -> Config:
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    # Escape percent signs for ConfigParser (which interprets % as interpolation)
    escaped_url = TEST_DATABASE_URL.replace("%", "%%")
    cfg.set_main_option("sqlalchemy.url", escaped_url)
    return cfg


@pytest.fixture(scope="session", autouse=True)
def _migrate_test_db():
    # Plain (non-async) session-scoped fixture: the async Alembic template
    # manages its own event loop internally via asyncio.run(), which raises
    # if called from a loop pytest-asyncio is already running. Keeping this
    # fixture synchronous avoids that clash.
    cfg = _alembic_config()
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield


@pytest_asyncio.fixture
async def db_session():
    # Each test runs inside one outer transaction that is rolled back at
    # teardown, so committed rows never leak into the next test. The session
    # is bound to that transaction's connection with join_transaction_mode
    # set to "create_savepoint": a commit() inside the code under test
    # releases a savepoint rather than the outer transaction, so the final
    # rollback still discards everything.
    engine = create_async_engine(TEST_DATABASE_URL)
    connection = await engine.connect()
    outer_transaction = await connection.begin()
    session_factory = async_sessionmaker(
        bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
    )
    async with session_factory() as session:
        yield session
    await outer_transaction.rollback()
    await connection.close()
    await engine.dispose()


@pytest_asyncio.fixture
async def async_client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()
