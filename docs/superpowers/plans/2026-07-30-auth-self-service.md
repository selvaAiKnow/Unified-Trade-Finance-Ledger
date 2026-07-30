# Auth Self-Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a signup link and a forgot-password flow (request → OTP verify → set new password) to the login page, backed by three new FastAPI endpoints and a new `password_reset_otps` table.

**Architecture:** Backend adds a `PasswordResetOtp` model/table, two new JWT-based helper functions for a short-lived, purpose-scoped reset token, and three new `/auth/*` endpoints. Frontend adds two links to `LoginPage`, three new API client functions, and one new page (`ForgotPasswordPage`) with internal step state, matching the existing `SignupForm` convention.

**Tech Stack:** FastAPI + SQLAlchemy (async) + Alembic + pytest (backend, existing); React + TypeScript + Tailwind + Vitest (frontend, existing).

## Global Constraints

- No changes to existing `/auth/signup`, `/auth/login`, or `/auth/me` behavior.
- OTP delivery is stubbed — no real email/SMS integration. `POST /auth/forgot-password` returns the code directly in its response.
- No auto-login after password reset — the user returns to `/login`.
- New password minimum length: 8 characters, enforced only on `reset-password`.
- Every backend task ends with `cd api && python -m pytest` clean (or the specific new test file, per step) and every frontend task ends with `cd web && npx vitest run && npx tsc -b` clean.

---

### Task 1: Fix the broken test database configuration

**Files:**
- Modify: `api/tests/conftest.py`

**Interfaces:**
- No new exports. This unblocks `pytest` collection for every later backend task.

This is a pre-existing bug, unrelated to this plan's feature: `conftest.py` references `settings.database_url`, but the `Settings` class (`api/app/config.py`) has no such field — the actual database URL lives in a separate module-level `DATABASE_URL` constant that `api/app/db.py` already uses. Currently `pytest` fails at collection with `AttributeError: 'Settings' object has no attribute 'database_url'`.

- [ ] **Step 1: Fix the import and URL derivation in `api/tests/conftest.py`**

Change:

```python
from app.config import settings
from app.db import get_db
from app.main import app

TEST_DATABASE_URL = settings.database_url.replace("/trade_finance", "/trade_finance_test")
```

to:

```python
from app.config import DATABASE_URL, database_name
from app.db import get_db
from app.main import app

TEST_DATABASE_URL = DATABASE_URL.replace(f"/{database_name}", f"/{database_name}_test")
```

This derives the test database URL from the same `DATABASE_URL`/`database_name` values `db.py` actually uses, instead of a nonexistent settings field, and generalizes correctly regardless of what `DATABASE_NAME` is configured to.

- [ ] **Step 2: Run the existing backend test suite to verify it now collects and passes**

Run: `cd api && python -m pytest`
Expected: all existing tests pass (this fix has no effect on behavior — only on whether tests can run at all).

- [ ] **Step 3: Commit**

```bash
git add api/tests/conftest.py
git commit -m "Fix test database URL to use the current config's DATABASE_URL"
```

---

### Task 2: `PasswordResetOtp` model and migration

**Files:**
- Create: `api/app/models/password_reset_otp.py`
- Create: `api/alembic/versions/0009_create_password_reset_otps.py`

**Interfaces:**
- Produces: `PasswordResetOtp` model (table `password_reset_otps`) — columns `id`, `user_id`, `code_hash`, `expires_at`, `consumed_at`, `attempt_count`, `created_at` — consumed by Tasks 4-6.

- [ ] **Step 1: Create the model**

Create `api/app/models/password_reset_otp.py`:

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class PasswordResetOtp(Base):
    __tablename__ = "password_reset_otps"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    code_hash: Mapped[str] = mapped_column(String, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

This mirrors the existing `api/app/models/kyb_check.py` style exactly (same import pattern, same `Mapped`/`mapped_column` usage).

- [ ] **Step 2: Create the migration**

Create `api/alembic/versions/0009_create_password_reset_otps.py`:

```python
"""create password_reset_otps

Revision ID: 9e11d6601079
Revises: 477729804589
Create Date: 2026-07-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9e11d6601079'
down_revision: Union[str, None] = '477729804589'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('password_reset_otps',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('code_hash', sa.String(), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('consumed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('attempt_count', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('password_reset_otps')
```

`down_revision` (`477729804589`) is the revision id inside `api/alembic/versions/0008_create_bank_review_findings.py` — the current head. This file's own `revision` id (`9e11d6601079`) was generated fresh for this migration and must not collide with any existing revision id in `api/alembic/versions/`.

- [ ] **Step 3: Verify the migration applies cleanly**

Run: `cd api && python -m pytest`
Expected: the session-scoped `_migrate_test_db` fixture in `conftest.py` runs `alembic downgrade base` then `alembic upgrade head` against the test database — this exercises the new migration's `upgrade()`/`downgrade()` both ways. All existing tests still pass (nothing yet uses the new table).

- [ ] **Step 4: Commit**

```bash
git add api/app/models/password_reset_otp.py api/alembic/versions/0009_create_password_reset_otps.py
git commit -m "Add PasswordResetOtp model and migration"
```

---

### Task 3: Reset-token JWT helpers and new settings

**Files:**
- Modify: `api/app/config.py`
- Modify: `api/app/auth/security.py`

**Interfaces:**
- Produces: `create_password_reset_token(user_id: str) -> str` and `decode_password_reset_token(token: str) -> str | None` (returns the user id on success, `None` on invalid/expired/wrong-purpose token) — consumed by Tasks 5 and 6.
- Produces: `settings.otp_expiry_minutes` (int, default `10`), `settings.otp_max_attempts` (int, default `5`), `settings.password_reset_token_expiry_minutes` (int, default `10`) — consumed by Tasks 4, 5, 6.

- [ ] **Step 1: Add the three new settings fields to `api/app/config.py`**

In the `Settings` class, add these three lines alongside the existing fields (after `jwt_expiry_minutes`):

```python
    otp_expiry_minutes: int = 10
    otp_max_attempts: int = 5
    password_reset_token_expiry_minutes: int = 10
```

- [ ] **Step 2: Add the two new functions to `api/app/auth/security.py`**

Add these two functions after the existing `decode_access_token`:

```python
def create_password_reset_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.password_reset_token_expiry_minutes)
    payload = {"sub": user_id, "purpose": "password_reset", "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_password_reset_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    if payload.get("purpose") != "password_reset":
        return None
    return payload.get("sub")
```

No new imports are needed — `datetime`, `timedelta`, `timezone`, `jwt`, and `settings` are already imported at the top of `security.py`. The `purpose` claim is what keeps a normal login access token (created by `create_access_token`, which has no `purpose` claim) from being usable here, and vice versa.

- [ ] **Step 3: Run the full backend test suite**

Run: `cd api && python -m pytest`
Expected: all existing tests pass (these are new, unused functions/settings — no existing behavior changes).

- [ ] **Step 4: Commit**

```bash
git add api/app/config.py api/app/auth/security.py
git commit -m "Add password-reset token helpers and OTP/reset settings"
```

---

### Task 4: `POST /auth/forgot-password`

**Files:**
- Modify: `api/app/schemas/auth.py`
- Modify: `api/app/routers/auth.py`
- Test: `api/tests/test_auth_password_reset.py`

**Interfaces:**
- Consumes: `PasswordResetOtp` model (Task 2), `hash_password` (existing), `settings.otp_expiry_minutes` (Task 3).
- Produces: `ForgotPasswordRequest`/`ForgotPasswordResponse` schemas, consumed by Tasks 5-6's tests (as the flow's first step) and by frontend Task 8.

- [ ] **Step 1: Write the failing test**

Create `api/tests/test_auth_password_reset.py`:

```python
async def _signup(async_client, email: str, password: str) -> None:
    payload = {
        "organization": {"name": "Test Org", "org_type": "EXPORTER", "country": "India", "industry": "Pharmaceuticals", "tax_id": "TAX-1"},
        "admin_user": {"name": "Test User", "email": email, "password": password},
    }
    response = await async_client.post("/auth/signup", json=payload)
    assert response.status_code == 201


async def test_forgot_password_returns_otp_code_for_existing_user(async_client):
    await _signup(async_client, "forgot-test@example.com", "the original password")

    response = await async_client.post("/auth/forgot-password", json={"email": "forgot-test@example.com"})

    assert response.status_code == 200
    body = response.json()
    assert len(body["otp_code"]) == 6
    assert body["otp_code"].isdigit()


async def test_forgot_password_rejects_unknown_email(async_client):
    response = await async_client.post("/auth/forgot-password", json={"email": "nobody@example.com"})

    assert response.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && python -m pytest tests/test_auth_password_reset.py -v`
Expected: FAIL — `/auth/forgot-password` doesn't exist yet (404 for the route itself, not the "unknown email" 404).

- [ ] **Step 3: Add the schemas to `api/app/schemas/auth.py`**

Add after the existing `LoginResponse`:

```python
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
    new_password: str = Field(min_length=8)


class ResetPasswordResponse(BaseModel):
    message: str
```

Add `Field` to the existing pydantic import line at the top of the file:

```python
from pydantic import BaseModel, ConfigDict, EmailStr, Field
```

(All six schemas are added in this step since they're small and declared together; only `ForgotPasswordRequest`/`ForgotPasswordResponse` are used by this task's endpoint — the rest are used by Tasks 5-6.)

- [ ] **Step 4: Add the endpoint to `api/app/routers/auth.py`**

Add these imports at the top of the file, alongside the existing ones:

```python
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from app.auth.security import (
    create_access_token,
    create_password_reset_token,
    decode_password_reset_token,
    hash_password,
    verify_password,
)
from app.config import settings
from app.models.password_reset_otp import PasswordResetOtp
from app.schemas.auth import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LoginResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
    SignupRequest,
    SignupResponse,
    UserOut,
    VerifyOtpRequest,
    VerifyOtpResponse,
)
```

(This replaces the existing narrower `from app.auth.security import create_access_token, hash_password, verify_password` and `from app.schemas.auth import LoginRequest, LoginResponse, SignupRequest, SignupResponse, UserOut` lines — the full set of names each import statement needs, combining what already existed with what this and the next two tasks add. `import uuid` and the `datetime`/`timedelta`/`timezone` imports are new; `secrets` is new.)

Add this endpoint after the existing `login` endpoint (before `me`):

```python
@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)) -> ForgotPasswordResponse:
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No account found with that email")

    now = datetime.now(timezone.utc)
    existing = await db.execute(
        select(PasswordResetOtp).where(PasswordResetOtp.user_id == user.id, PasswordResetOtp.consumed_at.is_(None))
    )
    for stale_otp in existing.scalars().all():
        stale_otp.consumed_at = now

    code = f"{secrets.randbelow(1_000_000):06d}"
    otp = PasswordResetOtp(
        user_id=user.id,
        code_hash=hash_password(code),
        expires_at=now + timedelta(minutes=settings.otp_expiry_minutes),
    )
    db.add(otp)
    await db.commit()

    return ForgotPasswordResponse(message="A verification code has been generated.", otp_code=code)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd api && python -m pytest tests/test_auth_password_reset.py -v`
Expected: PASS (2 tests)

- [ ] **Step 6: Run the full backend test suite**

Run: `cd api && python -m pytest`
Expected: all tests pass, including the 2 new ones.

- [ ] **Step 7: Commit**

```bash
git add api/app/schemas/auth.py api/app/routers/auth.py api/tests/test_auth_password_reset.py
git commit -m "Add POST /auth/forgot-password endpoint"
```

---

### Task 5: `POST /auth/verify-otp`

**Files:**
- Modify: `api/app/routers/auth.py`
- Modify: `api/tests/test_auth_password_reset.py`

**Interfaces:**
- Consumes: `PasswordResetOtp` model (Task 2), `create_password_reset_token` (Task 3), `VerifyOtpRequest`/`VerifyOtpResponse` schemas (Task 4), `settings.otp_max_attempts` (Task 3).
- Produces: nothing new outside the file — the reset token this endpoint returns is consumed by Task 6's endpoint and by the frontend (Task 9).

- [ ] **Step 1: Write the failing tests**

Add to `api/tests/test_auth_password_reset.py`, after the existing tests:

```python
async def test_verify_otp_returns_reset_token_for_correct_code(async_client):
    await _signup(async_client, "verify-test@example.com", "the original password")
    forgot_response = await async_client.post("/auth/forgot-password", json={"email": "verify-test@example.com"})
    otp_code = forgot_response.json()["otp_code"]

    response = await async_client.post("/auth/verify-otp", json={"email": "verify-test@example.com", "code": otp_code})

    assert response.status_code == 200
    assert response.json()["reset_token"]


async def test_verify_otp_rejects_wrong_code(async_client):
    await _signup(async_client, "verify-wrong@example.com", "the original password")
    await async_client.post("/auth/forgot-password", json={"email": "verify-wrong@example.com"})

    response = await async_client.post("/auth/verify-otp", json={"email": "verify-wrong@example.com", "code": "000000"})

    assert response.status_code == 400


async def test_verify_otp_locks_out_after_five_wrong_attempts(async_client):
    await _signup(async_client, "verify-lockout@example.com", "the original password")
    forgot_response = await async_client.post("/auth/forgot-password", json={"email": "verify-lockout@example.com"})
    correct_code = forgot_response.json()["otp_code"]
    wrong_code = "000000" if correct_code != "000000" else "111111"

    for _ in range(5):
        response = await async_client.post("/auth/verify-otp", json={"email": "verify-lockout@example.com", "code": wrong_code})
        assert response.status_code == 400

    # Even the correct code is now rejected — the OTP is locked out, not just that one guess.
    response = await async_client.post("/auth/verify-otp", json={"email": "verify-lockout@example.com", "code": correct_code})
    assert response.status_code == 400
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && python -m pytest tests/test_auth_password_reset.py -v`
Expected: FAIL — `/auth/verify-otp` doesn't exist yet.

- [ ] **Step 3: Add the endpoint to `api/app/routers/auth.py`**

Add after the `forgot_password` endpoint:

```python
@router.post("/verify-otp", response_model=VerifyOtpResponse)
async def verify_otp(payload: VerifyOtpRequest, db: AsyncSession = Depends(get_db)) -> VerifyOtpResponse:
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code")

    otp_result = await db.execute(
        select(PasswordResetOtp)
        .where(PasswordResetOtp.user_id == user.id, PasswordResetOtp.consumed_at.is_(None))
        .order_by(PasswordResetOtp.created_at.desc())
    )
    otp = otp_result.scalars().first()
    if otp is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code")

    if otp.attempt_count >= settings.otp_max_attempts:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Too many attempts. Request a new code.")

    now = datetime.now(timezone.utc)
    if otp.expires_at < now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code")

    if not verify_password(payload.code, otp.code_hash):
        otp.attempt_count += 1
        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code")

    otp.consumed_at = now
    await db.commit()

    reset_token = create_password_reset_token(user_id=str(user.id))
    return VerifyOtpResponse(reset_token=reset_token)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && python -m pytest tests/test_auth_password_reset.py -v`
Expected: PASS (5 tests total: the 2 from Task 4 plus these 3)

- [ ] **Step 5: Run the full backend test suite**

Run: `cd api && python -m pytest`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add api/app/routers/auth.py api/tests/test_auth_password_reset.py
git commit -m "Add POST /auth/verify-otp endpoint"
```

---

### Task 6: `POST /auth/reset-password`

**Files:**
- Modify: `api/app/routers/auth.py`
- Modify: `api/tests/test_auth_password_reset.py`

**Interfaces:**
- Consumes: `decode_password_reset_token` (Task 3), `ResetPasswordRequest`/`ResetPasswordResponse` schemas (Task 4), `hash_password` (existing).

- [ ] **Step 1: Write the failing tests**

Add to `api/tests/test_auth_password_reset.py`, after the existing tests:

```python
async def test_full_password_reset_flow_lets_user_log_in_with_new_password(async_client):
    await _signup(async_client, "reset-flow@example.com", "the original password")
    forgot_response = await async_client.post("/auth/forgot-password", json={"email": "reset-flow@example.com"})
    otp_code = forgot_response.json()["otp_code"]
    verify_response = await async_client.post("/auth/verify-otp", json={"email": "reset-flow@example.com", "code": otp_code})
    reset_token = verify_response.json()["reset_token"]

    reset_response = await async_client.post(
        "/auth/reset-password", json={"reset_token": reset_token, "new_password": "a brand new password"}
    )
    assert reset_response.status_code == 200

    old_password_login = await async_client.post(
        "/auth/login", json={"email": "reset-flow@example.com", "password": "the original password"}
    )
    assert old_password_login.status_code == 401

    new_password_login = await async_client.post(
        "/auth/login", json={"email": "reset-flow@example.com", "password": "a brand new password"}
    )
    assert new_password_login.status_code == 200


async def test_reset_password_rejects_garbage_token(async_client):
    response = await async_client.post(
        "/auth/reset-password", json={"reset_token": "not-a-real-token", "new_password": "a brand new password"}
    )
    assert response.status_code == 400


async def test_reset_password_rejects_short_password(async_client):
    await _signup(async_client, "reset-short@example.com", "the original password")
    forgot_response = await async_client.post("/auth/forgot-password", json={"email": "reset-short@example.com"})
    verify_response = await async_client.post(
        "/auth/verify-otp", json={"email": "reset-short@example.com", "code": forgot_response.json()["otp_code"]}
    )
    reset_token = verify_response.json()["reset_token"]

    response = await async_client.post("/auth/reset-password", json={"reset_token": reset_token, "new_password": "short"})

    assert response.status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && python -m pytest tests/test_auth_password_reset.py -v`
Expected: FAIL — `/auth/reset-password` doesn't exist yet.

- [ ] **Step 3: Add the endpoint to `api/app/routers/auth.py`**

Add after the `verify_otp` endpoint:

```python
@router.post("/reset-password", response_model=ResetPasswordResponse)
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)) -> ResetPasswordResponse:
    user_id = decode_password_reset_token(payload.reset_token)
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset link")

    user = await db.get(User, uuid.UUID(user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset link")

    user.password_hash = hash_password(payload.new_password)
    await db.commit()

    return ResetPasswordResponse(message="Password reset successful. Please sign in with your new password.")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && python -m pytest tests/test_auth_password_reset.py -v`
Expected: PASS (8 tests total)

- [ ] **Step 5: Run the full backend test suite**

Run: `cd api && python -m pytest`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add api/app/routers/auth.py api/tests/test_auth_password_reset.py
git commit -m "Add POST /auth/reset-password endpoint"
```

---

### Task 7: LoginPage signup/forgot-password links

**Files:**
- Modify: `web/src/pages/LoginPage.tsx`
- Modify: `web/src/pages/LoginPage.test.tsx`

**Interfaces:**
- No new exports. Purely additive JSX in an existing page.

- [ ] **Step 1: Write the failing test**

Add to `web/src/pages/LoginPage.test.tsx`, inside the existing `describe('LoginPage', ...)` block, after the last test:

```tsx
  it('links to the signup hub and the forgot-password page', () => {
    const store = new AuthStore();
    renderPage(store);

    expect(screen.getByRole('link', { name: /sign up/i })).toHaveAttribute('href', '/signup');
    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute('href', '/forgot-password');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/pages/LoginPage.test.tsx`
Expected: FAIL — neither link exists yet.

- [ ] **Step 3: Add the links to `web/src/pages/LoginPage.tsx`**

Change the import line:

```tsx
import { useNavigate } from 'react-router-dom';
```

to:

```tsx
import { Link, useNavigate } from 'react-router-dom';
```

Add this block right after the closing `</form>` tag and before the closing `</div>` of the card (i.e., as the last child inside `<div className="w-full max-w-sm bg-paper-2 border border-line p-10">`, after `</form>`):

```tsx
        <div className="mt-5 pt-4 border-t border-line flex items-center justify-between text-sm">
          <Link to="/forgot-password" className="text-seal font-semibold hover:underline">
            Forgot password?
          </Link>
          <Link to="/signup" className="text-ink-soft hover:underline">
            Sign up
          </Link>
        </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/pages/LoginPage.test.tsx`
Expected: PASS (4 tests: the 3 existing plus this one)

- [ ] **Step 5: Run the full suite and build check**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: all 81 tests pass (80 existing + 1 new), `tsc -b` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/LoginPage.tsx web/src/pages/LoginPage.test.tsx
git commit -m "Add signup and forgot-password links to LoginPage"
```

---

### Task 8: Frontend API client functions and types

**Files:**
- Modify: `web/src/api/types.ts`
- Modify: `web/src/api/auth.ts`

**Interfaces:**
- Produces: `forgotPassword(payload: ForgotPasswordRequest): Promise<ForgotPasswordResponse>`, `verifyOtp(payload: VerifyOtpRequest): Promise<VerifyOtpResponse>`, `resetPassword(payload: ResetPasswordRequest): Promise<ResetPasswordResponse>` from `web/src/api/auth.ts` — consumed by Task 9.
- Produces: `ForgotPasswordRequest`, `ForgotPasswordResponse`, `VerifyOtpRequest`, `VerifyOtpResponse`, `ResetPasswordRequest`, `ResetPasswordResponse` interfaces from `web/src/api/types.ts` — matching the backend schemas from Task 4 field-for-field.

- [ ] **Step 1: Add the new types to `web/src/api/types.ts`**

Add at the end of the file:

```ts
export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  message: string;
  otp_code: string;
}

export interface VerifyOtpRequest {
  email: string;
  code: string;
}

export interface VerifyOtpResponse {
  reset_token: string;
}

export interface ResetPasswordRequest {
  reset_token: string;
  new_password: string;
}

export interface ResetPasswordResponse {
  message: string;
}
```

- [ ] **Step 2: Add the new functions to `web/src/api/auth.ts`**

Change the type import line:

```ts
import type { LoginRequest, LoginResponse, SignupRequest, SignupResponse, User } from './types';
```

to:

```ts
import type {
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  LoginResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
  SignupRequest,
  SignupResponse,
  User,
  VerifyOtpRequest,
  VerifyOtpResponse,
} from './types';
```

Add at the end of the file:

```ts
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

- [ ] **Step 3: Run the full suite and build check**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: all 81 tests pass, `tsc -b` prints nothing (these are new, unused-so-far exports — no existing behavior changes).

- [ ] **Step 4: Commit**

```bash
git add web/src/api/types.ts web/src/api/auth.ts
git commit -m "Add forgot-password/verify-otp/reset-password API client functions"
```

---

### Task 9: `ForgotPasswordPage` and routing

**Files:**
- Create: `web/src/pages/ForgotPasswordPage.tsx`
- Create: `web/src/pages/ForgotPasswordPage.test.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `forgotPassword`, `verifyOtp`, `resetPassword` (Task 8).
- Produces: `ForgotPasswordPage` component, routed at `/forgot-password` (public, alongside `/login` and `/signup` — not behind `ProtectedRoute`).

- [ ] **Step 1: Write the failing tests**

Create `web/src/pages/ForgotPasswordPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as authApi from '../api/auth';
import { ForgotPasswordPage } from './ForgotPasswordPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );
}

describe('ForgotPasswordPage', () => {
  it('walks through request, otp, and reset steps to completion', async () => {
    vi.spyOn(authApi, 'forgotPassword').mockResolvedValue({ message: 'sent', otp_code: '123456' });
    vi.spyOn(authApi, 'verifyOtp').mockResolvedValue({ reset_token: 'tok-abc' });
    const resetSpy = vi.spyOn(authApi, 'resetPassword').mockResolvedValue({ message: 'done' });

    renderPage();

    await userEvent.type(screen.getByLabelText(/work email/i), 'a@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send verification code/i }));

    expect(await screen.findByText('123456')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/verification code/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }));

    await screen.findByLabelText(/new password/i);
    await userEvent.type(screen.getByLabelText(/^new password/i), 'a brand new password');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'a brand new password');
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByText(/password has been reset/i)).toBeInTheDocument();
    expect(resetSpy).toHaveBeenCalledWith({ reset_token: 'tok-abc', new_password: 'a brand new password' });
  });

  it('shows an error when the email is not found', async () => {
    vi.spyOn(authApi, 'forgotPassword').mockRejectedValue(new Error('not found'));

    renderPage();

    await userEvent.type(screen.getByLabelText(/work email/i), 'nobody@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send verification code/i }));

    expect(await screen.findByText(/no account found/i)).toBeInTheDocument();
  });

  it('shows an error when the code is wrong', async () => {
    vi.spyOn(authApi, 'forgotPassword').mockResolvedValue({ message: 'sent', otp_code: '123456' });
    vi.spyOn(authApi, 'verifyOtp').mockRejectedValue(new Error('invalid'));

    renderPage();

    await userEvent.type(screen.getByLabelText(/work email/i), 'a@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send verification code/i }));
    await screen.findByLabelText(/verification code/i);
    await userEvent.type(screen.getByLabelText(/verification code/i), '000000');
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }));

    expect(await screen.findByText(/invalid or expired code/i)).toBeInTheDocument();
  });

  it('shows an error when the two password fields do not match', async () => {
    vi.spyOn(authApi, 'forgotPassword').mockResolvedValue({ message: 'sent', otp_code: '123456' });
    vi.spyOn(authApi, 'verifyOtp').mockResolvedValue({ reset_token: 'tok-abc' });

    renderPage();

    await userEvent.type(screen.getByLabelText(/work email/i), 'a@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send verification code/i }));
    await screen.findByLabelText(/verification code/i);
    await userEvent.type(screen.getByLabelText(/verification code/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }));

    await screen.findByLabelText(/^new password/i);
    await userEvent.type(screen.getByLabelText(/^new password/i), 'a brand new password');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'a different password');
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByText(/do not match/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/pages/ForgotPasswordPage.test.tsx`
Expected: FAIL — `ForgotPasswordPage` doesn't exist yet.

- [ ] **Step 3: Implement `web/src/pages/ForgotPasswordPage.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { forgotPassword, resetPassword, verifyOtp } from '../api/auth';

type Step = 'request' | 'otp' | 'reset' | 'done';

export function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleRequestSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const response = await forgotPassword({ email });
      setDevOtpCode(response.otp_code);
      setStep('otp');
    } catch {
      setError('No account found with that email.');
    }
  }

  async function handleOtpSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const response = await verifyOtp({ email, code });
      setResetToken(response.reset_token);
      setStep('reset');
    } catch {
      setError('Invalid or expired code. Please try again.');
    }
  }

  async function handleResetSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    try {
      await resetPassword({ reset_token: resetToken, new_password: newPassword });
      setStep('done');
    } catch {
      setError('Could not reset your password. Please try again.');
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{
        background:
          'linear-gradient(180deg, rgba(28,43,57,0.04), rgba(28,43,57,0)), ' +
          'repeating-linear-gradient(135deg, rgba(28,43,57,0.025) 0 2px, transparent 2px 26px), ' +
          '#F1EFE7',
      }}
    >
      <div className="w-full max-w-sm bg-paper-2 border border-line p-10">
        {step === 'request' && (
          <>
            <h2 className="font-serif text-2xl font-medium mb-1.5">Reset your password</h2>
            <p className="text-ink-soft text-sm mb-7">Enter your work email and we'll send you a verification code.</p>
            <form onSubmit={handleRequestSubmit} className="flex flex-col gap-4">
              <div>
                <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
                  Work email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 border border-line-strong rounded"
                  required
                />
              </div>
              {error && <p className="text-block text-sm">{error}</p>}
              <button type="submit" className="bg-seal text-white rounded py-2.5 font-semibold hover:bg-seal-dark">
                Send verification code
              </button>
            </form>
          </>
        )}
        {step === 'otp' && (
          <>
            <h2 className="font-serif text-2xl font-medium mb-1.5">Enter verification code</h2>
            <p className="text-ink-soft text-sm mb-7">
              Enter the 6-digit code sent to {email}.
              {devOtpCode && (
                <>
                  {' '}
                  (Dev mode — your code is <span className="font-mono font-semibold">{devOtpCode}</span>.)
                </>
              )}
            </p>
            <form onSubmit={handleOtpSubmit} className="flex flex-col gap-4">
              <div>
                <label htmlFor="code" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
                  Verification code
                </label>
                <input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full px-3 py-2.5 border border-line-strong rounded"
                  required
                />
              </div>
              {error && <p className="text-block text-sm">{error}</p>}
              <button type="submit" className="bg-seal text-white rounded py-2.5 font-semibold hover:bg-seal-dark">
                Verify code
              </button>
            </form>
          </>
        )}
        {step === 'reset' && (
          <>
            <h2 className="font-serif text-2xl font-medium mb-1.5">Set a new password</h2>
            <p className="text-ink-soft text-sm mb-7">Choose a new password for your account.</p>
            <form onSubmit={handleResetSubmit} className="flex flex-col gap-4">
              <div>
                <label htmlFor="newPassword" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
                  New password
                </label>
                <input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2.5 border border-line-strong rounded"
                  required
                />
              </div>
              <div>
                <label htmlFor="confirmPassword" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2.5 border border-line-strong rounded"
                  required
                />
              </div>
              {error && <p className="text-block text-sm">{error}</p>}
              <button type="submit" className="bg-seal text-white rounded py-2.5 font-semibold hover:bg-seal-dark">
                Reset password
              </button>
            </form>
          </>
        )}
        {step === 'done' && (
          <>
            <h2 className="font-serif text-2xl font-medium mb-1.5">Password reset</h2>
            <p className="text-ink-soft text-sm mb-7">Your password has been reset. You can now sign in.</p>
            <Link to="/login" className="inline-block bg-seal text-white rounded px-4 py-2.5 font-semibold hover:bg-seal-dark">
              Continue to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire the route in `web/src/App.tsx`**

Add the import alongside the other page imports (alphabetically, after `DashboardPage`):

```tsx
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
```

Add the route right after the `/login` route:

```tsx
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run src/pages/ForgotPasswordPage.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Run the full suite and build check**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: all 85 tests pass (81 from Task 7 + 4 new here), `tsc -b` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/ForgotPasswordPage.tsx web/src/pages/ForgotPasswordPage.test.tsx web/src/App.tsx
git commit -m "Add ForgotPasswordPage with request/otp/reset steps"
```

---

## Final Verification

- [ ] Run `cd api && python -m pytest` — expect all tests passing, including the 8 new ones in `test_auth_password_reset.py`.
- [ ] Run `cd web && npx vitest run` — expect 85/85 tests passing.
- [ ] Run `cd web && npx tsc -b` — expect a clean build with no output.
- [ ] Start both the API and web dev servers and manually walk through: click "Sign up" from the login page (goes to `/signup`), then click "Forgot password?" (goes to `/forgot-password`), request a code, verify it (using the dev-visible code shown on screen), set a new password, and confirm login works with the new password but not the old one.
