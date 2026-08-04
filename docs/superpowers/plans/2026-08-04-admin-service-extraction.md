# Admin Service Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull the admin panel's backend (bootstrap + 5 admin endpoints) out of `api` into a new standalone `admin-service/`, matching the shape of this repo's other real standalone services (`risk-scoring/`, `ledger-monitoring/`, `sanctions-adapter/`) — own venv, own tests, own process — while keeping `api` as the sole owner of the shared database schema and the sole issuer of login tokens.

**Architecture:** `admin-service` gets its own minimal copies of the `User`/`Organization`/`Trade`/`KybCheck` SQLAlchemy models, pointed at the exact same Postgres database `api` already owns (same `DATABASE_URL`), and its own JWT decode logic trusting the same `jwt_secret` as `api` (shared via env var) — so a token minted by `api`'s existing `POST /auth/login` is valid here too, with zero changes to login/signup. `admin-service` runs no migrations of its own; `api`'s alembic remains the single schema owner. The frontend keeps living in `web/` unchanged in structure — only `web/src/api/admin.ts` retargets its HTTP calls at the new service's base URL instead of `api`'s.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 async + pytest (new `admin-service`, matching `api`'s stack minus Alembic); React + TypeScript + Vite + Vitest (frontend, unchanged stack).

## Global Constraints

- `admin-service` owns no migrations. `api`'s alembic remains the sole schema owner for `users`/`organizations`/`trades`/`kyb_checks`. `admin-service`'s test suite requires `api`'s migrations to already be applied to the shared `utfl_test` database — run `api`'s own test suite (or `alembic upgrade head` from `api/`) at least once before running `admin-service`'s tests for the first time in a fresh environment.
- `admin-service` trusts the same `jwt_secret` as `api` (same env var, same default `"dev-secret-change-in-production"`) and never issues tokens itself — `POST /auth/login` stays in `api` as the platform's sole identity provider.
- This is a pure relocation: no route, request/response shape, or auth semantic changes. Every existing behavior (403 for non-admins, 404 for unknown org ids, the partial-unique-index race protection on bootstrap, the safe-by-accident `NULL` org_id semantics on `api`'s pre-existing endpoints) must be preserved exactly.
- The frontend's page-level code (`AdminOrganizationsPage.tsx`, `AdminUsersPage.tsx`, `AdminTradesPage.tsx`, `AdminShell.tsx`, `RoleGates.tsx`) does not change — only `web/src/api/admin.ts`'s HTTP target changes, via `web/src/api/client.ts`.
- `admin-service` runs on port **8001** (`api` is 8000, `risk-scoring` is 8002, `ledger-monitoring` is 8090 — 8001 is free).

---

### Task 1: Scaffold `admin-service` — config, db, models, schemas, auth, health check

**Files:**
- Create: `admin-service/requirements.txt`
- Create: `admin-service/requirements-dev.txt`
- Create: `admin-service/pytest.ini`
- Create: `admin-service/.env.example`
- Create: `admin-service/app/__init__.py`
- Create: `admin-service/app/config.py`
- Create: `admin-service/app/db.py`
- Create: `admin-service/app/models.py`
- Create: `admin-service/app/schemas.py`
- Create: `admin-service/app/auth.py`
- Create: `admin-service/app/main.py`
- Create: `admin-service/tests/conftest.py`
- Create: `admin-service/tests/test_health.py`
- Modify: `.gitignore` (repo root)

**Interfaces:**
- Produces: `app.config.settings` (`jwt_secret: str`, `admin_bootstrap_secret: str | None`), `app.config.DATABASE_URL`/`database_name`, `app.db.get_db`, `app.models.{User, Organization, Trade, KybCheck}`, `app.schemas.{OrganizationOut, KybCheckOut, UserOut, TradeOut, AdminBootstrapRequest, AdminKybStatusUpdate}`, `app.auth.{hash_password, verify_password, decode_access_token, get_current_admin_user}`, `app.main.app`. Task 2 imports all of these by these exact names.

- [ ] **Step 1: Create the requirements files**

Create `admin-service/requirements.txt`:

```
fastapi==0.115.0
uvicorn[standard]==0.32.0
sqlalchemy==2.0.35
asyncpg==0.29.0
pydantic==2.9.2
pydantic-settings==2.5.2
email-validator==2.3.0
bcrypt==4.2.0
pyjwt==2.9.0
```

Create `admin-service/requirements-dev.txt`:

```
-r requirements.txt
pytest==8.3.3
pytest-asyncio==0.24.0
python-dotenv==1.2.2
httpx==0.27.2
```

- [ ] **Step 2: Create `pytest.ini`**

Create `admin-service/pytest.ini`:

```ini
[pytest]
pythonpath = .
asyncio_mode = auto
```

- [ ] **Step 3: Create `.env.example`**

Create `admin-service/.env.example`:

```
HOST=localhost
DB_USERNAME=postgres
DB_PASSWORD=postgres
DATABASE_NAME=utfl

# Must match the JWT_SECRET configured for the api service exactly -- this
# service trusts tokens minted by api's POST /auth/login.
# JWT_SECRET=change-me-in-production

# Bootstrapping the first platform admin account:
#   1. Set ADMIN_BOOTSTRAP_SECRET to a random value and restart this service.
#   2. Call POST /admin/bootstrap once with that secret to create the
#      PLATFORM_ADMIN account.
#   3. Unset ADMIN_BOOTSTRAP_SECRET (or remove it from .env) and restart.
#      The endpoint is unauthenticated and stays live forever otherwise: with
#      the wrong secret it 403s, with the right one (after an admin already
#      exists) it 409s, which makes it a permanent oracle for confirming a
#      guessed secret if left configured.
# ADMIN_BOOTSTRAP_SECRET=
```

- [ ] **Step 4: Create `app/__init__.py`**

Create `admin-service/app/__init__.py` (empty file).

- [ ] **Step 5: Create `app/config.py`**

Create `admin-service/app/config.py`:

```python
import os
from pathlib import Path
from urllib.parse import quote_plus

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _get_env_value(key: str) -> str | None:
    return os.getenv(key)


host = _get_env_value("HOST")
username = _get_env_value("DB_USERNAME")
password = _get_env_value("DB_PASSWORD")
database_name = _get_env_value("DATABASE_NAME")

encoded_password = quote_plus(password)

DATABASE_URL = (
    f"postgresql+asyncpg://{username}:{encoded_password}@{host}:5432/{database_name}"
)


class Settings(BaseSettings):
    jwt_secret: str = "dev-secret-change-in-production"
    admin_bootstrap_secret: str | None = None


settings = Settings()
```

- [ ] **Step 6: Create `app/db.py`**

Create `admin-service/app/db.py`:

```python
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import DATABASE_URL

engine = create_async_engine(DATABASE_URL, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncSession:
    async with SessionLocal() as session:
        yield session
```

- [ ] **Step 7: Create `app/models.py`**

Create `admin-service/app/models.py`. These are minimal, read-mostly copies of `api`'s `User`/`Organization`/`Trade`/`KybCheck` models (`api/app/models/user.py`, `organization.py`, `trade.py`, `kyb_check.py`), pointed at the same physical tables. This service never runs `Base.metadata.create_all()` — `api`'s alembic already created these tables — so a second, independent `Base`/`DeclarativeBase` mapping to the same tables from a separate process is safe:

```python
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    org_type: Mapped[str] = mapped_column(String, nullable=False)
    country: Mapped[str] = mapped_column(String, nullable=False)
    industry: Mapped[str] = mapped_column(String, nullable=False)
    tax_id: Mapped[str] = mapped_column(String, nullable=False)
    kyb_status: Mapped[str] = mapped_column(String, nullable=False, default="PENDING")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class KybCheck(Base):
    __tablename__ = "kyb_checks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    check_type: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    detail: Mapped[str | None] = mapped_column(String, nullable=True)
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Trade(Base):
    __tablename__ = "trades"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lc_reference: Mapped[str] = mapped_column(String, nullable=False)
    industry: Mapped[str] = mapped_column(String, nullable=False)
    instrument_type: Mapped[str] = mapped_column(String, nullable=False)
    exporter_org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    buyer_org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    issuing_bank_org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    advising_bank_org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    product_description: Mapped[str] = mapped_column(String, nullable=False)
    order_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String, nullable=False)
    incoterm: Mapped[str] = mapped_column(String, nullable=False)
    payment_term: Mapped[str] = mapped_column(String, nullable=False)
    shipment_deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="DRAFT")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

- [ ] **Step 8: Create `app/schemas.py`**

Create `admin-service/app/schemas.py`. `admin-service` can't import `api`'s Python package (separate venv, separate repo root), so these are self-contained `Literal`-based equivalents of `api`'s `app/schemas/{organization,kyb_check,user,trade,admin}.py`:

```python
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr

OrgType = Literal["EXPORTER", "BUYER", "BANK", "BOTH"]
KybStatus = Literal["PENDING", "CLEAR", "REVIEW", "BLOCK"]
UserRole = Literal["EXPORTER_ADMIN", "DOCS_COMPLIANCE", "FINANCE", "VIEWER", "BUYER", "BANK_REVIEWER", "PLATFORM_ADMIN"]
UserStatus = Literal["ACTIVE", "INVITED"]
KybCheckType = Literal["BUSINESS_REGISTRATION", "SANCTIONS_SCREENING", "BANK_ACCOUNT"]
KybCheckStatus = Literal["PASSED", "PENDING", "FAILED"]
TradeStatus = Literal["DRAFT", "DOCS_UNDER_REVIEW", "COMPLIANCE_CLEAR", "BANK_REVIEW", "ACCEPTED", "CLOSED"]


class OrganizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    org_type: OrgType
    country: str
    industry: str
    tax_id: str
    kyb_status: KybStatus
    created_at: datetime


class KybCheckOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    check_type: KybCheckType
    status: KybCheckStatus
    detail: str | None
    checked_at: datetime


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID | None
    name: str
    email: str
    role: UserRole
    status: UserStatus


class TradeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    lc_reference: str
    industry: str
    instrument_type: str
    exporter_org_id: uuid.UUID
    buyer_org_id: uuid.UUID
    issuing_bank_org_id: uuid.UUID
    advising_bank_org_id: uuid.UUID
    product_description: str
    order_value: Decimal
    currency: str
    incoterm: str
    payment_term: str
    shipment_deadline: date | None
    status: TradeStatus
    created_at: datetime
    updated_at: datetime


class AdminBootstrapRequest(BaseModel):
    secret: str
    name: str
    email: EmailStr
    password: str


class AdminKybStatusUpdate(BaseModel):
    kyb_status: KybStatus
```

- [ ] **Step 9: Create `app/auth.py`**

Create `admin-service/app/auth.py`. This mirrors `api/app/auth/security.py` (password hashing, JWT decode) plus `api/app/auth/dependencies.py` (`get_current_user` + `require_role`), collapsed into one dependency since this service only ever needs the single `PLATFORM_ADMIN` check:

```python
import uuid

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models import User

bearer_scheme = HTTPBearer()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except (ValueError, TypeError):
        return False


def decode_access_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    # Session tokens minted by api's create_access_token never carry a
    # "purpose" claim. Special-purpose tokens (e.g. api's password reset
    # tokens) do, and must never authenticate a request here either.
    if payload.get("purpose") is not None:
        return None
    return payload


async def get_current_admin_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    user = await db.get(User, uuid.UUID(payload["sub"]))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if user.role != "PLATFORM_ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
    return user
```

- [ ] **Step 10: Create `app/main.py`** (health check only — the admin router is wired in Task 2)

Create `admin-service/app/main.py`:

```python
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="UTFL Admin Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 11: Create `tests/conftest.py`**

Create `admin-service/tests/conftest.py`. This mirrors `api/tests/conftest.py`'s `db_session`/`async_client` fixtures exactly, but drops the `_migrate_test_db` autouse fixture — this service owns no migrations, so it assumes `api`'s migrations have already created the schema on the shared test database (see the Global Constraints note and this service's README, added in Task 4):

```python
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import DATABASE_URL, database_name
from app.db import get_db
from app.main import app

TEST_DATABASE_URL = DATABASE_URL.rsplit("/", 1)[0] + f"/{database_name}_test"
assert TEST_DATABASE_URL != DATABASE_URL, "test DB URL did not diverge from the app DB URL"
assert TEST_DATABASE_URL.endswith("_test"), f"refusing to run tests against a non-test database: {TEST_DATABASE_URL}"


@pytest_asyncio.fixture
async def db_session():
    # This service owns no migrations. It assumes api's alembic has already
    # created the schema on this database -- run api's test suite (or
    # `alembic upgrade head` from api/) at least once first.
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
```

- [ ] **Step 12: Write the failing health-check + DB-connectivity test**

Create `admin-service/tests/test_health.py`:

```python
from sqlalchemy import select

from app.models import Organization


async def test_health(async_client):
    response = await async_client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_organization_model_maps_to_the_real_shared_table(db_session):
    # Proves this service's independently-defined model actually matches the
    # column names/types api's alembic created -- not just that it imports.
    org = Organization(
        name="Model Mapping Check Org",
        org_type="EXPORTER",
        country="India",
        industry="Pharmaceuticals",
        tax_id="TAX-MODEL-CHECK-1",
    )
    db_session.add(org)
    await db_session.commit()

    result = await db_session.execute(select(Organization).where(Organization.name == "Model Mapping Check Org"))
    fetched = result.scalar_one()
    assert fetched.kyb_status == "PENDING"
    assert fetched.id == org.id
```

- [ ] **Step 13: Set up the venv and run the tests**

Run (from `admin-service/`):
```bash
python -m venv venv
venv/Scripts/pip.exe install -r requirements-dev.txt
```

Before running these tests for the first time, make sure `api`'s migrations have been applied to `utfl_test`: `cd ../api && venv/Scripts/python.exe -m pytest -q` (this runs `api`'s full suite, which migrates `utfl_test` to head as a side effect of its autouse fixture).

Then, from `admin-service/`:
```bash
venv/Scripts/python.exe -m pytest -v
```
Expected: 2 tests pass (`test_health`, `test_organization_model_maps_to_the_real_shared_table`).

- [ ] **Step 14: Add `admin-service/.env` to the root `.gitignore`**

In `.gitignore` (repo root), add a line alongside the existing `api/.env`, `ledger-monitoring/.env`, `risk-scoring/.env` entries:

```
admin-service/.env
```

- [ ] **Step 15: Copy `api`'s real `.env` values into a new `admin-service/.env`**

Copy `admin-service/.env.example` to `admin-service/.env` and fill in the same `HOST`/`DB_USERNAME`/`DB_PASSWORD`/`DATABASE_NAME` values already used in `api/.env` (same database), plus the same `JWT_SECRET` value if `api/.env` sets one explicitly (if `api/.env` doesn't set `JWT_SECRET`, leave it unset here too — both services fall back to the identical default).

- [ ] **Step 16: Commit**

```bash
git add admin-service/
git add .gitignore
git commit -m "Scaffold admin-service: config, db, models, schemas, auth, health check"
```

---

### Task 2: Move the admin router into `admin-service`; remove it from `api`

**Files:**
- Create: `admin-service/app/routers/__init__.py`
- Create: `admin-service/app/routers/admin.py`
- Create: `admin-service/tests/helpers.py`
- Create: `admin-service/tests/test_bootstrap.py`
- Create: `admin-service/tests/test_admin_endpoints.py`
- Modify: `admin-service/app/main.py`
- Delete: `api/app/routers/admin.py`
- Delete: `api/app/schemas/admin.py`
- Delete: `api/tests/test_admin_bootstrap.py`
- Delete: `api/tests/test_admin_endpoints.py`
- Modify: `api/app/main.py`
- Create: `api/tests/test_platform_admin.py`

**Interfaces:**
- Consumes (from Task 1): `app.config.settings`, `app.db.get_db`, `app.models.{User, Organization, Trade, KybCheck}`, `app.schemas.*`, `app.auth.{hash_password, get_current_admin_user}`.
- Produces: `admin-service`'s `router` (FastAPI `APIRouter`, prefix `/admin`) registered on `app.main.app` — no later task in this plan depends on it further.

- [ ] **Step 1: Write the failing bootstrap tests**

Create `admin-service/tests/test_bootstrap.py`:

```python
from sqlalchemy import select

from app.auth import verify_password
from app.config import settings
from app.models import User


async def test_bootstrap_rejects_missing_secret(async_client, monkeypatch):
    monkeypatch.setattr(settings, "admin_bootstrap_secret", None)

    response = await async_client.post(
        "/admin/bootstrap",
        json={"secret": "anything", "name": "Ops Admin", "email": "admin@utfl.example", "password": "a good password"},
    )

    assert response.status_code == 403


async def test_bootstrap_rejects_wrong_secret(async_client, monkeypatch):
    monkeypatch.setattr(settings, "admin_bootstrap_secret", "test-bootstrap-secret")

    response = await async_client.post(
        "/admin/bootstrap",
        json={"secret": "wrong-secret", "name": "Ops Admin", "email": "admin@utfl.example", "password": "a good password"},
    )

    assert response.status_code == 403


async def test_bootstrap_creates_platform_admin_with_hashed_password(async_client, monkeypatch, db_session):
    monkeypatch.setattr(settings, "admin_bootstrap_secret", "test-bootstrap-secret")

    response = await async_client.post(
        "/admin/bootstrap",
        json={"secret": "test-bootstrap-secret", "name": "Ops Admin", "email": "admin@utfl.example", "password": "a good password"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["role"] == "PLATFORM_ADMIN"
    assert body["org_id"] is None

    result = await db_session.execute(select(User).where(User.email == "admin@utfl.example"))
    stored = result.scalar_one()
    assert verify_password("a good password", stored.password_hash)
    assert not verify_password("wrong password", stored.password_hash)


async def test_bootstrap_rejects_second_admin(async_client, monkeypatch):
    monkeypatch.setattr(settings, "admin_bootstrap_secret", "test-bootstrap-secret")
    payload = {"secret": "test-bootstrap-secret", "name": "Ops Admin", "email": "admin1@utfl.example", "password": "a good password"}

    first = await async_client.post("/admin/bootstrap", json=payload)
    assert first.status_code == 201

    second = await async_client.post("/admin/bootstrap", json={**payload, "email": "admin2@utfl.example"})
    assert second.status_code == 409
```

- [ ] **Step 2: Write the failing admin-endpoint tests**

Create `admin-service/tests/helpers.py` — this service's tests can't call `api`'s `/auth/signup`/`/auth/login` HTTP endpoints (they're not part of this app), so tests build their own fixture data directly via `db_session` and mint their own JWTs matching the exact payload shape `api`'s `create_access_token` produces:

```python
import uuid
from datetime import datetime, timedelta, timezone

import jwt

from app.config import settings


def make_token(user_id: uuid.UUID, org_id: uuid.UUID | None, role: str) -> str:
    payload = {
        "sub": str(user_id),
        "org_id": str(org_id) if org_id else None,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=60),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")
```

Create `admin-service/tests/test_admin_endpoints.py`:

```python
from decimal import Decimal

from app.auth import hash_password
from app.models import KybCheck, Organization, Trade, User
from tests.helpers import make_token


async def _create_org(db_session, name="Test Org", org_type="EXPORTER", kyb_status="CLEAR"):
    org = Organization(name=name, org_type=org_type, country="India", industry="Pharmaceuticals", tax_id=f"TAX-{name}", kyb_status=kyb_status)
    db_session.add(org)
    await db_session.flush()
    return org


async def _create_user(db_session, org_id, role="EXPORTER_ADMIN", email="user@example.com"):
    user = User(org_id=org_id, name="Test User", email=email, password_hash=hash_password("x"), role=role, status="ACTIVE")
    db_session.add(user)
    await db_session.flush()
    return user


async def test_non_admin_gets_403_from_admin_routes(async_client, db_session):
    org = await _create_org(db_session)
    business_user = await _create_user(db_session, org.id)
    token = make_token(business_user.id, org.id, "EXPORTER_ADMIN")

    response = await async_client.get("/admin/organizations", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403

    response = await async_client.get(
        f"/admin/organizations/{org.id}/kyb-checks", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403

    response = await async_client.patch(
        f"/admin/organizations/{org.id}/kyb-status",
        json={"kyb_status": "BLOCK"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403

    response = await async_client.get("/admin/users", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403

    response = await async_client.get("/admin/trades", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403


async def test_admin_sees_organizations_across_every_org(async_client, db_session):
    await _create_org(db_session, name="Org A", org_type="EXPORTER")
    await _create_org(db_session, name="Org B", org_type="BUYER")
    admin = await _create_user(db_session, None, role="PLATFORM_ADMIN", email="admin@utfl.example")
    admin_token = make_token(admin.id, None, "PLATFORM_ADMIN")

    response = await async_client.get("/admin/organizations", headers={"Authorization": f"Bearer {admin_token}"})

    assert response.status_code == 200
    names = {org["name"] for org in response.json()}
    assert "Org A" in names
    assert "Org B" in names


async def test_admin_sees_kyb_checks_for_any_organization(async_client, db_session):
    org = await _create_org(db_session)
    db_session.add(KybCheck(org_id=org.id, check_type="SANCTIONS_SCREENING", status="PASSED", detail="fake:CLEAR"))
    await db_session.flush()
    admin = await _create_user(db_session, None, role="PLATFORM_ADMIN", email="admin@utfl.example")
    admin_token = make_token(admin.id, None, "PLATFORM_ADMIN")

    response = await async_client.get(
        f"/admin/organizations/{org.id}/kyb-checks", headers={"Authorization": f"Bearer {admin_token}"}
    )

    assert response.status_code == 200
    check_types = {c["check_type"] for c in response.json()}
    assert check_types == {"SANCTIONS_SCREENING"}


async def test_admin_can_override_kyb_status(async_client, db_session):
    org = await _create_org(db_session, kyb_status="PENDING")
    admin = await _create_user(db_session, None, role="PLATFORM_ADMIN", email="admin@utfl.example")
    admin_token = make_token(admin.id, None, "PLATFORM_ADMIN")

    response = await async_client.patch(
        f"/admin/organizations/{org.id}/kyb-status",
        json={"kyb_status": "BLOCK"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    assert response.json()["kyb_status"] == "BLOCK"

    org_list = await async_client.get("/admin/organizations", headers={"Authorization": f"Bearer {admin_token}"})
    updated = next(o for o in org_list.json() if o["id"] == str(org.id))
    assert updated["kyb_status"] == "BLOCK"


async def test_admin_sees_users_across_every_org(async_client, db_session):
    org = await _create_org(db_session)
    await _create_user(db_session, org.id, email="business-user@example.com")
    admin = await _create_user(db_session, None, role="PLATFORM_ADMIN", email="admin@utfl.example")
    admin_token = make_token(admin.id, None, "PLATFORM_ADMIN")

    response = await async_client.get("/admin/users", headers={"Authorization": f"Bearer {admin_token}"})

    assert response.status_code == 200
    emails = {u["email"] for u in response.json()}
    assert "business-user@example.com" in emails


async def test_admin_sees_trades_across_every_org(async_client, db_session):
    exporter = await _create_org(db_session, name="Exporter Co")
    buyer = await _create_org(db_session, name="Buyer Co", org_type="BUYER")
    bank1 = await _create_org(db_session, name="Issuing Bank", org_type="BANK")
    bank2 = await _create_org(db_session, name="Advising Bank", org_type="BANK")
    trade = Trade(
        lc_reference="ADMIN-SVC-TEST-LC-1",
        industry="Pharmaceuticals",
        instrument_type="Letter of Credit",
        exporter_org_id=exporter.id,
        buyer_org_id=buyer.id,
        issuing_bank_org_id=bank1.id,
        advising_bank_org_id=bank2.id,
        product_description="Paracetamol Tablets 500mg",
        order_value=Decimal("80000.00"),
        currency="USD",
        incoterm="CIF Osaka",
        payment_term="Usance LC, 60 days",
    )
    db_session.add(trade)
    await db_session.flush()
    admin = await _create_user(db_session, None, role="PLATFORM_ADMIN", email="admin@utfl.example")
    admin_token = make_token(admin.id, None, "PLATFORM_ADMIN")

    response = await async_client.get("/admin/trades", headers={"Authorization": f"Bearer {admin_token}"})

    assert response.status_code == 200
    assert any(t["exporter_org_id"] == str(exporter.id) for t in response.json())
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `cd admin-service && venv/Scripts/python.exe -m pytest tests/test_bootstrap.py tests/test_admin_endpoints.py -v`
Expected: FAIL with 404s — no `/admin/*` routes exist in `admin-service` yet.

- [ ] **Step 4: Create the router**

Create `admin-service/app/routers/__init__.py` (empty file).

Create `admin-service/app/routers/admin.py` — this is `api/app/routers/admin.py`'s logic, adapted to this service's own `app.auth`/`app.models`/`app.schemas` (no `.value` calls on enum members, since `admin-service`'s schemas use plain `Literal` strings, not `Enum`):

```python
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_admin_user, hash_password
from app.config import settings
from app.db import get_db
from app.models import KybCheck, Organization, Trade, User
from app.schemas import (
    AdminBootstrapRequest,
    AdminKybStatusUpdate,
    KybCheckOut,
    OrganizationOut,
    TradeOut,
    UserOut,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/bootstrap", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def bootstrap_admin(
    payload: AdminBootstrapRequest,
    db: AsyncSession = Depends(get_db),
) -> User:
    if not settings.admin_bootstrap_secret or payload.secret != settings.admin_bootstrap_secret:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid bootstrap secret")

    existing_admin = await db.execute(select(User).where(User.role == "PLATFORM_ADMIN"))
    if existing_admin.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A platform admin already exists")

    existing_email = await db.execute(select(User).where(User.email == payload.email))
    if existing_email.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    admin_user = User(
        org_id=None,
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role="PLATFORM_ADMIN",
        status="ACTIVE",
    )
    db.add(admin_user)
    try:
        await db.commit()
    except IntegrityError:
        # Catch race condition where another request committed a PLATFORM_ADMIN
        # between our pre-check and our insert. The partial unique index on
        # users.role (created by api's migration 0014) ensures exactly one
        # PLATFORM_ADMIN can exist.
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A platform admin already exists")
    await db.refresh(admin_user)
    return admin_user


@router.get("/organizations", response_model=list[OrganizationOut], dependencies=[Depends(get_current_admin_user)])
async def list_all_organizations(db: AsyncSession = Depends(get_db)) -> list[Organization]:
    result = await db.execute(select(Organization).order_by(Organization.name))
    return list(result.scalars().all())


@router.get(
    "/organizations/{org_id}/kyb-checks",
    response_model=list[KybCheckOut],
    dependencies=[Depends(get_current_admin_user)],
)
async def list_all_organization_kyb_checks(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> list[KybCheck]:
    org = await db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    result = await db.execute(select(KybCheck).where(KybCheck.org_id == org_id))
    return list(result.scalars().all())


@router.patch(
    "/organizations/{org_id}/kyb-status",
    response_model=OrganizationOut,
    dependencies=[Depends(get_current_admin_user)],
)
async def update_organization_kyb_status(
    org_id: uuid.UUID,
    payload: AdminKybStatusUpdate,
    db: AsyncSession = Depends(get_db),
) -> Organization:
    org = await db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    org.kyb_status = payload.kyb_status
    await db.commit()
    await db.refresh(org)
    return org


@router.get("/users", response_model=list[UserOut], dependencies=[Depends(get_current_admin_user)])
async def list_all_users(db: AsyncSession = Depends(get_db)) -> list[User]:
    result = await db.execute(select(User).order_by(User.name))
    return list(result.scalars().all())


@router.get("/trades", response_model=list[TradeOut], dependencies=[Depends(get_current_admin_user)])
async def list_all_trades(db: AsyncSession = Depends(get_db)) -> list[Trade]:
    result = await db.execute(select(Trade).order_by(Trade.created_at.desc()))
    return list(result.scalars().all())
```

- [ ] **Step 5: Register the router**

In `admin-service/app/main.py`, add the import and registration:

```python
from app.routers import admin
```

```python
app.include_router(admin.router)
```

(Add the import line alongside the existing `from fastapi.middleware.cors import CORSMiddleware` import, and the `include_router` call right after `app.add_middleware(...)`, before the `/health` route.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd admin-service && venv/Scripts/python.exe -m pytest -v`
Expected: PASS (all tests in `test_health.py`, `test_bootstrap.py`, `test_admin_endpoints.py`).

- [ ] **Step 7: Remove the admin router and its tests from `api`**

Delete `api/app/routers/admin.py`.
Delete `api/app/schemas/admin.py`.
Delete `api/tests/test_admin_bootstrap.py`.
Delete `api/tests/test_admin_endpoints.py`.

In `api/app/main.py`, change line 9 and remove line 27:

```python
from app.routers import auth, bank_review, document_registry, documents, organizations, sanctions_screening, trades, users
```

(remove the `app.include_router(admin.router)` line entirely — it was the last line before the blank line preceding `@app.get("/health")`).

- [ ] **Step 8: Relocate the two `api`-side regression tests that don't depend on the removed bootstrap endpoint**

Two tests from the deleted files test `api`'s *own* code (not the admin router) and must survive, adapted to create their `PLATFORM_ADMIN` fixture user directly via `db_session` instead of via the now-removed `POST /admin/bootstrap`.

Create `api/tests/test_platform_admin.py`:

```python
from app.auth.security import hash_password
from app.models.user import User


async def _create_platform_admin(db_session, email="admin@utfl.example", password="a good password") -> User:
    user = User(org_id=None, name="Ops Admin", email=email, password_hash=hash_password(password), role="PLATFORM_ADMIN", status="ACTIVE")
    db_session.add(user)
    await db_session.commit()
    return user


async def _signup_and_login(async_client, email: str, org_type: str = "EXPORTER") -> tuple[str, str]:
    payload = {
        "organization": {"name": f"Org for {email}", "org_type": org_type, "country": "India", "industry": "Pharmaceuticals", "tax_id": f"TAX-{email}"},
        "admin_user": {"name": "Business User", "email": email, "password": "a good password"},
    }
    response = await async_client.post("/auth/signup", json=payload)
    org_id = response.json()["organization"]["id"]
    login_response = await async_client.post("/auth/login", json={"email": email, "password": "a good password"})
    return org_id, login_response.json()["access_token"]


async def _create_trade(async_client, token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id):
    payload = {
        "lc_reference": "PLATFORM-ADMIN-TEST-LC-1",
        "industry": "Pharmaceuticals",
        "instrument_type": "Letter of Credit",
        "exporter_org_id": exporter_org_id,
        "buyer_org_id": buyer_org_id,
        "issuing_bank_org_id": issuing_bank_org_id,
        "advising_bank_org_id": advising_bank_org_id,
        "product_description": "Paracetamol Tablets 500mg",
        "order_value": "80000.00",
        "currency": "USD",
        "incoterm": "CIF Osaka",
        "payment_term": "Usance LC, 60 days",
        "shipment_deadline": "2026-09-15",
    }
    return await async_client.post("/trades", json=payload, headers={"Authorization": f"Bearer {token}"})


async def test_platform_admin_can_call_auth_me(async_client, db_session):
    # Regression test: GET /auth/me used to serialize through a second, separate
    # UserOut schema (app/schemas/auth.py) whose org_id was non-optional. Returning
    # a platform admin (org_id=NULL) through it raised a ResponseValidationError ->
    # 500, so a real admin could log in but /auth/me (called immediately after
    # login, and on every page refresh by the frontend) would 500 forever.
    await _create_platform_admin(db_session, email="me-admin@utfl.example")

    login_response = await async_client.post(
        "/auth/login", json={"email": "me-admin@utfl.example", "password": "a good password"}
    )
    token = login_response.json()["access_token"]

    response = await async_client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    body = response.json()
    assert body["org_id"] is None
    assert body["role"] == "PLATFORM_ADMIN"


async def test_platform_admin_token_against_business_endpoints_is_safe_but_useless(async_client, db_session):
    # Characterization test: pins today's safe-by-accident behavior for the
    # pre-existing, non-admin-aware endpoints. A platform admin has org_id=NULL,
    # and both trades_query_for_user() and user_can_access_org() (app/access.py)
    # compare against user.org_id with plain equality, so NULL never matches
    # anything. An admin therefore sees an empty list from GET /trades (not
    # another org's trades) and a 404 from GET /organizations/{id} (not that
    # org's data) rather than raising an error.
    #
    # IMPORTANT: if app/access.py is ever changed to treat a NULL org_id as a
    # wildcard granting access to everything, this test's assertions must be
    # revisited deliberately -- it should not be allowed to silently start
    # failing (or worse, silently start passing with different semantics).
    org_id, exporter_token = await _signup_and_login(async_client, "characterization-org@example.com")
    buyer_org_id, _ = await _signup_and_login(async_client, "characterization-buyer@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await _signup_and_login(async_client, "characterization-issuing@example.com", org_type="BANK")
    advising_bank_org_id, _ = await _signup_and_login(async_client, "characterization-advising@example.com", org_type="BANK")
    await _create_trade(async_client, exporter_token, org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)

    await _create_platform_admin(db_session, email="char-admin@utfl.example")
    login_response = await async_client.post(
        "/auth/login", json={"email": "char-admin@utfl.example", "password": "a good password"}
    )
    admin_token = login_response.json()["access_token"]

    trades_response = await async_client.get("/trades", headers={"Authorization": f"Bearer {admin_token}"})
    assert trades_response.status_code == 200
    assert trades_response.json() == []

    org_response = await async_client.get(f"/organizations/{org_id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert org_response.status_code == 404
```

- [ ] **Step 9: Run the full backend test suite**

Run: `cd api && venv/Scripts/python.exe -m pytest -q`
Expected: PASS. Compare the count against the pre-Task-2 baseline: minus the deleted `test_admin_bootstrap.py` (5 tests) and `test_admin_endpoints.py` (7 tests), plus the new `test_platform_admin.py` (2 tests) — net change is a decrease of 10 tests in `api`'s own suite (the rest moved to `admin-service`, which now has its own count).

Also re-run `admin-service`'s suite once more to confirm nothing there regressed: `cd admin-service && venv/Scripts/python.exe -m pytest -v`.

- [ ] **Step 10: Commit**

```bash
git add admin-service/app/routers/ admin-service/app/main.py admin-service/tests/helpers.py admin-service/tests/test_bootstrap.py admin-service/tests/test_admin_endpoints.py
git add api/app/main.py api/tests/test_platform_admin.py
git rm api/app/routers/admin.py api/app/schemas/admin.py api/tests/test_admin_bootstrap.py api/tests/test_admin_endpoints.py
git commit -m "Move the admin router to admin-service; relocate api's platform-admin regression tests"
```

---

### Task 3: Frontend — point admin API calls at `admin-service`

**Files:**
- Modify: `web/src/api/client.ts`
- Modify: `web/src/api/client.test.ts`
- Modify: `web/src/api/admin.ts`
- Modify: `web/.env.example`

**Interfaces:**
- Produces: `adminApiFetch<T>(path, options)` in `web/src/api/client.ts`, used by `web/src/api/admin.ts` — no later task in this plan depends on it further (the page components that consume `admin.ts`'s exports are unchanged, since those export names/signatures don't change).

- [ ] **Step 1: Write the failing test**

Add to `web/src/api/client.test.ts`, inside the `describe('apiFetch', ...)` block's imports and as a new top-level `describe`:

Change the import line:

```ts
import { ApiError, adminApiFetch, apiFetch, setAuthToken, setUnauthorizedHandler } from './client';
```

Add a new `describe` block after the existing `describe('apiFetch', ...)` block closes:

```ts
describe('adminApiFetch', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    setAuthToken(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends requests to the admin service base URL, not the main api base URL', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    await adminApiFetch('/admin/organizations');

    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('http://localhost:8001/admin/organizations');
  });

  it('attaches the same Bearer Authorization header as apiFetch', async () => {
    setAuthToken('test-token-123');
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    await adminApiFetch('/admin/users');

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers['Authorization']).toBe('Bearer test-token-123');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run src/api/client.test.ts`
Expected: FAIL — `adminApiFetch` is not exported from `./client`.

- [ ] **Step 3: Refactor `client.ts` to add `adminApiFetch`**

Replace the full contents of `web/src/api/client.ts`:

```ts
const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000';
const ADMIN_BASE_URL = (import.meta.env.VITE_ADMIN_API_BASE_URL as string | undefined) ?? 'http://localhost:8001';

let authToken: string | null = null;
let onUnauthorized: () => void = () => {};

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface ApiFetchOptions {
  method?: string;
  body?: unknown;
  isFormData?: boolean;
}

async function fetchFrom<T>(baseUrl: string, path: string, options: ApiFetchOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    if (options.isFormData) {
      body = options.body as FormData;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
  });

  if (response.status === 401) {
    onUnauthorized();
    throw new ApiError(401, 'Unauthorized');
  }

  if (!response.ok) {
    throw new ApiError(response.status, `Request to ${path} failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  return fetchFrom<T>(BASE_URL, path, options);
}

export function adminApiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  return fetchFrom<T>(ADMIN_BASE_URL, path, options);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run src/api/client.test.ts`
Expected: PASS (7 tests: the 5 existing `apiFetch` tests, unchanged, plus the 2 new `adminApiFetch` tests).

- [ ] **Step 5: Point `admin.ts` at the new client function**

In `web/src/api/admin.ts`, change the import and every `apiFetch` call to `adminApiFetch`:

```ts
import { adminApiFetch } from './client';
import type { KybCheck, KybStatus, Organization, Trade, User } from './types';

export function listAdminOrganizations(): Promise<Organization[]> {
  return adminApiFetch<Organization[]>('/admin/organizations');
}

export function listAdminOrganizationKybChecks(orgId: string): Promise<KybCheck[]> {
  return adminApiFetch<KybCheck[]>(`/admin/organizations/${orgId}/kyb-checks`);
}

export function updateOrganizationKybStatus(orgId: string, kybStatus: KybStatus): Promise<Organization> {
  return adminApiFetch<Organization>(`/admin/organizations/${orgId}/kyb-status`, {
    method: 'PATCH',
    body: { kyb_status: kybStatus },
  });
}

export function listAdminUsers(): Promise<User[]> {
  return adminApiFetch<User[]>('/admin/users');
}

export function listAdminTrades(): Promise<Trade[]> {
  return adminApiFetch<Trade[]>('/admin/trades');
}
```

- [ ] **Step 6: Add the new env var to `.env.example`**

In `web/.env.example`, add a second line:

```
VITE_API_BASE_URL=http://localhost:8000
VITE_ADMIN_API_BASE_URL=http://localhost:8001
```

- [ ] **Step 7: Typecheck and run the full frontend suite**

Run: `cd web && npx tsc -b && npx vitest run`
Expected: both clean. The admin page test files (`AdminOrganizationsPage.test.tsx`, `AdminUsersPage.test.tsx`, `AdminTradesPage.test.tsx`) mock `admin.ts`'s exported functions directly via `vi.spyOn`, so they're unaffected by this internal change and should still pass unchanged.

- [ ] **Step 8: Commit**

```bash
git add web/src/api/client.ts web/src/api/client.test.ts web/src/api/admin.ts web/.env.example
git commit -m "Point admin API calls at admin-service instead of api"
```

---

### Task 4: Docs — `admin-service` README and `api/.env.example` cleanup

**Files:**
- Create: `admin-service/README.md`
- Modify: `api/.env.example`

**Interfaces:** None — this task produces no code interfaces other tasks depend on.

- [ ] **Step 1: Write `admin-service/README.md`**

Create `admin-service/README.md`, following the style of `risk-scoring/README.md` and `ledger-monitoring/README.md`:

```markdown
# admin-service

A standalone FastAPI service exposing platform-admin-only endpoints: create
the first `PLATFORM_ADMIN` account (`POST /admin/bootstrap`), and read/manage
data across every organization on the platform (organizations, KYB checks,
users, trades, and a manual KYB status override). See
`docs/superpowers/specs/2026-08-04-admin-panel-design.md` for the original
design and `docs/superpowers/plans/2026-08-04-admin-service-extraction.md`
for why this moved out of `api` into its own service.

Unlike `risk-scoring`/`ledger-monitoring`/`sanctions-adapter`, this service
is *not* an optional adapter called server-to-server from `api` with a safe
fallback — it's called directly by the browser (`web`'s `/admin/*` pages),
and there's no fallback if it's down. It also has direct read/write access
to `api`'s own database (`users`/`organizations`/`trades`/`kyb_checks`),
via its own minimal copies of those SQLAlchemy models in `app/models.py`.

## Schema ownership

This service owns **no migrations**. `api`'s Alembic migrations remain the
single source of truth for the `users`/`organizations`/`trades`/`kyb_checks`
tables — this service just connects to the same database and reads/writes
into tables `api` already created. If `api`'s models change shape, the
copies in `app/models.py` here need to be updated to match by hand; there's
no shared package enforcing this, so keep them in sync deliberately.

## Auth

This service trusts the same `JWT_SECRET` as `api` (set it to the identical
value in both services' `.env` files) and decodes tokens itself — it never
issues tokens. `POST /auth/login` in `api` remains the platform's only
identity provider; a token from there is valid here too, as long as the
underlying user's `role` is `PLATFORM_ADMIN`.

## Requirements

- Python 3.12
- The same Postgres database `api` uses, with `api`'s migrations already applied

## Setup

```bash
cd admin-service
python -m venv venv
venv\Scripts\activate  # or source venv/bin/activate on macOS/Linux
pip install -r requirements-dev.txt
cp .env.example .env
# Edit .env: same DB connection values as api/.env, and the same JWT_SECRET
# if api/.env sets one explicitly.
```

## Bootstrapping the first platform admin account

1. Set `ADMIN_BOOTSTRAP_SECRET` in `.env` to a random value and restart this service.
2. Call `POST /admin/bootstrap` once with that secret to create the `PLATFORM_ADMIN` account.
3. Unset `ADMIN_BOOTSTRAP_SECRET` and restart. The endpoint is unauthenticated and stays
   live forever otherwise — see the comment in `.env.example` for why that matters.
4. Log in normally via `api`'s `POST /auth/login` with the new account's email/password.

## Run

```bash
uvicorn app.main:app --port 8001
```

## Build and test

Before running this service's tests for the first time against a fresh
database, make sure `api`'s migrations have created the schema — the
simplest way is to run `api`'s own test suite once (its `conftest.py`
migrates the shared `utfl_test` database to head as a side effect):

```bash
cd ../api && venv/Scripts/python.exe -m pytest -q
```

Then, from `admin-service/`:

```bash
venv/Scripts/python.exe -m pytest -v
```

`tests/helpers.py` mints JWTs directly (via `pyjwt`, using the shared
`jwt_secret`) rather than calling `api`'s `/auth/login` — this service's
tests build their own fixture data directly through `db_session` instead of
signing up through `api`'s HTTP endpoints, since those endpoints aren't
part of this app.

## Module layout

- `app/models.py` — minimal copies of `api`'s `User`/`Organization`/`Trade`/`KybCheck`
  models, pointed at the same database. Read-mostly; the only write path is
  `PATCH /admin/organizations/{id}/kyb-status` and account creation in bootstrap.
- `app/schemas.py` — response/request Pydantic models, matching `api`'s shapes exactly
  (`Literal` string unions in place of `api`'s `Enum`-based ones, since this service
  can't import `api`'s Python package).
- `app/auth.py` — JWT decode (trusting `api`'s shared secret), password hashing
  (needed only for bootstrap), and the single `get_current_admin_user` dependency.
- `app/routers/admin.py` — the six endpoints: bootstrap, list organizations, list an
  organization's KYB checks, update an organization's KYB status, list users, list trades.

## Not in scope for this service

- Any route other than the six admin endpoints — in particular, login/signup/team
  management stay in `api`.
- Its own migrations — see "Schema ownership" above.
- Editing anything other than an organization's `kyb_status` (no user/org CRUD, no
  audit log, no pagination) — same scope boundary as the original design spec.
```

- [ ] **Step 2: Remove the now-stale bootstrap section from `api/.env.example`**

In `api/.env.example`, remove the `ADMIN_BOOTSTRAP_SECRET` section (that setting no longer exists in `api`'s `Settings` class as of Task 2) — delete these lines:

```
# Bootstrapping the first platform admin account:
#   1. Set ADMIN_BOOTSTRAP_SECRET to a random value and restart the API.
#   2. Call POST /admin/bootstrap once with that secret to create the
#      PLATFORM_ADMIN account (see docs/superpowers/specs/2026-08-04-admin-panel-design.md).
#   3. Unset ADMIN_BOOTSTRAP_SECRET (or remove it from .env) and restart the API.
#      The endpoint is unauthenticated and stays live forever otherwise: with the
#      wrong secret it 403s, with the right one (after an admin already exists) it
#      409s, which makes it a permanent oracle for confirming a guessed secret if
#      left configured.
# ADMIN_BOOTSTRAP_SECRET=
```

Leave the rest of the file (`HOST`/`DB_USERNAME`/`DB_PASSWORD`/`DATABASE_NAME` and the other optional settings) unchanged.

- [ ] **Step 3: Commit**

```bash
git add admin-service/README.md api/.env.example
git commit -m "Document admin-service setup, bootstrap procedure, and schema ownership"
```
