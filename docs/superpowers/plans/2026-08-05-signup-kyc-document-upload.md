# Signup KYC Document Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require a real, uploaded business-registration document during signup instead of the current placeholder — the `BUSINESS_REGISTRATION` KYB check currently always auto-passes with no file ever asked for or stored; this makes the upload itself real and mandatory while leaving the check's auto-pass outcome unchanged (per user's explicit choice — no real registry verification exists yet).

**Architecture:** `POST /auth/signup` changes from a pure-JSON body to a multipart request (mirroring the existing `POST /trades/{id}/documents` pattern exactly — same `Form(...)`/`File(...)` style, same `upload_bytes` MinIO helper, same bucket). The uploaded file is stored under a new `org/{org_id}/...` key once the organization exists, and that key is written into the `BUSINESS_REGISTRATION` `KybCheck` row's existing `detail` column (currently always `null`) — no schema migration needed. `SANCTIONS_SCREENING` and `BANK_ACCOUNT` are untouched. Because the request shape changes, every test helper across the backend suite that currently POSTs JSON to `/auth/signup` must switch to multipart too — this plan's Task 2 is that mechanical sweep.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 async (backend); React + TypeScript + Vite + Vitest (frontend).

## Global Constraints

- Only `BUSINESS_REGISTRATION` requires an uploaded document. `SANCTIONS_SCREENING` (automated lookup) and `BANK_ACCOUNT` (no document decided) are unchanged.
- The check's status logic is unchanged: uploading still results in `PASSED` immediately — no real verification exists yet, and none is being added by this plan (confirmed explicitly with the user).
- No document viewer or download link anywhere — not requested, and nothing in the app has one for any document type today. This plan stores the reference and nothing more.
- Reuse existing infrastructure exactly: the same MinIO bucket (`settings.minio_bucket`), the same `upload_bytes` helper (`api/app/storage.py`), the same `Form(...)`/`File(...)` multipart pattern already used by `POST /trades/{id}/documents` (`api/app/routers/documents.py`).
- No new database column or migration — the object key is stored in `KybCheck.detail`, an existing nullable string column that was previously always `null` for `BUSINESS_REGISTRATION`.

---

### Task 1: Backend — multipart signup endpoint storing the business registration document

**Files:**
- Modify: `api/app/schemas/auth.py`
- Modify: `api/app/routers/auth.py`
- Modify: `api/tests/test_auth_signup.py`

**Interfaces:**
- Produces: `POST /auth/signup` as a multipart endpoint accepting form fields `org_name`, `org_type`, `country`, `industry`, `tax_id`, `admin_name`, `admin_email`, `password` plus a required file field `business_registration_document`. Response shape (`SignupResponse`) is unchanged. Task 2's test helpers and Task 3's frontend both call this exact multipart shape.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `api/tests/test_auth_signup.py`:

```python
from sqlalchemy import select

from app.models.kyb_check import KybCheck
from app.models.organization import Organization
from app.models.user import User
from app.storage import get_bytes

SIGNUP_FORM_DATA = {
    "org_name": "MedCure Pharma Exports Pvt. Ltd.",
    "org_type": "EXPORTER",
    "country": "India",
    "industry": "Pharmaceuticals",
    "tax_id": "27AAECM1234B1Z5",
    "admin_name": "Priya Shah",
    "admin_email": "priya@medcurepharma.example",
    "password": "correct horse battery staple",
}
SIGNUP_FILES = {"business_registration_document": ("certificate.pdf", b"fake certificate bytes", "application/pdf")}


async def test_signup_creates_org_user_and_kyb_checks(async_client):
    response = await async_client.post("/auth/signup", data=SIGNUP_FORM_DATA, files=SIGNUP_FILES)

    assert response.status_code == 201
    body = response.json()
    assert body["organization"]["name"] == "MedCure Pharma Exports Pvt. Ltd."
    assert body["organization"]["kyb_status"] == "CLEAR"
    assert body["user"]["email"] == "priya@medcurepharma.example"
    assert body["user"]["role"] == "EXPORTER_ADMIN"
    assert len(body["kyb_checks"]) == 3
    by_type = {c["check_type"]: c for c in body["kyb_checks"]}
    assert by_type["BUSINESS_REGISTRATION"]["status"] == "PASSED"
    assert by_type["BUSINESS_REGISTRATION"]["detail"] is not None
    assert by_type["SANCTIONS_SCREENING"]["status"] == "PASSED"
    assert by_type["SANCTIONS_SCREENING"]["detail"] is not None
    assert by_type["BANK_ACCOUNT"]["status"] == "PASSED"


async def test_signup_stores_the_business_registration_document(async_client):
    response = await async_client.post(
        "/auth/signup",
        data={**SIGNUP_FORM_DATA, "admin_email": "storage-check@medcurepharma.example"},
        files=SIGNUP_FILES,
    )
    org_id = response.json()["organization"]["id"]
    by_type = {c["check_type"]: c for c in response.json()["kyb_checks"]}

    object_key = by_type["BUSINESS_REGISTRATION"]["detail"]
    assert object_key.startswith(f"org/{org_id}/")
    assert object_key.endswith("-certificate.pdf")
    assert get_bytes(object_key) == b"fake certificate bytes"


async def test_signup_rejects_missing_business_registration_document(async_client):
    response = await async_client.post(
        "/auth/signup",
        data={**SIGNUP_FORM_DATA, "admin_email": "no-doc@medcurepharma.example"},
    )

    assert response.status_code == 422


async def test_signup_creates_three_kyb_check_rows(async_client, db_session):
    response = await async_client.post(
        "/auth/signup",
        data={
            **SIGNUP_FORM_DATA,
            "org_name": "Kyoto Textile Trading Co.",
            "industry": "Textiles",
            "tax_id": "29AABCT1111C1Z2",
            "admin_name": "Arjun Nair",
            "admin_email": "arjun@kyototextile.example",
            "password": "another secret",
        },
        files=SIGNUP_FILES,
    )
    org_id = response.json()["organization"]["id"]

    rows = (await db_session.execute(select(KybCheck).where(KybCheck.org_id == org_id))).scalars().all()
    assert len(rows) == 3
    by_type = {r.check_type: r for r in rows}
    assert by_type["SANCTIONS_SCREENING"].status == "PASSED"
    assert by_type["SANCTIONS_SCREENING"].detail is not None
    assert by_type["BUSINESS_REGISTRATION"].status == "PASSED"
    assert by_type["BANK_ACCOUNT"].status == "PASSED"


async def test_signup_with_both_org_type_creates_exporter_admin(async_client):
    response = await async_client.post(
        "/auth/signup",
        data={
            **SIGNUP_FORM_DATA,
            "org_name": "Sample Global Exports Pvt. Ltd.",
            "org_type": "BOTH",
            "tax_id": "AASCS1234F",
            "admin_name": "Rohan Mehta",
            "admin_email": "exports@sampleglobal.in",
        },
        files=SIGNUP_FILES,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["organization"]["org_type"] == "BOTH"
    assert body["user"]["role"] == "EXPORTER_ADMIN"


async def test_signup_rejects_duplicate_email(async_client):
    await async_client.post(
        "/auth/signup",
        data={**SIGNUP_FORM_DATA, "org_name": "Org A", "tax_id": "TAX-A", "admin_name": "User A", "admin_email": "dupe@example.com", "password": "password one"},
        files=SIGNUP_FILES,
    )

    response = await async_client.post(
        "/auth/signup",
        data={**SIGNUP_FORM_DATA, "org_name": "Org B", "tax_id": "TAX-B", "admin_name": "User B", "admin_email": "dupe@example.com", "password": "password two"},
        files=SIGNUP_FILES,
    )
    assert response.status_code == 409
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && venv/Scripts/python.exe -m pytest tests/test_auth_signup.py -v`
Expected: FAIL — the endpoint still expects a JSON body (`data=`/`files=` sent as multipart will 422 against the current `payload: SignupRequest` JSON-body parameter).

- [ ] **Step 3: Remove the now-obsolete JSON request schemas**

In `api/app/schemas/auth.py`, remove the `SignupOrganization`, `SignupAdminUser`, and `SignupRequest` classes entirely (they're only used by the `/auth/signup` endpoint, which no longer takes a JSON body). Leave `SignupResponse` and everything else in the file unchanged. The top of the file should read:

```python
from pydantic import BaseModel, EmailStr, Field

from app.schemas.kyb_check import KybCheckOut
from app.schemas.organization import OrganizationOut
from app.schemas.user import UserOut


class SignupResponse(BaseModel):
    organization: OrganizationOut
    user: UserOut
    kyb_checks: list[KybCheckOut]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
```

(Everything below `LoginRequest` in the file — `LoginResponse`, `ForgotPasswordRequest`, etc. — is unrelated and stays exactly as-is; only the three classes above `LoginRequest`, plus the now-unused `from app.models.enums import OrgType` import, are removed — `OrgType` was only ever referenced by `SignupOrganization.org_type`.)

- [ ] **Step 4: Rewrite the signup endpoint as multipart**

In `api/app/routers/auth.py`, change the imports: add `File`, `Form`, `UploadFile` to the existing `from fastapi import ...` line, add a new `from pydantic import EmailStr` line, add `OrgType` to the existing `from app.models.enums import ...` line, add `from app.storage import upload_bytes`, and remove `SignupRequest` from the `from app.schemas.auth import (...)` block. The full import block becomes:

```python
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import EmailStr
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
from app.models.enums import KybCheckStatus, KybCheckType, OrgType, UserRole, UserStatus
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
    SignupResponse,
    VerifyOtpRequest,
    VerifyOtpResponse,
)
from app.schemas.user import UserOut
from app.storage import upload_bytes
```

Then replace the full `signup` endpoint function:

```python
@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    org_name: str = Form(...),
    org_type: OrgType = Form(...),
    country: str = Form(...),
    industry: str = Form(...),
    tax_id: str = Form(...),
    admin_name: str = Form(...),
    admin_email: EmailStr = Form(...),
    password: str = Form(...),
    business_registration_document: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    sanctions_client: SanctionsClient = Depends(get_sanctions_client),
) -> SignupResponse:
    existing = await db.execute(select(User).where(User.email == admin_email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    org = Organization(
        name=org_name,
        org_type=org_type.value,
        country=country,
        industry=industry,
        tax_id=tax_id,
    )
    db.add(org)
    await db.flush()

    document_content = await business_registration_document.read()
    object_key = f"org/{org.id}/{uuid.uuid4()}-{business_registration_document.filename}"
    upload_bytes(object_key, document_content, business_registration_document.content_type or "application/octet-stream")

    admin_role = ORG_TYPE_TO_ADMIN_ROLE[org_type.value]
    user = User(
        org_id=org.id,
        name=admin_name,
        email=admin_email,
        password_hash=hash_password(password),
        role=admin_role,
        status=UserStatus.ACTIVE.value,
    )
    db.add(user)

    sanctions_result = await sanctions_client.screen(name=org.name, country=org.country)
    org.kyb_status = sanctions_result["status"]
    kyb_checks = [
        KybCheck(
            org_id=org.id,
            check_type=KybCheckType.BUSINESS_REGISTRATION.value,
            status=KybCheckStatus.PASSED.value,
            detail=object_key,
        ),
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

    return SignupResponse(organization=org, user=user, kyb_checks=kyb_checks)
```

(This import block replaces everything from `from fastapi import ...` down to the end of the imports. The three lines above that — `import secrets`, `import uuid`, and `from datetime import datetime, timedelta, timezone` — are unrelated to this change (used by the forgot-password/OTP/reset-password endpoints elsewhere in this same file) and must stay exactly as they are at the very top of the file. `uuid.uuid4()` in the new `signup` function below relies on that existing `import uuid` line.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd api && venv/Scripts/python.exe -m pytest tests/test_auth_signup.py -v`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add api/app/schemas/auth.py api/app/routers/auth.py api/tests/test_auth_signup.py
git commit -m "Require a real business registration document upload during signup"
```

---

### Task 2: Backend — propagate the multipart signup change across the test suite

**Files:**
- Modify: `api/tests/test_auth_login.py`
- Modify: `api/tests/test_auth_password_reset.py`
- Modify: `api/tests/test_organizations_endpoints.py`
- Modify: `api/tests/test_users_endpoints.py`
- Modify: `api/tests/test_document_registry_endpoints.py`
- Modify: `api/tests/test_trades_endpoints.py`
- Modify: `api/tests/test_admin_endpoints.py`

**Interfaces:**
- Consumes: the multipart `/auth/signup` shape from Task 1 (`org_name`, `org_type`, `country`, `industry`, `tax_id`, `admin_name`, `admin_email`, `password` form fields + `business_registration_document` file field).
- Produces: nothing new — this task only updates existing local test helpers to match Task 1's new request shape. `test_bank_review_endpoints.py`, `test_sanctions_screening_endpoints.py`, and `test_documents_endpoints.py` need NO changes in this task — they only `import create_trade, signup_and_login` from `test_trades_endpoints.py` and never build the signup payload themselves, so fixing `test_trades_endpoints.py`'s `signup_and_login` fixes all three automatically.

This task is intentionally mechanical: every file below gets the exact same treatment — the JSON `payload`/`signup_payload` dict is replaced with a `data` dict (flat field names) plus a `files` dict, and the `async_client.post("/auth/signup", json=...)` call becomes `async_client.post("/auth/signup", data=..., files=...)`. No other line in any of these files changes.

- [ ] **Step 1: Run the full suite to confirm it currently fails**

Run: `cd api && venv/Scripts/python.exe -m pytest -q`
Expected: many failures across the files below — every one of their signup helpers still POSTs JSON, which now 422s against Task 1's multipart-only endpoint.

- [ ] **Step 2: Fix `test_auth_login.py`**

Replace lines 1-7 of `api/tests/test_auth_login.py`:

```python
async def _signup(async_client, email: str, password: str, org_type: str = "EXPORTER") -> None:
    data = {
        "org_name": "Test Org",
        "org_type": org_type,
        "country": "India",
        "industry": "Pharmaceuticals",
        "tax_id": "TAX-1",
        "admin_name": "Test User",
        "admin_email": email,
        "password": password,
    }
    files = {"business_registration_document": ("certificate.pdf", b"fake certificate bytes", "application/pdf")}
    response = await async_client.post("/auth/signup", data=data, files=files)
    assert response.status_code == 201
```

- [ ] **Step 3: Fix `test_auth_password_reset.py`**

Replace lines 1-7 of `api/tests/test_auth_password_reset.py`:

```python
async def _signup(async_client, email: str, password: str) -> None:
    data = {
        "org_name": "Test Org",
        "org_type": "EXPORTER",
        "country": "India",
        "industry": "Pharmaceuticals",
        "tax_id": "TAX-1",
        "admin_name": "Test User",
        "admin_email": email,
        "password": password,
    }
    files = {"business_registration_document": ("certificate.pdf", b"fake certificate bytes", "application/pdf")}
    response = await async_client.post("/auth/signup", data=data, files=files)
    assert response.status_code == 201
```

- [ ] **Step 4: Fix `test_organizations_endpoints.py`**

Replace lines 4-14 of `api/tests/test_organizations_endpoints.py` (the local `_signup_and_login`, leaving the `from tests.test_trades_endpoints import create_trade, signup_and_login` line above it untouched):

```python
async def _signup_and_login(async_client, email: str) -> tuple[str, str]:
    data = {
        "org_name": "Test Org",
        "org_type": "EXPORTER",
        "country": "India",
        "industry": "Pharmaceuticals",
        "tax_id": "TAX-ORG-1",
        "admin_name": "Test User",
        "admin_email": email,
        "password": "a good password",
    }
    files = {"business_registration_document": ("certificate.pdf", b"fake certificate bytes", "application/pdf")}
    signup_response = await async_client.post("/auth/signup", data=data, files=files)
    org_id = signup_response.json()["organization"]["id"]

    login_response = await async_client.post("/auth/login", json={"email": email, "password": "a good password"})
    token = login_response.json()["access_token"]
    return org_id, token
```

- [ ] **Step 5: Fix `test_users_endpoints.py`**

Replace lines 7-14 of `api/tests/test_users_endpoints.py`:

```python
async def _signup_and_login(async_client, email: str) -> str:
    data = {
        "org_name": "Test Org",
        "org_type": "EXPORTER",
        "country": "India",
        "industry": "Pharmaceuticals",
        "tax_id": "TAX-USERS-1",
        "admin_name": "Admin User",
        "admin_email": email,
        "password": "a good password",
    }
    files = {"business_registration_document": ("certificate.pdf", b"fake certificate bytes", "application/pdf")}
    await async_client.post("/auth/signup", data=data, files=files)
    login_response = await async_client.post("/auth/login", json={"email": email, "password": "a good password"})
    return login_response.json()["access_token"]
```

- [ ] **Step 6: Fix `test_document_registry_endpoints.py`**

Replace lines 1-8 of `api/tests/test_document_registry_endpoints.py`:

```python
async def _signup_and_login(async_client, email: str) -> str:
    data = {
        "org_name": "Test Org",
        "org_type": "EXPORTER",
        "country": "India",
        "industry": "Pharmaceuticals",
        "tax_id": "TAX-REG-1",
        "admin_name": "Admin User",
        "admin_email": email,
        "password": "a good password",
    }
    files = {"business_registration_document": ("certificate.pdf", b"fake certificate bytes", "application/pdf")}
    await async_client.post("/auth/signup", data=data, files=files)
    login_response = await async_client.post("/auth/login", json={"email": email, "password": "a good password"})
    return login_response.json()["access_token"]
```

- [ ] **Step 7: Fix `test_trades_endpoints.py`**

This is the canonical helper — `test_bank_review_endpoints.py`, `test_sanctions_screening_endpoints.py`, and `test_documents_endpoints.py` import it and need no changes of their own once this is fixed. Replace lines 1-9 of `api/tests/test_trades_endpoints.py` (leave `create_trade`, which starts at line 12, untouched):

```python
async def signup_and_login(async_client, email: str, org_type: str = "EXPORTER", industry: str = "Pharmaceuticals") -> tuple[str, str]:
    data = {
        "org_name": f"Org for {email}",
        "org_type": org_type,
        "country": "India",
        "industry": industry,
        "tax_id": f"TAX-{email}",
        "admin_name": "Admin User",
        "admin_email": email,
        "password": "a good password",
    }
    files = {"business_registration_document": ("certificate.pdf", b"fake certificate bytes", "application/pdf")}
    response = await async_client.post("/auth/signup", data=data, files=files)
    org_id = response.json()["organization"]["id"]
    login_response = await async_client.post("/auth/login", json={"email": email, "password": "a good password"})
    return org_id, login_response.json()["access_token"]
```

- [ ] **Step 8: Fix `test_admin_endpoints.py`**

Replace lines 4-12 of `api/tests/test_admin_endpoints.py` (the local `_signup_and_login` only — leave `_bootstrap_admin_and_login` and `_create_trade` below it untouched, since they don't call `/auth/signup`):

```python
async def _signup_and_login(async_client, email: str, org_type: str = "EXPORTER") -> tuple[str, str]:
    data = {
        "org_name": f"Org for {email}",
        "org_type": org_type,
        "country": "India",
        "industry": "Pharmaceuticals",
        "tax_id": f"TAX-{email}",
        "admin_name": "Business User",
        "admin_email": email,
        "password": "a good password",
    }
    files = {"business_registration_document": ("certificate.pdf", b"fake certificate bytes", "application/pdf")}
    response = await async_client.post("/auth/signup", data=data, files=files)
    org_id = response.json()["organization"]["id"]
    login_response = await async_client.post("/auth/login", json={"email": email, "password": "a good password"})
    return org_id, login_response.json()["access_token"]
```

- [ ] **Step 9: Run the full backend suite**

Run: `cd api && venv/Scripts/python.exe -m pytest -q`
Expected: PASS, full suite green (this exercises `test_bank_review_endpoints.py`, `test_sanctions_screening_endpoints.py`, and `test_documents_endpoints.py` too, confirming the import-based files needed no direct edits).

- [ ] **Step 10: Commit**

```bash
git add api/tests/test_auth_login.py api/tests/test_auth_password_reset.py api/tests/test_organizations_endpoints.py api/tests/test_users_endpoints.py api/tests/test_document_registry_endpoints.py api/tests/test_trades_endpoints.py api/tests/test_admin_endpoints.py
git commit -m "Update every signup test helper to the new multipart request shape"
```

---

### Task 3: Frontend — signup form requires and uploads the document

**Files:**
- Modify: `web/src/api/types.ts`
- Modify: `web/src/api/auth.ts`
- Modify: `web/src/components/SignupForm.tsx`
- Modify: `web/src/pages/OrganizationSignupPage.test.tsx`
- Modify: `web/src/pages/BankSignupPage.test.tsx`

**Interfaces:**
- Consumes: the multipart `/auth/signup` endpoint from Task 1.
- Produces: `signup(payload)` in `web/src/api/auth.ts` now takes `{ orgName, orgType, country, industry, taxId, adminName, adminEmail, password, businessRegistrationDocument }` (a flat object, `businessRegistrationDocument: File`) instead of the old nested `SignupRequest` shape — no later task depends on this further, but any other caller of `signup()` must be checked (there are none besides `SignupForm.tsx`, confirmed in Task 3 Step 1).

- [ ] **Step 1: Confirm `signup()` has exactly one caller**

Run: `grep -rn "from '../api/auth'" web/src | grep -i signup` and `grep -rn "signup(" web/src/components web/src/pages`
Expected: only `web/src/components/SignupForm.tsx` calls `signup()`. (This confirms the signature change in this task is safe and fully contained.)

- [ ] **Step 2: Remove the now-obsolete `SignupRequest` type**

In `web/src/api/types.ts`, delete the `SignupRequest` interface entirely (lines 41-54 as of this plan's writing — find and remove the `export interface SignupRequest { ... }` block). Leave `SignupResponse` and everything else in the file unchanged.

- [ ] **Step 3: Rewrite `signup()` to send multipart**

Replace the full contents of `web/src/api/auth.ts`:

```ts
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
  businessRegistrationDocument: File;
}

export function signup(payload: SignupPayload): Promise<SignupResponse> {
  const formData = new FormData();
  formData.append('org_name', payload.orgName);
  formData.append('org_type', payload.orgType);
  formData.append('country', payload.country);
  formData.append('industry', payload.industry);
  formData.append('tax_id', payload.taxId);
  formData.append('admin_name', payload.adminName);
  formData.append('admin_email', payload.adminEmail);
  formData.append('password', payload.password);
  formData.append('business_registration_document', payload.businessRegistrationDocument);
  return apiFetch<SignupResponse>('/auth/signup', { method: 'POST', body: formData, isFormData: true });
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

- [ ] **Step 4: Add the file field to `SignupForm.tsx`**

In `web/src/components/SignupForm.tsx`, add a new piece of state right after the existing `form` state (after the `useState({...})` block that holds `orgName`/`orgType`/etc.):

```tsx
  const [businessRegistrationDocument, setBusinessRegistrationDocument] = useState<File | null>(null);
```

Replace the `handleAccountSubmit` function:

```tsx
  async function handleAccountSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!businessRegistrationDocument) {
      setError('Please attach your business registration certificate.');
      return;
    }
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
        businessRegistrationDocument,
      });
      setResult(response);
      setStep('verify');
    } catch {
      setError(errorMessage);
    }
  }
```

Add a new file input field right after the "Tax / business ID" field's closing `</div>` and before the "Admin name" field's opening `<div className="col-span-2">`:

```tsx
          <div className="col-span-2">
            <label htmlFor="businessRegistrationDocument" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Business registration certificate
            </label>
            <input
              id="businessRegistrationDocument"
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setBusinessRegistrationDocument(e.target.files?.[0] ?? null)}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            />
          </div>
```

- [ ] **Step 5: Update `OrganizationSignupPage.test.tsx`**

Replace the full contents of `web/src/pages/OrganizationSignupPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as authApi from '../api/auth';
import { OrganizationSignupPage } from './OrganizationSignupPage';

describe('OrganizationSignupPage', () => {
  it('submits the account step and shows the immediate KYB verify result', async () => {
    const signupSpy = vi.spyOn(authApi, 'signup').mockResolvedValue({
      organization: { id: '1', name: 'MedCure Pharma Exports', org_type: 'EXPORTER', country: 'India', industry: 'Pharmaceuticals', tax_id: 'TAX-1', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
      user: { id: '2', org_id: '1', name: 'Priya Shah', email: 'priya@example.com', role: 'EXPORTER_ADMIN', status: 'ACTIVE' },
      kyb_checks: [
        { id: 'k-1', org_id: '1', check_type: 'BUSINESS_REGISTRATION', status: 'PASSED', detail: 'org/1/abc-certificate.pdf', checked_at: '2026-01-01T00:00:00Z' },
        { id: 'k-2', org_id: '1', check_type: 'SANCTIONS_SCREENING', status: 'PASSED', detail: 'fake:CLEAR', checked_at: '2026-01-01T00:00:00Z' },
        { id: 'k-3', org_id: '1', check_type: 'BANK_ACCOUNT', status: 'PASSED', detail: null, checked_at: '2026-01-01T00:00:00Z' },
      ],
    });

    render(
      <MemoryRouter>
        <OrganizationSignupPage />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/organization name/i), 'MedCure Pharma Exports');
    await userEvent.selectOptions(screen.getByLabelText(/country/i), 'India');
    await userEvent.selectOptions(screen.getByLabelText(/industry/i), 'Pharmaceuticals');
    await userEvent.type(screen.getByLabelText(/tax/i), 'TAX-1');
    await userEvent.upload(
      screen.getByLabelText(/business registration certificate/i),
      new File(['certificate bytes'], 'certificate.pdf', { type: 'application/pdf' }),
    );
    await userEvent.type(screen.getByLabelText(/admin name/i), 'Priya Shah');
    await userEvent.type(screen.getByLabelText(/admin email/i), 'priya@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'a good password');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByText(/clear/i)).toBeInTheDocument();
    expect(screen.getByText('BUSINESS_REGISTRATION')).toBeInTheDocument();
    expect(screen.getByText('SANCTIONS_SCREENING')).toBeInTheDocument();
    expect(screen.getByText('BANK_ACCOUNT')).toBeInTheDocument();
    expect(signupSpy).toHaveBeenCalledWith(
      expect.objectContaining({ orgType: 'EXPORTER', taxId: 'TAX-1', adminEmail: 'priya@example.com' }),
    );
  });

  it('requires a business registration document before submitting', async () => {
    const signupSpy = vi.spyOn(authApi, 'signup');

    render(
      <MemoryRouter>
        <OrganizationSignupPage />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/organization name/i), 'MedCure Pharma Exports');
    await userEvent.selectOptions(screen.getByLabelText(/country/i), 'India');
    await userEvent.selectOptions(screen.getByLabelText(/industry/i), 'Pharmaceuticals');
    await userEvent.type(screen.getByLabelText(/tax/i), 'TAX-1');
    await userEvent.type(screen.getByLabelText(/admin name/i), 'Priya Shah');
    await userEvent.type(screen.getByLabelText(/admin email/i), 'priya@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'a good password');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(signupSpy).not.toHaveBeenCalled();
  });

  it('offers Exporter, Importer, and Both as organization types', () => {
    render(
      <MemoryRouter>
        <OrganizationSignupPage />
      </MemoryRouter>,
    );

    const select = screen.getByLabelText(/organization type/i) as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionValues).toEqual(['EXPORTER', 'BUYER', 'BOTH']);
    expect(optionLabels).toEqual(['Exporter', 'Importer', 'Both']);
  });

  it('offers India and Japan as country options', () => {
    render(
      <MemoryRouter>
        <OrganizationSignupPage />
      </MemoryRouter>,
    );

    const select = screen.getByLabelText(/country/i) as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).toEqual(['India', 'Japan']);
  });

  it('offers the nine trade industries as industry options', () => {
    render(
      <MemoryRouter>
        <OrganizationSignupPage />
      </MemoryRouter>,
    );

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
    render(
      <MemoryRouter>
        <OrganizationSignupPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  });
});
```

- [ ] **Step 6: Update `BankSignupPage.test.tsx`**

Replace the full contents of `web/src/pages/BankSignupPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as authApi from '../api/auth';
import { BankSignupPage } from './BankSignupPage';

describe('BankSignupPage', () => {
  it('submits the account step with org_type fixed to BANK and no type dropdown shown', async () => {
    const signupSpy = vi.spyOn(authApi, 'signup').mockResolvedValue({
      organization: { id: '1', name: 'Canara Bank', org_type: 'BANK', country: 'India', industry: 'Banking', tax_id: 'TAX-2', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
      user: { id: '2', org_id: '1', name: 'Rahul Mehta', email: 'rahul@example.com', role: 'BANK_REVIEWER', status: 'ACTIVE' },
      kyb_checks: [
        { id: 'k-1', org_id: '1', check_type: 'BUSINESS_REGISTRATION', status: 'PASSED', detail: 'org/1/abc-certificate.pdf', checked_at: '2026-01-01T00:00:00Z' },
        { id: 'k-2', org_id: '1', check_type: 'SANCTIONS_SCREENING', status: 'PASSED', detail: 'fake:CLEAR', checked_at: '2026-01-01T00:00:00Z' },
        { id: 'k-3', org_id: '1', check_type: 'BANK_ACCOUNT', status: 'PASSED', detail: null, checked_at: '2026-01-01T00:00:00Z' },
      ],
    });

    render(
      <MemoryRouter>
        <BankSignupPage />
      </MemoryRouter>,
    );

    expect(screen.queryByLabelText(/organization type/i)).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/institution name/i), 'Canara Bank');
    await userEvent.selectOptions(screen.getByLabelText(/country/i), 'India');
    await userEvent.type(screen.getByLabelText(/industry/i), 'Banking');
    await userEvent.type(screen.getByLabelText(/tax/i), 'TAX-2');
    await userEvent.upload(
      screen.getByLabelText(/business registration certificate/i),
      new File(['certificate bytes'], 'certificate.pdf', { type: 'application/pdf' }),
    );
    await userEvent.type(screen.getByLabelText(/admin name/i), 'Rahul Mehta');
    await userEvent.type(screen.getByLabelText(/admin email/i), 'rahul@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'a good password');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByText(/clear/i)).toBeInTheDocument();
    expect(screen.getByText('Institution verified')).toBeInTheDocument();
    expect(screen.queryByText('Organization verified')).not.toBeInTheDocument();
    expect(signupSpy).toHaveBeenCalledWith(expect.objectContaining({ orgType: 'BANK', taxId: 'TAX-2', adminEmail: 'rahul@example.com' }));
  });
});
```

- [ ] **Step 7: Typecheck and run the full frontend suite**

Run: `cd web && npx tsc -b && npx vitest run`
Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add web/src/api/types.ts web/src/api/auth.ts web/src/components/SignupForm.tsx web/src/pages/OrganizationSignupPage.test.tsx web/src/pages/BankSignupPage.test.tsx
git commit -m "Require and upload the business registration document from the signup form"
```
