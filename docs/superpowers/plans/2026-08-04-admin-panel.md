# Platform Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a platform-wide admin account type (`PLATFORM_ADMIN`) that can browse every organization, user, and trade across the platform, and manually override an organization's KYB status — served from a separate `/admin/...` frontend area with its own login redirect and layout.

**Architecture:** Reuse the existing JWT/login mechanism as-is (no parallel auth system) by making `users.org_id` nullable and adding `PLATFORM_ADMIN` to the existing string-typed `role` column. A secret-gated, unauthenticated `POST /admin/bootstrap` endpoint creates the one admin account (there is no public admin signup). A new `api/app/routers/admin.py`, gated by the existing `require_role()` dependency, exposes platform-wide reads plus the one write (KYB status). On the frontend, two small route guards (`RequireAdmin`, `RequireBusinessUser`) split `PLATFORM_ADMIN` traffic into a new `AdminShell` + three list pages, away from the existing org-scoped `AppShell`.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 async + Alembic + pytest (backend); React + TypeScript + Vite + Vitest + Testing Library (frontend).

## Global Constraints

- `users.org_id` becomes nullable — existing NOT NULL behavior for every non-admin row is unaffected; this is an additive relaxation, not a data migration.
- `UserRole` gains `PLATFORM_ADMIN`; `role` remains a plain string column, so no DB migration is needed for the role itself.
- `admin_bootstrap_secret` defaults to `None` (unset) — `POST /admin/bootstrap` must return 403 in every environment until someone explicitly configures it, matching the existing `anthropic_api_key`/`sanctions_adapter_url` safe-by-default pattern.
- `POST /admin/bootstrap` must refuse (409) if a `PLATFORM_ADMIN` user already exists — v1 supports exactly one bootstrap, ever.
- No admin bootstrap UI — creating the first admin is a one-time API call, not a user-facing flow.
- No org/user editing beyond `kyb_status` in this version, and no pagination on the admin list endpoints — both explicitly deferred in the spec.
- `AdminShell` must be a separate component from `AppShell`, not a variant of it — `AppShell` assumes every user has an `org_id` (breadcrumbs, Team/Profile org fetches) which is false for `PLATFORM_ADMIN`.

---

### Task 1: Backend — nullable `org_id`, `PLATFORM_ADMIN` role, bootstrap config plumbing

**Files:**
- Modify: `api/app/models/enums.py`
- Modify: `api/app/models/user.py`
- Modify: `api/app/schemas/user.py`
- Modify: `api/app/config.py`
- Modify: `api/app/auth/security.py`
- Modify: `api/app/routers/auth.py`
- Create: `api/alembic/versions/0013_make_users_org_id_nullable.py`
- Test: `api/tests/test_user_model.py`

**Interfaces:**
- Produces: `UserRole.PLATFORM_ADMIN` (value `"PLATFORM_ADMIN"`), `User.org_id: uuid.UUID | None`, `settings.admin_bootstrap_secret: str | None`, `create_access_token(user_id: str, org_id: str | None, role: str) -> str`. Later tasks (2, 3) rely on all four.

- [ ] **Step 1: Write the failing test**

Append to `api/tests/test_user_model.py`:

```python
async def test_create_user_with_null_org_id_for_platform_admin(db_session):
    user = User(
        org_id=None,
        name="Ops Admin",
        email="ops-admin@example.com",
        password_hash=hash_password("correct horse battery staple"),
        role="PLATFORM_ADMIN",
        status="ACTIVE",
    )
    db_session.add(user)
    await db_session.commit()

    result = await db_session.execute(select(User).where(User.email == "ops-admin@example.com"))
    fetched = result.scalar_one()
    assert fetched.org_id is None
    assert fetched.role == "PLATFORM_ADMIN"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && venv/Scripts/python.exe -m pytest tests/test_user_model.py -v`
Expected: FAIL — `sqlalchemy.exc.IntegrityError` (or similar), "null value in column \"org_id\" ... violates not-null constraint", because the column is still `NOT NULL`.

- [ ] **Step 3: Add `PLATFORM_ADMIN` to the role enum**

In `api/app/models/enums.py`, change the `UserRole` class:

```python
class UserRole(str, Enum):
    EXPORTER_ADMIN = "EXPORTER_ADMIN"
    DOCS_COMPLIANCE = "DOCS_COMPLIANCE"
    FINANCE = "FINANCE"
    VIEWER = "VIEWER"
    BUYER = "BUYER"
    BANK_REVIEWER = "BANK_REVIEWER"
    PLATFORM_ADMIN = "PLATFORM_ADMIN"
```

- [ ] **Step 4: Make `User.org_id` nullable in the model**

In `api/app/models/user.py`, change line 15:

```python
org_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True)
```

- [ ] **Step 5: Widen `UserOut.org_id` to match**

In `api/app/schemas/user.py`, change:

```python
class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID | None
    name: str
    email: str
    role: UserRole
    status: UserStatus
```

- [ ] **Step 6: Add the bootstrap secret setting**

In `api/app/config.py`, add a field to `Settings` (after `anthropic_api_key`):

```python
class Settings(BaseSettings):
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_expiry_minutes: int = 1440
    otp_expiry_minutes: int = 10
    otp_max_attempts: int = 5
    password_reset_token_expiry_minutes: int = 10
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "trade-documents"
    sanctions_adapter_url: str | None = None
    anthropic_api_key: str | None = None
    admin_bootstrap_secret: str | None = None
```

- [ ] **Step 7: Allow `create_access_token` to accept a null `org_id`**

In `api/app/auth/security.py`, change the signature (body unchanged — `None` serializes to JSON `null` in the JWT payload, which is never read back out anywhere in the codebase):

```python
def create_access_token(user_id: str, org_id: str | None, role: str) -> str:
```

- [ ] **Step 8: Pass a null-safe `org_id` from login**

In `api/app/routers/auth.py`, change line 110:

```python
    token = create_access_token(user_id=str(user.id), org_id=str(user.org_id) if user.org_id else None, role=user.role)
```

- [ ] **Step 9: Write the migration**

Create `api/alembic/versions/0013_make_users_org_id_nullable.py`:

```python
"""make users.org_id nullable for platform admin accounts

Revision ID: b2f9a1c3d4e5
Revises: d7a4f6c2e8b1
Create Date: 2026-08-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2f9a1c3d4e5'
down_revision: Union[str, None] = 'd7a4f6c2e8b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('users', 'org_id', nullable=True)


def downgrade() -> None:
    op.alter_column('users', 'org_id', nullable=False)
```

- [ ] **Step 10: Run test to verify it passes**

Run: `cd api && venv/Scripts/python.exe -m pytest tests/test_user_model.py -v`
Expected: PASS (the test DB is re-migrated from `base` to `head` at the start of every pytest session via the `_migrate_test_db` fixture in `conftest.py`, so the new migration is picked up automatically).

- [ ] **Step 11: Run the full backend test suite**

Run: `cd api && venv/Scripts/python.exe -m pytest -q`
Expected: PASS, same count as before plus the one new test. This confirms the nullable relaxation and the `org_id: str | None` signature change don't break any existing signup/login/trade flow (which always pass a non-null `org_id`).

- [ ] **Step 12: Apply the migration to the real dev database**

Run: `cd api && venv/Scripts/alembic.exe upgrade head` (against the `utfl` dev DB, not `utfl_test` — the test suite only migrates its own database). Verify with `alembic current` that it now reports `b2f9a1c3d4e5`.

- [ ] **Step 13: Commit**

```bash
git add api/app/models/enums.py api/app/models/user.py api/app/schemas/user.py api/app/config.py api/app/auth/security.py api/app/routers/auth.py api/alembic/versions/0013_make_users_org_id_nullable.py api/tests/test_user_model.py
git commit -m "Make users.org_id nullable and add PLATFORM_ADMIN role"
```

---

### Task 2: Backend — admin bootstrap endpoint

**Files:**
- Create: `api/app/schemas/admin.py`
- Create: `api/app/routers/admin.py`
- Modify: `api/app/main.py`
- Test: `api/tests/test_admin_bootstrap.py`

**Interfaces:**
- Consumes: `settings.admin_bootstrap_secret` (Task 1), `UserRole.PLATFORM_ADMIN` (Task 1), `UserOut` (Task 1, now `org_id: uuid.UUID | None`), `hash_password` (`api/app/auth/security.py`, unchanged).
- Produces: `router` (FastAPI `APIRouter`, prefix `/admin`) — Task 3 extends this same router and file. `AdminBootstrapRequest` schema in `api/app/schemas/admin.py` — Task 3 adds a second schema to this file.

- [ ] **Step 1: Write the failing tests**

Create `api/tests/test_admin_bootstrap.py`:

```python
from app.config import settings


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


async def test_bootstrap_creates_platform_admin_and_allows_login(async_client, monkeypatch):
    monkeypatch.setattr(settings, "admin_bootstrap_secret", "test-bootstrap-secret")

    response = await async_client.post(
        "/admin/bootstrap",
        json={"secret": "test-bootstrap-secret", "name": "Ops Admin", "email": "admin@utfl.example", "password": "a good password"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["role"] == "PLATFORM_ADMIN"
    assert body["org_id"] is None

    login_response = await async_client.post(
        "/auth/login", json={"email": "admin@utfl.example", "password": "a good password"}
    )
    assert login_response.status_code == 200
    assert "access_token" in login_response.json()


async def test_bootstrap_rejects_second_admin(async_client, monkeypatch):
    monkeypatch.setattr(settings, "admin_bootstrap_secret", "test-bootstrap-secret")
    payload = {"secret": "test-bootstrap-secret", "name": "Ops Admin", "email": "admin1@utfl.example", "password": "a good password"}

    first = await async_client.post("/admin/bootstrap", json=payload)
    assert first.status_code == 201

    second = await async_client.post("/admin/bootstrap", json={**payload, "email": "admin2@utfl.example"})
    assert second.status_code == 409
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && venv/Scripts/python.exe -m pytest tests/test_admin_bootstrap.py -v`
Expected: FAIL with 404 (no `/admin/bootstrap` route exists yet).

- [ ] **Step 3: Write the schema**

Create `api/app/schemas/admin.py`:

```python
from pydantic import BaseModel, EmailStr


class AdminBootstrapRequest(BaseModel):
    secret: str
    name: str
    email: EmailStr
    password: str
```

- [ ] **Step 4: Write the router**

Create `api/app/routers/admin.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import hash_password
from app.config import settings
from app.db import get_db
from app.models.enums import UserRole, UserStatus
from app.models.user import User
from app.schemas.admin import AdminBootstrapRequest
from app.schemas.user import UserOut

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/bootstrap", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def bootstrap_admin(
    payload: AdminBootstrapRequest,
    db: AsyncSession = Depends(get_db),
) -> User:
    if not settings.admin_bootstrap_secret or payload.secret != settings.admin_bootstrap_secret:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid bootstrap secret")

    existing_admin = await db.execute(select(User).where(User.role == UserRole.PLATFORM_ADMIN.value))
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
        role=UserRole.PLATFORM_ADMIN.value,
        status=UserStatus.ACTIVE.value,
    )
    db.add(admin_user)
    await db.commit()
    await db.refresh(admin_user)
    return admin_user
```

- [ ] **Step 5: Register the router**

In `api/app/main.py`, change line 9 and add a line after line 26:

```python
from app.routers import admin, auth, bank_review, document_registry, documents, organizations, sanctions_screening, trades, users
```

```python
app.include_router(bank_review.router)
app.include_router(admin.router)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd api && venv/Scripts/python.exe -m pytest tests/test_admin_bootstrap.py -v`
Expected: PASS (4 tests).

- [ ] **Step 7: Run the full backend test suite**

Run: `cd api && venv/Scripts/python.exe -m pytest -q`
Expected: PASS, no regressions.

- [ ] **Step 8: Commit**

```bash
git add api/app/schemas/admin.py api/app/routers/admin.py api/app/main.py api/tests/test_admin_bootstrap.py
git commit -m "Add secret-gated POST /admin/bootstrap for the first platform admin"
```

---

### Task 3: Backend — admin read/write endpoints

**Files:**
- Modify: `api/app/schemas/admin.py`
- Modify: `api/app/routers/admin.py`
- Test: `api/tests/test_admin_endpoints.py`

**Interfaces:**
- Consumes: `router` and `AdminBootstrapRequest` (Task 2, same files). `OrganizationOut` (`api/app/schemas/organization.py`), `KybCheckOut` (`api/app/schemas/kyb_check.py`), `TradeOut` (`api/app/schemas/trade.py`), `UserOut` (Task 1) — all reused unchanged. `require_role` (`api/app/auth/dependencies.py`).
- Produces: `GET /admin/organizations`, `GET /admin/organizations/{org_id}/kyb-checks`, `PATCH /admin/organizations/{org_id}/kyb-status`, `GET /admin/users`, `GET /admin/trades` — no later backend task depends on these; Tasks 4-8 (frontend) call them over HTTP.

- [ ] **Step 1: Write the failing tests**

Create `api/tests/test_admin_endpoints.py`:

```python
from app.config import settings


async def _signup_and_login(async_client, email: str, org_type: str = "EXPORTER") -> tuple[str, str]:
    payload = {
        "organization": {"name": f"Org for {email}", "org_type": org_type, "country": "India", "industry": "Pharmaceuticals", "tax_id": f"TAX-{email}"},
        "admin_user": {"name": "Business User", "email": email, "password": "a good password"},
    }
    response = await async_client.post("/auth/signup", json=payload)
    org_id = response.json()["organization"]["id"]
    login_response = await async_client.post("/auth/login", json={"email": email, "password": "a good password"})
    return org_id, login_response.json()["access_token"]


async def _bootstrap_admin_and_login(async_client, monkeypatch, email: str = "admin@utfl.example") -> str:
    monkeypatch.setattr(settings, "admin_bootstrap_secret", "test-bootstrap-secret")
    await async_client.post(
        "/admin/bootstrap",
        json={"secret": "test-bootstrap-secret", "name": "Ops Admin", "email": email, "password": "a good password"},
    )
    login_response = await async_client.post("/auth/login", json={"email": email, "password": "a good password"})
    return login_response.json()["access_token"]


async def _create_trade(async_client, token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id):
    payload = {
        "lc_reference": "ADMIN-TEST-LC-1",
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


async def test_non_admin_gets_403_from_admin_routes(async_client):
    _, token = await _signup_and_login(async_client, "business-user-1@example.com")

    response = await async_client.get("/admin/organizations", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 403


async def test_admin_sees_organizations_across_every_org(async_client, monkeypatch):
    await _signup_and_login(async_client, "org-a@example.com", org_type="EXPORTER")
    await _signup_and_login(async_client, "org-b@example.com", org_type="BUYER")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.get("/admin/organizations", headers={"Authorization": f"Bearer {admin_token}"})

    assert response.status_code == 200
    names = {org["name"] for org in response.json()}
    assert "Org for org-a@example.com" in names
    assert "Org for org-b@example.com" in names


async def test_admin_sees_kyb_checks_for_any_organization(async_client, monkeypatch):
    org_id, _ = await _signup_and_login(async_client, "org-e@example.com")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.get(
        f"/admin/organizations/{org_id}/kyb-checks", headers={"Authorization": f"Bearer {admin_token}"}
    )

    assert response.status_code == 200
    check_types = {check["check_type"] for check in response.json()}
    assert check_types == {"BUSINESS_REGISTRATION", "SANCTIONS_SCREENING", "BANK_ACCOUNT"}


async def test_admin_can_override_kyb_status(async_client, monkeypatch):
    org_id, _ = await _signup_and_login(async_client, "org-d@example.com")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.patch(
        f"/admin/organizations/{org_id}/kyb-status",
        json={"kyb_status": "BLOCK"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    assert response.json()["kyb_status"] == "BLOCK"

    org_list = await async_client.get("/admin/organizations", headers={"Authorization": f"Bearer {admin_token}"})
    updated = next(org for org in org_list.json() if org["id"] == org_id)
    assert updated["kyb_status"] == "BLOCK"


async def test_admin_sees_users_across_every_org(async_client, monkeypatch):
    await _signup_and_login(async_client, "org-c@example.com")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.get("/admin/users", headers={"Authorization": f"Bearer {admin_token}"})

    assert response.status_code == 200
    emails = {user["email"] for user in response.json()}
    assert "org-c@example.com" in emails


async def test_admin_sees_trades_across_every_org(async_client, monkeypatch):
    exporter_org_id, exporter_token = await _signup_and_login(async_client, "trade-exporter@example.com")
    buyer_org_id, _ = await _signup_and_login(async_client, "trade-buyer@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await _signup_and_login(async_client, "trade-issuing@example.com", org_type="BANK")
    advising_bank_org_id, _ = await _signup_and_login(async_client, "trade-advising@example.com", org_type="BANK")
    await _create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)

    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)
    response = await async_client.get("/admin/trades", headers={"Authorization": f"Bearer {admin_token}"})

    assert response.status_code == 200
    assert any(trade["exporter_org_id"] == exporter_org_id for trade in response.json())
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && venv/Scripts/python.exe -m pytest tests/test_admin_endpoints.py -v`
Expected: FAIL — `test_non_admin_gets_403_from_admin_routes` fails because `/admin/organizations` doesn't exist yet (404, not 403); the rest fail with 404s for the same reason.

- [ ] **Step 3: Add the KYB status update schema**

In `api/app/schemas/admin.py`, add below `AdminBootstrapRequest`:

```python
from app.models.enums import KybStatus


class AdminKybStatusUpdate(BaseModel):
    kyb_status: KybStatus
```

- [ ] **Step 4: Add the five endpoints**

In `api/app/routers/admin.py`, add these imports at the top (alongside the existing ones):

```python
import uuid

from app.auth.dependencies import require_role
from app.models.kyb_check import KybCheck
from app.models.organization import Organization
from app.models.trade import Trade
from app.schemas.admin import AdminKybStatusUpdate
from app.schemas.kyb_check import KybCheckOut
from app.schemas.organization import OrganizationOut
from app.schemas.trade import TradeOut
```

Add below the existing `bootstrap_admin` endpoint:

```python
require_admin = require_role(UserRole.PLATFORM_ADMIN.value)


@router.get("/organizations", response_model=list[OrganizationOut], dependencies=[Depends(require_admin)])
async def list_all_organizations(db: AsyncSession = Depends(get_db)) -> list[Organization]:
    result = await db.execute(select(Organization).order_by(Organization.name))
    return list(result.scalars().all())


@router.get(
    "/organizations/{org_id}/kyb-checks",
    response_model=list[KybCheckOut],
    dependencies=[Depends(require_admin)],
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
    dependencies=[Depends(require_admin)],
)
async def update_organization_kyb_status(
    org_id: uuid.UUID,
    payload: AdminKybStatusUpdate,
    db: AsyncSession = Depends(get_db),
) -> Organization:
    org = await db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    org.kyb_status = payload.kyb_status.value
    await db.commit()
    await db.refresh(org)
    return org


@router.get("/users", response_model=list[UserOut], dependencies=[Depends(require_admin)])
async def list_all_users(db: AsyncSession = Depends(get_db)) -> list[User]:
    result = await db.execute(select(User).order_by(User.name))
    return list(result.scalars().all())


@router.get("/trades", response_model=list[TradeOut], dependencies=[Depends(require_admin)])
async def list_all_trades(db: AsyncSession = Depends(get_db)) -> list[Trade]:
    result = await db.execute(select(Trade).order_by(Trade.created_at.desc()))
    return list(result.scalars().all())
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd api && venv/Scripts/python.exe -m pytest tests/test_admin_endpoints.py -v`
Expected: PASS (7 tests).

- [ ] **Step 6: Run the full backend test suite**

Run: `cd api && venv/Scripts/python.exe -m pytest -q`
Expected: PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add api/app/schemas/admin.py api/app/routers/admin.py api/tests/test_admin_endpoints.py
git commit -m "Add platform-wide admin read endpoints and KYB status override"
```

---

### Task 4: Frontend — types, api client, and login redirect

**Files:**
- Modify: `web/src/api/types.ts`
- Modify: `web/src/lib/roles.ts`
- Modify: `web/src/pages/NewTransactionPage.tsx`
- Modify: `web/src/pages/ProfilePage.tsx`
- Modify: `web/src/pages/LoginPage.tsx`
- Create: `web/src/api/admin.ts`
- Test: `web/src/pages/LoginPage.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` (`web/src/api/client.ts`, unchanged), backend routes from Tasks 2-3 (`GET /admin/organizations`, `GET /admin/organizations/{id}/kyb-checks`, `PATCH /admin/organizations/{id}/kyb-status`, `GET /admin/users`, `GET /admin/trades`).
- Produces: `UserRole` including `'PLATFORM_ADMIN'`, `User.org_id: string | null` — every later frontend task relies on this widened type. `listAdminOrganizations`, `listAdminOrganizationKybChecks`, `updateOrganizationKybStatus`, `listAdminUsers`, `listAdminTrades` (`web/src/api/admin.ts`) — Tasks 5-8 call these by name.

- [ ] **Step 1: Write the failing test**

Add to `web/src/pages/LoginPage.test.tsx` (new imports: `Route`, `Routes` from `react-router-dom` are already imported as `MemoryRouter` — add `Route, Routes` to that import line):

```tsx
import { MemoryRouter, Route, Routes } from 'react-router-dom';
```

Add two new tests inside the `describe('LoginPage', ...)` block:

```tsx
  it('redirects a regular user to /dashboard after login', async () => {
    const store = new AuthStore();
    vi.spyOn(authApi, 'login').mockResolvedValue({ access_token: 'tok-1', token_type: 'bearer' });
    vi.spyOn(authApi, 'getMe').mockResolvedValue({ id: '1', org_id: '2', name: 'A', email: 'a@example.com', role: 'VIEWER', status: 'ACTIVE' });

    render(
      <AuthContext.Provider value={store}>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<div>Dashboard stub</div>} />
            <Route path="/admin" element={<div>Admin stub</div>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    await userEvent.type(screen.getByLabelText(/email/i), 'a@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Dashboard stub')).toBeInTheDocument();
  });

  it('redirects a PLATFORM_ADMIN user to /admin after login', async () => {
    const store = new AuthStore();
    vi.spyOn(authApi, 'login').mockResolvedValue({ access_token: 'tok-1', token_type: 'bearer' });
    vi.spyOn(authApi, 'getMe').mockResolvedValue({ id: '1', org_id: null, name: 'Ops Admin', email: 'admin@utfl.example', role: 'PLATFORM_ADMIN', status: 'ACTIVE' });

    render(
      <AuthContext.Provider value={store}>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<div>Dashboard stub</div>} />
            <Route path="/admin" element={<div>Admin stub</div>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@utfl.example');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Admin stub')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run src/pages/LoginPage.test.tsx`
Expected: FAIL — `role: 'PLATFORM_ADMIN'` and `org_id: null` don't type-check yet (or the test runner reports a type/runtime mismatch), and both new tests fail because `LoginPage` always navigates to `/dashboard`.

- [ ] **Step 3: Widen the `User`/`UserRole` types**

In `web/src/api/types.ts`, change line 3 and the `User` interface:

```ts
export type UserRole = 'EXPORTER_ADMIN' | 'DOCS_COMPLIANCE' | 'FINANCE' | 'VIEWER' | 'BUYER' | 'BANK_REVIEWER' | 'PLATFORM_ADMIN';
```

```ts
export interface User {
  id: string;
  org_id: string | null;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}
```

- [ ] **Step 4: Add a label for the new role**

In `web/src/lib/roles.ts`, add a key to `ROLE_LABELS`:

```ts
const ROLE_LABELS: Record<UserRole, string> = {
  EXPORTER_ADMIN: 'Superuser',
  BANK_REVIEWER: 'Superuser',
  BUYER: 'Superuser',
  DOCS_COMPLIANCE: 'Docs & Compliance',
  FINANCE: 'Finance',
  VIEWER: 'Viewer',
  PLATFORM_ADMIN: 'Platform Admin',
};
```

- [ ] **Step 5: Fix the two call sites that assumed `org_id` was always a string**

`user.org_id` is only ever `null` for a `PLATFORM_ADMIN`, and both of these pages are reachable only by business users (enforced by `RequireBusinessUser` in Task 5) — so a non-null assertion here is safe and matches this codebase's existing `const user = auth.user!;` convention.

In `web/src/pages/NewTransactionPage.tsx`, change lines 128-130:

```tsx
    setForm((prev) => ({ ...prev, [selfField]: user.org_id! }));
    getOrganization(user.org_id!).then((org) => setSelfOrgName(org.name));
  }, [selfField, user.org_id]);
```

In `web/src/pages/ProfilePage.tsx`, change lines 28-29 and 44:

```tsx
          getOrganization(user.org_id!),
          listOrganizationKybChecks(user.org_id!),
```

```tsx
  }, [user.org_id]);
```

- [ ] **Step 6: Create the admin API client**

Create `web/src/api/admin.ts`:

```ts
import { apiFetch } from './client';
import type { KybCheck, KybStatus, Organization, Trade, User } from './types';

export function listAdminOrganizations(): Promise<Organization[]> {
  return apiFetch<Organization[]>('/admin/organizations');
}

export function listAdminOrganizationKybChecks(orgId: string): Promise<KybCheck[]> {
  return apiFetch<KybCheck[]>(`/admin/organizations/${orgId}/kyb-checks`);
}

export function updateOrganizationKybStatus(orgId: string, kybStatus: KybStatus): Promise<Organization> {
  return apiFetch<Organization>(`/admin/organizations/${orgId}/kyb-status`, {
    method: 'PATCH',
    body: { kyb_status: kybStatus },
  });
}

export function listAdminUsers(): Promise<User[]> {
  return apiFetch<User[]>('/admin/users');
}

export function listAdminTrades(): Promise<Trade[]> {
  return apiFetch<Trade[]>('/admin/trades');
}
```

- [ ] **Step 7: Redirect by role after login**

In `web/src/pages/LoginPage.tsx`, change the success branch of `handleSubmit` (lines 27-30):

```tsx
    try {
      setAuthToken(access_token);
      const me = await getMe();
      auth.setSession(access_token, me);
      navigate(me.role === 'PLATFORM_ADMIN' ? '/admin' : '/dashboard');
    } catch {
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd web && npx vitest run src/pages/LoginPage.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 9: Typecheck and run the full frontend suite**

Run: `cd web && npx tsc -b && npx vitest run`
Expected: both clean — no type errors, no regressions.

- [ ] **Step 10: Commit**

```bash
git add web/src/api/types.ts web/src/lib/roles.ts web/src/pages/NewTransactionPage.tsx web/src/pages/ProfilePage.tsx web/src/pages/LoginPage.tsx web/src/api/admin.ts web/src/pages/LoginPage.test.tsx
git commit -m "Add PLATFORM_ADMIN role, admin API client, and role-based login redirect"
```

---

### Task 5: Frontend — route guards, admin shell, and the organizations list

**Files:**
- Create: `web/src/components/RoleGates.tsx`
- Create: `web/src/components/AdminShell.tsx`
- Create: `web/src/pages/AdminOrganizationsPage.tsx`
- Modify: `web/src/App.tsx`
- Test: `web/src/components/RoleGates.test.tsx`
- Test: `web/src/components/AdminShell.test.tsx`
- Test: `web/src/pages/AdminOrganizationsPage.test.tsx`

**Interfaces:**
- Consumes: `listAdminOrganizations` (Task 4, `web/src/api/admin.ts`), `kybStatusInfo` (`web/src/lib/statusTones.ts`, unchanged), `useAuthStore` (`web/src/stores/AuthContext.ts`, unchanged), `Panel`/`Badge` (`web/src/components/ui/`, unchanged).
- Produces: `RequireAdmin`, `RequireBusinessUser` (`web/src/components/RoleGates.tsx`) and `AdminShell` (`web/src/components/AdminShell.tsx`) — wired into `App.tsx` in this task, not reused elsewhere. `AdminOrganizationsPage` — Task 6 modifies this same file to add the KYB status editor.

- [ ] **Step 1: Write the failing route-guard tests**

Create `web/src/components/RoleGates.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AuthStore } from '../stores/AuthStore';
import { AuthContext } from '../stores/AuthContext';
import { RequireAdmin, RequireBusinessUser } from './RoleGates';

function renderRequireAdmin(role: string) {
  const store = new AuthStore();
  store.isHydrating = false;
  store.setSession('tok', {
    id: 'u-1',
    org_id: role === 'PLATFORM_ADMIN' ? null : 'o-1',
    name: 'Test User',
    email: 'test@example.com',
    role: role as never,
    status: 'ACTIVE',
  });

  return render(
    <AuthContext.Provider value={store}>
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<div>Admin area</div>} />
          </Route>
          <Route path="/dashboard" element={<div>Dashboard area</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

function renderRequireBusinessUser(role: string) {
  const store = new AuthStore();
  store.isHydrating = false;
  store.setSession('tok', {
    id: 'u-1',
    org_id: role === 'PLATFORM_ADMIN' ? null : 'o-1',
    name: 'Test User',
    email: 'test@example.com',
    role: role as never,
    status: 'ACTIVE',
  });

  return render(
    <AuthContext.Provider value={store}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<RequireBusinessUser />}>
            <Route path="/dashboard" element={<div>Dashboard area</div>} />
          </Route>
          <Route path="/admin" element={<div>Admin area</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('RequireAdmin', () => {
  it('renders the admin route for a PLATFORM_ADMIN user', () => {
    renderRequireAdmin('PLATFORM_ADMIN');
    expect(screen.getByText('Admin area')).toBeInTheDocument();
  });

  it('redirects a business user away to /dashboard', () => {
    renderRequireAdmin('EXPORTER_ADMIN');
    expect(screen.getByText('Dashboard area')).toBeInTheDocument();
  });
});

describe('RequireBusinessUser', () => {
  it('renders the business route for a non-admin user', () => {
    renderRequireBusinessUser('EXPORTER_ADMIN');
    expect(screen.getByText('Dashboard area')).toBeInTheDocument();
  });

  it('redirects a PLATFORM_ADMIN user away to /admin', () => {
    renderRequireBusinessUser('PLATFORM_ADMIN');
    expect(screen.getByText('Admin area')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/RoleGates.test.tsx`
Expected: FAIL — `./RoleGates` doesn't exist yet.

- [ ] **Step 3: Write the route guards**

Create `web/src/components/RoleGates.tsx`:

```tsx
import { observer } from 'mobx-react-lite';
import { Navigate, Outlet } from 'react-router-dom';

import { useAuthStore } from '../stores/AuthContext';

export const RequireAdmin = observer(function RequireAdmin() {
  const auth = useAuthStore();
  if (auth.user?.role !== 'PLATFORM_ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
});

export const RequireBusinessUser = observer(function RequireBusinessUser() {
  const auth = useAuthStore();
  if (auth.user?.role === 'PLATFORM_ADMIN') {
    return <Navigate to="/admin" replace />;
  }
  return <Outlet />;
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/RoleGates.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing AdminShell test**

Create `web/src/components/AdminShell.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AuthStore } from '../stores/AuthStore';
import { AuthContext } from '../stores/AuthContext';
import { AdminShell } from './AdminShell';

function renderShell() {
  const store = new AuthStore();
  store.isHydrating = false;
  store.setSession('tok', { id: '1', org_id: null, name: 'Ops Admin', email: 'admin@utfl.example', role: 'PLATFORM_ADMIN' as never, status: 'ACTIVE' });

  return {
    store,
    ...render(
      <AuthContext.Provider value={store}>
        <MemoryRouter>
          <AdminShell />
        </MemoryRouter>
      </AuthContext.Provider>,
    ),
  };
}

describe('AdminShell', () => {
  it('shows links to Organizations, Users, and Trades', () => {
    renderShell();
    expect(screen.getByRole('link', { name: 'Organizations' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trades' })).toBeInTheDocument();
  });

  it('logs out when the log out button is clicked', async () => {
    const { store } = renderShell();
    const logoutSpy = vi.spyOn(store, 'logout');

    await userEvent.click(screen.getByRole('button', { name: /log out/i }));

    expect(logoutSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/AdminShell.test.tsx`
Expected: FAIL — `./AdminShell` doesn't exist yet.

- [ ] **Step 7: Write the admin shell**

Create `web/src/components/AdminShell.tsx`:

```tsx
import { NavLink, Outlet } from 'react-router-dom';

import { useAuthStore } from '../stores/AuthContext';

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return isActive ? 'text-seal font-semibold' : 'text-ink-soft hover:text-ink';
}

export function AdminShell() {
  const auth = useAuthStore();

  return (
    <div className="min-h-screen bg-paper">
      <div className="h-[60px] border-b border-line bg-paper-2 flex items-center justify-between px-7">
        <div className="font-serif font-bold text-[16.5px]">Trade Ledger — Admin</div>
        <nav className="flex items-center gap-5 text-[13.5px] font-medium">
          <NavLink to="/admin" end className={navLinkClassName}>
            Organizations
          </NavLink>
          <NavLink to="/admin/users" className={navLinkClassName}>
            Users
          </NavLink>
          <NavLink to="/admin/trades" className={navLinkClassName}>
            Trades
          </NavLink>
          <button onClick={() => auth.logout()} className="text-ink-soft hover:text-ink font-semibold">
            Log out
          </button>
        </nav>
      </div>
      <div className="px-8 py-8">
        <Outlet />
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/AdminShell.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 9: Write the failing AdminOrganizationsPage test**

Create `web/src/pages/AdminOrganizationsPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import * as adminApi from '../api/admin';
import type { Organization } from '../api/types';
import { AdminOrganizationsPage } from './AdminOrganizationsPage';

const orgs: Organization[] = [
  { id: 'o-1', name: 'Indus Exports Pvt. Ltd.', org_type: 'EXPORTER', country: 'India', industry: 'Pharmaceuticals', tax_id: 'TAX-1', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
  { id: 'o-2', name: 'Sakura Textiles K.K.', org_type: 'BUYER', country: 'Japan', industry: 'Textiles & Apparel', tax_id: 'TAX-2', kyb_status: 'REVIEW', created_at: '2026-01-01T00:00:00Z' },
];

describe('AdminOrganizationsPage', () => {
  it('renders every organization platform-wide with its KYB status', async () => {
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    render(<AdminOrganizationsPage />);

    expect(await screen.findByText('Indus Exports Pvt. Ltd.')).toBeInTheDocument();
    expect(screen.getByText('Sakura Textiles K.K.')).toBeInTheDocument();
    expect(screen.getByText('Clear')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    vi.spyOn(adminApi, 'listAdminOrganizations').mockRejectedValue(new Error('boom'));

    render(<AdminOrganizationsPage />);

    expect(await screen.findByText(/couldn't load organizations/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `cd web && npx vitest run src/pages/AdminOrganizationsPage.test.tsx`
Expected: FAIL — `./AdminOrganizationsPage` doesn't exist yet.

- [ ] **Step 11: Write the organizations list page**

Create `web/src/pages/AdminOrganizationsPage.tsx`:

```tsx
import { useEffect, useState } from 'react';

import { listAdminOrganizations } from '../api/admin';
import type { Organization } from '../api/types';
import { kybStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';

export function AdminOrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAdminOrganizations()
      .then(setOrganizations)
      .catch(() => setError("Couldn't load organizations. Please try again."));
  }, []);

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (organizations === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Organizations</h1>
      {organizations.length === 0 ? (
        <p className="text-ink-soft">No organizations yet.</p>
      ) : (
        <Panel noPadding>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-soft border-b border-line-strong">
                <th className="py-2.5 px-6">Name</th>
                <th className="py-2.5 px-6">Type</th>
                <th className="py-2.5 px-6">Country</th>
                <th className="py-2.5 px-6">Industry</th>
                <th className="py-2.5 px-6">KYB status</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((org) => {
                const status = kybStatusInfo(org.kyb_status);
                return (
                  <tr key={org.id} className="border-b border-line last:border-b-0">
                    <td className="py-3 px-6">{org.name}</td>
                    <td className="py-3 px-6">{org.org_type}</td>
                    <td className="py-3 px-6">{org.country}</td>
                    <td className="py-3 px-6">{org.industry}</td>
                    <td className="py-3 px-6">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `cd web && npx vitest run src/pages/AdminOrganizationsPage.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 13: Wire everything into the router**

Replace the full contents of `web/src/App.tsx`:

```tsx
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AdminShell } from './components/AdminShell';
import { AppShell } from './components/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RequireAdmin, RequireBusinessUser } from './components/RoleGates';
import { TransactionDetailLayout } from './components/TransactionDetailLayout';
import { AdminOrganizationsPage } from './pages/AdminOrganizationsPage';
import { BankSignupPage } from './pages/BankSignupPage';
import { DashboardPage } from './pages/DashboardPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { NewTransactionPage } from './pages/NewTransactionPage';
import { OrganizationProfilePage } from './pages/OrganizationProfilePage';
import { OrganizationSignupPage } from './pages/OrganizationSignupPage';
import { ProfilePage } from './pages/ProfilePage';
import { SignupPage } from './pages/SignupPage';
import { TeamPage } from './pages/TeamPage';
import { TransactionBankReviewPage } from './pages/TransactionBankReviewPage';
import { TransactionCompliancePage } from './pages/TransactionCompliancePage';
import { TransactionDocumentsPage } from './pages/TransactionDocumentsPage';
import { TransactionOverviewPage } from './pages/TransactionOverviewPage';
import { TransactionTimelinePage } from './pages/TransactionTimelinePage';
import { TransactionsPage } from './pages/TransactionsPage';
import { AuthProvider } from './stores/AuthContext';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/signup/organization" element={<OrganizationSignupPage />} />
          <Route path="/signup/banking" element={<BankSignupPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<RequireAdmin />}>
              <Route element={<AdminShell />}>
                <Route path="/admin" element={<AdminOrganizationsPage />} />
              </Route>
            </Route>
            <Route element={<RequireBusinessUser />}>
              <Route element={<AppShell />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/transactions" element={<TransactionsPage />} />
                <Route path="/transactions/new" element={<NewTransactionPage />} />
                <Route path="/transactions/:tradeId" element={<TransactionDetailLayout />}>
                  <Route path="overview" element={<TransactionOverviewPage />} />
                  <Route path="documents" element={<TransactionDocumentsPage />} />
                  <Route path="compliance" element={<TransactionCompliancePage />} />
                  <Route path="bank-review" element={<TransactionBankReviewPage />} />
                  <Route path="timeline" element={<TransactionTimelinePage />} />
                </Route>
                <Route path="/organizations/:orgId" element={<OrganizationProfilePage />} />
                <Route path="/team" element={<TeamPage />} />
                <Route path="/profile" element={<ProfilePage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
```

- [ ] **Step 14: Typecheck and run the full frontend suite**

Run: `cd web && npx tsc -b && npx vitest run`
Expected: both clean — no type errors, no regressions.

- [ ] **Step 15: Commit**

```bash
git add web/src/components/RoleGates.tsx web/src/components/RoleGates.test.tsx web/src/components/AdminShell.tsx web/src/components/AdminShell.test.tsx web/src/pages/AdminOrganizationsPage.tsx web/src/pages/AdminOrganizationsPage.test.tsx web/src/App.tsx
git commit -m "Add admin route guards, AdminShell, and the organizations list page"
```

---

### Task 6: Frontend — KYB status inline editor

**Files:**
- Modify: `web/src/pages/AdminOrganizationsPage.tsx`
- Modify: `web/src/pages/AdminOrganizationsPage.test.tsx`

**Interfaces:**
- Consumes: `updateOrganizationKybStatus` (Task 4, `web/src/api/admin.ts`), `KybStatus` type (`web/src/api/types.ts`, unchanged).

- [ ] **Step 1: Write the failing tests**

Add to `web/src/pages/AdminOrganizationsPage.test.tsx` — change the top import line and add two tests:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
```

```tsx
  it("lets an admin change an organization's KYB status", async () => {
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue([orgs[0]]);
    const updateSpy = vi.spyOn(adminApi, 'updateOrganizationKybStatus').mockResolvedValue({ ...orgs[0], kyb_status: 'BLOCK' });

    render(<AdminOrganizationsPage />);
    await screen.findByText('Indus Exports Pvt. Ltd.');

    await userEvent.selectOptions(screen.getByLabelText(/change kyb status for indus exports/i), 'BLOCK');

    expect(updateSpy).toHaveBeenCalledWith('o-1', 'BLOCK');
    expect(await screen.findByText('Blocked')).toBeInTheDocument();
  });

  it('reverts the status and shows an error if the update fails', async () => {
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue([orgs[0]]);
    vi.spyOn(adminApi, 'updateOrganizationKybStatus').mockRejectedValue(new Error('boom'));

    render(<AdminOrganizationsPage />);
    await screen.findByText('Indus Exports Pvt. Ltd.');

    await userEvent.selectOptions(screen.getByLabelText(/change kyb status for indus exports/i), 'BLOCK');

    expect(await screen.findByText(/couldn't update the kyb status/i)).toBeInTheDocument();
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run src/pages/AdminOrganizationsPage.test.tsx`
Expected: FAIL — no element matches `getByLabelText(/change kyb status/i)`.

- [ ] **Step 3: Add the inline status editor**

Replace the full contents of `web/src/pages/AdminOrganizationsPage.tsx`:

```tsx
import { useEffect, useState } from 'react';

import { listAdminOrganizations, updateOrganizationKybStatus } from '../api/admin';
import type { KybStatus, Organization } from '../api/types';
import { kybStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';

const KYB_STATUS_OPTIONS: KybStatus[] = ['PENDING', 'CLEAR', 'REVIEW', 'BLOCK'];

export function AdminOrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAdminOrganizations()
      .then(setOrganizations)
      .catch(() => setError("Couldn't load organizations. Please try again."));
  }, []);

  async function handleStatusChange(orgId: string, kybStatus: KybStatus) {
    const previous = organizations;
    setOrganizations((orgs) => orgs?.map((org) => (org.id === orgId ? { ...org, kyb_status: kybStatus } : org)) ?? orgs);
    try {
      await updateOrganizationKybStatus(orgId, kybStatus);
    } catch {
      setOrganizations(previous);
      setError("Couldn't update the KYB status. Please try again.");
    }
  }

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (organizations === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Organizations</h1>
      {organizations.length === 0 ? (
        <p className="text-ink-soft">No organizations yet.</p>
      ) : (
        <Panel noPadding>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-soft border-b border-line-strong">
                <th className="py-2.5 px-6">Name</th>
                <th className="py-2.5 px-6">Type</th>
                <th className="py-2.5 px-6">Country</th>
                <th className="py-2.5 px-6">Industry</th>
                <th className="py-2.5 px-6">KYB status</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((org) => {
                const status = kybStatusInfo(org.kyb_status);
                return (
                  <tr key={org.id} className="border-b border-line last:border-b-0">
                    <td className="py-3 px-6">{org.name}</td>
                    <td className="py-3 px-6">{org.org_type}</td>
                    <td className="py-3 px-6">{org.country}</td>
                    <td className="py-3 px-6">{org.industry}</td>
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-2">
                        <Badge tone={status.tone}>{status.label}</Badge>
                        <select
                          aria-label={`Change KYB status for ${org.name}`}
                          value={org.kyb_status}
                          onChange={(e) => handleStatusChange(org.id, e.target.value as KybStatus)}
                          className="text-xs border border-line-strong rounded px-1.5 py-1"
                        >
                          {KYB_STATUS_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {kybStatusInfo(option).label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run src/pages/AdminOrganizationsPage.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck and run the full frontend suite**

Run: `cd web && npx tsc -b && npx vitest run`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/AdminOrganizationsPage.tsx web/src/pages/AdminOrganizationsPage.test.tsx
git commit -m "Add inline KYB status editor to the admin organizations page"
```

---

### Task 7: Frontend — users list page

**Files:**
- Create: `web/src/pages/AdminUsersPage.tsx`
- Modify: `web/src/App.tsx`
- Test: `web/src/pages/AdminUsersPage.test.tsx`

**Interfaces:**
- Consumes: `listAdminUsers`, `listAdminOrganizations` (Task 4, `web/src/api/admin.ts`), `roleLabel` (`web/src/lib/roles.ts`), `userStatusInfo` (`web/src/lib/statusTones.ts`).

- [ ] **Step 1: Write the failing test**

Create `web/src/pages/AdminUsersPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import * as adminApi from '../api/admin';
import type { Organization, User } from '../api/types';
import { AdminUsersPage } from './AdminUsersPage';

const orgs: Organization[] = [
  { id: 'o-1', name: 'Indus Exports Pvt. Ltd.', org_type: 'EXPORTER', country: 'India', industry: 'Pharmaceuticals', tax_id: 'TAX-1', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
];

const users: User[] = [
  { id: 'u-1', org_id: 'o-1', name: 'Priya Shah', email: 'priya@example.com', role: 'EXPORTER_ADMIN', status: 'ACTIVE' },
  { id: 'u-2', org_id: null, name: 'Ops Admin', email: 'admin@utfl.example', role: 'PLATFORM_ADMIN', status: 'ACTIVE' },
];

describe('AdminUsersPage', () => {
  it('renders every user platform-wide with their organization name', async () => {
    vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    render(<AdminUsersPage />);

    expect(await screen.findByText('Priya Shah')).toBeInTheDocument();
    expect(screen.getByText('Indus Exports Pvt. Ltd.')).toBeInTheDocument();
    expect(screen.getByText('Ops Admin')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    vi.spyOn(adminApi, 'listAdminUsers').mockRejectedValue(new Error('boom'));
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    render(<AdminUsersPage />);

    expect(await screen.findByText(/couldn't load users/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/pages/AdminUsersPage.test.tsx`
Expected: FAIL — `./AdminUsersPage` doesn't exist yet.

- [ ] **Step 3: Write the users list page**

Create `web/src/pages/AdminUsersPage.tsx`:

```tsx
import { useEffect, useState } from 'react';

import { listAdminOrganizations, listAdminUsers } from '../api/admin';
import type { Organization, User } from '../api/types';
import { roleLabel } from '../lib/roles';
import { userStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';

export function AdminUsersPage() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listAdminUsers(), listAdminOrganizations()])
      .then(([fetchedUsers, fetchedOrganizations]) => {
        setUsers(fetchedUsers);
        setOrganizations(fetchedOrganizations);
      })
      .catch(() => setError("Couldn't load users. Please try again."));
  }, []);

  function orgName(orgId: string | null): string {
    if (!orgId) return '—';
    return organizations.find((org) => org.id === orgId)?.name ?? orgId;
  }

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (users === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Users</h1>
      {users.length === 0 ? (
        <p className="text-ink-soft">No users yet.</p>
      ) : (
        <Panel noPadding>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-soft border-b border-line-strong">
                <th className="py-2.5 px-6">Name</th>
                <th className="py-2.5 px-6">Email</th>
                <th className="py-2.5 px-6">Organization</th>
                <th className="py-2.5 px-6">Role</th>
                <th className="py-2.5 px-6">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const status = userStatusInfo(user.status);
                return (
                  <tr key={user.id} className="border-b border-line last:border-b-0">
                    <td className="py-3 px-6">{user.name}</td>
                    <td className="py-3 px-6 font-mono">{user.email}</td>
                    <td className="py-3 px-6">{orgName(user.org_id)}</td>
                    <td className="py-3 px-6">{roleLabel(user.role)}</td>
                    <td className="py-3 px-6">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/pages/AdminUsersPage.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the route**

In `web/src/App.tsx`, add an import and a route line:

```tsx
import { AdminOrganizationsPage } from './pages/AdminOrganizationsPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
```

```tsx
                <Route path="/admin" element={<AdminOrganizationsPage />} />
                <Route path="/admin/users" element={<AdminUsersPage />} />
```

- [ ] **Step 6: Typecheck and run the full frontend suite**

Run: `cd web && npx tsc -b && npx vitest run`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/AdminUsersPage.tsx web/src/pages/AdminUsersPage.test.tsx web/src/App.tsx
git commit -m "Add the admin users list page"
```

---

### Task 8: Frontend — trades list page

**Files:**
- Create: `web/src/pages/AdminTradesPage.tsx`
- Modify: `web/src/App.tsx`
- Test: `web/src/pages/AdminTradesPage.test.tsx`

**Interfaces:**
- Consumes: `listAdminTrades` (Task 4, `web/src/api/admin.ts`), `tradeStatusInfo` (`web/src/lib/statusTones.ts`).

- [ ] **Step 1: Write the failing test**

Create `web/src/pages/AdminTradesPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import * as adminApi from '../api/admin';
import type { Trade } from '../api/types';
import { AdminTradesPage } from './AdminTradesPage';

const trades: Trade[] = [
  {
    id: 't-1',
    lc_reference: 'MUFGJP2026LC1187',
    industry: 'Pharmaceuticals',
    instrument_type: 'Letter of Credit',
    exporter_org_id: 'o-1',
    buyer_org_id: 'o-2',
    issuing_bank_org_id: 'o-3',
    advising_bank_org_id: 'o-4',
    product_description: 'Paracetamol Tablets 500mg',
    order_value: 80000,
    currency: 'USD',
    incoterm: 'CIF Osaka',
    payment_term: 'Usance LC, 60 days',
    shipment_deadline: '2026-09-15',
    status: 'DOCS_UNDER_REVIEW',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

describe('AdminTradesPage', () => {
  it('renders every trade platform-wide', async () => {
    vi.spyOn(adminApi, 'listAdminTrades').mockResolvedValue(trades);

    render(<AdminTradesPage />);

    expect(await screen.findByText('MUFGJP2026LC1187')).toBeInTheDocument();
    expect(screen.getByText('2026-09-15')).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    vi.spyOn(adminApi, 'listAdminTrades').mockRejectedValue(new Error('boom'));

    render(<AdminTradesPage />);

    expect(await screen.findByText(/couldn't load trades/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/pages/AdminTradesPage.test.tsx`
Expected: FAIL — `./AdminTradesPage` doesn't exist yet.

- [ ] **Step 3: Write the trades list page**

Create `web/src/pages/AdminTradesPage.tsx`:

```tsx
import { useEffect, useState } from 'react';

import { listAdminTrades } from '../api/admin';
import type { Trade } from '../api/types';
import { tradeStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';

export function AdminTradesPage() {
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAdminTrades()
      .then(setTrades)
      .catch(() => setError("Couldn't load trades. Please try again."));
  }, []);

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (trades === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Trades</h1>
      {trades.length === 0 ? (
        <p className="text-ink-soft">No trades yet.</p>
      ) : (
        <Panel noPadding>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-soft border-b border-line-strong">
                <th className="py-2.5 px-6">LC reference</th>
                <th className="py-2.5 px-6">Industry</th>
                <th className="py-2.5 px-6">Order value</th>
                <th className="py-2.5 px-6">Shipment deadline</th>
                <th className="py-2.5 px-6">Status</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => {
                const status = tradeStatusInfo(trade.status);
                return (
                  <tr key={trade.id} className="border-b border-line last:border-b-0">
                    <td className="py-3 px-6">{trade.lc_reference}</td>
                    <td className="py-3 px-6">{trade.industry}</td>
                    <td className="py-3 px-6 font-mono">
                      {trade.currency} {trade.order_value.toLocaleString()}
                    </td>
                    <td className="py-3 px-6">{trade.shipment_deadline ?? '—'}</td>
                    <td className="py-3 px-6">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/pages/AdminTradesPage.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the route**

In `web/src/App.tsx`, add an import and a route line:

```tsx
import { AdminOrganizationsPage } from './pages/AdminOrganizationsPage';
import { AdminTradesPage } from './pages/AdminTradesPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
```

```tsx
                <Route path="/admin" element={<AdminOrganizationsPage />} />
                <Route path="/admin/users" element={<AdminUsersPage />} />
                <Route path="/admin/trades" element={<AdminTradesPage />} />
```

- [ ] **Step 6: Typecheck and run the full frontend suite**

Run: `cd web && npx tsc -b && npx vitest run`
Expected: both clean.

- [ ] **Step 7: Run the full backend suite one more time (sanity check before wrap-up)**

Run: `cd api && venv/Scripts/python.exe -m pytest -q`
Expected: PASS, no regressions across the whole feature.

- [ ] **Step 8: Commit**

```bash
git add web/src/pages/AdminTradesPage.tsx web/src/pages/AdminTradesPage.test.tsx web/src/App.tsx
git commit -m "Add the admin trades list page"
```
