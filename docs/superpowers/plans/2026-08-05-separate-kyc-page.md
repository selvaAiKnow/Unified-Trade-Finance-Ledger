# Separate KYC Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the business registration document upload out of the signup form and onto a dedicated, post-signup `/kyc` page, matching the existing "KYB verification" panel layout (Overall status + `BUSINESS_REGISTRATION` / `SANCTIONS_SCREENING` / `BANK_ACCOUNT` rows) already used on the Profile page.

**Architecture:** Signup goes back to a simple JSON request with no file, but now also logs the user in (returns an `access_token`, like `/auth/login`) so the frontend can redirect straight to the protected `/kyc` page. The `BUSINESS_REGISTRATION` check starts at `PENDING` instead of auto-`PASSED`. A new authenticated endpoint lets a user upload the document for their own org, which flips that one check to `PASSED`. The Profile page keeps its existing read-only KYB panel and gains a link to `/kyc` whenever `BUSINESS_REGISTRATION` is still pending.

**Tech Stack:** FastAPI + SQLAlchemy/Alembic (`api/`), React + TypeScript + Vite + MobX (`web/`), MinIO object storage.

## Global Constraints

- `POST /auth/signup` no longer accepts a file. It is a plain JSON request again (`org_name`, `org_type`, `country`, `industry`, `tax_id`, `admin_name`, `admin_email`, `password`).
- Signup auto-logs the user in: its response gains `access_token` and `token_type`, exactly like `LoginResponse`.
- At signup, the `BUSINESS_REGISTRATION` `KybCheck` row is created with `status=PENDING` and `detail=None`. `SANCTIONS_SCREENING` and `BANK_ACCOUNT` behavior is unchanged from today (still auto-resolved during signup).
- The new upload endpoint lives at `POST /organizations/{org_id}/kyb-checks/business-registration-document`, is authenticated, and only the org's own members may use it (`current_user.org_id == org_id` — NOT the broader trade-partner access rule that `GET /organizations/{org_id}` and `GET /organizations/{org_id}/kyb-checks` use, since uploading a compliance document is not something a counterparty should ever do).
- The endpoint reuses the existing MinIO bucket, `upload_bytes`, filename sanitization (basename only, safe fallback), 10 MB size cap, and `application/pdf` / `image/*` content-type allowlist that the prior signup implementation used.
- Once `BUSINESS_REGISTRATION` is `PASSED`, the upload endpoint rejects further uploads with `409` and the frontend never shows the upload form again for that org (one-time upload, no replace flow).
- The `/kyc` page lives inside the normal authenticated app shell (same chrome as Profile/Team) but gets **no sidebar nav entry** — reachable only via the post-signup redirect or the link from Profile.
- No app-wide route gate: once a user navigates away from `/kyc`, they can use the rest of the app normally regardless of `BUSINESS_REGISTRATION` status.
- No document viewer/download link is being added (carried over from the prior signup-upload work).

---

### Task 1: Backend — revert signup to JSON, add auto-login, start BUSINESS_REGISTRATION as PENDING

**Files:**
- Modify: `api/app/schemas/auth.py`
- Modify: `api/app/routers/auth.py`
- Modify: `api/tests/test_auth_signup.py` (full rewrite)

**Interfaces:**
- Produces: `SignupRequest` (flat pydantic model: `org_name: str`, `org_type: OrgType`, `country: str`, `industry: str`, `tax_id: str`, `admin_name: str`, `admin_email: EmailStr`, `password: str`) and `SignupResponse` (`organization`, `user`, `kyb_checks`, `access_token: str`, `token_type: str = "bearer"`) — Task 4 (frontend `signup()`) consumes this exact JSON shape.
- Consumes: nothing from other tasks.

- [ ] **Step 1: Replace `api/app/schemas/auth.py` with the following**

```python
from pydantic import BaseModel, EmailStr, Field

from app.models.enums import OrgType
from app.schemas.kyb_check import KybCheckOut
from app.schemas.organization import OrganizationOut
from app.schemas.user import UserOut


class SignupRequest(BaseModel):
    org_name: str
    org_type: OrgType
    country: str
    industry: str
    tax_id: str
    admin_name: str
    admin_email: EmailStr
    password: str


class SignupResponse(BaseModel):
    organization: OrganizationOut
    user: UserOut
    kyb_checks: list[KybCheckOut]
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str
    otp_code: str


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    code: str


class VerifyOtpResponse(BaseModel):
    reset_token: str


class ResetPasswordRequest(BaseModel):
    reset_token: str
    # bcrypt.hashpw raises on inputs longer than 72 bytes, so cap it here and 422
    # rather than 500 on an over-long password.
    new_password: str = Field(min_length=8, max_length=72)


class ResetPasswordResponse(BaseModel):
    message: str
```

- [ ] **Step 2: Replace the top of `api/app/routers/auth.py` (imports and the `signup` handler) with the following**

Everything from `import secrets` through the `_is_allowed_document_content_type` helper (currently lines 1-58) and the `signup` function (currently lines 60-138) is replaced by:

```python
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.security import (
    create_access_token,
    create_password_reset_token,
    decode_password_reset_token,
    hash_password,
    verify_password,
)
from app.config import settings
from app.db import get_db
from app.models.enums import KybCheckStatus, KybCheckType, UserRole, UserStatus
from app.models.kyb_check import KybCheck
from app.models.organization import Organization
from app.models.password_reset_otp import PasswordResetOtp
from app.models.user import User
from app.sanctions.client import SanctionsClient
from app.sanctions.dependency import get_sanctions_client
from app.schemas.auth import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LoginResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
    SignupRequest,
    SignupResponse,
    VerifyOtpRequest,
    VerifyOtpResponse,
)
from app.schemas.user import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

ORG_TYPE_TO_ADMIN_ROLE = {
    "EXPORTER": UserRole.EXPORTER_ADMIN.value,
    "BUYER": UserRole.BUYER.value,
    "BANK": UserRole.BANK_REVIEWER.value,
    "BOTH": UserRole.EXPORTER_ADMIN.value,
}


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    payload: SignupRequest,
    db: AsyncSession = Depends(get_db),
    sanctions_client: SanctionsClient = Depends(get_sanctions_client),
) -> SignupResponse:
    existing = await db.execute(select(User).where(User.email == payload.admin_email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    org = Organization(
        name=payload.org_name,
        org_type=payload.org_type.value,
        country=payload.country,
        industry=payload.industry,
        tax_id=payload.tax_id,
    )
    db.add(org)
    await db.flush()

    admin_role = ORG_TYPE_TO_ADMIN_ROLE[payload.org_type.value]
    user = User(
        org_id=org.id,
        name=payload.admin_name,
        email=payload.admin_email,
        password_hash=hash_password(payload.password),
        role=admin_role,
        status=UserStatus.ACTIVE.value,
    )
    db.add(user)

    sanctions_result = await sanctions_client.screen(name=org.name, country=org.country)
    org.kyb_status = sanctions_result["status"]

    kyb_checks = [
        KybCheck(org_id=org.id, check_type=KybCheckType.BUSINESS_REGISTRATION.value, status=KybCheckStatus.PENDING.value),
        KybCheck(
            org_id=org.id,
            check_type=KybCheckType.SANCTIONS_SCREENING.value,
            status=KybCheckStatus.PASSED.value if sanctions_result["status"] == "CLEAR" else KybCheckStatus.FAILED.value,
            detail=f"fake:{sanctions_result['status']}",
        ),
        KybCheck(org_id=org.id, check_type=KybCheckType.BANK_ACCOUNT.value, status=KybCheckStatus.PASSED.value),
    ]
    db.add_all(kyb_checks)

    await db.commit()
    await db.refresh(org)
    await db.refresh(user)
    for check in kyb_checks:
        await db.refresh(check)

    token = create_access_token(user_id=str(user.id), org_id=str(user.org_id), role=user.role)
    return SignupResponse(organization=org, user=user, kyb_checks=kyb_checks, access_token=token)
```

Every function below `signup` in `auth.py` (`login`, `forgot_password`, `verify_otp`, `reset_password`, `me`) is unchanged — leave them exactly as they are today. Note `secrets`, `uuid`, `datetime`/`timedelta`/`timezone`, and `settings` are still imported above because `forgot_password`/`reset_password` use them, not because signup needs them anymore.

- [ ] **Step 3: Run the full backend suite to see it fail**

Run: `api/venv/Scripts/python.exe -m pytest -q` from the `api` directory (Windows; use `venv/bin/python` on other platforms).
Expected: many failures — every test file with a local signup helper still sends `data=`/`files=` multipart, which the new JSON-only endpoint rejects. This is expected; Task 2 fixes those files. For this step, only `api/tests/test_auth_signup.py` needs to end up green (see Step 4-5) — everything else stays red until Task 2.

- [ ] **Step 4: Replace `api/tests/test_auth_signup.py` with the following**

```python
from sqlalchemy import select

from app.models.kyb_check import KybCheck

SIGNUP_PAYLOAD = {
    "org_name": "MedCure Pharma Exports Pvt. Ltd.",
    "org_type": "EXPORTER",
    "country": "India",
    "industry": "Pharmaceuticals",
    "tax_id": "27AAECM1234B1Z5",
    "admin_name": "Priya Shah",
    "admin_email": "priya@medcurepharma.example",
    "password": "correct horse battery staple",
}


async def test_signup_creates_org_user_and_kyb_checks(async_client):
    response = await async_client.post("/auth/signup", json=SIGNUP_PAYLOAD)

    assert response.status_code == 201
    body = response.json()
    assert body["organization"]["name"] == "MedCure Pharma Exports Pvt. Ltd."
    assert body["organization"]["kyb_status"] == "CLEAR"
    assert body["user"]["email"] == "priya@medcurepharma.example"
    assert body["user"]["role"] == "EXPORTER_ADMIN"
    assert body["access_token"]
    assert body["token_type"] == "bearer"
    assert len(body["kyb_checks"]) == 3
    by_type = {c["check_type"]: c for c in body["kyb_checks"]}
    assert by_type["BUSINESS_REGISTRATION"]["status"] == "PENDING"
    assert by_type["BUSINESS_REGISTRATION"]["detail"] is None
    assert by_type["SANCTIONS_SCREENING"]["status"] == "PASSED"
    assert by_type["SANCTIONS_SCREENING"]["detail"] is not None
    assert by_type["BANK_ACCOUNT"]["status"] == "PASSED"


async def test_signup_creates_three_kyb_check_rows(async_client, db_session):
    response = await async_client.post(
        "/auth/signup",
        json={
            **SIGNUP_PAYLOAD,
            "org_name": "Kyoto Textile Trading Co.",
            "industry": "Textiles",
            "tax_id": "29AABCT1111C1Z2",
            "admin_name": "Arjun Nair",
            "admin_email": "arjun@kyototextile.example",
            "password": "another secret",
        },
    )
    org_id = response.json()["organization"]["id"]

    rows = (await db_session.execute(select(KybCheck).where(KybCheck.org_id == org_id))).scalars().all()
    assert len(rows) == 3
    by_type = {r.check_type: r for r in rows}
    assert by_type["SANCTIONS_SCREENING"].status == "PASSED"
    assert by_type["SANCTIONS_SCREENING"].detail is not None
    assert by_type["BUSINESS_REGISTRATION"].status == "PENDING"
    assert by_type["BANK_ACCOUNT"].status == "PASSED"


async def test_signup_with_both_org_type_creates_exporter_admin(async_client):
    response = await async_client.post(
        "/auth/signup",
        json={
            **SIGNUP_PAYLOAD,
            "org_name": "Sample Global Exports Pvt. Ltd.",
            "org_type": "BOTH",
            "tax_id": "AASCS1234F",
            "admin_name": "Rohan Mehta",
            "admin_email": "exports@sampleglobal.in",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["organization"]["org_type"] == "BOTH"
    assert body["user"]["role"] == "EXPORTER_ADMIN"


async def test_signup_rejects_duplicate_email(async_client):
    await async_client.post(
        "/auth/signup",
        json={
            **SIGNUP_PAYLOAD,
            "org_name": "Org A",
            "tax_id": "TAX-A",
            "admin_name": "User A",
            "admin_email": "dupe@example.com",
            "password": "password one",
        },
    )

    response = await async_client.post(
        "/auth/signup",
        json={
            **SIGNUP_PAYLOAD,
            "org_name": "Org B",
            "tax_id": "TAX-B",
            "admin_name": "User B",
            "admin_email": "dupe@example.com",
            "password": "password two",
        },
    )
    assert response.status_code == 409


async def test_signup_returns_a_working_access_token(async_client):
    response = await async_client.post(
        "/auth/signup",
        json={**SIGNUP_PAYLOAD, "admin_email": "token-check@medcurepharma.example"},
    )
    token = response.json()["access_token"]

    me_response = await async_client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "token-check@medcurepharma.example"
```

- [ ] **Step 5: Run `test_auth_signup.py` to verify it passes**

Run: `api/venv/Scripts/python.exe -m pytest tests/test_auth_signup.py -v` from the `api` directory.
Expected: all 5 tests PASS. (The rest of the suite is still red — that's Task 2.)

- [ ] **Step 6: Commit**

```bash
git add api/app/schemas/auth.py api/app/routers/auth.py api/tests/test_auth_signup.py
git commit -m "Revert signup to a JSON request that auto-logs the user in"
```

---

### Task 2: Backend — propagate the reverted signup shape across the test suite

**Files:**
- Modify: `api/tests/test_auth_login.py`
- Modify: `api/tests/test_auth_password_reset.py`
- Modify: `api/tests/test_organizations_endpoints.py`
- Modify: `api/tests/test_users_endpoints.py`
- Modify: `api/tests/test_document_registry_endpoints.py`
- Modify: `api/tests/test_trades_endpoints.py`
- Modify: `api/tests/test_admin_endpoints.py`

**Interfaces:**
- Consumes: `POST /auth/signup` (Task 1) — JSON body, response includes `access_token` directly (no separate `/auth/login` call is needed anymore).
- Produces: `signup_and_login` in `test_trades_endpoints.py` keeps its existing name and `tuple[str, str]` return type (`org_id`, `access_token`) — `test_bank_review_endpoints.py`, `test_sanctions_screening_endpoints.py`, and `test_documents_endpoints.py` import it and need no changes.

This task is intentionally mechanical: every local signup helper switches from a `data=`/`files=` multipart call plus a separate `/auth/login` call, to a single `json=` call that reads `access_token` straight out of the signup response. No other line in any of these files changes.

- [ ] **Step 1: In `api/tests/test_auth_login.py`, replace the `_signup` helper (current lines 1-14) with**

```python
async def _signup(async_client, email: str, password: str, org_type: str = "EXPORTER") -> None:
    payload = {
        "org_name": "Test Org",
        "org_type": org_type,
        "country": "India",
        "industry": "Pharmaceuticals",
        "tax_id": "TAX-1",
        "admin_name": "Test User",
        "admin_email": email,
        "password": password,
    }
    response = await async_client.post("/auth/signup", json=payload)
    assert response.status_code == 201
```

- [ ] **Step 2: In `api/tests/test_auth_password_reset.py`, replace the `_signup` helper (current lines 1-14) with**

```python
async def _signup(async_client, email: str, password: str) -> None:
    payload = {
        "org_name": "Test Org",
        "org_type": "EXPORTER",
        "country": "India",
        "industry": "Pharmaceuticals",
        "tax_id": "TAX-1",
        "admin_name": "Test User",
        "admin_email": email,
        "password": password,
    }
    response = await async_client.post("/auth/signup", json=payload)
    assert response.status_code == 201
```

- [ ] **Step 3: In `api/tests/test_organizations_endpoints.py`, replace the `_signup_and_login` helper (current lines 4-21) with**

```python
async def _signup_and_login(async_client, email: str) -> tuple[str, str]:
    payload = {
        "org_name": "Test Org",
        "org_type": "EXPORTER",
        "country": "India",
        "industry": "Pharmaceuticals",
        "tax_id": "TAX-ORG-1",
        "admin_name": "Test User",
        "admin_email": email,
        "password": "a good password",
    }
    response = await async_client.post("/auth/signup", json=payload)
    body = response.json()
    return body["organization"]["id"], body["access_token"]
```

Then, in the same file, `test_list_organizations_returns_matches` (current lines 29-47) has an inline second signup — replace its body (current lines 31-42) with:

```python
async def test_list_organizations_returns_matches(async_client):
    _, token = await _signup_and_login(async_client, "org-list-1@example.com")
    payload = {
        "org_name": "Sakura Textiles K.K.",
        "org_type": "BUYER",
        "country": "Japan",
        "industry": "Textiles & Apparel",
        "tax_id": "TAX-ORG-LIST-1",
        "admin_name": "Test User",
        "admin_email": "org-list-2@example.com",
        "password": "a good password",
    }
    await async_client.post("/auth/signup", json=payload)

    response = await async_client.get("/organizations?search=sakura", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    names = [org["name"] for org in response.json()]
    assert names == ["Sakura Textiles K.K."]
```

And `test_list_organizations_search_is_case_insensitive_substring` (current lines 50-68) — replace its body (current lines 52-63) with:

```python
async def test_list_organizations_search_is_case_insensitive_substring(async_client):
    _, token = await _signup_and_login(async_client, "org-list-3@example.com")
    payload = {
        "org_name": "Indus Exports Pvt. Ltd.",
        "org_type": "EXPORTER",
        "country": "India",
        "industry": "Textiles & Apparel",
        "tax_id": "TAX-ORG-LIST-2",
        "admin_name": "Test User",
        "admin_email": "org-list-4@example.com",
        "password": "a good password",
    }
    await async_client.post("/auth/signup", json=payload)

    response = await async_client.get("/organizations?search=EXPORTS", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    names = [org["name"] for org in response.json()]
    assert "Indus Exports Pvt. Ltd." in names
```

No other test in this file changes — everything from `test_list_organizations_without_search_returns_all` onward is unaffected.

- [ ] **Step 4: In `api/tests/test_users_endpoints.py`, replace the `_signup_and_login` helper (current lines 7-21, i.e. up to and including the `return login_response.json()["access_token"]` line) with**

```python
async def _signup_and_login(async_client, email: str) -> str:
    payload = {
        "org_name": "Test Org",
        "org_type": "EXPORTER",
        "country": "India",
        "industry": "Pharmaceuticals",
        "tax_id": "TAX-USERS-1",
        "admin_name": "Admin User",
        "admin_email": email,
        "password": "a good password",
    }
    response = await async_client.post("/auth/signup", json=payload)
    return response.json()["access_token"]
```

- [ ] **Step 5: In `api/tests/test_document_registry_endpoints.py`, replace the `_signup_and_login` helper (current lines 1-15) with**

```python
async def _signup_and_login(async_client, email: str) -> str:
    payload = {
        "org_name": "Test Org",
        "org_type": "EXPORTER",
        "country": "India",
        "industry": "Pharmaceuticals",
        "tax_id": "TAX-REG-1",
        "admin_name": "Admin User",
        "admin_email": email,
        "password": "a good password",
    }
    response = await async_client.post("/auth/signup", json=payload)
    return response.json()["access_token"]
```

- [ ] **Step 6: In `api/tests/test_trades_endpoints.py`, replace the `signup_and_login` helper (current lines 1-16) with**

```python
async def signup_and_login(async_client, email: str, org_type: str = "EXPORTER", industry: str = "Pharmaceuticals") -> tuple[str, str]:
    payload = {
        "org_name": f"Org for {email}",
        "org_type": org_type,
        "country": "India",
        "industry": industry,
        "tax_id": f"TAX-{email}",
        "admin_name": "Admin User",
        "admin_email": email,
        "password": "a good password",
    }
    response = await async_client.post("/auth/signup", json=payload)
    body = response.json()
    return body["organization"]["id"], body["access_token"]
```

- [ ] **Step 7: In `api/tests/test_admin_endpoints.py`, replace the `_signup_and_login` helper (current lines 4-19) with**

```python
async def _signup_and_login(async_client, email: str, org_type: str = "EXPORTER") -> tuple[str, str]:
    payload = {
        "org_name": f"Org for {email}",
        "org_type": org_type,
        "country": "India",
        "industry": "Pharmaceuticals",
        "tax_id": f"TAX-{email}",
        "admin_name": "Business User",
        "admin_email": email,
        "password": "a good password",
    }
    response = await async_client.post("/auth/signup", json=payload)
    body = response.json()
    return body["organization"]["id"], body["access_token"]
```

`_bootstrap_admin_and_login` and `_create_trade` in this file are untouched.

- [ ] **Step 8: Run the full backend suite**

Run: `api/venv/Scripts/python.exe -m pytest -q` from the `api` directory.
Expected: all tests pass (this also exercises `test_bank_review_endpoints.py`, `test_sanctions_screening_endpoints.py`, and `test_documents_endpoints.py`, which import `signup_and_login`/`create_trade` from `test_trades_endpoints.py` and need no direct changes).

- [ ] **Step 9: Commit**

```bash
git add api/tests/test_auth_login.py api/tests/test_auth_password_reset.py api/tests/test_organizations_endpoints.py api/tests/test_users_endpoints.py api/tests/test_document_registry_endpoints.py api/tests/test_trades_endpoints.py api/tests/test_admin_endpoints.py
git commit -m "Update every signup test helper to the reverted JSON request shape"
```

---

### Task 3: Backend — authenticated business registration document upload endpoint

**Files:**
- Modify: `api/app/routers/organizations.py`
- Modify: `api/tests/test_organizations_endpoints.py`

**Interfaces:**
- Consumes: `_signup_and_login(async_client, email) -> tuple[str, str]` from Task 2 (same file).
- Produces: `POST /organizations/{org_id}/kyb-checks/business-registration-document` (multipart, field name `file`), `response_model=KybCheckOut` — Task 5 (frontend `uploadBusinessRegistrationDocument`) consumes this path and field name exactly.

- [ ] **Step 1: Write the failing tests — append to `api/tests/test_organizations_endpoints.py`**

Add this import at the top of the file, alongside the existing import:

```python
from app.storage import get_bytes
```

Then append these tests at the end of the file:

```python
async def test_upload_business_registration_document_passes_the_check(async_client):
    org_id, token = await _signup_and_login(async_client, "kyc-upload-1@example.com")

    response = await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("certificate.pdf", b"fake certificate bytes", "application/pdf")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["check_type"] == "BUSINESS_REGISTRATION"
    assert body["status"] == "PASSED"
    assert body["detail"].startswith(f"org/{org_id}/")
    assert get_bytes(body["detail"]) == b"fake certificate bytes"


async def test_upload_business_registration_document_requires_auth(async_client):
    org_id, _ = await _signup_and_login(async_client, "kyc-upload-2@example.com")

    response = await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        files={"file": ("certificate.pdf", b"fake certificate bytes", "application/pdf")},
    )

    assert response.status_code in (401, 403)


async def test_upload_business_registration_document_rejects_other_orgs_members(async_client):
    org_id, _ = await _signup_and_login(async_client, "kyc-upload-3@example.com")
    _, other_token = await _signup_and_login(async_client, "kyc-upload-4@example.com")

    response = await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        headers={"Authorization": f"Bearer {other_token}"},
        files={"file": ("certificate.pdf", b"fake certificate bytes", "application/pdf")},
    )

    assert response.status_code == 404


async def test_upload_business_registration_document_rejects_already_passed(async_client):
    org_id, token = await _signup_and_login(async_client, "kyc-upload-5@example.com")
    await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("certificate.pdf", b"fake certificate bytes", "application/pdf")},
    )

    response = await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("certificate2.pdf", b"other bytes", "application/pdf")},
    )

    assert response.status_code == 409


async def test_upload_business_registration_document_sanitizes_a_path_traversal_filename(async_client):
    org_id, token = await _signup_and_login(async_client, "kyc-upload-6@example.com")

    response = await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("../../../evil.txt", b"fake certificate bytes", "application/pdf")},
    )

    assert response.status_code == 200
    object_key = response.json()["detail"]
    assert ".." not in object_key
    assert object_key.startswith(f"org/{org_id}/")
    assert object_key.endswith("-evil.txt")


async def test_upload_business_registration_document_rejects_oversized_file(async_client):
    org_id, token = await _signup_and_login(async_client, "kyc-upload-7@example.com")
    oversized_content = b"x" * (10 * 1024 * 1024 + 1)

    response = await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("certificate.pdf", oversized_content, "application/pdf")},
    )

    assert response.status_code == 422


async def test_upload_business_registration_document_rejects_disallowed_content_type(async_client):
    org_id, token = await _signup_and_login(async_client, "kyc-upload-8@example.com")

    response = await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("certificate.txt", b"not a real document", "text/plain")},
    )

    assert response.status_code == 422
```

- [ ] **Step 2: Run the new tests to see them fail**

Run: `api/venv/Scripts/python.exe -m pytest tests/test_organizations_endpoints.py -v -k business_registration_document` from the `api` directory.
Expected: FAIL with 404/405 (route doesn't exist yet).

- [ ] **Step 3: Replace `api/app/routers/organizations.py` with the following**

```python
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.access import user_can_access_org
from app.auth.dependencies import get_current_user
from app.db import get_db
from app.models.enums import KybCheckStatus, KybCheckType
from app.models.kyb_check import KybCheck
from app.models.organization import Organization
from app.models.user import User
from app.schemas.kyb_check import KybCheckOut
from app.schemas.organization import OrganizationOut
from app.storage import upload_bytes

router = APIRouter(prefix="/organizations", tags=["organizations"])

MAX_BUSINESS_REGISTRATION_DOCUMENT_SIZE = 10 * 1024 * 1024


def _is_allowed_document_content_type(content_type: str | None) -> bool:
    if content_type is None:
        return False
    return content_type == "application/pdf" or content_type.startswith("image/")


@router.get("", response_model=list[OrganizationOut])
async def list_organizations(
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> list[Organization]:
    query = select(Organization).order_by(Organization.name)
    if search:
        query = query.where(Organization.name.ilike(f"%{search}%"))
    result = await db.execute(query.limit(20))
    return list(result.scalars().all())


@router.get("/{org_id}", response_model=OrganizationOut)
async def get_organization(
    org_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OrganizationOut:
    org = await db.get(Organization, org_id)
    if org is None or not await user_can_access_org(current_user, org_id, db):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return org


@router.get("/{org_id}/kyb-checks", response_model=list[KybCheckOut])
async def get_organization_kyb_checks(
    org_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[KybCheckOut]:
    org = await db.get(Organization, org_id)
    if org is None or not await user_can_access_org(current_user, org_id, db):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    result = await db.execute(select(KybCheck).where(KybCheck.org_id == org_id))
    return list(result.scalars().all())


@router.post("/{org_id}/kyb-checks/business-registration-document", response_model=KybCheckOut)
async def upload_business_registration_document(
    org_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> KybCheckOut:
    if current_user.org_id != org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    result = await db.execute(
        select(KybCheck).where(
            KybCheck.org_id == org_id,
            KybCheck.check_type == KybCheckType.BUSINESS_REGISTRATION.value,
        )
    )
    check = result.scalar_one_or_none()
    if check is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    if check.status == KybCheckStatus.PASSED.value:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Business registration is already verified")

    content = await file.read()
    if len(content) > MAX_BUSINESS_REGISTRATION_DOCUMENT_SIZE:
        raise HTTPException(status_code=422, detail="Business registration document exceeds the 10 MB size limit")
    if not _is_allowed_document_content_type(file.content_type):
        raise HTTPException(status_code=422, detail="Business registration document must be a PDF or an image")

    safe_document_name = Path(file.filename or "").name or "document"
    object_key = f"org/{org_id}/{uuid.uuid4()}-{safe_document_name}"
    upload_bytes(object_key, content, file.content_type or "application/octet-stream")

    check.status = KybCheckStatus.PASSED.value
    check.detail = object_key
    await db.commit()
    await db.refresh(check)
    return check
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `api/venv/Scripts/python.exe -m pytest tests/test_organizations_endpoints.py -v` from the `api` directory.
Expected: all tests in the file PASS.

- [ ] **Step 5: Run the full backend suite**

Run: `api/venv/Scripts/python.exe -m pytest -q` from the `api` directory.
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add api/app/routers/organizations.py api/tests/test_organizations_endpoints.py
git commit -m "Add an authenticated endpoint to upload the business registration document"
```

---

### Task 4: Frontend — simplify the signup form and auto-login into /kyc

**Files:**
- Modify: `web/src/api/types.ts`
- Modify: `web/src/api/auth.ts`
- Modify: `web/src/api/auth.test.ts`
- Modify: `web/src/components/SignupForm.tsx`
- Modify: `web/src/pages/BankSignupPage.tsx`
- Modify: `web/src/pages/OrganizationSignupPage.test.tsx` (full rewrite)
- Modify: `web/src/pages/BankSignupPage.test.tsx` (full rewrite)

**Interfaces:**
- Consumes: `SignupResponse` (Task 1) now has `access_token: string` and `token_type: string`; `AuthStore.setSession(token, user)` (existing, unchanged).
- Produces: `SignupForm` navigates to `/kyc` on success — Task 5 provides that route.

- [ ] **Step 1: In `web/src/api/types.ts`, add two fields to `SignupResponse`**

```typescript
export interface SignupResponse {
  organization: Organization;
  user: User;
  kyb_checks: KybCheck[];
  access_token: string;
  token_type: string;
}
```

- [ ] **Step 2: Replace `web/src/api/auth.ts` with the following**

```typescript
import { apiFetch } from './client';
import type {
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  LoginResponse,
  OrgType,
  ResetPasswordRequest,
  ResetPasswordResponse,
  SignupResponse,
  User,
  VerifyOtpRequest,
  VerifyOtpResponse,
} from './types';

export interface SignupPayload {
  orgName: string;
  orgType: OrgType;
  country: string;
  industry: string;
  taxId: string;
  adminName: string;
  adminEmail: string;
  password: string;
}

export function signup(payload: SignupPayload): Promise<SignupResponse> {
  return apiFetch<SignupResponse>('/auth/signup', {
    method: 'POST',
    body: {
      org_name: payload.orgName,
      org_type: payload.orgType,
      country: payload.country,
      industry: payload.industry,
      tax_id: payload.taxId,
      admin_name: payload.adminName,
      admin_email: payload.adminEmail,
      password: payload.password,
    },
  });
}

export function login(payload: LoginRequest): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/auth/login', { method: 'POST', body: payload });
}

export function getMe(): Promise<User> {
  return apiFetch<User>('/auth/me');
}

export function forgotPassword(payload: ForgotPasswordRequest): Promise<ForgotPasswordResponse> {
  return apiFetch<ForgotPasswordResponse>('/auth/forgot-password', { method: 'POST', body: payload });
}

export function verifyOtp(payload: VerifyOtpRequest): Promise<VerifyOtpResponse> {
  return apiFetch<VerifyOtpResponse>('/auth/verify-otp', { method: 'POST', body: payload });
}

export function resetPassword(payload: ResetPasswordRequest): Promise<ResetPasswordResponse> {
  return apiFetch<ResetPasswordResponse>('/auth/reset-password', { method: 'POST', body: payload });
}
```

- [ ] **Step 3: Replace `web/src/api/auth.test.ts`'s first test (current lines 14-37) with**

```typescript
  it('signup posts to /auth/signup and returns the parsed response', async () => {
    const responseBody = {
      organization: { id: '1', name: 'Org', org_type: 'EXPORTER', country: 'IN', industry: 'Pharma', tax_id: 'TAX', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
      user: { id: '2', org_id: '1', name: 'User', email: 'user@example.com', role: 'EXPORTER_ADMIN', status: 'ACTIVE' },
      kyb_checks: [],
      access_token: 'tok',
      token_type: 'bearer',
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(JSON.stringify(responseBody), { status: 201 }));

    const result = await signup({
      orgName: 'Org',
      orgType: 'EXPORTER',
      country: 'IN',
      industry: 'Pharma',
      taxId: 'TAX',
      adminName: 'User',
      adminEmail: 'user@example.com',
      password: 'secret',
    });

    expect(result).toEqual(responseBody);
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/auth/signup');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      org_name: 'Org',
      org_type: 'EXPORTER',
      country: 'IN',
      industry: 'Pharma',
      tax_id: 'TAX',
      admin_name: 'User',
      admin_email: 'user@example.com',
      password: 'secret',
    });
  });
```

The `login` and `getMe` tests below it (current lines 39-63) are unchanged.

- [ ] **Step 4: Replace `web/src/components/SignupForm.tsx` with the following**

```tsx
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { signup } from '../api/auth';
import type { OrgType } from '../api/types';
import { useAuthStore } from '../stores/AuthContext';

const COUNTRY_OPTIONS = ['India', 'Japan'];

export const TRADE_INDUSTRY_OPTIONS = [
  'Pharmaceuticals',
  'Textiles & Apparel',
  'Electronics & Electrical Equipment',
  'Automotive & Auto Components',
  'Chemicals & Petrochemicals',
  'Agriculture & Food Products',
  'Machinery & Industrial Equipment',
  'Steel & Metals',
  'Oil & Gas / Energy',
];

export interface SignupFormProps {
  heading: string;
  subheading: string;
  orgTypeOptions: Array<{ value: OrgType; label: string }>;
  orgNameLabel?: string;
  errorMessage?: string;
  industryOptions?: string[];
}

export function SignupForm({
  heading,
  subheading,
  orgTypeOptions,
  orgNameLabel = 'Organization name',
  errorMessage = 'Could not create your organization. Please check your details and try again.',
  industryOptions,
}: SignupFormProps) {
  const auth = useAuthStore();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    orgName: '',
    orgType: orgTypeOptions[0].value,
    country: COUNTRY_OPTIONS[0],
    industry: industryOptions?.[0] ?? '',
    taxId: '',
    adminName: '',
    adminEmail: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const response = await signup({
        orgName: form.orgName,
        orgType: form.orgType,
        country: form.country,
        industry: form.industry,
        taxId: form.taxId,
        adminName: form.adminName,
        adminEmail: form.adminEmail,
        password: form.password,
      });
      auth.setSession(response.access_token, response.user);
      navigate('/kyc');
    } catch {
      setError(errorMessage);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-paper py-10">
      <div className="w-full max-w-lg bg-paper-2 border border-line p-8">
        <h2 className="font-serif text-xl mb-1">{heading}</h2>
        <p className="text-ink-soft text-sm mb-4">{subheading}</p>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label htmlFor="orgName" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              {orgNameLabel}
            </label>
            <input
              id="orgName"
              value={form.orgName}
              onChange={(e) => setForm({ ...form, orgName: e.target.value })}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            />
          </div>
          {orgTypeOptions.length > 1 && (
            <div>
              <label htmlFor="orgType" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
                Organization type
              </label>
              <select
                id="orgType"
                value={form.orgType}
                onChange={(e) => setForm({ ...form, orgType: e.target.value as OrgType })}
                className="w-full px-3 py-2.5 border border-line-strong rounded"
              >
                {orgTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="country" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Country
            </label>
            <select
              id="country"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
            >
              {COUNTRY_OPTIONS.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="industry" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Industry
            </label>
            {industryOptions ? (
              <select
                id="industry"
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                className="w-full px-3 py-2.5 border border-line-strong rounded"
              >
                {industryOptions.map((industry) => (
                  <option key={industry} value={industry}>
                    {industry}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="industry"
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                className="w-full px-3 py-2.5 border border-line-strong rounded"
                required
              />
            )}
          </div>
          <div>
            <label htmlFor="taxId" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Tax / business ID
            </label>
            <input
              id="taxId"
              value={form.taxId}
              onChange={(e) => setForm({ ...form, taxId: e.target.value })}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            />
          </div>
          <div className="col-span-2">
            <label htmlFor="adminName" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Admin name
            </label>
            <input
              id="adminName"
              value={form.adminName}
              onChange={(e) => setForm({ ...form, adminName: e.target.value })}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="adminEmail" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Admin email
            </label>
            <input
              id="adminEmail"
              type="email"
              value={form.adminEmail}
              onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            />
          </div>
          {error && <p className="col-span-2 text-block text-sm">{error}</p>}
          <button type="submit" className="col-span-2 bg-seal text-white rounded py-2.5 font-semibold hover:bg-seal-dark">
            Continue
          </button>
        </form>
        <p className="text-center text-sm text-ink-soft mt-5 pt-4 border-t border-line">
          Already have an account?{' '}
          <Link to="/login" className="text-seal font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
```

Note this drops the `successHeading` prop and the entire `step`/`result`/"verify" screen — the `/kyc` page (Task 5) now shows that information instead.

- [ ] **Step 5: In `web/src/pages/BankSignupPage.tsx`, drop the now-removed `successHeading` prop**

```tsx
import { SignupForm } from '../components/SignupForm';

export function BankSignupPage() {
  return (
    <SignupForm
      heading="Register your bank"
      subheading="For banks and financiers joining as a participant institution."
      orgTypeOptions={[{ value: 'BANK', label: 'Bank' }]}
      orgNameLabel="Institution name"
      errorMessage="Could not register your institution. Please check your details and try again."
    />
  );
}
```

`web/src/pages/OrganizationSignupPage.tsx` passes no `successHeading` today, so it needs no change.

- [ ] **Step 6: Replace `web/src/pages/OrganizationSignupPage.test.tsx` with the following**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as authApi from '../api/auth';
import { AuthContext } from '../stores/AuthContext';
import { AuthStore } from '../stores/AuthStore';
import { OrganizationSignupPage } from './OrganizationSignupPage';

function renderPage(store: AuthStore) {
  return render(
    <AuthContext.Provider value={store}>
      <MemoryRouter initialEntries={['/signup/organization']}>
        <Routes>
          <Route path="/signup/organization" element={<OrganizationSignupPage />} />
          <Route path="/kyc" element={<div>KYC page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('OrganizationSignupPage', () => {
  it('submits the account step, logs the user in, and redirects to /kyc', async () => {
    const store = new AuthStore();
    store.isHydrating = false;
    const signupSpy = vi.spyOn(authApi, 'signup').mockResolvedValue({
      organization: { id: '1', name: 'MedCure Pharma Exports', org_type: 'EXPORTER', country: 'India', industry: 'Pharmaceuticals', tax_id: 'TAX-1', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
      user: { id: '2', org_id: '1', name: 'Priya Shah', email: 'priya@example.com', role: 'EXPORTER_ADMIN', status: 'ACTIVE' },
      kyb_checks: [
        { id: 'k-1', org_id: '1', check_type: 'BUSINESS_REGISTRATION', status: 'PENDING', detail: null, checked_at: '2026-01-01T00:00:00Z' },
        { id: 'k-2', org_id: '1', check_type: 'SANCTIONS_SCREENING', status: 'PASSED', detail: 'fake:CLEAR', checked_at: '2026-01-01T00:00:00Z' },
        { id: 'k-3', org_id: '1', check_type: 'BANK_ACCOUNT', status: 'PASSED', detail: null, checked_at: '2026-01-01T00:00:00Z' },
      ],
      access_token: 'new-token',
      token_type: 'bearer',
    });

    renderPage(store);

    await userEvent.type(screen.getByLabelText(/organization name/i), 'MedCure Pharma Exports');
    await userEvent.selectOptions(screen.getByLabelText(/country/i), 'India');
    await userEvent.selectOptions(screen.getByLabelText(/industry/i), 'Pharmaceuticals');
    await userEvent.type(screen.getByLabelText(/tax/i), 'TAX-1');
    await userEvent.type(screen.getByLabelText(/admin name/i), 'Priya Shah');
    await userEvent.type(screen.getByLabelText(/admin email/i), 'priya@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'a good password');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByText('KYC page')).toBeInTheDocument();
    expect(signupSpy).toHaveBeenCalledWith(
      expect.objectContaining({ orgType: 'EXPORTER', taxId: 'TAX-1', adminEmail: 'priya@example.com' }),
    );
    expect(store.token).toBe('new-token');
    expect(store.user?.email).toBe('priya@example.com');
  });

  it('offers Exporter, Importer, and Both as organization types', () => {
    renderPage(new AuthStore());

    const select = screen.getByLabelText(/organization type/i) as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionValues).toEqual(['EXPORTER', 'BUYER', 'BOTH']);
    expect(optionLabels).toEqual(['Exporter', 'Importer', 'Both']);
  });

  it('offers India and Japan as country options', () => {
    renderPage(new AuthStore());

    const select = screen.getByLabelText(/country/i) as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).toEqual(['India', 'Japan']);
  });

  it('offers the nine trade industries as industry options', () => {
    renderPage(new AuthStore());

    const select = screen.getByLabelText(/industry/i) as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).toEqual([
      'Pharmaceuticals',
      'Textiles & Apparel',
      'Electronics & Electrical Equipment',
      'Automotive & Auto Components',
      'Chemicals & Petrochemicals',
      'Agriculture & Food Products',
      'Machinery & Industrial Equipment',
      'Steel & Metals',
      'Oil & Gas / Energy',
    ]);
  });

  it('links to the login page from the account step', () => {
    renderPage(new AuthStore());

    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  });
});
```

- [ ] **Step 7: Replace `web/src/pages/BankSignupPage.test.tsx` with the following**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as authApi from '../api/auth';
import { AuthContext } from '../stores/AuthContext';
import { AuthStore } from '../stores/AuthStore';
import { BankSignupPage } from './BankSignupPage';

function renderPage(store: AuthStore) {
  return render(
    <AuthContext.Provider value={store}>
      <MemoryRouter initialEntries={['/signup/banking']}>
        <Routes>
          <Route path="/signup/banking" element={<BankSignupPage />} />
          <Route path="/kyc" element={<div>KYC page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('BankSignupPage', () => {
  it('submits the account step with org_type fixed to BANK, logs the user in, and redirects to /kyc', async () => {
    const store = new AuthStore();
    store.isHydrating = false;
    const signupSpy = vi.spyOn(authApi, 'signup').mockResolvedValue({
      organization: { id: '1', name: 'Canara Bank', org_type: 'BANK', country: 'India', industry: 'Banking', tax_id: 'TAX-2', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
      user: { id: '2', org_id: '1', name: 'Rahul Mehta', email: 'rahul@example.com', role: 'BANK_REVIEWER', status: 'ACTIVE' },
      kyb_checks: [
        { id: 'k-1', org_id: '1', check_type: 'BUSINESS_REGISTRATION', status: 'PENDING', detail: null, checked_at: '2026-01-01T00:00:00Z' },
        { id: 'k-2', org_id: '1', check_type: 'SANCTIONS_SCREENING', status: 'PASSED', detail: 'fake:CLEAR', checked_at: '2026-01-01T00:00:00Z' },
        { id: 'k-3', org_id: '1', check_type: 'BANK_ACCOUNT', status: 'PASSED', detail: null, checked_at: '2026-01-01T00:00:00Z' },
      ],
      access_token: 'bank-token',
      token_type: 'bearer',
    });

    renderPage(store);

    expect(screen.queryByLabelText(/organization type/i)).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/institution name/i), 'Canara Bank');
    await userEvent.selectOptions(screen.getByLabelText(/country/i), 'India');
    await userEvent.type(screen.getByLabelText(/industry/i), 'Banking');
    await userEvent.type(screen.getByLabelText(/tax/i), 'TAX-2');
    await userEvent.type(screen.getByLabelText(/admin name/i), 'Rahul Mehta');
    await userEvent.type(screen.getByLabelText(/admin email/i), 'rahul@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'a good password');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByText('KYC page')).toBeInTheDocument();
    expect(signupSpy).toHaveBeenCalledWith(expect.objectContaining({ orgType: 'BANK', taxId: 'TAX-2', adminEmail: 'rahul@example.com' }));
    expect(store.token).toBe('bank-token');
  });
});
```

- [ ] **Step 8: Run the frontend suite**

Run: `npx vitest run` from the `web` directory.
Expected: all tests pass (note: `KYC page` in the test above is a placeholder route element, not the real `KycPage` — Task 5 adds that; this task's tests only need the placeholder to prove the redirect happened).

- [ ] **Step 9: Commit**

```bash
git add web/src/api/types.ts web/src/api/auth.ts web/src/api/auth.test.ts web/src/components/SignupForm.tsx web/src/pages/BankSignupPage.tsx web/src/pages/OrganizationSignupPage.test.tsx web/src/pages/BankSignupPage.test.tsx
git commit -m "Simplify signup to auto-login and redirect to /kyc, drop the document upload"
```

---

### Task 5: Frontend — the /kyc page

**Files:**
- Modify: `web/src/api/organizations.ts`
- Create: `web/src/pages/KycPage.tsx`
- Create: `web/src/pages/KycPage.test.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/AppShell.tsx`

**Interfaces:**
- Consumes: `getOrganization`, `listOrganizationKybChecks` (existing, from `web/src/api/organizations.ts`); `POST /organizations/{org_id}/kyb-checks/business-registration-document` (Task 3).
- Produces: `uploadBusinessRegistrationDocument(orgId: string, file: File): Promise<KybCheck>`; the `/kyc` route.

- [ ] **Step 1: In `web/src/api/organizations.ts`, add the upload function**

```typescript
import { apiFetch } from './client';
import type { KybCheck, Organization } from './types';

export function getOrganization(id: string): Promise<Organization> {
  return apiFetch<Organization>(`/organizations/${id}`);
}

export function listOrganizations(search?: string): Promise<Organization[]> {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return apiFetch<Organization[]>(`/organizations${query}`);
}

export function listOrganizationKybChecks(id: string): Promise<KybCheck[]> {
  return apiFetch<KybCheck[]>(`/organizations/${id}/kyb-checks`);
}

export function uploadBusinessRegistrationDocument(orgId: string, file: File): Promise<KybCheck> {
  const formData = new FormData();
  formData.append('file', file);
  return apiFetch<KybCheck>(`/organizations/${orgId}/kyb-checks/business-registration-document`, {
    method: 'POST',
    body: formData,
    isFormData: true,
  });
}
```

- [ ] **Step 2: Write the failing test — create `web/src/pages/KycPage.test.tsx`**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as organizationsApi from '../api/organizations';
import type { KybCheck, Organization } from '../api/types';
import { AuthContext } from '../stores/AuthContext';
import { AuthStore } from '../stores/AuthStore';
import { KycPage } from './KycPage';

const org: Organization = {
  id: 'o-1',
  name: 'Indus Exports Pvt. Ltd.',
  org_type: 'EXPORTER',
  country: 'India',
  industry: 'Pharmaceuticals',
  tax_id: 'TAX-1',
  kyb_status: 'CLEAR',
  created_at: '2026-01-01T00:00:00Z',
};

const pendingChecks: KybCheck[] = [
  { id: 'k-1', org_id: 'o-1', check_type: 'BUSINESS_REGISTRATION', status: 'PENDING', detail: null, checked_at: '2026-01-01T00:00:00Z' },
  { id: 'k-2', org_id: 'o-1', check_type: 'SANCTIONS_SCREENING', status: 'PASSED', detail: 'fake:CLEAR', checked_at: '2026-01-01T00:00:00Z' },
  { id: 'k-3', org_id: 'o-1', check_type: 'BANK_ACCOUNT', status: 'PASSED', detail: null, checked_at: '2026-01-01T00:00:00Z' },
];

const passedChecks: KybCheck[] = [
  { ...pendingChecks[0], status: 'PASSED', detail: 'org/o-1/abc-certificate.pdf' },
  pendingChecks[1],
  pendingChecks[2],
];

function renderPage() {
  const store = new AuthStore();
  store.isHydrating = false;
  store.setSession('tok', { id: 'u-1', org_id: 'o-1', name: 'Priya Shah', email: 'priya@example.com', role: 'EXPORTER_ADMIN', status: 'ACTIVE' });

  return render(
    <AuthContext.Provider value={store}>
      <MemoryRouter>
        <KycPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('KycPage', () => {
  it('shows the KYB verification breakdown', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(pendingChecks);

    renderPage();

    expect(await screen.findByText('Clear')).toBeInTheDocument();
    expect(screen.getByText('BUSINESS_REGISTRATION')).toBeInTheDocument();
    expect(screen.getByText('SANCTIONS_SCREENING')).toBeInTheDocument();
    expect(screen.getByText('BANK_ACCOUNT')).toBeInTheDocument();
  });

  it('shows the upload form when BUSINESS_REGISTRATION is pending', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(pendingChecks);

    renderPage();

    expect(await screen.findByText('Upload business registration certificate')).toBeInTheDocument();
  });

  it('hides the upload form once BUSINESS_REGISTRATION is passed', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(passedChecks);

    renderPage();

    await screen.findByText('BUSINESS_REGISTRATION');
    expect(screen.queryByText('Upload business registration certificate')).not.toBeInTheDocument();
  });

  it('uploads the document and refreshes the checks', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    const listSpy = vi
      .spyOn(organizationsApi, 'listOrganizationKybChecks')
      .mockResolvedValueOnce(pendingChecks)
      .mockResolvedValueOnce(passedChecks);
    const uploadSpy = vi.spyOn(organizationsApi, 'uploadBusinessRegistrationDocument').mockResolvedValue(passedChecks[0]);

    renderPage();

    await screen.findByText('Upload business registration certificate');
    await userEvent.upload(
      screen.getByLabelText(/business registration certificate/i),
      new File(['certificate bytes'], 'certificate.pdf', { type: 'application/pdf' }),
    );
    await userEvent.click(screen.getByRole('button', { name: /upload certificate/i }));

    await waitFor(() => expect(uploadSpy).toHaveBeenCalledWith('o-1', expect.any(File)));
    expect(listSpy).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByText('Upload business registration certificate')).not.toBeInTheDocument());
  });

  it('requires a file before submitting the upload form', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(pendingChecks);
    const uploadSpy = vi.spyOn(organizationsApi, 'uploadBusinessRegistrationDocument');

    renderPage();

    await screen.findByText('Upload business registration certificate');
    await userEvent.click(screen.getByRole('button', { name: /upload certificate/i }));

    expect(await screen.findByText(/please choose a file/i)).toBeInTheDocument();
    expect(uploadSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to see it fail**

Run: `npx vitest run src/pages/KycPage.test.tsx` from the `web` directory.
Expected: FAIL — `KycPage` doesn't exist yet.

- [ ] **Step 4: Create `web/src/pages/KycPage.tsx`**

```tsx
import { observer } from 'mobx-react-lite';
import { useEffect, useState, type FormEvent } from 'react';

import { getOrganization, listOrganizationKybChecks, uploadBusinessRegistrationDocument } from '../api/organizations';
import type { KybCheck, Organization } from '../api/types';
import { kybCheckStatusInfo, kybStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';
import { useAuthStore } from '../stores/AuthContext';

export const KycPage = observer(function KycPage() {
  const auth = useAuthStore();
  const user = auth.user!;

  const [org, setOrg] = useState<Organization | null>(null);
  const [kybChecks, setKybChecks] = useState<KybCheck[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function load() {
    setLoadError(null);
    try {
      const [fetchedOrg, fetchedKybChecks] = await Promise.all([
        getOrganization(user.org_id),
        listOrganizationKybChecks(user.org_id),
      ]);
      setOrg(fetchedOrg);
      setKybChecks(fetchedKybChecks);
    } catch {
      setLoadError("Couldn't load your verification status. Please try again.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.org_id]);

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    setUploadError(null);
    if (!file) {
      setUploadError('Please choose a file to upload.');
      return;
    }
    setUploading(true);
    try {
      await uploadBusinessRegistrationDocument(user.org_id, file);
      setFile(null);
      await load();
    } catch {
      setUploadError('Could not upload the document. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  const businessRegistrationCheck = kybChecks.find((check) => check.check_type === 'BUSINESS_REGISTRATION');
  const needsDocument = businessRegistrationCheck?.status === 'PENDING';

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">KYC verification</h1>

      {loadError && <p className="text-block text-sm max-w-md">{loadError}</p>}

      {org && (
        <Panel title="KYB verification" noPadding className="max-w-md">
          <div className="flex items-center justify-between px-6 py-3.5 border-b border-line">
            <span className="text-sm text-ink-soft">Overall status</span>
            <Badge tone={kybStatusInfo(org.kyb_status).tone}>{kybStatusInfo(org.kyb_status).label}</Badge>
          </div>
          <div className="divide-y divide-line">
            {kybChecks.map((check) => {
              const checkStatus = kybCheckStatusInfo(check.status);
              return (
                <div key={check.id} className="flex items-center justify-between px-6 py-3.5">
                  <span className="text-sm">{check.check_type}</span>
                  <Badge tone={checkStatus.tone}>{checkStatus.label}</Badge>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {needsDocument && (
        <Panel title="Upload business registration certificate" className="max-w-md">
          <form onSubmit={handleUpload} className="flex flex-col gap-3">
            <div>
              <label htmlFor="businessRegistrationDocument" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
                Business registration certificate
              </label>
              <input
                id="businessRegistrationDocument"
                type="file"
                accept="image/*,application/pdf"
                aria-required="true"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full px-3 py-2.5 border border-line-strong rounded"
              />
            </div>
            {uploadError && <p className="text-block text-sm">{uploadError}</p>}
            <button
              type="submit"
              disabled={uploading}
              className="bg-seal text-white rounded py-2.5 font-semibold hover:bg-seal-dark disabled:opacity-60"
            >
              {uploading ? 'Uploading…' : 'Upload certificate'}
            </button>
          </form>
        </Panel>
      )}
    </div>
  );
});
```

- [ ] **Step 5: Wire up the route — in `web/src/App.tsx`, add the import and route**

Add the import alongside the other page imports (alphabetically, after `KybCheck`-unrelated imports — place it after `ForgotPasswordPage` and before `LoginPage`):

```tsx
import { KycPage } from './pages/KycPage';
```

Add the route inside the `AppShell` block, after `/profile`:

```tsx
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/kyc" element={<KycPage />} />
```

- [ ] **Step 6: Add a breadcrumb entry — in `web/src/components/AppShell.tsx`, add to the `BREADCRUMBS` array right after the `/profile` entry**

```tsx
  { test: (p) => p === '/profile', section: 'Account', title: 'Profile' },
  { test: (p) => p === '/kyc', section: 'Account', title: 'Verification' },
```

No sidebar link is added — this route is reachable only via the post-signup redirect (Task 4) or the Profile page link (Task 6).

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/pages/KycPage.test.tsx` from the `web` directory.
Expected: all tests PASS.

- [ ] **Step 8: Run the full frontend suite**

Run: `npx vitest run` from the `web` directory.
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add web/src/api/organizations.ts web/src/pages/KycPage.tsx web/src/pages/KycPage.test.tsx web/src/App.tsx web/src/components/AppShell.tsx
git commit -m "Add the /kyc page for uploading the business registration document"
```

---

### Task 6: Frontend — Profile page links to /kyc when pending

**Files:**
- Modify: `web/src/pages/ProfilePage.tsx`
- Modify: `web/src/pages/ProfilePage.test.tsx`

**Interfaces:**
- Consumes: `/kyc` route (Task 5).

- [ ] **Step 1: Write the failing tests — in `web/src/pages/ProfilePage.test.tsx`, add a `pendingKybChecks` fixture and two tests**

Add this fixture near the existing `kybChecks` fixture (after it):

```tsx
const pendingKybChecks: KybCheck[] = [
  { id: 'k-1', org_id: 'o-1', check_type: 'BUSINESS_REGISTRATION', status: 'PENDING', detail: null, checked_at: '2026-01-01T00:00:00Z' },
  { id: 'k-2', org_id: 'o-1', check_type: 'SANCTIONS_SCREENING', status: 'PASSED', detail: 'fake:CLEAR', checked_at: '2026-01-01T00:00:00Z' },
  { id: 'k-3', org_id: 'o-1', check_type: 'BANK_ACCOUNT', status: 'PASSED', detail: null, checked_at: '2026-01-01T00:00:00Z' },
];
```

Add these two tests inside the `describe('ProfilePage', ...)` block, after the `"shows the user's organization details and KYB verification status"` test:

```tsx
  it('shows an upload link to /kyc when BUSINESS_REGISTRATION is pending', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(pendingKybChecks);

    renderPage();

    const link = await screen.findByRole('link', { name: /upload business registration certificate/i });
    expect(link).toHaveAttribute('href', '/kyc');
  });

  it('does not show an upload link once BUSINESS_REGISTRATION is passed', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(kybChecks);

    renderPage();

    await screen.findByText('BUSINESS_REGISTRATION');
    expect(screen.queryByRole('link', { name: /upload business registration certificate/i })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/pages/ProfilePage.test.tsx` from the `web` directory.
Expected: FAIL — no such link exists yet.

- [ ] **Step 3: In `web/src/pages/ProfilePage.tsx`, add the `Link` import**

```tsx
import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { getOrganization, listOrganizationKybChecks } from '../api/organizations';
import type { KybCheck, Organization } from '../api/types';
import { roleLabel } from '../lib/roles';
import { kybCheckStatusInfo, kybStatusInfo, userStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';
import { useAuthStore } from '../stores/AuthContext';
```

- [ ] **Step 4: In the same file, add the conditional CTA inside the "KYB verification" `Panel`**

Replace the KYB verification panel block (the `{org && (<Panel title="KYB verification" ...>...</Panel>)}` at the end of the file) with:

```tsx
      {org && (
        <Panel title="KYB verification" noPadding className="max-w-md">
          <div className="flex items-center justify-between px-6 py-3.5 border-b border-line">
            <span className="text-sm text-ink-soft">Overall status</span>
            <Badge tone={kybStatusInfo(org.kyb_status).tone}>{kybStatusInfo(org.kyb_status).label}</Badge>
          </div>
          <div className="divide-y divide-line">
            {kybChecks.map((check) => {
              const checkStatus = kybCheckStatusInfo(check.status);
              return (
                <div key={check.id} className="flex items-center justify-between px-6 py-3.5">
                  <span className="text-sm">{check.check_type}</span>
                  <Badge tone={checkStatus.tone}>{checkStatus.label}</Badge>
                </div>
              );
            })}
          </div>
          {kybChecks.some((check) => check.check_type === 'BUSINESS_REGISTRATION' && check.status === 'PENDING') && (
            <div className="px-6 py-3.5 border-t border-line">
              <Link to="/kyc" className="text-seal text-sm font-semibold hover:underline">
                Upload business registration certificate
              </Link>
            </div>
          )}
        </Panel>
      )}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/pages/ProfilePage.test.tsx` from the `web` directory.
Expected: all tests PASS.

- [ ] **Step 6: Run the full frontend suite**

Run: `npx vitest run` from the `web` directory.
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/ProfilePage.tsx web/src/pages/ProfilePage.test.tsx
git commit -m "Link to /kyc from the Profile page when business registration is pending"
```
