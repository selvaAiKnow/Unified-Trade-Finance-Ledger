# Phase 1 — API + Data Model Service — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `api/` FastAPI service and its Postgres data model — organizations, users, KYB checks, document registry, trades, documents, sanctions screenings, and bank-review findings — as specified in `docs/superpowers/specs/2026-07-22-phase1-api-data-model-design.md`, validated entirely through automated pytest tests against a real local Postgres + MinIO (via `infra/docker-compose.yml`).

**Architecture:** A single async FastAPI service (`api/app/`) with SQLAlchemy 2.0 async models, Alembic migrations, Pydantic v2 schemas, JWT auth with role-based FastAPI dependencies (no separate gateway), and a MinIO-backed document store. A typed `SanctionsClient` protocol is defined with a fake implementation for this service's own tests — the real HTTP-calling implementation is a later sub-project (`sanctions-adapter`). Alongside `api/`, this plan also scaffolds the rest of the Section 7 repo layout as empty placeholders and stands up `infra/docker-compose.yml` (Postgres + MinIO).

**Tech Stack:** Python 3.11+, FastAPI (async), SQLAlchemy 2.0 (async, asyncpg driver), Alembic (async template), Pydantic v2, pytest + pytest-asyncio + httpx (ASGI transport), bcrypt, PyJWT, minio (official Python client), PostgreSQL 16, MinIO.

## Global Constraints

- Every model, route, and schema lives under `api/app/`; every test lives under `api/tests/` and runs via `pytest` from the `api/` directory.
- Tests run against a real Postgres and real MinIO — both started via `infra/docker-compose.yml` (`docker compose -f infra/docker-compose.yml up -d`) before running any task's tests. No mocked DB layer.
- Postgres is exposed on host port **5433** (not the default 5432) — this dev machine already runs a native `postgresql-x64-17` Windows service bound to 5432, so the container is remapped to avoid the conflict. Every `DATABASE_URL`/`sqlalchemy.url` in this plan uses `localhost:5433`.
- Enums are modeled as Python `str, Enum` classes in `api/app/models/enums.py`, validated at the Pydantic schema layer, but stored as plain `String` columns in Postgres (not native `pg` enum types) — this keeps future value additions a simple code change with no enum-altering migration.
- Auth: JWT access tokens (HS256), 24h expiry (`jwt_expiry_minutes = 1440`), no refresh-token flow. RBAC is enforced via FastAPI dependencies (`require_role(...)`) on each route — there is no API gateway in this service.
- Only the `SANCTIONS_SCREENING` KYB check calls the real (fake-in-tests) sanctions client; `BUSINESS_REGISTRATION` and `BANK_ACCOUNT` are always inserted as static `PASSED` rows.
- `on_chain_hash` is SHA-256 (hex) of the uploaded document's bytes, computed at upload time. It is never anchored anywhere in this service — no blockchain client exists here.
- Re-uploading the same `document_type` for a trade creates a new, additional `documents` row (append-only) rather than replacing the previous one.
- No PII, full document bytes, or off-chain storage references are ever passed to anything resembling an on-chain client — there is no such client in this service.
- Frequent commits: one commit per task, after its tests pass.

---

## File Structure

```
web/README.md                          # placeholder — built in a later sub-project
sanctions-adapter/README.md            # placeholder — built in the next sub-project
document-intelligence/README.md        # placeholder — Phase 2
compliance-service/README.md           # placeholder — Phase 2
risk-scoring/README.md                 # placeholder — Phase 2
decision-engine/README.md              # placeholder — Phase 2
ledger-monitoring/README.md            # placeholder — Phase 4
packages/README.md                     # placeholder — will hold shared clients later

infra/docker-compose.yml               # Postgres + MinIO for local dev and tests
infra/postgres-init/001-create-test-db.sql

api/requirements.txt
api/requirements-dev.txt
api/pytest.ini
api/alembic.ini
api/alembic/env.py                     # async template, modified
api/alembic/versions/                  # one file per task that adds/changes a table

api/app/main.py                        # FastAPI app + router includes
api/app/config.py                      # pydantic-settings
api/app/db.py                          # Base, async engine, session, get_db
api/app/models/enums.py
api/app/models/organization.py
api/app/models/user.py
api/app/models/kyb_check.py
api/app/models/document_registry.py
api/app/models/trade.py
api/app/models/document.py
api/app/models/sanctions_screening.py
api/app/models/bank_review_finding.py
api/app/schemas/organization.py
api/app/schemas/user.py
api/app/schemas/auth.py
api/app/schemas/document_registry.py
api/app/schemas/trade.py
api/app/schemas/document.py
api/app/schemas/sanctions.py
api/app/schemas/bank_review.py
api/app/auth/security.py               # password hashing, JWT encode/decode
api/app/auth/dependencies.py           # get_current_user, require_role
api/app/sanctions/client.py            # SanctionsClient protocol + SanctionsResult
api/app/sanctions/fake.py              # FakeSanctionsClient
api/app/sanctions/dependency.py        # get_sanctions_client
api/app/access.py                      # org-scoping helpers for trades
api/app/hashing.py                     # sha256_hex
api/app/storage.py                     # MinIO wrapper
api/app/routers/auth.py
api/app/routers/organizations.py
api/app/routers/users.py
api/app/routers/document_registry.py
api/app/routers/trades.py
api/app/routers/documents.py
api/app/routers/sanctions_screening.py
api/app/routers/bank_review.py

api/tests/conftest.py
api/tests/test_health.py
api/tests/test_organization_model.py
api/tests/test_user_model.py
api/tests/test_kyb_check_model.py
api/tests/test_auth_signup.py
api/tests/test_auth_login.py
api/tests/test_organizations_endpoints.py
api/tests/test_users_endpoints.py
api/tests/test_document_registry_endpoints.py
api/tests/test_trades_endpoints.py
api/tests/test_documents_endpoints.py
api/tests/test_sanctions_screening_endpoints.py
api/tests/test_bank_review_endpoints.py
```

---

### Task 1: Repo scaffold, infra compose, and API skeleton

**Files:**
- Create: `web/README.md`, `sanctions-adapter/README.md`, `document-intelligence/README.md`, `compliance-service/README.md`, `risk-scoring/README.md`, `decision-engine/README.md`, `ledger-monitoring/README.md`, `packages/README.md`
- Create: `infra/docker-compose.yml`, `infra/postgres-init/001-create-test-db.sql`
- Create: `api/requirements.txt`, `api/requirements-dev.txt`, `api/pytest.ini`, `api/app/__init__.py`, `api/app/main.py`
- Test: `api/tests/test_health.py`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: a running FastAPI app (`app.main.app`) with `GET /health`, plus Postgres + MinIO reachable via `infra/docker-compose.yml` — the foundation every later task builds on.

- [ ] **Step 1: Create placeholder folders for future sub-projects/phases**

```bash
mkdir -p web sanctions-adapter document-intelligence compliance-service risk-scoring decision-engine ledger-monitoring packages
```

Write identical content into each, substituting the folder name and phase, e.g. `web/README.md`:

```markdown
# web

Placeholder — the Portal (React + Tailwind + MobX + SSE) is built in a later Phase 1 sub-project, after `api` and `sanctions-adapter`. See `docs/superpowers/specs/2026-07-22-phase1-api-data-model-design.md`.
```

`sanctions-adapter/README.md`:

```markdown
# sanctions-adapter

Placeholder — built as the next Phase 1 sub-project, implementing the `SanctionsClient` interface defined in `api/app/sanctions/client.py`.
```

`document-intelligence/README.md`, `compliance-service/README.md`, `risk-scoring/README.md`, `decision-engine/README.md`:

```markdown
# document-intelligence

Placeholder — Phase 2 (see `docs/claude_code_build_prompt.md`, Section 6).
```

(repeat with the matching folder name for `compliance-service`, `risk-scoring`, `decision-engine`)

`ledger-monitoring/README.md`:

```markdown
# ledger-monitoring

Placeholder — Phase 4 (see `docs/claude_code_build_prompt.md`, Section 6).
```

`packages/README.md`:

```markdown
# packages

Placeholder — will hold the shared Industry Document Registry client and sanctions client types once a second service consumes them (currently only `api` does, in-process).
```

- [ ] **Step 2: Write `infra/docker-compose.yml`**

```yaml
version: "3.8"
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: trade
      POSTGRES_PASSWORD: trade
      POSTGRES_DB: trade_finance
    ports:
      - "5433:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./postgres-init:/docker-entrypoint-initdb.d
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - miniodata:/data
volumes:
  pgdata:
  miniodata:
```

- [ ] **Step 3: Write `infra/postgres-init/001-create-test-db.sql`**

```sql
CREATE DATABASE trade_finance_test;
```

- [ ] **Step 4: Start infra and verify it's healthy**

```bash
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml ps
```

Expected: both `postgres` and `minio` show `running`/`healthy`.

- [ ] **Step 5: Write `api/requirements.txt`**

```
fastapi==0.115.0
uvicorn[standard]==0.32.0
sqlalchemy==2.0.35
asyncpg==0.29.0
alembic==1.13.3
pydantic==2.9.2
pydantic-settings==2.5.2
bcrypt==4.2.0
pyjwt==2.9.0
minio==7.2.9
python-multipart==0.0.12
```

- [ ] **Step 6: Write `api/requirements-dev.txt`**

```
-r requirements.txt
pytest==8.3.3
pytest-asyncio==0.24.0
httpx==0.27.2
```

- [ ] **Step 7: Create a virtualenv and install dependencies**

```bash
cd api
python -m venv .venv
. .venv/Scripts/activate   # Windows Git Bash; use `source .venv/bin/activate` on Linux/Mac
pip install -r requirements-dev.txt
```

- [ ] **Step 8: Write `api/pytest.ini`**

```ini
[pytest]
pythonpath = .
asyncio_mode = auto
```

- [ ] **Step 9: Write `api/app/__init__.py`** (empty file, makes `app` a package)

- [ ] **Step 10: Write `api/app/main.py`**

```python
from fastapi import FastAPI

app = FastAPI(title="UTFL Trade Finance API")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 11: Write the failing test `api/tests/test_health.py`**

```python
from httpx import AsyncClient, ASGITransport

from app.main import app


async def test_health_returns_ok():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 12: Run the test**

Run (from `api/`): `pytest tests/test_health.py -v`
Expected: PASS (1 test) — this only proves the FastAPI app boots and the test tooling (pytest, pytest-asyncio, httpx ASGI transport) works.

- [ ] **Step 13: Commit**

```bash
git add web sanctions-adapter document-intelligence compliance-service risk-scoring decision-engine ledger-monitoring packages infra api/requirements.txt api/requirements-dev.txt api/pytest.ini api/app/__init__.py api/app/main.py api/tests/test_health.py
git commit -m "Scaffold repo layout, infra compose, and API skeleton"
```

---

### Task 2: DB setup, Organization model, and shared test fixtures

**Files:**
- Create: `api/app/config.py`, `api/app/db.py`
- Create: `api/app/models/__init__.py`, `api/app/models/enums.py`, `api/app/models/organization.py`
- Create: `api/alembic.ini`, `api/alembic/env.py`, `api/alembic/script.py.mako`, `api/alembic/versions/0001_create_organizations.py`
- Create: `api/tests/conftest.py`
- Test: `api/tests/test_organization_model.py`

**Interfaces:**
- Consumes: nothing new
- Produces: `Base` (SQLAlchemy declarative base, `app/db.py`), `get_db()` (FastAPI dependency yielding an `AsyncSession`), `settings` (`app/config.py`, a `pydantic_settings.BaseSettings` instance), `Organization` model (`app/models/organization.py`), and the `db_session`/`async_client` pytest fixtures in `tests/conftest.py` that every later task's tests reuse.

- [ ] **Step 1: Write `api/app/config.py`**

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://trade:trade@localhost:5433/trade_finance"
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_expiry_minutes: int = 1440
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "trade-documents"

    class Config:
        env_file = ".env"


settings = Settings()
```

- [ ] **Step 2: Write `api/app/db.py`**

```python
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(settings.database_url, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncSession:
    async with SessionLocal() as session:
        yield session
```

- [ ] **Step 3: Write `api/app/models/__init__.py`** (empty file)

- [ ] **Step 4: Write `api/app/models/enums.py`**

```python
from enum import Enum


class OrgType(str, Enum):
    EXPORTER = "EXPORTER"
    BUYER = "BUYER"
    BANK = "BANK"


class KybStatus(str, Enum):
    PENDING = "PENDING"
    CLEAR = "CLEAR"
    REVIEW = "REVIEW"
    BLOCK = "BLOCK"


class UserRole(str, Enum):
    EXPORTER_ADMIN = "EXPORTER_ADMIN"
    DOCS_COMPLIANCE = "DOCS_COMPLIANCE"
    FINANCE = "FINANCE"
    VIEWER = "VIEWER"
    BUYER = "BUYER"
    BANK_REVIEWER = "BANK_REVIEWER"


class UserStatus(str, Enum):
    ACTIVE = "ACTIVE"
    INVITED = "INVITED"


class KybCheckType(str, Enum):
    BUSINESS_REGISTRATION = "BUSINESS_REGISTRATION"
    SANCTIONS_SCREENING = "SANCTIONS_SCREENING"
    BANK_ACCOUNT = "BANK_ACCOUNT"


class KybCheckStatus(str, Enum):
    PASSED = "PASSED"
    PENDING = "PENDING"
    FAILED = "FAILED"


class TradeStatus(str, Enum):
    DRAFT = "DRAFT"
    DOCS_UNDER_REVIEW = "DOCS_UNDER_REVIEW"
    COMPLIANCE_CLEAR = "COMPLIANCE_CLEAR"
    BANK_REVIEW = "BANK_REVIEW"
    ACCEPTED = "ACCEPTED"
    CLOSED = "CLOSED"


class DocumentVerificationStatus(str, Enum):
    UPLOADED = "UPLOADED"
    PENDING = "PENDING"
    VERIFIED = "VERIFIED"


class SanctionsStatus(str, Enum):
    CLEAR = "CLEAR"
    REVIEW = "REVIEW"
    BLOCK = "BLOCK"


class BankReviewResult(str, Enum):
    MATCHES_LC = "MATCHES_LC"
    DISCREPANCY = "DISCREPANCY"
```

- [ ] **Step 5: Write `api/app/models/organization.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.enums import KybStatus


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    org_type: Mapped[str] = mapped_column(String, nullable=False)
    country: Mapped[str] = mapped_column(String, nullable=False)
    industry: Mapped[str] = mapped_column(String, nullable=False)
    tax_id: Mapped[str] = mapped_column(String, nullable=False)
    kyb_status: Mapped[str] = mapped_column(String, nullable=False, default=KybStatus.PENDING.value)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 6: Initialize Alembic with the async template**

```bash
cd api
alembic init -t async alembic
```

- [ ] **Step 7: Edit `api/alembic.ini`** — set a default dev URL on the `sqlalchemy.url` line under `[alembic]`:

```ini
sqlalchemy.url = postgresql+asyncpg://trade:trade@localhost:5433/trade_finance
```

- [ ] **Step 8: Edit `api/alembic/env.py`** — import `Base` and all models so autogenerate can see them, and set `target_metadata`:

Replace the line `target_metadata = None` with:

```python
from app.db import Base
from app.models.organization import Organization  # noqa: F401

target_metadata = Base.metadata
```

(Every later task that adds a model appends its import to this same list, right after the `Organization` import.)

- [ ] **Step 9: Generate and inspect the migration**

```bash
alembic revision --autogenerate -m "create organizations"
```

Rename the generated file to `alembic/versions/0001_create_organizations.py` if Alembic didn't already give it a similar name, and confirm it contains an `op.create_table("organizations", ...)` with all six columns from Step 5.

- [ ] **Step 10: Apply the migration to the dev database**

```bash
alembic upgrade head
```

Expected: no errors; `\d organizations` in `psql` (or a GUI client) shows the table.

- [ ] **Step 11: Write `api/tests/conftest.py`**

```python
import os

import pytest
import pytest_asyncio
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.db import get_db
from app.main import app

TEST_DATABASE_URL = settings.database_url.replace("/trade_finance", "/trade_finance_test")


def _alembic_config() -> Config:
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
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
    engine = create_async_engine(TEST_DATABASE_URL)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
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

- [ ] **Step 12: Write the failing test `api/tests/test_organization_model.py`**

```python
from sqlalchemy import select

from app.models.enums import KybStatus
from app.models.organization import Organization


async def test_create_and_fetch_organization(db_session):
    org = Organization(
        name="MedCure Pharma Exports Pvt. Ltd.",
        org_type="EXPORTER",
        country="India",
        industry="Pharmaceuticals",
        tax_id="27AAECM1234B1Z5",
    )
    db_session.add(org)
    await db_session.commit()

    result = await db_session.execute(select(Organization).where(Organization.name == org.name))
    fetched = result.scalar_one()
    assert fetched.org_type == "EXPORTER"
    assert fetched.kyb_status == KybStatus.PENDING.value
    assert fetched.id is not None
```

- [ ] **Step 13: Run the test to verify it fails**

Run: `pytest tests/test_organization_model.py -v`
Expected: FAIL — either `trade_finance_test` database doesn't exist yet (rerun `docker compose -f ../infra/docker-compose.yml up -d` to trigger the init script) or the migration hasn't been applied there yet. If it fails for either of those infra reasons rather than an assertion, that's expected at this point in Step 13 — the fixture in Step 11 is what fixes it in Step 14.

- [ ] **Step 14: Run the test to verify it passes**

Run: `pytest tests/test_organization_model.py -v`
Expected: PASS (1 test) — the `_migrate_test_db` fixture runs the migration against `trade_finance_test` automatically.

- [ ] **Step 15: Commit**

```bash
git add app/config.py app/db.py app/models/__init__.py app/models/enums.py app/models/organization.py alembic.ini alembic/env.py alembic/script.py.mako alembic/versions/0001_create_organizations.py tests/conftest.py tests/test_organization_model.py
git commit -m "Add DB setup, Organization model, and shared test fixtures"
```

---

### Task 3: User model and password hashing

**Files:**
- Create: `api/app/models/user.py`, `api/app/auth/__init__.py`, `api/app/auth/security.py`
- Create: `api/alembic/versions/0002_create_users.py`
- Modify: `api/alembic/env.py` (add the `User` import)
- Test: `api/tests/test_user_model.py`

**Interfaces:**
- Consumes: `Organization` (Task 2)
- Produces: `User` model (`id, org_id, name, email, password_hash, role, status, created_at`), `hash_password(password: str) -> str`, `verify_password(password: str, password_hash: str) -> bool` (`app/auth/security.py`) — used by the signup/login endpoints in Tasks 5-6.

- [ ] **Step 1: Write the failing test `api/tests/test_user_model.py`**

```python
from sqlalchemy import select

from app.auth.security import hash_password, verify_password
from app.models.organization import Organization
from app.models.user import User


async def test_create_user_with_hashed_password(db_session):
    org = Organization(name="MedCure Pharma Exports", org_type="EXPORTER", country="India", industry="Pharmaceuticals", tax_id="27AAECM1234B1Z5")
    db_session.add(org)
    await db_session.flush()

    user = User(
        org_id=org.id,
        name="Priya Shah",
        email="priya@medcurepharma.example",
        password_hash=hash_password("correct horse battery staple"),
        role="EXPORTER_ADMIN",
        status="ACTIVE",
    )
    db_session.add(user)
    await db_session.commit()

    result = await db_session.execute(select(User).where(User.email == "priya@medcurepharma.example"))
    fetched = result.scalar_one()
    assert verify_password("correct horse battery staple", fetched.password_hash)
    assert not verify_password("wrong password", fetched.password_hash)
    assert fetched.org_id == org.id
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_user_model.py -v`
Expected: FAIL — `app.models.user` / `app.auth.security` don't exist yet.

- [ ] **Step 3: Write `api/app/auth/__init__.py`** (empty file)

- [ ] **Step 4: Write `api/app/auth/security.py`**

```python
import bcrypt


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())
```

- [ ] **Step 5: Write `api/app/models/user.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 6: Add the `User` import to `api/alembic/env.py`**, right after the `Organization` import:

```python
from app.models.user import User  # noqa: F401
```

- [ ] **Step 7: Generate and apply the migration**

```bash
alembic revision --autogenerate -m "create users"
```

Rename to `alembic/versions/0002_create_users.py`. Confirm it creates `users` with a foreign key to `organizations` and a unique constraint on `email`.

```bash
alembic upgrade head
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pytest tests/test_user_model.py -v`
Expected: PASS (1 test) — the session-scoped `_migrate_test_db` fixture re-runs `downgrade base` + `upgrade head`, picking up the new migration automatically.

- [ ] **Step 9: Commit**

```bash
git add app/models/user.py app/auth/__init__.py app/auth/security.py alembic/env.py alembic/versions/0002_create_users.py tests/test_user_model.py
git commit -m "Add User model and password hashing"
```

---

### Task 4: KYB check model and sanctions client interface

**Files:**
- Create: `api/app/models/kyb_check.py`
- Create: `api/app/sanctions/__init__.py`, `api/app/sanctions/client.py`, `api/app/sanctions/fake.py`, `api/app/sanctions/dependency.py`
- Create: `api/alembic/versions/0003_create_kyb_checks.py`
- Modify: `api/alembic/env.py`
- Test: `api/tests/test_kyb_check_model.py`

**Interfaces:**
- Consumes: `Organization` (Task 2)
- Produces: `KybCheck` model (`id, org_id, check_type, status, detail, checked_at`), `SanctionsResult` (TypedDict: `status, matches, raw`), `SanctionsClient` (Protocol: `async def screen(name: str, country: str) -> SanctionsResult`), `FakeSanctionsClient` (test/dev implementation), `get_sanctions_client()` (FastAPI dependency returning a `SanctionsClient`) — all consumed by the signup flow in Task 5.

- [ ] **Step 1: Write the failing test `api/tests/test_kyb_check_model.py`**

```python
from sqlalchemy import select

from app.models.enums import KybCheckStatus, KybCheckType
from app.models.kyb_check import KybCheck
from app.models.organization import Organization
from app.sanctions.fake import FakeSanctionsClient


async def test_create_kyb_check_rows(db_session):
    org = Organization(name="MedCure Pharma Exports", org_type="EXPORTER", country="India", industry="Pharmaceuticals", tax_id="27AAECM1234B1Z5")
    db_session.add(org)
    await db_session.flush()

    db_session.add_all(
        [
            KybCheck(org_id=org.id, check_type=KybCheckType.BUSINESS_REGISTRATION.value, status=KybCheckStatus.PASSED.value),
            KybCheck(org_id=org.id, check_type=KybCheckType.SANCTIONS_SCREENING.value, status=KybCheckStatus.PASSED.value, detail="fake:CLEAR"),
            KybCheck(org_id=org.id, check_type=KybCheckType.BANK_ACCOUNT.value, status=KybCheckStatus.PASSED.value),
        ]
    )
    await db_session.commit()

    rows = (await db_session.execute(select(KybCheck).where(KybCheck.org_id == org.id))).scalars().all()
    assert len(rows) == 3
    assert {r.check_type for r in rows} == {"BUSINESS_REGISTRATION", "SANCTIONS_SCREENING", "BANK_ACCOUNT"}


async def test_fake_sanctions_client_returns_clear():
    client = FakeSanctionsClient()
    result = await client.screen(name="MedCure Pharma Exports", country="India")
    assert result["status"] == "CLEAR"
    assert result["matches"] == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_kyb_check_model.py -v`
Expected: FAIL — `app.models.kyb_check` / `app.sanctions.*` don't exist yet.

- [ ] **Step 3: Write `api/app/sanctions/__init__.py`** (empty file)

- [ ] **Step 4: Write `api/app/sanctions/client.py`**

```python
from typing import Any, Protocol, TypedDict


class SanctionsResult(TypedDict):
    status: str  # CLEAR | REVIEW | BLOCK
    matches: list[dict[str, Any]]
    raw: dict[str, Any]


class SanctionsClient(Protocol):
    async def screen(self, name: str, country: str) -> SanctionsResult: ...
```

- [ ] **Step 5: Write `api/app/sanctions/fake.py`**

```python
from app.sanctions.client import SanctionsResult


class FakeSanctionsClient:
    async def screen(self, name: str, country: str) -> SanctionsResult:
        return {"status": "CLEAR", "matches": [], "raw": {"provider": "fake", "name": name, "country": country}}
```

- [ ] **Step 6: Write `api/app/sanctions/dependency.py`**

```python
from app.sanctions.client import SanctionsClient
from app.sanctions.fake import FakeSanctionsClient


def get_sanctions_client() -> SanctionsClient:
    # Swapped for a real HTTP-calling client once the sanctions-adapter
    # sub-project exists; the interface in client.py does not change.
    return FakeSanctionsClient()
```

- [ ] **Step 7: Write `api/app/models/kyb_check.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class KybCheck(Base):
    __tablename__ = "kyb_checks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    check_type: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    detail: Mapped[str | None] = mapped_column(String, nullable=True)
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 8: Add the `KybCheck` import to `api/alembic/env.py`**, after the `User` import:

```python
from app.models.kyb_check import KybCheck  # noqa: F401
```

- [ ] **Step 9: Generate and apply the migration**

```bash
alembic revision --autogenerate -m "create kyb_checks"
```

Rename to `alembic/versions/0003_create_kyb_checks.py`.

```bash
alembic upgrade head
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `pytest tests/test_kyb_check_model.py -v`
Expected: PASS (2 tests)

- [ ] **Step 11: Commit**

```bash
git add app/models/kyb_check.py app/sanctions alembic/env.py alembic/versions/0003_create_kyb_checks.py tests/test_kyb_check_model.py
git commit -m "Add KybCheck model and SanctionsClient interface"
```

---

### Task 5: Signup endpoint

**Files:**
- Create: `api/app/schemas/__init__.py`, `api/app/schemas/organization.py`, `api/app/schemas/auth.py`
- Create: `api/app/routers/__init__.py`, `api/app/routers/auth.py`
- Modify: `api/app/main.py` (include the auth router)
- Test: `api/tests/test_auth_signup.py`

**Interfaces:**
- Consumes: `Organization` (Task 2), `User`, `hash_password` (Task 3), `KybCheck`, `get_sanctions_client` (Task 4)
- Produces: `POST /auth/signup` → `{organization: {...}, user: {...}}` (201). `SignupRequest` / `SignupResponse` Pydantic schemas (`app/schemas/auth.py`) reused nowhere else, but the pattern (schema module per router) is reused by every later router task.

- [ ] **Step 1: Write `api/app/schemas/__init__.py`** (empty file)

- [ ] **Step 2: Write `api/app/schemas/organization.py`**

```python
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import KybStatus, OrgType


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
```

- [ ] **Step 3: Write the failing test `api/tests/test_auth_signup.py`**

```python
from sqlalchemy import select

from app.models.kyb_check import KybCheck
from app.models.organization import Organization
from app.models.user import User


async def test_signup_creates_org_user_and_kyb_checks(async_client):
    payload = {
        "organization": {
            "name": "MedCure Pharma Exports Pvt. Ltd.",
            "org_type": "EXPORTER",
            "country": "India",
            "industry": "Pharmaceuticals",
            "tax_id": "27AAECM1234B1Z5",
        },
        "admin_user": {
            "name": "Priya Shah",
            "email": "priya@medcurepharma.example",
            "password": "correct horse battery staple",
        },
    }

    response = await async_client.post("/auth/signup", json=payload)

    assert response.status_code == 201
    body = response.json()
    assert body["organization"]["name"] == "MedCure Pharma Exports Pvt. Ltd."
    assert body["organization"]["kyb_status"] == "PENDING"
    assert body["user"]["email"] == "priya@medcurepharma.example"
    assert body["user"]["role"] == "EXPORTER_ADMIN"


async def test_signup_creates_three_kyb_check_rows(async_client, db_session):
    payload = {
        "organization": {
            "name": "Kyoto Textile Trading Co.",
            "org_type": "EXPORTER",
            "country": "India",
            "industry": "Textiles",
            "tax_id": "29AABCT1111C1Z2",
        },
        "admin_user": {"name": "Arjun Nair", "email": "arjun@kyototextile.example", "password": "another secret"},
    }
    response = await async_client.post("/auth/signup", json=payload)
    org_id = response.json()["organization"]["id"]

    rows = (await db_session.execute(select(KybCheck).where(KybCheck.org_id == org_id))).scalars().all()
    assert len(rows) == 3
    by_type = {r.check_type: r for r in rows}
    assert by_type["SANCTIONS_SCREENING"].status == "PASSED"
    assert by_type["SANCTIONS_SCREENING"].detail is not None
    assert by_type["BUSINESS_REGISTRATION"].status == "PASSED"
    assert by_type["BANK_ACCOUNT"].status == "PASSED"


async def test_signup_rejects_duplicate_email(async_client):
    payload = {
        "organization": {"name": "Org A", "org_type": "EXPORTER", "country": "India", "industry": "Pharmaceuticals", "tax_id": "TAX-A"},
        "admin_user": {"name": "User A", "email": "dupe@example.com", "password": "password one"},
    }
    await async_client.post("/auth/signup", json=payload)

    payload2 = {
        "organization": {"name": "Org B", "org_type": "EXPORTER", "country": "India", "industry": "Pharmaceuticals", "tax_id": "TAX-B"},
        "admin_user": {"name": "User B", "email": "dupe@example.com", "password": "password two"},
    }
    response = await async_client.post("/auth/signup", json=payload2)
    assert response.status_code == 409
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pytest tests/test_auth_signup.py -v`
Expected: FAIL — `/auth/signup` doesn't exist (404).

- [ ] **Step 5: Write `api/app/schemas/auth.py`**

```python
import uuid

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models.enums import OrgType
from app.schemas.organization import OrganizationOut


class SignupOrganization(BaseModel):
    name: str
    org_type: OrgType
    country: str
    industry: str
    tax_id: str


class SignupAdminUser(BaseModel):
    name: str
    email: EmailStr
    password: str


class SignupRequest(BaseModel):
    organization: SignupOrganization
    admin_user: SignupAdminUser


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    email: str
    role: str
    status: str


class SignupResponse(BaseModel):
    organization: OrganizationOut
    user: UserOut
```

- [ ] **Step 6: Write `api/app/routers/__init__.py`** (empty file)

- [ ] **Step 7: Write `api/app/routers/auth.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import hash_password
from app.db import get_db
from app.models.enums import KybCheckStatus, KybCheckType, UserRole, UserStatus
from app.models.kyb_check import KybCheck
from app.models.organization import Organization
from app.models.user import User
from app.sanctions.client import SanctionsClient
from app.sanctions.dependency import get_sanctions_client
from app.schemas.auth import SignupRequest, SignupResponse

router = APIRouter(prefix="/auth", tags=["auth"])

ORG_TYPE_TO_ADMIN_ROLE = {
    "EXPORTER": UserRole.EXPORTER_ADMIN.value,
    "BUYER": UserRole.BUYER.value,
    "BANK": UserRole.BANK_REVIEWER.value,
}


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    payload: SignupRequest,
    db: AsyncSession = Depends(get_db),
    sanctions_client: SanctionsClient = Depends(get_sanctions_client),
) -> SignupResponse:
    existing = await db.execute(select(User).where(User.email == payload.admin_user.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    org = Organization(
        name=payload.organization.name,
        org_type=payload.organization.org_type.value,
        country=payload.organization.country,
        industry=payload.organization.industry,
        tax_id=payload.organization.tax_id,
    )
    db.add(org)
    await db.flush()

    admin_role = ORG_TYPE_TO_ADMIN_ROLE[payload.organization.org_type.value]
    user = User(
        org_id=org.id,
        name=payload.admin_user.name,
        email=payload.admin_user.email,
        password_hash=hash_password(payload.admin_user.password),
        role=admin_role,
        status=UserStatus.ACTIVE.value,
    )
    db.add(user)

    sanctions_result = await sanctions_client.screen(name=org.name, country=org.country)
    db.add_all(
        [
            KybCheck(org_id=org.id, check_type=KybCheckType.BUSINESS_REGISTRATION.value, status=KybCheckStatus.PASSED.value),
            KybCheck(
                org_id=org.id,
                check_type=KybCheckType.SANCTIONS_SCREENING.value,
                status=KybCheckStatus.PASSED.value if sanctions_result["status"] == "CLEAR" else KybCheckStatus.FAILED.value,
                detail=f"fake:{sanctions_result['status']}",
            ),
            KybCheck(org_id=org.id, check_type=KybCheckType.BANK_ACCOUNT.value, status=KybCheckStatus.PASSED.value),
        ]
    )

    await db.commit()
    await db.refresh(org)
    await db.refresh(user)

    return SignupResponse(organization=org, user=user)
```

- [ ] **Step 8: Wire the router into `api/app/main.py`**

```python
from fastapi import FastAPI

from app.routers import auth

app = FastAPI(title="UTFL Trade Finance API")
app.include_router(auth.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `pytest tests/test_auth_signup.py -v`
Expected: PASS (3 tests)

- [ ] **Step 10: Commit**

```bash
git add app/schemas app/routers app/main.py tests/test_auth_signup.py
git commit -m "Add signup endpoint"
```

---

### Task 6: Login, JWT, and RBAC dependencies

**Files:**
- Modify: `api/app/auth/security.py` (add JWT functions)
- Create: `api/app/auth/dependencies.py`
- Modify: `api/app/schemas/auth.py` (add login schemas)
- Modify: `api/app/routers/auth.py` (add `/auth/login`, `/auth/me`)
- Test: `api/tests/test_auth_login.py`

**Interfaces:**
- Consumes: `User`, `verify_password` (Task 3), `hash_password` output already stored (Task 5)
- Produces: `create_access_token(user_id, org_id, role) -> str`, `decode_access_token(token) -> dict | None` (`app/auth/security.py`); `get_current_user` and `require_role(*roles)` FastAPI dependencies (`app/auth/dependencies.py`) — used by every protected route in Tasks 7-13.

- [ ] **Step 1: Write the failing test `api/tests/test_auth_login.py`**

```python
async def _signup(async_client, email: str, password: str, org_type: str = "EXPORTER") -> None:
    payload = {
        "organization": {"name": "Test Org", "org_type": org_type, "country": "India", "industry": "Pharmaceuticals", "tax_id": "TAX-1"},
        "admin_user": {"name": "Test User", "email": email, "password": password},
    }
    response = await async_client.post("/auth/signup", json=payload)
    assert response.status_code == 201


async def test_login_returns_jwt_and_me_returns_profile(async_client):
    await _signup(async_client, "login-test@example.com", "correct horse battery staple")

    login_response = await async_client.post(
        "/auth/login", json={"email": "login-test@example.com", "password": "correct horse battery staple"}
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    assert token

    me_response = await async_client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "login-test@example.com"


async def test_login_rejects_wrong_password(async_client):
    await _signup(async_client, "wrongpass@example.com", "the real password")

    response = await async_client.post("/auth/login", json={"email": "wrongpass@example.com", "password": "not it"})
    assert response.status_code == 401


async def test_me_rejects_missing_token(async_client):
    response = await async_client.get("/auth/me")
    assert response.status_code in (401, 403)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_auth_login.py -v`
Expected: FAIL — `/auth/login` and `/auth/me` don't exist.

- [ ] **Step 3: Add JWT functions to `api/app/auth/security.py`**

```python
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_access_token(user_id: str, org_id: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expiry_minutes)
    payload = {"sub": user_id, "org_id": org_id, "role": role, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
```

- [ ] **Step 4: Write `api/app/auth/dependencies.py`**

```python
import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import decode_access_token
from app.db import get_db
from app.models.user import User

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    user = await db.get(User, uuid.UUID(payload["sub"]))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_role(*roles: str):
    async def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return user

    return dependency
```

- [ ] **Step 5: Add login schemas to `api/app/schemas/auth.py`** (append)

```python
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
```

- [ ] **Step 6: Add `/auth/login` and `/auth/me` to `api/app/routers/auth.py`** (append, adding these imports at the top alongside the existing ones: `from app.auth.dependencies import get_current_user` and `from app.auth.security import create_access_token, hash_password, verify_password` — replacing the earlier single `hash_password` import — and `from app.schemas.auth import LoginRequest, LoginResponse, SignupRequest, SignupResponse, UserOut`)

```python
@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> LoginResponse:
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    token = create_access_token(user_id=str(user.id), org_id=str(user.org_id), role=user.role)
    return LoginResponse(access_token=token)


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)) -> UserOut:
    return current_user
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pytest tests/test_auth_login.py -v`
Expected: PASS (3 tests)

- [ ] **Step 8: Run the full suite so far to check nothing regressed**

Run: `pytest -v`
Expected: all tests from Tasks 1-6 PASS.

- [ ] **Step 9: Commit**

```bash
git add app/auth/security.py app/auth/dependencies.py app/schemas/auth.py app/routers/auth.py tests/test_auth_login.py
git commit -m "Add login, JWT issuance, and RBAC dependencies"
```

---

### Task 7: Organizations read endpoints

**Files:**
- Create: `api/app/schemas/kyb_check.py`
- Create: `api/app/routers/organizations.py`
- Modify: `api/app/main.py`
- Test: `api/tests/test_organizations_endpoints.py`

**Interfaces:**
- Consumes: `Organization`, `KybCheck` (Tasks 2, 4), `get_current_user` (Task 6)
- Produces: `GET /organizations/{id}`, `GET /organizations/{id}/kyb-checks` — both require authentication (any role), used later by the web portal's org/KYB screens.

- [ ] **Step 1: Write the failing test `api/tests/test_organizations_endpoints.py`**

```python
async def _signup_and_login(async_client, email: str) -> tuple[str, str]:
    signup_payload = {
        "organization": {"name": "Test Org", "org_type": "EXPORTER", "country": "India", "industry": "Pharmaceuticals", "tax_id": "TAX-ORG-1"},
        "admin_user": {"name": "Test User", "email": email, "password": "a good password"},
    }
    signup_response = await async_client.post("/auth/signup", json=signup_payload)
    org_id = signup_response.json()["organization"]["id"]

    login_response = await async_client.post("/auth/login", json={"email": email, "password": "a good password"})
    token = login_response.json()["access_token"]
    return org_id, token


async def test_get_organization_requires_auth(async_client):
    org_id, _ = await _signup_and_login(async_client, "org-read-1@example.com")
    response = await async_client.get(f"/organizations/{org_id}")
    assert response.status_code in (401, 403)


async def test_get_organization_returns_org(async_client):
    org_id, token = await _signup_and_login(async_client, "org-read-2@example.com")
    response = await async_client.get(f"/organizations/{org_id}", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["id"] == org_id


async def test_get_organization_kyb_checks(async_client):
    org_id, token = await _signup_and_login(async_client, "org-read-3@example.com")
    response = await async_client.get(f"/organizations/{org_id}/kyb-checks", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    checks = response.json()
    assert len(checks) == 3
    assert {c["check_type"] for c in checks} == {"BUSINESS_REGISTRATION", "SANCTIONS_SCREENING", "BANK_ACCOUNT"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_organizations_endpoints.py -v`
Expected: FAIL — routes don't exist (404s where 401/403/200 expected).

- [ ] **Step 3: Write `api/app/schemas/kyb_check.py`**

```python
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import KybCheckStatus, KybCheckType


class KybCheckOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    check_type: KybCheckType
    status: KybCheckStatus
    detail: str | None
    checked_at: datetime
```

- [ ] **Step 4: Write `api/app/routers/organizations.py`**

```python
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.db import get_db
from app.models.kyb_check import KybCheck
from app.models.organization import Organization
from app.models.user import User
from app.schemas.kyb_check import KybCheckOut
from app.schemas.organization import OrganizationOut

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get("/{org_id}", response_model=OrganizationOut, dependencies=[Depends(get_current_user)])
async def get_organization(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> OrganizationOut:
    org = await db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return org


@router.get("/{org_id}/kyb-checks", response_model=list[KybCheckOut])
async def get_organization_kyb_checks(
    org_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> list[KybCheckOut]:
    result = await db.execute(select(KybCheck).where(KybCheck.org_id == org_id))
    return list(result.scalars().all())
```

- [ ] **Step 5: Wire the router into `api/app/main.py`**

```python
from app.routers import auth, organizations

app.include_router(auth.router)
app.include_router(organizations.router)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pytest tests/test_organizations_endpoints.py -v`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add app/schemas/kyb_check.py app/routers/organizations.py app/main.py tests/test_organizations_endpoints.py
git commit -m "Add organizations read endpoints"
```

---

### Task 8: Users listing and team invite

**Files:**
- Create: `api/app/schemas/user.py`
- Create: `api/app/routers/users.py`
- Modify: `api/app/main.py`
- Test: `api/tests/test_users_endpoints.py`

**Interfaces:**
- Consumes: `User` (Task 3), `get_current_user`, `require_role` (Task 6)
- Produces: `GET /users` (org-scoped list), `POST /users` (invite a teammate into the caller's org, status `INVITED`) — backs the prototype's Team page.

- [ ] **Step 1: Write the failing test `api/tests/test_users_endpoints.py`**

```python
async def _signup_and_login(async_client, email: str) -> str:
    signup_payload = {
        "organization": {"name": "Test Org", "org_type": "EXPORTER", "country": "India", "industry": "Pharmaceuticals", "tax_id": "TAX-USERS-1"},
        "admin_user": {"name": "Admin User", "email": email, "password": "a good password"},
    }
    await async_client.post("/auth/signup", json=signup_payload)
    login_response = await async_client.post("/auth/login", json={"email": email, "password": "a good password"})
    return login_response.json()["access_token"]


async def test_list_users_returns_only_own_org(async_client):
    token_a = await _signup_and_login(async_client, "org-a-admin@example.com")
    await _signup_and_login(async_client, "org-b-admin@example.com")

    response = await async_client.get("/users", headers={"Authorization": f"Bearer {token_a}"})
    assert response.status_code == 200
    emails = {u["email"] for u in response.json()}
    assert emails == {"org-a-admin@example.com"}


async def test_invite_teammate_creates_invited_user(async_client):
    token = await _signup_and_login(async_client, "invite-admin@example.com")

    response = await async_client.post(
        "/users",
        json={"name": "Arjun Nair", "email": "arjun-invited@example.com", "role": "DOCS_COMPLIANCE"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "INVITED"
    assert body["role"] == "DOCS_COMPLIANCE"


async def test_invite_teammate_rejects_non_admin(async_client):
    admin_token = await _signup_and_login(async_client, "invite-admin-2@example.com")
    await async_client.post(
        "/users",
        json={"name": "Viewer Person", "email": "viewer-person@example.com", "role": "VIEWER"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    viewer_login = await async_client.post("/auth/login", json={"email": "viewer-person@example.com", "password": "invited-no-password-yet"})
    # Invited users have no usable password yet in Phase 1 (no invite-acceptance
    # flow is in scope) — this asserts login correctly rejects, not that
    # invited users can act; team-invite acceptance is a documented gap.
    assert viewer_login.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_users_endpoints.py -v`
Expected: FAIL — `/users` doesn't exist.

- [ ] **Step 3: Write `api/app/schemas/user.py`**

```python
import uuid

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models.enums import UserRole, UserStatus


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    email: str
    role: UserRole
    status: UserStatus


class InviteUserRequest(BaseModel):
    name: str
    email: EmailStr
    role: UserRole
```

- [ ] **Step 4: Write `api/app/routers/users.py`**

```python
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_role
from app.db import get_db
from app.models.enums import UserRole, UserStatus
from app.models.user import User
from app.schemas.user import InviteUserRequest, UserOut

router = APIRouter(prefix="/users", tags=["users"])

ADMIN_ROLES = (UserRole.EXPORTER_ADMIN.value, UserRole.BANK_REVIEWER.value, UserRole.BUYER.value)


@router.get("", response_model=list[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[UserOut]:
    result = await db.execute(select(User).where(User.org_id == current_user.org_id))
    return list(result.scalars().all())


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def invite_user(
    payload: InviteUserRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(*ADMIN_ROLES)),
) -> UserOut:
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    new_user = User(
        org_id=current_user.org_id,
        name=payload.name,
        email=payload.email,
        password_hash="",  # no invite-acceptance/password-set flow in Phase 1 scope
        role=payload.role.value,
        status=UserStatus.INVITED.value,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user
```

- [ ] **Step 5: Wire the router into `api/app/main.py`**

```python
from app.routers import auth, organizations, users

app.include_router(auth.router)
app.include_router(organizations.router)
app.include_router(users.router)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pytest tests/test_users_endpoints.py -v`
Expected: PASS (3 tests) — note an empty `password_hash` never verifies against any password via `verify_password` (bcrypt will raise or return `False` on a malformed hash; either way login fails as asserted), so this documents the gap safely rather than leaving an exploitable blank-password login.

- [ ] **Step 7: Commit**

```bash
git add app/schemas/user.py app/routers/users.py app/main.py tests/test_users_endpoints.py
git commit -m "Add users listing and team invite endpoints"
```

---

### Task 9: Document registry model, seed data, and endpoint

**Files:**
- Create: `api/app/models/document_registry.py`
- Create: `api/app/schemas/document_registry.py`
- Create: `api/app/routers/document_registry.py`
- Create: `api/alembic/versions/0004_create_document_registry.py`
- Modify: `api/alembic/env.py`, `api/app/main.py`
- Test: `api/tests/test_document_registry_endpoints.py`

**Interfaces:**
- Consumes: nothing new
- Produces: `DocumentRegistryEntry` model (`id, industry, instrument_type, document_type, category, mandatory, lc_required`), `GET /document-registry?industry=&instrument_type=` — consumed later by Task 10's trade-creation flow and eventually by the `web` portal's New Transaction / Documents tab checklist.

- [ ] **Step 1: Write the failing test `api/tests/test_document_registry_endpoints.py`**

```python
async def _signup_and_login(async_client, email: str) -> str:
    signup_payload = {
        "organization": {"name": "Test Org", "org_type": "EXPORTER", "country": "India", "industry": "Pharmaceuticals", "tax_id": "TAX-REG-1"},
        "admin_user": {"name": "Admin User", "email": email, "password": "a good password"},
    }
    await async_client.post("/auth/signup", json=signup_payload)
    login_response = await async_client.post("/auth/login", json={"email": email, "password": "a good password"})
    return login_response.json()["access_token"]


async def test_document_registry_returns_pharma_checklist(async_client):
    token = await _signup_and_login(async_client, "registry-reader@example.com")

    response = await async_client.get(
        "/document-registry",
        params={"industry": "Pharmaceuticals", "instrument_type": "Letter of Credit"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    entries = response.json()
    document_types = {e["document_type"] for e in entries}
    assert "Drug Manufacturing License (Form 25/28)" in document_types
    assert "Certificate of Analysis (CoA)" in document_types
    assert all(e["industry"] == "Pharmaceuticals" for e in entries)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_document_registry_endpoints.py -v`
Expected: FAIL — `/document-registry` doesn't exist and the table is empty/nonexistent.

- [ ] **Step 3: Write `api/app/models/document_registry.py`**

```python
import uuid

from sqlalchemy import Boolean, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class DocumentRegistryEntry(Base):
    __tablename__ = "document_registry"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    industry: Mapped[str] = mapped_column(String, nullable=False)
    instrument_type: Mapped[str] = mapped_column(String, nullable=False)
    document_type: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False)
    mandatory: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    lc_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
```

- [ ] **Step 4: Add the import to `api/alembic/env.py`**

```python
from app.models.document_registry import DocumentRegistryEntry  # noqa: F401
```

- [ ] **Step 5: Generate the schema migration**

```bash
alembic revision --autogenerate -m "create document_registry"
```

Rename to `alembic/versions/0004_create_document_registry.py`.

- [ ] **Step 6: Append seed data to the same migration file**, inside its `upgrade()` function, after the `op.create_table(...)` call (and add a matching `op.execute("DELETE FROM document_registry")` at the top of `downgrade()`, before the `op.drop_table(...)` call):

```python
    document_registry = sa.table(
        "document_registry",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("industry", sa.String),
        sa.column("instrument_type", sa.String),
        sa.column("document_type", sa.String),
        sa.column("category", sa.String),
        sa.column("mandatory", sa.Boolean),
        sa.column("lc_required", sa.Boolean),
    )
    op.bulk_insert(
        document_registry,
        [
            {"id": uuid.uuid4(), "industry": "Pharmaceuticals", "instrument_type": "Letter of Credit", "document_type": "Drug Manufacturing License (Form 25/28)", "category": "Regulatory / Compliance", "mandatory": True, "lc_required": False},
            {"id": uuid.uuid4(), "industry": "Pharmaceuticals", "instrument_type": "Letter of Credit", "document_type": "Certificate of Pharmaceutical Product (CoPP)", "category": "Regulatory / Compliance", "mandatory": True, "lc_required": True},
            {"id": uuid.uuid4(), "industry": "Pharmaceuticals", "instrument_type": "Letter of Credit", "document_type": "WHO-GMP / Schedule-M Certificate", "category": "Regulatory / Compliance", "mandatory": True, "lc_required": True},
            {"id": uuid.uuid4(), "industry": "Pharmaceuticals", "instrument_type": "Letter of Credit", "document_type": "Certificate of Analysis (CoA)", "category": "Regulatory / Compliance", "mandatory": True, "lc_required": True},
            {"id": uuid.uuid4(), "industry": "Pharmaceuticals", "instrument_type": "Letter of Credit", "document_type": "Free Sale Certificate", "category": "Regulatory / Compliance", "mandatory": True, "lc_required": False},
            {"id": uuid.uuid4(), "industry": "Pharmaceuticals", "instrument_type": "Letter of Credit", "document_type": "Cold-Chain Temperature Certificate", "category": "Regulatory / Compliance", "mandatory": False, "lc_required": False},
        ],
    )
```

Add the needed imports at the top of the generated migration file: `import uuid`, `from sqlalchemy.dialects import postgresql` (alongside the existing `import sqlalchemy as sa` and `from alembic import op`).

- [ ] **Step 7: Apply the migration**

```bash
alembic upgrade head
```

- [ ] **Step 8: Write `api/app/schemas/document_registry.py`**

```python
import uuid

from pydantic import BaseModel, ConfigDict


class DocumentRegistryEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    industry: str
    instrument_type: str
    document_type: str
    category: str
    mandatory: bool
    lc_required: bool
```

- [ ] **Step 9: Write `api/app/routers/document_registry.py`**

```python
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.db import get_db
from app.models.document_registry import DocumentRegistryEntry
from app.schemas.document_registry import DocumentRegistryEntryOut

router = APIRouter(prefix="/document-registry", tags=["document-registry"])


@router.get("", response_model=list[DocumentRegistryEntryOut], dependencies=[Depends(get_current_user)])
async def list_document_registry(
    industry: str,
    instrument_type: str,
    db: AsyncSession = Depends(get_db),
) -> list[DocumentRegistryEntryOut]:
    result = await db.execute(
        select(DocumentRegistryEntry).where(
            DocumentRegistryEntry.industry == industry,
            DocumentRegistryEntry.instrument_type == instrument_type,
        )
    )
    return list(result.scalars().all())
```

- [ ] **Step 10: Wire the router into `api/app/main.py`**

```python
from app.routers import auth, document_registry, organizations, users

app.include_router(auth.router)
app.include_router(organizations.router)
app.include_router(users.router)
app.include_router(document_registry.router)
```

- [ ] **Step 11: Run tests to verify they pass**

Run: `pytest tests/test_document_registry_endpoints.py -v`
Expected: PASS (1 test)

- [ ] **Step 12: Commit**

```bash
git add app/models/document_registry.py app/schemas/document_registry.py app/routers/document_registry.py alembic/env.py alembic/versions/0004_create_document_registry.py app/main.py tests/test_document_registry_endpoints.py
git commit -m "Add document registry model, seed data, and endpoint"
```

---

### Task 10: Trade model and endpoints

**Files:**
- Create: `api/app/models/trade.py`, `api/app/schemas/trade.py`, `api/app/access.py`, `api/app/routers/trades.py`
- Create: `api/alembic/versions/0005_create_trades.py`
- Modify: `api/alembic/env.py`, `api/app/main.py`
- Test: `api/tests/test_trades_endpoints.py`

**Interfaces:**
- Consumes: `Organization` (Task 2), `get_current_user` (Task 6)
- Produces: `Trade` model (all fields from the spec's `trades` table), `user_can_access_trade(user, trade) -> bool` and `trades_query_for_user(user) -> Select` (`app/access.py`, reused by Tasks 11-13), `POST /trades`, `GET /trades`, `GET /trades/{id}`.

- [ ] **Step 1: Write the failing test `api/tests/test_trades_endpoints.py`**

```python
async def _signup_and_login(async_client, email: str, org_type: str = "EXPORTER", industry: str = "Pharmaceuticals") -> tuple[str, str]:
    signup_payload = {
        "organization": {"name": f"Org for {email}", "org_type": org_type, "country": "India", "industry": industry, "tax_id": f"TAX-{email}"},
        "admin_user": {"name": "Admin User", "email": email, "password": "a good password"},
    }
    response = await async_client.post("/auth/signup", json=signup_payload)
    org_id = response.json()["organization"]["id"]
    login_response = await async_client.post("/auth/login", json={"email": email, "password": "a good password"})
    return org_id, login_response.json()["access_token"]


async def _create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id):
    payload = {
        "lc_reference": "MUFGJP2026LC1187",
        "industry": "Pharmaceuticals",
        "instrument_type": "Letter of Credit",
        "exporter_org_id": exporter_org_id,
        "buyer_org_id": buyer_org_id,
        "issuing_bank_org_id": issuing_bank_org_id,
        "advising_bank_org_id": advising_bank_org_id,
        "product_description": "Paracetamol Tablets 500mg, HS 3004.90",
        "order_value": "80000.00",
        "currency": "USD",
        "incoterm": "CIF Osaka",
        "payment_term": "Usance LC, 60 days",
    }
    return await async_client.post("/trades", json=payload, headers={"Authorization": f"Bearer {exporter_token}"})


async def test_create_and_get_trade(async_client):
    exporter_org_id, exporter_token = await _signup_and_login(async_client, "exporter-1@example.com")
    buyer_org_id, _ = await _signup_and_login(async_client, "buyer-1@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await _signup_and_login(async_client, "issuing-bank-1@example.com", org_type="BANK")
    advising_bank_org_id, _ = await _signup_and_login(async_client, "advising-bank-1@example.com", org_type="BANK")

    create_response = await _create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)
    assert create_response.status_code == 201
    trade = create_response.json()
    assert trade["status"] == "DRAFT"
    assert trade["lc_reference"] == "MUFGJP2026LC1187"

    get_response = await async_client.get(f"/trades/{trade['id']}", headers={"Authorization": f"Bearer {exporter_token}"})
    assert get_response.status_code == 200
    assert get_response.json()["id"] == trade["id"]


async def test_trade_list_is_scoped_to_participant_orgs(async_client):
    exporter_org_id, exporter_token = await _signup_and_login(async_client, "exporter-2@example.com")
    buyer_org_id, _ = await _signup_and_login(async_client, "buyer-2@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await _signup_and_login(async_client, "issuing-bank-2@example.com", org_type="BANK")
    advising_bank_org_id, _ = await _signup_and_login(async_client, "advising-bank-2@example.com", org_type="BANK")
    _unrelated_org_id, unrelated_token = await _signup_and_login(async_client, "unrelated-2@example.com", org_type="BANK")

    await _create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)

    own_list = await async_client.get("/trades", headers={"Authorization": f"Bearer {exporter_token}"})
    assert len(own_list.json()) == 1

    unrelated_list = await async_client.get("/trades", headers={"Authorization": f"Bearer {unrelated_token}"})
    assert unrelated_list.json() == []


async def test_get_trade_rejects_non_participant(async_client):
    exporter_org_id, exporter_token = await _signup_and_login(async_client, "exporter-3@example.com")
    buyer_org_id, _ = await _signup_and_login(async_client, "buyer-3@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await _signup_and_login(async_client, "issuing-bank-3@example.com", org_type="BANK")
    advising_bank_org_id, _ = await _signup_and_login(async_client, "advising-bank-3@example.com", org_type="BANK")
    _unrelated_org_id, unrelated_token = await _signup_and_login(async_client, "unrelated-3@example.com", org_type="BANK")

    create_response = await _create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)
    trade_id = create_response.json()["id"]

    response = await async_client.get(f"/trades/{trade_id}", headers={"Authorization": f"Bearer {unrelated_token}"})
    assert response.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_trades_endpoints.py -v`
Expected: FAIL — `/trades` doesn't exist.

- [ ] **Step 3: Write `api/app/models/trade.py`**

```python
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.enums import TradeStatus


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
    status: Mapped[str] = mapped_column(String, nullable=False, default=TradeStatus.DRAFT.value)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

- [ ] **Step 4: Add the import to `api/alembic/env.py`**

```python
from app.models.trade import Trade  # noqa: F401
```

- [ ] **Step 5: Generate and apply the migration**

```bash
alembic revision --autogenerate -m "create trades"
```

Rename to `alembic/versions/0005_create_trades.py`.

```bash
alembic upgrade head
```

- [ ] **Step 6: Write `api/app/access.py`**

```python
from sqlalchemy import Select, or_, select

from app.models.trade import Trade
from app.models.user import User


def user_can_access_trade(user: User, trade: Trade) -> bool:
    return user.org_id in {
        trade.exporter_org_id,
        trade.buyer_org_id,
        trade.issuing_bank_org_id,
        trade.advising_bank_org_id,
    }


def trades_query_for_user(user: User) -> Select:
    return select(Trade).where(
        or_(
            Trade.exporter_org_id == user.org_id,
            Trade.buyer_org_id == user.org_id,
            Trade.issuing_bank_org_id == user.org_id,
            Trade.advising_bank_org_id == user.org_id,
        )
    )
```

- [ ] **Step 7: Write `api/app/schemas/trade.py`**

```python
import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.models.enums import TradeStatus


class TradeCreate(BaseModel):
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
    status: TradeStatus
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 8: Write `api/app/routers/trades.py`**

```python
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.access import trades_query_for_user, user_can_access_trade
from app.auth.dependencies import get_current_user
from app.db import get_db
from app.models.trade import Trade
from app.models.user import User
from app.schemas.trade import TradeCreate, TradeOut

router = APIRouter(prefix="/trades", tags=["trades"])


@router.post("", response_model=TradeOut, status_code=status.HTTP_201_CREATED)
async def create_trade(
    payload: TradeCreate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> TradeOut:
    trade = Trade(**payload.model_dump())
    db.add(trade)
    await db.commit()
    await db.refresh(trade)
    return trade


@router.get("", response_model=list[TradeOut])
async def list_trades(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TradeOut]:
    result = await db.execute(trades_query_for_user(current_user))
    return list(result.scalars().all())


@router.get("/{trade_id}", response_model=TradeOut)
async def get_trade(
    trade_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TradeOut:
    trade = await db.get(Trade, trade_id)
    if trade is None or not user_can_access_trade(current_user, trade):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")
    return trade
```

- [ ] **Step 9: Wire the router into `api/app/main.py`**

```python
from app.routers import auth, document_registry, organizations, trades, users

app.include_router(trades.router)
```

(add this alongside the other `include_router` calls)

- [ ] **Step 10: Run tests to verify they pass**

Run: `pytest tests/test_trades_endpoints.py -v`
Expected: PASS (3 tests)

- [ ] **Step 11: Commit**

```bash
git add app/models/trade.py app/access.py app/schemas/trade.py app/routers/trades.py alembic/env.py alembic/versions/0005_create_trades.py app/main.py tests/test_trades_endpoints.py
git commit -m "Add Trade model and endpoints"
```

---

### Task 11: Document model, MinIO storage, hashing, and upload/list endpoints

**Files:**
- Create: `api/app/models/document.py`, `api/app/hashing.py`, `api/app/storage.py`, `api/app/schemas/document.py`, `api/app/routers/documents.py`
- Create: `api/alembic/versions/0006_create_documents.py`
- Modify: `api/alembic/env.py`, `api/app/main.py`
- Test: `api/tests/test_documents_endpoints.py`

**Interfaces:**
- Consumes: `Trade`, `user_can_access_trade` (Task 10), `User` (Task 3)
- Produces: `Document` model, `sha256_hex(data: bytes) -> str`, `upload_bytes(object_key, data, content_type) -> str`, `get_bytes(object_key) -> bytes` (`app/storage.py`), `POST /trades/{id}/documents`, `GET /trades/{id}/documents`.

- [ ] **Step 1: Write the failing test `api/tests/test_documents_endpoints.py`**

```python
import hashlib

from tests.test_trades_endpoints import _create_trade, _signup_and_login


async def test_upload_and_list_documents(async_client):
    exporter_org_id, exporter_token = await _signup_and_login(async_client, "doc-exporter-1@example.com")
    buyer_org_id, _ = await _signup_and_login(async_client, "doc-buyer-1@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await _signup_and_login(async_client, "doc-issuing-1@example.com", org_type="BANK")
    advising_bank_org_id, _ = await _signup_and_login(async_client, "doc-advising-1@example.com", org_type="BANK")

    trade_response = await _create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)
    trade_id = trade_response.json()["id"]

    file_content = b"fake pdf bytes for Certificate of Analysis"
    upload_response = await async_client.post(
        f"/trades/{trade_id}/documents",
        data={"category": "Regulatory / Compliance", "document_type": "Certificate of Analysis (CoA)"},
        files={"file": ("coa.pdf", file_content, "application/pdf")},
        headers={"Authorization": f"Bearer {exporter_token}"},
    )
    assert upload_response.status_code == 201
    document = upload_response.json()
    assert document["verification_status"] == "UPLOADED"
    assert document["on_chain_hash"] == hashlib.sha256(file_content).hexdigest()

    list_response = await async_client.get(f"/trades/{trade_id}/documents", headers={"Authorization": f"Bearer {exporter_token}"})
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1


async def test_reupload_same_document_type_appends_new_row(async_client):
    exporter_org_id, exporter_token = await _signup_and_login(async_client, "doc-exporter-2@example.com")
    buyer_org_id, _ = await _signup_and_login(async_client, "doc-buyer-2@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await _signup_and_login(async_client, "doc-issuing-2@example.com", org_type="BANK")
    advising_bank_org_id, _ = await _signup_and_login(async_client, "doc-advising-2@example.com", org_type="BANK")

    trade_response = await _create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)
    trade_id = trade_response.json()["id"]

    for content in (b"first version", b"corrected version"):
        await async_client.post(
            f"/trades/{trade_id}/documents",
            data={"category": "Regulatory / Compliance", "document_type": "Free Sale Certificate"},
            files={"file": ("fsc.pdf", content, "application/pdf")},
            headers={"Authorization": f"Bearer {exporter_token}"},
        )

    list_response = await async_client.get(f"/trades/{trade_id}/documents", headers={"Authorization": f"Bearer {exporter_token}"})
    matching = [d for d in list_response.json() if d["document_type"] == "Free Sale Certificate"]
    assert len(matching) == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_documents_endpoints.py -v`
Expected: FAIL — `/trades/{id}/documents` doesn't exist. (This will also fail to import `_create_trade`/`_signup_and_login` until Step 3 below makes them importable — see the note in Step 3.)

- [ ] **Step 3: Make the Task 10 test helpers importable**

Edit `api/tests/test_trades_endpoints.py`: remove the leading underscore from `_signup_and_login` and `_create_trade`, renaming them to `signup_and_login` and `create_trade`, and update every call site within that same file to match. Then update the new test file's import to `from tests.test_trades_endpoints import create_trade, signup_and_login` and its call sites (`_signup_and_login` → `signup_and_login`, `_create_trade` → `create_trade`).

- [ ] **Step 4: Write `api/app/hashing.py`**

```python
import hashlib


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
```

- [ ] **Step 5: Write `api/app/storage.py`**

```python
import io

from minio import Minio

from app.config import settings

_client = Minio(
    settings.minio_endpoint,
    access_key=settings.minio_access_key,
    secret_key=settings.minio_secret_key,
    secure=False,
)


def ensure_bucket() -> None:
    if not _client.bucket_exists(settings.minio_bucket):
        _client.make_bucket(settings.minio_bucket)


def upload_bytes(object_key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    ensure_bucket()
    _client.put_object(settings.minio_bucket, object_key, io.BytesIO(data), length=len(data), content_type=content_type)
    return object_key


def get_bytes(object_key: str) -> bytes:
    response = _client.get_object(settings.minio_bucket, object_key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()
```

- [ ] **Step 6: Write `api/app/models/document.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.enums import DocumentVerificationStatus


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trade_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trades.id"), nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False)
    document_type: Mapped[str] = mapped_column(String, nullable=False)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    submitted_to: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    off_chain_storage_ref: Mapped[str] = mapped_column(String, nullable=False)
    on_chain_hash: Mapped[str] = mapped_column(String, nullable=False)
    verification_status: Mapped[str] = mapped_column(String, nullable=False, default=DocumentVerificationStatus.UPLOADED.value)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 7: Add the import to `api/alembic/env.py`**

```python
from app.models.document import Document  # noqa: F401
```

- [ ] **Step 8: Generate and apply the migration**

```bash
alembic revision --autogenerate -m "create documents"
```

Rename to `alembic/versions/0006_create_documents.py`.

```bash
alembic upgrade head
```

- [ ] **Step 9: Write `api/app/schemas/document.py`**

```python
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import DocumentVerificationStatus


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    trade_id: uuid.UUID
    category: str
    document_type: str
    uploaded_by: uuid.UUID
    submitted_to: uuid.UUID
    off_chain_storage_ref: str
    on_chain_hash: str
    verification_status: DocumentVerificationStatus
    created_at: datetime
```

- [ ] **Step 10: Write `api/app/routers/documents.py`**

```python
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.access import user_can_access_trade
from app.auth.dependencies import get_current_user
from app.db import get_db
from app.hashing import sha256_hex
from app.models.document import Document
from app.models.trade import Trade
from app.models.user import User
from app.schemas.document import DocumentOut
from app.storage import upload_bytes

router = APIRouter(prefix="/trades/{trade_id}/documents", tags=["documents"])


async def _get_accessible_trade(trade_id: uuid.UUID, db: AsyncSession, user: User) -> Trade:
    trade = await db.get(Trade, trade_id)
    if trade is None or not user_can_access_trade(user, trade):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")
    return trade


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    trade_id: uuid.UUID,
    category: str = Form(...),
    document_type: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DocumentOut:
    trade = await _get_accessible_trade(trade_id, db, current_user)
    content = await file.read()
    object_key = f"{trade_id}/{uuid.uuid4()}-{file.filename}"
    upload_bytes(object_key, content, file.content_type or "application/octet-stream")

    document = Document(
        trade_id=trade_id,
        category=category,
        document_type=document_type,
        uploaded_by=current_user.id,
        submitted_to=trade.issuing_bank_org_id,
        off_chain_storage_ref=object_key,
        on_chain_hash=sha256_hex(content),
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)
    return document


@router.get("", response_model=list[DocumentOut])
async def list_documents(
    trade_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[DocumentOut]:
    await _get_accessible_trade(trade_id, db, current_user)
    result = await db.execute(select(Document).where(Document.trade_id == trade_id))
    return list(result.scalars().all())
```

- [ ] **Step 11: Wire the router into `api/app/main.py`**

```python
from app.routers import auth, document_registry, documents, organizations, trades, users

app.include_router(documents.router)
```

- [ ] **Step 12: Run tests to verify they pass**

Run: `pytest tests/test_documents_endpoints.py -v`
Expected: PASS (2 tests) — requires MinIO running via `infra/docker-compose.yml`.

- [ ] **Step 13: Run the full suite**

Run: `pytest -v`
Expected: all tests from Tasks 1-11 PASS.

- [ ] **Step 14: Commit**

```bash
git add app/models/document.py app/hashing.py app/storage.py app/schemas/document.py app/routers/documents.py alembic/env.py alembic/versions/0006_create_documents.py app/main.py tests/test_documents_endpoints.py tests/test_trades_endpoints.py
git commit -m "Add Document model, MinIO storage, hashing, and upload/list endpoints"
```

---

### Task 12: Sanctions screening model and endpoints

**Files:**
- Create: `api/app/models/sanctions_screening.py`, `api/app/schemas/sanctions.py`, `api/app/routers/sanctions_screening.py`
- Create: `api/alembic/versions/0007_create_sanctions_screenings.py`
- Modify: `api/alembic/env.py`, `api/app/main.py`
- Test: `api/tests/test_sanctions_screening_endpoints.py`

**Interfaces:**
- Consumes: `Trade`, `user_can_access_trade` (Task 10), `SanctionsClient`/`get_sanctions_client` (Task 4)
- Produces: `SanctionsScreening` model, `POST /trades/{id}/sanctions-screening` (triggers a screening run), `GET /trades/{id}/sanctions-screening` (list past runs) — backs the prototype's Compliance tab.

- [ ] **Step 1: Write the failing test `api/tests/test_sanctions_screening_endpoints.py`**

```python
from tests.test_trades_endpoints import create_trade, signup_and_login


async def test_trigger_and_list_sanctions_screening(async_client):
    exporter_org_id, exporter_token = await signup_and_login(async_client, "sanc-exporter-1@example.com")
    buyer_org_id, _ = await signup_and_login(async_client, "sanc-buyer-1@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await signup_and_login(async_client, "sanc-issuing-1@example.com", org_type="BANK")
    advising_bank_org_id, _ = await signup_and_login(async_client, "sanc-advising-1@example.com", org_type="BANK")

    trade_response = await create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)
    trade_id = trade_response.json()["id"]

    trigger_response = await async_client.post(
        f"/trades/{trade_id}/sanctions-screening",
        json={"party_screened": "Osaka Pharma Distribution K.K."},
        headers={"Authorization": f"Bearer {exporter_token}"},
    )
    assert trigger_response.status_code == 201
    assert trigger_response.json()["status"] == "CLEAR"

    list_response = await async_client.get(f"/trades/{trade_id}/sanctions-screening", headers={"Authorization": f"Bearer {exporter_token}"})
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1


async def test_sanctions_screening_rejects_non_participant(async_client):
    exporter_org_id, exporter_token = await signup_and_login(async_client, "sanc-exporter-2@example.com")
    buyer_org_id, _ = await signup_and_login(async_client, "sanc-buyer-2@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await signup_and_login(async_client, "sanc-issuing-2@example.com", org_type="BANK")
    advising_bank_org_id, _ = await signup_and_login(async_client, "sanc-advising-2@example.com", org_type="BANK")
    _unrelated_org_id, unrelated_token = await signup_and_login(async_client, "sanc-unrelated-2@example.com", org_type="BANK")

    trade_response = await create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)
    trade_id = trade_response.json()["id"]

    response = await async_client.post(
        f"/trades/{trade_id}/sanctions-screening",
        json={"party_screened": "Someone"},
        headers={"Authorization": f"Bearer {unrelated_token}"},
    )
    assert response.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_sanctions_screening_endpoints.py -v`
Expected: FAIL — route doesn't exist.

- [ ] **Step 3: Write `api/app/models/sanctions_screening.py`**

```python
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class SanctionsScreening(Base):
    __tablename__ = "sanctions_screenings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trade_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trades.id"), nullable=False)
    party_screened: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    raw_response: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 4: Add the import to `api/alembic/env.py`**

```python
from app.models.sanctions_screening import SanctionsScreening  # noqa: F401
```

- [ ] **Step 5: Generate and apply the migration**

```bash
alembic revision --autogenerate -m "create sanctions_screenings"
```

Rename to `alembic/versions/0007_create_sanctions_screenings.py`.

```bash
alembic upgrade head
```

- [ ] **Step 6: Write `api/app/schemas/sanctions.py`**

```python
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.models.enums import SanctionsStatus


class SanctionsScreeningTrigger(BaseModel):
    party_screened: str


class SanctionsScreeningOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    trade_id: uuid.UUID
    party_screened: str
    status: SanctionsStatus
    raw_response: dict[str, Any]
    checked_at: datetime
```

- [ ] **Step 7: Write `api/app/routers/sanctions_screening.py`**

```python
import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.db import get_db
from app.models.sanctions_screening import SanctionsScreening
from app.models.user import User
from app.routers.documents import _get_accessible_trade
from app.sanctions.client import SanctionsClient
from app.sanctions.dependency import get_sanctions_client
from app.schemas.sanctions import SanctionsScreeningOut, SanctionsScreeningTrigger

router = APIRouter(prefix="/trades/{trade_id}/sanctions-screening", tags=["sanctions-screening"])


@router.post("", response_model=SanctionsScreeningOut, status_code=status.HTTP_201_CREATED)
async def trigger_sanctions_screening(
    trade_id: uuid.UUID,
    payload: SanctionsScreeningTrigger,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    sanctions_client: SanctionsClient = Depends(get_sanctions_client),
) -> SanctionsScreeningOut:
    trade = await _get_accessible_trade(trade_id, db, current_user)
    result = await sanctions_client.screen(name=payload.party_screened, country=trade.industry)

    screening = SanctionsScreening(
        trade_id=trade_id,
        party_screened=payload.party_screened,
        status=result["status"],
        raw_response=dict(result),
    )
    db.add(screening)
    await db.commit()
    await db.refresh(screening)
    return screening


@router.get("", response_model=list[SanctionsScreeningOut])
async def list_sanctions_screenings(
    trade_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[SanctionsScreeningOut]:
    await _get_accessible_trade(trade_id, db, current_user)
    result = await db.execute(select(SanctionsScreening).where(SanctionsScreening.trade_id == trade_id))
    return list(result.scalars().all())
```

- [ ] **Step 8: Make `_get_accessible_trade` importable from `documents.py`**

Edit `api/app/routers/documents.py`: rename `_get_accessible_trade` to `get_accessible_trade` (drop the leading underscore) and update its two call sites in that same file. Update the import in `sanctions_screening.py` (Step 7 above) from `_get_accessible_trade` to `get_accessible_trade`, and its two call sites in that router.

- [ ] **Step 9: Wire the router into `api/app/main.py`**

```python
from app.routers import auth, document_registry, documents, organizations, sanctions_screening, trades, users

app.include_router(sanctions_screening.router)
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `pytest tests/test_sanctions_screening_endpoints.py -v`
Expected: PASS (2 tests)

- [ ] **Step 11: Commit**

```bash
git add app/models/sanctions_screening.py app/schemas/sanctions.py app/routers/sanctions_screening.py app/routers/documents.py alembic/env.py alembic/versions/0007_create_sanctions_screenings.py app/main.py tests/test_sanctions_screening_endpoints.py
git commit -m "Add SanctionsScreening model and endpoints"
```

---

### Task 13: Bank review findings model and endpoints

**Files:**
- Create: `api/app/models/bank_review_finding.py`, `api/app/schemas/bank_review.py`, `api/app/routers/bank_review.py`
- Create: `api/alembic/versions/0008_create_bank_review_findings.py`
- Modify: `api/alembic/env.py`, `api/app/main.py`
- Test: `api/tests/test_bank_review_endpoints.py`

**Interfaces:**
- Consumes: `Trade`, `Document`, `get_accessible_trade` (Tasks 10-11), `require_role` (Task 6)
- Produces: `BankReviewFinding` model (`id, trade_id, document_id, result, note, reviewed_by, reviewed_at`) — a table the design spec named the endpoint for (`GET /trades/{id}/bank-review`) but didn't itself define; this task fills that gap the same way the design intended: a manual, bank-staff-entered verdict per document. `POST /trades/{id}/bank-review`, `GET /trades/{id}/bank-review`.

- [ ] **Step 1: Write the failing test `api/tests/test_bank_review_endpoints.py`**

```python
from tests.test_trades_endpoints import create_trade, signup_and_login


async def test_bank_reviewer_can_record_and_list_findings(async_client):
    exporter_org_id, exporter_token = await signup_and_login(async_client, "bank-exporter-1@example.com")
    buyer_org_id, _ = await signup_and_login(async_client, "bank-buyer-1@example.com", org_type="BUYER")
    issuing_bank_org_id, issuing_bank_token = await signup_and_login(async_client, "bank-issuing-1@example.com", org_type="BANK")
    advising_bank_org_id, _ = await signup_and_login(async_client, "bank-advising-1@example.com", org_type="BANK")

    trade_response = await create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)
    trade_id = trade_response.json()["id"]

    upload_response = await async_client.post(
        f"/trades/{trade_id}/documents",
        data={"category": "Banking / LC", "document_type": "Bill of Exchange"},
        files={"file": ("boe.pdf", b"bill of exchange bytes", "application/pdf")},
        headers={"Authorization": f"Bearer {exporter_token}"},
    )
    document_id = upload_response.json()["id"]

    review_response = await async_client.post(
        f"/trades/{trade_id}/bank-review",
        json={"document_id": document_id, "result": "DISCREPANCY", "note": "Tenor mismatch: LC states 60 days, BoE shows 90 days"},
        headers={"Authorization": f"Bearer {issuing_bank_token}"},
    )
    assert review_response.status_code == 201
    assert review_response.json()["result"] == "DISCREPANCY"

    list_response = await async_client.get(f"/trades/{trade_id}/bank-review", headers={"Authorization": f"Bearer {exporter_token}"})
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1


async def test_non_bank_role_cannot_record_findings(async_client):
    exporter_org_id, exporter_token = await signup_and_login(async_client, "bank-exporter-2@example.com")
    buyer_org_id, _ = await signup_and_login(async_client, "bank-buyer-2@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await signup_and_login(async_client, "bank-issuing-2@example.com", org_type="BANK")
    advising_bank_org_id, _ = await signup_and_login(async_client, "bank-advising-2@example.com", org_type="BANK")

    trade_response = await create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)
    trade_id = trade_response.json()["id"]
    upload_response = await async_client.post(
        f"/trades/{trade_id}/documents",
        data={"category": "Banking / LC", "document_type": "Bill of Exchange"},
        files={"file": ("boe.pdf", b"bill of exchange bytes", "application/pdf")},
        headers={"Authorization": f"Bearer {exporter_token}"},
    )
    document_id = upload_response.json()["id"]

    response = await async_client.post(
        f"/trades/{trade_id}/bank-review",
        json={"document_id": document_id, "result": "MATCHES_LC", "note": None},
        headers={"Authorization": f"Bearer {exporter_token}"},
    )
    assert response.status_code == 403
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_bank_review_endpoints.py -v`
Expected: FAIL — route doesn't exist.

- [ ] **Step 3: Write `api/app/models/bank_review_finding.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class BankReviewFinding(Base):
    __tablename__ = "bank_review_findings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trade_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trades.id"), nullable=False)
    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=False)
    result: Mapped[str] = mapped_column(String, nullable=False)
    note: Mapped[str | None] = mapped_column(String, nullable=True)
    reviewed_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 4: Add the import to `api/alembic/env.py`**

```python
from app.models.bank_review_finding import BankReviewFinding  # noqa: F401
```

- [ ] **Step 5: Generate and apply the migration**

```bash
alembic revision --autogenerate -m "create bank_review_findings"
```

Rename to `alembic/versions/0008_create_bank_review_findings.py`.

```bash
alembic upgrade head
```

- [ ] **Step 6: Write `api/app/schemas/bank_review.py`**

```python
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import BankReviewResult


class BankReviewFindingCreate(BaseModel):
    document_id: uuid.UUID
    result: BankReviewResult
    note: str | None = None


class BankReviewFindingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    trade_id: uuid.UUID
    document_id: uuid.UUID
    result: BankReviewResult
    note: str | None
    reviewed_by: uuid.UUID
    reviewed_at: datetime
```

- [ ] **Step 7: Write `api/app/routers/bank_review.py`**

```python
import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_role
from app.db import get_db
from app.models.bank_review_finding import BankReviewFinding
from app.models.enums import UserRole
from app.models.user import User
from app.routers.documents import get_accessible_trade
from app.schemas.bank_review import BankReviewFindingCreate, BankReviewFindingOut

router = APIRouter(prefix="/trades/{trade_id}/bank-review", tags=["bank-review"])


@router.post("", response_model=BankReviewFindingOut, status_code=status.HTTP_201_CREATED)
async def record_bank_review_finding(
    trade_id: uuid.UUID,
    payload: BankReviewFindingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BANK_REVIEWER.value)),
) -> BankReviewFindingOut:
    await get_accessible_trade(trade_id, db, current_user)

    finding = BankReviewFinding(
        trade_id=trade_id,
        document_id=payload.document_id,
        result=payload.result.value,
        note=payload.note,
        reviewed_by=current_user.id,
    )
    db.add(finding)
    await db.commit()
    await db.refresh(finding)
    return finding


@router.get("", response_model=list[BankReviewFindingOut])
async def list_bank_review_findings(
    trade_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[BankReviewFindingOut]:
    await get_accessible_trade(trade_id, db, current_user)
    result = await db.execute(select(BankReviewFinding).where(BankReviewFinding.trade_id == trade_id))
    return list(result.scalars().all())
```

- [ ] **Step 8: Wire the router into `api/app/main.py`**

```python
from app.routers import auth, bank_review, document_registry, documents, organizations, sanctions_screening, trades, users

app.include_router(bank_review.router)
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `pytest tests/test_bank_review_endpoints.py -v`
Expected: PASS (2 tests)

- [ ] **Step 10: Run the full suite**

Run: `pytest -v`
Expected: all tests from Tasks 1-13 PASS. This is the complete Phase 1 API + data model sub-project.

- [ ] **Step 11: Commit**

```bash
git add app/models/bank_review_finding.py app/schemas/bank_review.py app/routers/bank_review.py alembic/env.py alembic/versions/0008_create_bank_review_findings.py app/main.py tests/test_bank_review_endpoints.py
git commit -m "Add BankReviewFinding model and endpoints"
```
