# KYC AI Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "upload immediately auto-passes" business registration check with a real AI-assisted review: an AI check runs after upload and either auto-passes the document or flags it for a human; a new admin-web "KYC Review" page (behind a new sidebar) lets an admin see who uploaded what, view the document, and approve or reject flagged ones.

**Architecture:** A new `FLAGGED` status is added to `KybCheckStatus`. Uploading a business registration document now kicks off a background AI check (mirroring the existing trade-document AI-checker pattern in `document_intelligence/`) via a new, parallel `kyc_intelligence/` module. The AI either auto-passes the check or leaves it `FLAGGED` with a summary; admins resolve `FLAGGED` checks via new endpoints. Three new nullable columns on `kyb_checks` (`uploaded_by`, `ai_summary`, `document_content_type`) require a real migration — the earlier signup/KYC work only ever added enum values or reused existing columns, but this task needs genuinely new data.

**Tech Stack:** FastAPI + SQLAlchemy/Alembic (`api/`), Anthropic SDK (existing `document_intelligence` pattern), React + TypeScript + Vite (`web/`, `admin-web/`).

## Global Constraints

- `KybCheckStatus` gains `FLAGGED` (AI declined to auto-pass; needs a human). Plain string column — no migration needed for the enum value itself.
- `kyb_checks` gains three real columns (migration required): `uploaded_by` (nullable FK to `users.id`), `ai_summary` (nullable text), `document_content_type` (nullable string, so the admin document endpoint can set the right header).
- On upload: the document is stored, `uploaded_by`/`document_content_type` are set synchronously, and `status` is (re)set to `PENDING` while an AI check runs as a background task (`BackgroundTasks`, same mechanism `POST /trades/{id}/documents` already uses). The AI either sets `PASSED` or `FLAGGED` (with `ai_summary`); if the AI call itself fails or returns nothing parseable, the check becomes `FLAGGED` too (never silently stuck) with a generic summary.
- Re-uploading is allowed any time the check isn't already `PASSED` (this was already true before this plan; unchanged) — including after `FLAGGED` or `FAILED`, so a rejected/flagged org can try again.
- New admin endpoints only ever act on `BUSINESS_REGISTRATION` checks (400 if targeted at `SANCTIONS_SCREENING`/`BANK_ACCOUNT`) and only ever set `PASSED` or `FAILED` (never `PENDING`/`FLAGGED` — those are automatic-only states).
- Admin gets a document viewer: `GET /admin/kyb-checks/{check_id}/document` streams the raw bytes with the stored content-type. This deliberately reverses the earlier "no document viewer" constraint from the original signup-KYC plan — a manual approve/reject decision is meaningless without being able to see the document.
- `admin-web`'s top nav bar becomes a left sidebar (simple vertical list, icon + text per item, not collapsible), gaining a 4th item: "KYC Review".
- The existing `/kyc` page (in `web/`, the org-facing upload page) needs a real behavior fix, not just type propagation: today it decides whether to show the upload form purely from `status === 'PENDING'`, which would incorrectly invite a second upload while the first is still mid-AI-check. The gate must also account for whether a document is already on file (`detail != null`).

---

### Task 1: Backend — migration, model, and schema for the new columns

**Files:**
- Create: `api/alembic/versions/0015_add_kyb_check_upload_columns.py`
- Modify: `api/app/models/enums.py`
- Modify: `api/app/models/kyb_check.py`
- Modify: `api/app/schemas/kyb_check.py`
- Modify: `api/tests/test_kyb_check_model.py`

**Interfaces:**
- Produces: `KybCheck.uploaded_by: uuid.UUID | None`, `KybCheck.ai_summary: str | None`, `KybCheck.document_content_type: str | None`; `KybCheckStatus.FLAGGED`; `KybCheckOut.uploaded_by`, `KybCheckOut.ai_summary` — every later task in this plan depends on these existing.

- [ ] **Step 1: Add the new status value — in `api/app/models/enums.py`, replace the `KybCheckStatus` class**

```python
class KybCheckStatus(str, Enum):
    PASSED = "PASSED"
    PENDING = "PENDING"
    FAILED = "FAILED"
    FLAGGED = "FLAGGED"
```

- [ ] **Step 2: Write the failing test — append to `api/tests/test_kyb_check_model.py`**

Add this import at the top, alongside the existing ones:

```python
from app.models.user import User
```

Append this test at the end of the file:

```python
async def test_kyb_check_upload_columns_round_trip(db_session):
    org = Organization(name="Kyoto Textile Trading Co.", org_type="EXPORTER", country="Japan", industry="Textiles", tax_id="29AABCT1111C1Z2")
    db_session.add(org)
    await db_session.flush()

    uploader = User(org_id=org.id, name="Arjun Nair", email="arjun@kyototextile.example", password_hash="", role="EXPORTER_ADMIN", status="ACTIVE")
    db_session.add(uploader)
    await db_session.flush()

    check = KybCheck(
        org_id=org.id,
        check_type=KybCheckType.BUSINESS_REGISTRATION.value,
        status=KybCheckStatus.FLAGGED.value,
        detail="org/some-key/certificate.pdf",
        uploaded_by=uploader.id,
        ai_summary="The organization name on the document does not clearly match.",
        document_content_type="application/pdf",
    )
    db_session.add(check)
    await db_session.commit()

    (fetched,) = (await db_session.execute(select(KybCheck).where(KybCheck.id == check.id))).scalars().all()
    assert fetched.uploaded_by == uploader.id
    assert fetched.ai_summary == "The organization name on the document does not clearly match."
    assert fetched.document_content_type == "application/pdf"
    assert fetched.status == "FLAGGED"
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `api/venv/Scripts/python.exe -m pytest tests/test_kyb_check_model.py::test_kyb_check_upload_columns_round_trip -v` from the `api` directory.
Expected: FAIL — `KybCheck` has no `uploaded_by`/`ai_summary`/`document_content_type` attributes yet.

- [ ] **Step 4: Replace `api/app/models/kyb_check.py` with the following**

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
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    ai_summary: Mapped[str | None] = mapped_column(String, nullable=True)
    document_content_type: Mapped[str | None] = mapped_column(String, nullable=True)
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 5: Create the migration — `api/alembic/versions/0015_add_kyb_check_upload_columns.py`**

```python
"""add uploader, ai summary, and content type columns to kyb_checks

Revision ID: d1f6a9c2b3e8
Revises: c3e9b1a4d2f6
Create Date: 2026-08-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1f6a9c2b3e8'
down_revision: Union[str, None] = 'c3e9b1a4d2f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('kyb_checks', sa.Column('uploaded_by', sa.UUID(), nullable=True))
    op.add_column('kyb_checks', sa.Column('ai_summary', sa.String(), nullable=True))
    op.add_column('kyb_checks', sa.Column('document_content_type', sa.String(), nullable=True))
    op.create_foreign_key('kyb_checks_uploaded_by_fkey', 'kyb_checks', 'users', ['uploaded_by'], ['id'])


def downgrade() -> None:
    op.drop_constraint('kyb_checks_uploaded_by_fkey', 'kyb_checks', type_='foreignkey')
    op.drop_column('kyb_checks', 'document_content_type')
    op.drop_column('kyb_checks', 'ai_summary')
    op.drop_column('kyb_checks', 'uploaded_by')
```

- [ ] **Step 6: Replace `api/app/schemas/kyb_check.py` with the following**

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
    uploaded_by: uuid.UUID | None
    ai_summary: str | None
    checked_at: datetime
```

(`document_content_type` is deliberately NOT exposed here — it's an internal detail the document-download endpoint reads directly off the DB row, not part of the public check shape.)

- [ ] **Step 7: Run the test to verify it passes**

Run: `api/venv/Scripts/python.exe -m pytest tests/test_kyb_check_model.py -v` from the `api` directory.
Expected: all tests in the file PASS.

- [ ] **Step 8: Run the full backend suite**

Run: `api/venv/Scripts/python.exe -m pytest -q` from the `api` directory.
Expected: all tests pass. (`KybCheckOut` gained two required fields — every existing test asserting on a `KybCheckOut`-shaped JSON body should still pass since they only check specific keys, but confirm this by running the suite, not by assumption.)

- [ ] **Step 9: Commit**

```bash
git add api/alembic/versions/0015_add_kyb_check_upload_columns.py api/app/models/enums.py api/app/models/kyb_check.py api/app/schemas/kyb_check.py api/tests/test_kyb_check_model.py
git commit -m "Add uploader, AI summary, and FLAGGED status to KYB checks"
```

---

### Task 2: Backend — the kyc_intelligence AI-checker module

**Files:**
- Create: `api/app/kyc_intelligence/__init__.py`
- Create: `api/app/kyc_intelligence/checker.py`
- Create: `api/app/kyc_intelligence/fake_checker.py`
- Create: `api/app/kyc_intelligence/claude_checker.py`
- Create: `api/app/kyc_intelligence/dependency.py`
- Create: `api/app/kyc_intelligence/service.py`
- Create: `api/tests/test_kyc_intelligence_service.py`

**Interfaces:**
- Consumes: `KybCheckStatus.FLAGGED`, `KybCheck.ai_summary` (Task 1).
- Produces: `KybDocumentCheckResult`, `KybDocumentChecker` (protocol), `FakeKybDocumentChecker`, `ClaudeKybDocumentChecker`, `get_kyb_document_checker()`, `run_kyb_document_check(...)` — Task 3 wires all of these into the upload endpoint.

This module mirrors `api/app/document_intelligence/` exactly in structure (read that module first if you haven't — `checker.py`'s `Protocol`, `fake_checker.py`'s stub, `claude_checker.py`'s `anthropic.AsyncAnthropic` call, `dependency.py`'s API-key gate, `service.py`'s background-task function), adapted for a different question: not "does this trade document match these trade terms" but "does this look like a genuine business registration certificate for this organization."

- [ ] **Step 1: Create `api/app/kyc_intelligence/__init__.py`** (empty file, matching `document_intelligence/__init__.py`)

- [ ] **Step 2: Create `api/app/kyc_intelligence/checker.py`**

```python
from typing import Protocol

from pydantic import BaseModel


class KybDocumentCheckResult(BaseModel):
    verified: bool
    summary: str


class KybDocumentChecker(Protocol):
    async def check(self, content: bytes, org_name: str, media_type: str) -> KybDocumentCheckResult | None: ...
```

- [ ] **Step 3: Create `api/app/kyc_intelligence/fake_checker.py`**

```python
from app.kyc_intelligence.checker import KybDocumentCheckResult


class FakeKybDocumentChecker:
    async def check(self, content: bytes, org_name: str, media_type: str) -> KybDocumentCheckResult:
        return KybDocumentCheckResult(
            verified=True,
            summary="Fake checker: document accepted (stub result, no AI call made).",
        )
```

- [ ] **Step 4: Create `api/app/kyc_intelligence/claude_checker.py`**

```python
import base64

import anthropic

from app.kyc_intelligence.checker import KybDocumentCheckResult


class ClaudeKybDocumentChecker:
    def __init__(self, api_key: str) -> None:
        self._client = anthropic.AsyncAnthropic(api_key=api_key, timeout=90.0)

    async def check(self, content: bytes, org_name: str, media_type: str) -> KybDocumentCheckResult | None:
        encoded = base64.standard_b64encode(content).decode("utf-8")
        response = await self._client.messages.parse(
            model="claude-opus-5",
            max_tokens=4000,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "document",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": encoded,
                            },
                        },
                        {
                            "type": "text",
                            "text": (
                                "This document was submitted as a business registration certificate for "
                                f'the organization "{org_name}". Does it look like a genuine business '
                                "registration certificate, and does the organization name on the document "
                                f'reasonably match "{org_name}"? Set verified to true only if both hold; '
                                "otherwise false. Explain your reasoning in one or two sentences."
                            ),
                        },
                    ],
                }
            ],
            output_format=KybDocumentCheckResult,
        )
        return response.parsed_output
```

- [ ] **Step 5: Create `api/app/kyc_intelligence/dependency.py`**

```python
from app.config import settings
from app.kyc_intelligence.checker import KybDocumentChecker
from app.kyc_intelligence.claude_checker import ClaudeKybDocumentChecker
from app.kyc_intelligence.fake_checker import FakeKybDocumentChecker


def get_kyb_document_checker() -> KybDocumentChecker:
    if settings.anthropic_api_key:
        return ClaudeKybDocumentChecker(api_key=settings.anthropic_api_key)
    return FakeKybDocumentChecker()
```

- [ ] **Step 6: Create `api/app/kyc_intelligence/service.py`**

```python
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.kyc_intelligence.checker import KybDocumentChecker
from app.models.enums import KybCheckStatus
from app.models.kyb_check import KybCheck

logger = logging.getLogger(__name__)


async def run_kyb_document_check(
    check_id: uuid.UUID,
    content: bytes,
    org_name: str,
    session_factory: async_sessionmaker,
    checker: KybDocumentChecker,
    media_type: str,
) -> None:
    try:
        result = await checker.check(content, org_name, media_type)
    except Exception:
        logger.exception("KYB document AI check failed for check %s", check_id)
        result = None

    async with session_factory() as db:
        check = await db.get(KybCheck, check_id)
        if result is None:
            check.status = KybCheckStatus.FLAGGED.value
            check.ai_summary = "AI check could not be completed automatically. Manual review required."
        elif result.verified:
            check.status = KybCheckStatus.PASSED.value
            check.ai_summary = result.summary
        else:
            check.status = KybCheckStatus.FLAGGED.value
            check.ai_summary = result.summary
        check.checked_at = datetime.now(timezone.utc)
        await db.commit()
```

- [ ] **Step 7: Write tests — create `api/tests/test_kyc_intelligence_service.py`**

```python
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.kyc_intelligence.checker import KybDocumentCheckResult
from app.kyc_intelligence.service import run_kyb_document_check
from app.models.enums import KybCheckStatus, KybCheckType
from app.models.kyb_check import KybCheck
from app.models.organization import Organization


class StubVerifiedChecker:
    async def check(self, content, org_name, media_type):
        return KybDocumentCheckResult(verified=True, summary="Looks genuine.")


class StubUnverifiedChecker:
    async def check(self, content, org_name, media_type):
        return KybDocumentCheckResult(verified=False, summary="Org name does not match.")


class StubNoneChecker:
    async def check(self, content, org_name, media_type):
        return None


class StubFailingChecker:
    async def check(self, content, org_name, media_type):
        raise RuntimeError("boom")


async def _make_check(db_session) -> KybCheck:
    org = Organization(name="Test Org", org_type="EXPORTER", country="India", industry="Pharmaceuticals", tax_id="TAX-SVC-1")
    db_session.add(org)
    await db_session.flush()
    check = KybCheck(org_id=org.id, check_type=KybCheckType.BUSINESS_REGISTRATION.value, status=KybCheckStatus.PENDING.value)
    db_session.add(check)
    await db_session.commit()
    return check


def _session_factory_for(db_session) -> async_sessionmaker:
    return async_sessionmaker(bind=db_session.bind, expire_on_commit=False, join_transaction_mode="create_savepoint")


async def test_run_kyb_document_check_passes_when_verified(db_session):
    check = await _make_check(db_session)
    session_factory = _session_factory_for(db_session)

    await run_kyb_document_check(check.id, b"bytes", "Test Org", session_factory, StubVerifiedChecker(), "application/pdf")

    (updated,) = (await db_session.execute(select(KybCheck).where(KybCheck.id == check.id))).scalars().all()
    assert updated.status == "PASSED"
    assert updated.ai_summary == "Looks genuine."
    assert updated.checked_at is not None


async def test_run_kyb_document_check_flags_when_unverified(db_session):
    check = await _make_check(db_session)
    session_factory = _session_factory_for(db_session)

    await run_kyb_document_check(check.id, b"bytes", "Test Org", session_factory, StubUnverifiedChecker(), "application/pdf")

    (updated,) = (await db_session.execute(select(KybCheck).where(KybCheck.id == check.id))).scalars().all()
    assert updated.status == "FLAGGED"
    assert updated.ai_summary == "Org name does not match."


async def test_run_kyb_document_check_flags_when_result_is_none(db_session):
    check = await _make_check(db_session)
    session_factory = _session_factory_for(db_session)

    await run_kyb_document_check(check.id, b"bytes", "Test Org", session_factory, StubNoneChecker(), "application/pdf")

    (updated,) = (await db_session.execute(select(KybCheck).where(KybCheck.id == check.id))).scalars().all()
    assert updated.status == "FLAGGED"
    assert updated.ai_summary == "AI check could not be completed automatically. Manual review required."


async def test_run_kyb_document_check_flags_when_checker_raises(db_session):
    check = await _make_check(db_session)
    session_factory = _session_factory_for(db_session)

    await run_kyb_document_check(check.id, b"bytes", "Test Org", session_factory, StubFailingChecker(), "application/pdf")

    (updated,) = (await db_session.execute(select(KybCheck).where(KybCheck.id == check.id))).scalars().all()
    assert updated.status == "FLAGGED"
```

- [ ] **Step 8: Run the new tests**

Run: `api/venv/Scripts/python.exe -m pytest tests/test_kyc_intelligence_service.py -v` from the `api` directory.
Expected: all 4 tests PASS.

- [ ] **Step 9: Run the full backend suite**

Run: `api/venv/Scripts/python.exe -m pytest -q` from the `api` directory.
Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add api/app/kyc_intelligence/ api/tests/test_kyc_intelligence_service.py
git commit -m "Add the kyc_intelligence AI document-checking module"
```

---

### Task 3: Backend — wire the AI check into the upload endpoint

**Files:**
- Modify: `api/app/routers/organizations.py`
- Modify: `api/tests/conftest.py`
- Modify: `api/tests/test_organizations_endpoints.py`

**Interfaces:**
- Consumes: `run_kyb_document_check`, `get_kyb_document_checker`, `KybDocumentChecker` (Task 2).
- Produces: `POST /organizations/{org_id}/kyb-checks/business-registration-document` now returns a `PENDING` check immediately and resolves to `PASSED`/`FLAGGED` asynchronously — Task 8/9 (the admin review page) and the `/kyc`-page fix task both depend on this async shape.

- [ ] **Step 1: Add the checker override to the shared test fixture — in `api/tests/conftest.py`, add two imports and one override line**

Add these imports alongside the existing `document_intelligence` ones:

```python
from app.kyc_intelligence.dependency import get_kyb_document_checker
from app.kyc_intelligence.fake_checker import FakeKybDocumentChecker
```

In the `async_client` fixture, add this line right after `app.dependency_overrides[get_document_checker] = lambda: FakeDocumentChecker()`:

```python
    app.dependency_overrides[get_kyb_document_checker] = lambda: FakeKybDocumentChecker()
```

(Without this, every test that uploads a business registration document would attempt a real Claude API call.)

- [ ] **Step 2: Write the failing tests — in `api/tests/test_organizations_endpoints.py`, replace `test_upload_business_registration_document_passes_the_check` (the whole function) with**

```python
async def test_upload_business_registration_document_is_auto_approved_by_ai(async_client):
    org_id, token = await _signup_and_login(async_client, "kyc-upload-1@example.com")

    response = await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("certificate.pdf", b"fake certificate bytes", "application/pdf")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["check_type"] == "BUSINESS_REGISTRATION"
    assert body["detail"].startswith(f"org/{org_id}/")
    assert get_bytes(body["detail"]) == b"fake certificate bytes"

    checks_response = await async_client.get(
        f"/organizations/{org_id}/kyb-checks", headers={"Authorization": f"Bearer {token}"}
    )
    business_registration = next(c for c in checks_response.json() if c["check_type"] == "BUSINESS_REGISTRATION")
    assert business_registration["status"] == "PASSED"
    assert business_registration["uploaded_by"] is not None
    assert business_registration["ai_summary"] is not None
    assert business_registration["checked_at"] is not None
```

Then append these three new tests at the end of the file:

```python
async def test_upload_business_registration_document_is_flagged_when_ai_does_not_verify(async_client):
    from app.kyc_intelligence.checker import KybDocumentCheckResult
    from app.kyc_intelligence.dependency import get_kyb_document_checker
    from app.main import app

    class StubUnverifiedChecker:
        async def check(self, content, org_name, media_type):
            return KybDocumentCheckResult(verified=False, summary="The organization name on the document does not match.")

    app.dependency_overrides[get_kyb_document_checker] = lambda: StubUnverifiedChecker()
    try:
        org_id, token = await _signup_and_login(async_client, "kyc-upload-9@example.com")
        await async_client.post(
            f"/organizations/{org_id}/kyb-checks/business-registration-document",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("certificate.pdf", b"fake certificate bytes", "application/pdf")},
        )

        checks_response = await async_client.get(
            f"/organizations/{org_id}/kyb-checks", headers={"Authorization": f"Bearer {token}"}
        )
        business_registration = next(c for c in checks_response.json() if c["check_type"] == "BUSINESS_REGISTRATION")
        assert business_registration["status"] == "FLAGGED"
        assert business_registration["ai_summary"] == "The organization name on the document does not match."
    finally:
        app.dependency_overrides.pop(get_kyb_document_checker, None)


async def test_upload_business_registration_document_is_flagged_when_ai_check_fails(async_client):
    from app.kyc_intelligence.dependency import get_kyb_document_checker
    from app.main import app

    class StubFailingChecker:
        async def check(self, content, org_name, media_type):
            raise RuntimeError("boom")

    app.dependency_overrides[get_kyb_document_checker] = lambda: StubFailingChecker()
    try:
        org_id, token = await _signup_and_login(async_client, "kyc-upload-10@example.com")
        await async_client.post(
            f"/organizations/{org_id}/kyb-checks/business-registration-document",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("certificate.pdf", b"fake certificate bytes", "application/pdf")},
        )

        checks_response = await async_client.get(
            f"/organizations/{org_id}/kyb-checks", headers={"Authorization": f"Bearer {token}"}
        )
        business_registration = next(c for c in checks_response.json() if c["check_type"] == "BUSINESS_REGISTRATION")
        assert business_registration["status"] == "FLAGGED"
    finally:
        app.dependency_overrides.pop(get_kyb_document_checker, None)


async def test_upload_business_registration_document_allows_retry_after_flagged(async_client):
    from app.kyc_intelligence.checker import KybDocumentCheckResult
    from app.kyc_intelligence.dependency import get_kyb_document_checker
    from app.main import app

    class StubUnverifiedChecker:
        async def check(self, content, org_name, media_type):
            return KybDocumentCheckResult(verified=False, summary="Needs review.")

    app.dependency_overrides[get_kyb_document_checker] = lambda: StubUnverifiedChecker()
    try:
        org_id, token = await _signup_and_login(async_client, "kyc-upload-11@example.com")
        await async_client.post(
            f"/organizations/{org_id}/kyb-checks/business-registration-document",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("certificate.pdf", b"fake certificate bytes", "application/pdf")},
        )
    finally:
        app.dependency_overrides.pop(get_kyb_document_checker, None)

    # The check is now FLAGGED. A fresh upload with the default (auto-verifying) fake
    # checker should be accepted and re-processed rather than rejected.
    response = await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("certificate2.pdf", b"other bytes", "application/pdf")},
    )
    assert response.status_code == 200

    checks_response = await async_client.get(
        f"/organizations/{org_id}/kyb-checks", headers={"Authorization": f"Bearer {token}"}
    )
    business_registration = next(c for c in checks_response.json() if c["check_type"] == "BUSINESS_REGISTRATION")
    assert business_registration["status"] == "PASSED"
```

Every other existing test in this file (`test_upload_business_registration_document_requires_auth`, `_rejects_other_orgs_members`, `_rejects_shared_trade_participant`, `_rejects_already_passed`, `_sanitizes_a_path_traversal_filename`, `_rejects_oversized_file`, `_rejects_disallowed_content_type`) is unaffected by this task's change and needs no edits — each of them fails (or returns synchronously-set fields like `detail`) before the AI check ever matters. `_rejects_already_passed`'s first upload still reaches `PASSED` before its second `POST` runs, because the background task (using the fake checker, which the fixture now overrides to auto-verify) completes synchronously within the test's single event loop — the same behavior already relied on by `test_uploaded_document_is_verified_compliant_by_the_background_check` in `test_documents_endpoints.py`.

- [ ] **Step 3: Run the tests to see them fail**

Run: `api/venv/Scripts/python.exe -m pytest tests/test_organizations_endpoints.py -v -k business_registration_document` from the `api` directory.
Expected: FAIL — the endpoint still synchronously sets `PASSED` and has no AI wiring yet.

- [ ] **Step 4: Replace the top of `api/app/routers/organizations.py` (imports) and the `upload_business_registration_document` function with the following**

Replace the import block (everything from `import uuid` through `from app.storage import upload_bytes`) with:

```python
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.access import user_can_access_org
from app.auth.dependencies import get_current_user
from app.db import get_db, get_session_factory
from app.kyc_intelligence.checker import KybDocumentChecker
from app.kyc_intelligence.dependency import get_kyb_document_checker
from app.kyc_intelligence.service import run_kyb_document_check
from app.models.enums import KybCheckStatus, KybCheckType
from app.models.kyb_check import KybCheck
from app.models.organization import Organization
from app.models.user import User
from app.schemas.kyb_check import KybCheckOut
from app.schemas.organization import OrganizationOut
from app.storage import upload_bytes
```

Replace the `upload_business_registration_document` function (keep `list_organizations`, `get_organization`, `get_organization_kyb_checks`, `MAX_BUSINESS_REGISTRATION_DOCUMENT_SIZE`, and `_is_allowed_document_content_type` exactly as they are) with:

```python
@router.post("/{org_id}/kyb-checks/business-registration-document", response_model=KybCheckOut)
async def upload_business_registration_document(
    org_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    session_factory: async_sessionmaker = Depends(get_session_factory),
    checker: KybDocumentChecker = Depends(get_kyb_document_checker),
) -> KybCheckOut:
    if current_user.org_id != org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    org = await db.get(Organization, org_id)
    if org is None:
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
    content_type = file.content_type or "application/octet-stream"
    upload_bytes(object_key, content, content_type)

    check.detail = object_key
    check.uploaded_by = current_user.id
    check.document_content_type = content_type
    check.status = KybCheckStatus.PENDING.value
    await db.commit()
    await db.refresh(check)

    background_tasks.add_task(
        run_kyb_document_check,
        check.id,
        content,
        org.name,
        session_factory,
        checker,
        content_type,
    )

    return check
```

Note the `from datetime import datetime, timezone` import is dropped entirely here: it was only ever used for the synchronous `checked_at` assignment this task removes (that responsibility now lives in `run_kyb_document_check`), and nothing else in `organizations.py` uses `datetime`/`timezone`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `api/venv/Scripts/python.exe -m pytest tests/test_organizations_endpoints.py -v` from the `api` directory.
Expected: all tests in the file PASS.

- [ ] **Step 6: Run the full backend suite**

Run: `api/venv/Scripts/python.exe -m pytest -q` from the `api` directory.
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add api/app/routers/organizations.py api/tests/conftest.py api/tests/test_organizations_endpoints.py
git commit -m "Run an AI check after business registration document upload"
```

---

### Task 4: Backend — admin endpoints to list, decide, and view business registration checks

**Files:**
- Modify: `api/app/schemas/admin.py`
- Modify: `api/app/routers/admin.py`
- Modify: `api/tests/test_admin_endpoints.py`

**Interfaces:**
- Consumes: `KybCheckStatus.FLAGGED`, `KybCheck.uploaded_by`/`ai_summary`/`document_content_type` (Task 1).
- Produces: `GET /admin/kyb-checks/business-registration`, `PATCH /admin/kyb-checks/{check_id}/decision`, `GET /admin/kyb-checks/{check_id}/document` — Task 8/9 (`admin-web`) consume all three exactly.

- [ ] **Step 1: Write the failing tests — extend `api/tests/test_admin_endpoints.py`**

In the existing `test_non_admin_gets_403_from_admin_routes` test, insert this block right before the existing `# Test GET /admin/trades` block:

```python
    # Test GET /admin/kyb-checks/business-registration
    response = await async_client.get(
        "/admin/kyb-checks/business-registration", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403

    # Test PATCH /admin/kyb-checks/{id}/decision
    response = await async_client.patch(
        "/admin/kyb-checks/00000000-0000-0000-0000-000000000000/decision",
        json={"status": "PASSED"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403

    # Test GET /admin/kyb-checks/{id}/document
    response = await async_client.get(
        "/admin/kyb-checks/00000000-0000-0000-0000-000000000000/document",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403
```

Then append these tests at the end of the file:

```python
async def test_admin_can_list_business_registration_checks(async_client, monkeypatch):
    org_id, token = await _signup_and_login(async_client, "kyc-review-1@example.com")
    await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("certificate.pdf", b"fake certificate bytes", "application/pdf")},
    )
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.get(
        "/admin/kyb-checks/business-registration", headers={"Authorization": f"Bearer {admin_token}"}
    )

    assert response.status_code == 200
    checks = response.json()
    assert {c["check_type"] for c in checks} == {"BUSINESS_REGISTRATION"}
    assert org_id in {c["org_id"] for c in checks}


async def test_admin_can_approve_a_flagged_check(async_client, monkeypatch):
    from app.kyc_intelligence.checker import KybDocumentCheckResult
    from app.kyc_intelligence.dependency import get_kyb_document_checker
    from app.main import app

    class StubUnverifiedChecker:
        async def check(self, content, org_name, media_type):
            return KybDocumentCheckResult(verified=False, summary="Needs review.")

    app.dependency_overrides[get_kyb_document_checker] = lambda: StubUnverifiedChecker()
    try:
        org_id, token = await _signup_and_login(async_client, "kyc-review-2@example.com")
        await async_client.post(
            f"/organizations/{org_id}/kyb-checks/business-registration-document",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("certificate.pdf", b"fake certificate bytes", "application/pdf")},
        )
    finally:
        app.dependency_overrides.pop(get_kyb_document_checker, None)

    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)
    list_response = await async_client.get(
        "/admin/kyb-checks/business-registration", headers={"Authorization": f"Bearer {admin_token}"}
    )
    check_id = next(c["id"] for c in list_response.json() if c["org_id"] == org_id)

    response = await async_client.patch(
        f"/admin/kyb-checks/{check_id}/decision",
        json={"status": "PASSED"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "PASSED"


async def test_admin_can_reject_a_flagged_check(async_client, monkeypatch):
    org_id, token = await _signup_and_login(async_client, "kyc-review-3@example.com")
    await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("certificate.pdf", b"fake certificate bytes", "application/pdf")},
    )
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)
    list_response = await async_client.get(
        "/admin/kyb-checks/business-registration", headers={"Authorization": f"Bearer {admin_token}"}
    )
    check_id = next(c["id"] for c in list_response.json() if c["org_id"] == org_id)

    response = await async_client.patch(
        f"/admin/kyb-checks/{check_id}/decision",
        json={"status": "FAILED"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "FAILED"


async def test_admin_decision_rejects_non_business_registration_check(async_client, monkeypatch):
    org_id, token = await _signup_and_login(async_client, "kyc-review-4@example.com")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)
    checks_response = await async_client.get(
        f"/organizations/{org_id}/kyb-checks", headers={"Authorization": f"Bearer {token}"}
    )
    sanctions_check_id = next(c["id"] for c in checks_response.json() if c["check_type"] == "SANCTIONS_SCREENING")

    response = await async_client.patch(
        f"/admin/kyb-checks/{sanctions_check_id}/decision",
        json={"status": "FAILED"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 400


async def test_admin_can_download_the_uploaded_document(async_client, monkeypatch):
    org_id, token = await _signup_and_login(async_client, "kyc-review-5@example.com")
    await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("certificate.pdf", b"fake certificate bytes", "application/pdf")},
    )
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)
    list_response = await async_client.get(
        "/admin/kyb-checks/business-registration", headers={"Authorization": f"Bearer {admin_token}"}
    )
    check_id = next(c["id"] for c in list_response.json() if c["org_id"] == org_id)

    response = await async_client.get(
        f"/admin/kyb-checks/{check_id}/document", headers={"Authorization": f"Bearer {admin_token}"}
    )

    assert response.status_code == 200
    assert response.content == b"fake certificate bytes"
    assert response.headers["content-type"] == "application/pdf"


async def test_admin_document_download_404s_when_nothing_uploaded(async_client, monkeypatch):
    org_id, token = await _signup_and_login(async_client, "kyc-review-6@example.com")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)
    checks_response = await async_client.get(
        f"/organizations/{org_id}/kyb-checks", headers={"Authorization": f"Bearer {token}"}
    )
    business_registration_check_id = next(
        c["id"] for c in checks_response.json() if c["check_type"] == "BUSINESS_REGISTRATION"
    )

    response = await async_client.get(
        f"/admin/kyb-checks/{business_registration_check_id}/document",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 404
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `api/venv/Scripts/python.exe -m pytest tests/test_admin_endpoints.py -v` from the `api` directory.
Expected: FAIL — the routes don't exist yet.

- [ ] **Step 3: In `api/app/schemas/admin.py`, add the new schema at the end of the file**

```python
from typing import Literal


class AdminKybCheckDecision(BaseModel):
    status: Literal["PASSED", "FAILED"]
```

(Add `from typing import Literal` as the first import line of the file, above `import uuid`.)

- [ ] **Step 4: Update the imports in `api/app/routers/admin.py`**

Replace:
```python
from fastapi import APIRouter, Depends, HTTPException, status
```
with:
```python
from fastapi import APIRouter, Depends, HTTPException, Response, status
```

Replace:
```python
from app.models.enums import UserRole, UserStatus
```
with:
```python
from app.models.enums import KybCheckType, UserRole, UserStatus
```

Replace:
```python
from app.schemas.admin import (
    AdminBootstrapRequest,
    AdminKybStatusUpdate,
    AdminUserCreate,
    AdminUserStatusUpdate,
    AdminUserUpdate,
)
```
with:
```python
from app.schemas.admin import (
    AdminBootstrapRequest,
    AdminKybCheckDecision,
    AdminKybStatusUpdate,
    AdminUserCreate,
    AdminUserStatusUpdate,
    AdminUserUpdate,
)
```

Add one new import line, right after `from app.schemas.trade import TradeOut`:
```python
from app.storage import get_bytes
```

- [ ] **Step 5: Add the three new endpoints at the end of `api/app/routers/admin.py`, after `list_all_trades`**

```python
@router.get(
    "/kyb-checks/business-registration",
    response_model=list[KybCheckOut],
    dependencies=[Depends(require_admin)],
)
async def list_business_registration_checks(db: AsyncSession = Depends(get_db)) -> list[KybCheck]:
    result = await db.execute(
        select(KybCheck)
        .where(KybCheck.check_type == KybCheckType.BUSINESS_REGISTRATION.value)
        .order_by(KybCheck.checked_at.desc())
    )
    return list(result.scalars().all())


@router.patch(
    "/kyb-checks/{check_id}/decision",
    response_model=KybCheckOut,
    dependencies=[Depends(require_admin)],
)
async def decide_kyb_check(
    check_id: uuid.UUID, payload: AdminKybCheckDecision, db: AsyncSession = Depends(get_db)
) -> KybCheck:
    check = await db.get(KybCheck, check_id)
    if check is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KYB check not found")
    if check.check_type != KybCheckType.BUSINESS_REGISTRATION.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only business registration checks can be manually decided",
        )
    check.status = payload.status
    check.checked_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(check)
    return check


@router.get("/kyb-checks/{check_id}/document", dependencies=[Depends(require_admin)])
async def get_kyb_check_document(check_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Response:
    check = await db.get(KybCheck, check_id)
    if check is None or check.detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    content = get_bytes(check.detail)
    return Response(content=content, media_type=check.document_content_type or "application/octet-stream")
```

This task also needs `from datetime import datetime, timezone` added as the first import line of `api/app/routers/admin.py` (for `decide_kyb_check`'s `checked_at` update) — it isn't there yet.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `api/venv/Scripts/python.exe -m pytest tests/test_admin_endpoints.py -v` from the `api` directory.
Expected: all tests in the file PASS.

- [ ] **Step 7: Run the full backend suite**

Run: `api/venv/Scripts/python.exe -m pytest -q` from the `api` directory.
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add api/app/schemas/admin.py api/app/routers/admin.py api/tests/test_admin_endpoints.py
git commit -m "Add admin endpoints to list, decide, and view business registration checks"
```

---

### Task 5: Frontend (main web app) — propagate FLAGGED and the new KybCheck fields

**Files:**
- Modify: `web/src/api/types.ts`
- Modify: `web/src/lib/statusTones.ts`
- Modify: `web/src/lib/statusTones.test.ts`

**Interfaces:**
- Consumes: `KybCheckStatus.FLAGGED`, `KybCheckOut.uploaded_by`/`ai_summary` (Task 1).

**Why this task exists:** Same reasoning as the earlier `SUSPENDED`-propagation task in this codebase's history: `web/src/lib/statusTones.ts`'s `kybCheckStatusInfo` is typed as `Record<KybCheckStatus, StatusInfo>`, and three pages (`KycPage.tsx`, `ProfilePage.tsx`, `OrganizationProfilePage.tsx`) call it with no null check. Once the backend can return `FLAGGED`, this map must cover it or those pages break.

- [ ] **Step 1: Write the failing test — in `web/src/lib/statusTones.test.ts`, replace the `kybCheckStatusInfo` test**

```typescript
describe('kybCheckStatusInfo', () => {
  it('maps every KybCheckStatus value to a tone and label', () => {
    expect(kybCheckStatusInfo('PASSED')).toEqual({ tone: 'positive', label: 'Passed' });
    expect(kybCheckStatusInfo('PENDING')).toEqual({ tone: 'warning', label: 'Pending' });
    expect(kybCheckStatusInfo('FAILED')).toEqual({ tone: 'negative', label: 'Failed' });
    expect(kybCheckStatusInfo('FLAGGED')).toEqual({ tone: 'warning', label: 'Needs review' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/statusTones.test.ts` from the `web` directory.
Expected: FAIL — `'FLAGGED'` isn't a valid `KybCheckStatus` yet, so this won't even compile.

- [ ] **Step 3: Update the types — in `web/src/api/types.ts`, replace the `KybCheckStatus` line and the `KybCheck` interface**

```typescript
export type KybCheckStatus = 'PASSED' | 'PENDING' | 'FAILED' | 'FLAGGED';
```

```typescript
export interface KybCheck {
  id: string;
  org_id: string;
  check_type: KybCheckType;
  status: KybCheckStatus;
  detail: string | null;
  uploaded_by: string | null;
  ai_summary: string | null;
  checked_at: string;
}
```

- [ ] **Step 4: Add the mapping — in `web/src/lib/statusTones.ts`, replace the `kybCheckStatusInfo` function**

```typescript
export function kybCheckStatusInfo(status: KybCheckStatus): StatusInfo {
  const map: Record<KybCheckStatus, StatusInfo> = {
    PASSED: { tone: 'positive', label: 'Passed' },
    PENDING: { tone: 'warning', label: 'Pending' },
    FAILED: { tone: 'negative', label: 'Failed' },
    FLAGGED: { tone: 'warning', label: 'Needs review' },
  };
  return map[status];
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/statusTones.test.ts` from the `web` directory.
Expected: PASS.

- [ ] **Step 6: Run the full frontend suite**

Run: `npx vitest run` from the `web` directory.
Expected: all tests pass. (Fixtures elsewhere that build a `KybCheck` object literal now need `uploaded_by`/`ai_summary` fields to satisfy the type — Task 6 handles the one file that needs this, `KycPage.test.tsx`; if `tsc` surfaces any other file, that means a fixture was missed and must be fixed here too.)

Run: `npx tsc --noEmit` from the `web` directory to confirm no type errors before moving on.

- [ ] **Step 7: Commit**

```bash
git add web/src/api/types.ts web/src/lib/statusTones.ts web/src/lib/statusTones.test.ts
git commit -m "Propagate FLAGGED and the new KybCheck fields to the main web app"
```

---

### Task 6: Frontend (main web app) — fix the /kyc page's upload-form gating

**Files:**
- Modify: `web/src/pages/KycPage.tsx`
- Modify: `web/src/pages/KycPage.test.tsx`

**Interfaces:**
- Consumes: `KybCheck.uploaded_by`/`ai_summary` (Task 5), the async upload behavior from Task 3 (the endpoint no longer synchronously returns `PASSED`).

**The bug being fixed:** today, `needsDocument = businessRegistrationCheck?.status === 'PENDING'`. After Task 3, a freshly-uploaded, still-AI-checking document also has `status === 'PENDING'` (that's the new "please wait" state) — so the upload form would incorrectly reappear and invite a second upload while the first is still being checked. The fix must distinguish "no document yet" from "document on file, still being checked."

- [ ] **Step 1: Write the failing tests — replace `web/src/pages/KycPage.test.tsx` with the following**

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

const noDocumentYetChecks: KybCheck[] = [
  { id: 'k-1', org_id: 'o-1', check_type: 'BUSINESS_REGISTRATION', status: 'PENDING', detail: null, uploaded_by: null, ai_summary: null, checked_at: '2026-01-01T00:00:00Z' },
  { id: 'k-2', org_id: 'o-1', check_type: 'SANCTIONS_SCREENING', status: 'PASSED', detail: 'fake:CLEAR', uploaded_by: null, ai_summary: null, checked_at: '2026-01-01T00:00:00Z' },
  { id: 'k-3', org_id: 'o-1', check_type: 'BANK_ACCOUNT', status: 'PASSED', detail: null, uploaded_by: null, ai_summary: null, checked_at: '2026-01-01T00:00:00Z' },
];

const awaitingAiChecks: KybCheck[] = [
  { ...noDocumentYetChecks[0], status: 'PENDING', detail: 'org/o-1/abc-certificate.pdf', uploaded_by: 'u-1' },
  noDocumentYetChecks[1],
  noDocumentYetChecks[2],
];

const flaggedChecks: KybCheck[] = [
  { ...noDocumentYetChecks[0], status: 'FLAGGED', detail: 'org/o-1/abc-certificate.pdf', uploaded_by: 'u-1', ai_summary: 'Org name does not match.' },
  noDocumentYetChecks[1],
  noDocumentYetChecks[2],
];

const rejectedChecks: KybCheck[] = [
  { ...noDocumentYetChecks[0], status: 'FAILED', detail: 'org/o-1/abc-certificate.pdf', uploaded_by: 'u-1', ai_summary: 'Not a valid certificate.' },
  noDocumentYetChecks[1],
  noDocumentYetChecks[2],
];

const passedChecks: KybCheck[] = [
  { ...noDocumentYetChecks[0], status: 'PASSED', detail: 'org/o-1/abc-certificate.pdf', uploaded_by: 'u-1', ai_summary: 'Looks genuine.' },
  noDocumentYetChecks[1],
  noDocumentYetChecks[2],
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
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(noDocumentYetChecks);

    renderPage();

    expect(await screen.findByText('Clear')).toBeInTheDocument();
    expect(screen.getByText('BUSINESS_REGISTRATION')).toBeInTheDocument();
    expect(screen.getByText('SANCTIONS_SCREENING')).toBeInTheDocument();
    expect(screen.getByText('BANK_ACCOUNT')).toBeInTheDocument();
  });

  it('shows the upload form when no document has been submitted yet', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(noDocumentYetChecks);

    renderPage();

    expect(await screen.findByText('Upload business registration certificate')).toBeInTheDocument();
  });

  it('hides the upload form and shows a review message while the AI check is still pending', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(awaitingAiChecks);

    renderPage();

    expect(await screen.findByText(/your document is being reviewed/i)).toBeInTheDocument();
    expect(screen.queryByText('Upload business registration certificate')).not.toBeInTheDocument();
  });

  it('hides the upload form and shows a needs-review message when the AI flags it', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(flaggedChecks);

    renderPage();

    expect(await screen.findByText(/needs additional review/i)).toBeInTheDocument();
    expect(screen.queryByText('Upload business registration certificate')).not.toBeInTheDocument();
  });

  it('re-shows the upload form with a rejection notice when the document was rejected', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(rejectedChecks);

    renderPage();

    expect(await screen.findByText('Upload business registration certificate')).toBeInTheDocument();
    expect(screen.getByText(/was rejected/i)).toBeInTheDocument();
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
      .mockResolvedValueOnce(noDocumentYetChecks)
      .mockResolvedValueOnce(awaitingAiChecks);
    const uploadSpy = vi.spyOn(organizationsApi, 'uploadBusinessRegistrationDocument').mockResolvedValue(awaitingAiChecks[0]);

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
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(noDocumentYetChecks);
    const uploadSpy = vi.spyOn(organizationsApi, 'uploadBusinessRegistrationDocument');

    renderPage();

    await screen.findByText('Upload business registration certificate');
    await userEvent.click(screen.getByRole('button', { name: /upload certificate/i }));

    expect(await screen.findByText(/please choose a file/i)).toBeInTheDocument();
    expect(uploadSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/pages/KycPage.test.tsx` from the `web` directory.
Expected: FAIL — the current gating (`status === 'PENDING'`) shows the upload form for `awaitingAiChecks` too, and there's no "needs additional review"/"was rejected" messaging yet.

- [ ] **Step 3: Replace `web/src/pages/KycPage.tsx` with the following**

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
  const hasDocumentOnFile = businessRegistrationCheck?.detail != null;
  const needsDocument =
    businessRegistrationCheck != null &&
    businessRegistrationCheck.status !== 'PASSED' &&
    (!hasDocumentOnFile || businessRegistrationCheck.status === 'FAILED');
  const awaitingReview =
    businessRegistrationCheck != null &&
    hasDocumentOnFile &&
    (businessRegistrationCheck.status === 'PENDING' || businessRegistrationCheck.status === 'FLAGGED');

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

      {awaitingReview && (
        <Panel className="max-w-md">
          <p className="text-sm text-ink-soft">
            {businessRegistrationCheck!.status === 'FLAGGED'
              ? 'Your document needs additional review by our team.'
              : 'Your document is being reviewed.'}
          </p>
        </Panel>
      )}

      {needsDocument && (
        <Panel title="Upload business registration certificate" className="max-w-md">
          {businessRegistrationCheck?.status === 'FAILED' && (
            <p className="text-sm text-block mb-3">Your previous document was rejected. Please upload a new one.</p>
          )}
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/pages/KycPage.test.tsx` from the `web` directory.
Expected: all tests PASS.

- [ ] **Step 5: Run the full frontend suite**

Run: `npx vitest run` from the `web` directory.
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/KycPage.tsx web/src/pages/KycPage.test.tsx
git commit -m "Fix the /kyc upload form to account for an in-review document"
```

---

### Task 7: Frontend (admin-web) — sidebar

**Files:**
- Modify: `admin-web/src/components/icons.tsx`
- Modify: `admin-web/src/components/AdminShell.tsx`
- Modify: `admin-web/src/components/AdminShell.test.tsx`

**Interfaces:**
- Produces: `BuildingIcon`, `UsersGroupIcon`, `ExchangeIcon`, `ShieldCheckIcon`, `LogoutIcon` (in `icons.tsx`) — used only by `AdminShell.tsx` in this task, but available to any later page. A `NavLink` to `/kyc-review` — the route itself doesn't exist until Task 9, but this task only asserts the link's `href`, not real navigation, so it's not a dangling reference within this task's own tests.

- [ ] **Step 1: Write the failing test — replace `admin-web/src/components/AdminShell.test.tsx` with the following**

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
  it('shows links to Organizations, Users, Trades, and KYC Review', () => {
    renderShell();
    expect(screen.getByRole('link', { name: /organizations/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /^users$/i })).toHaveAttribute('href', '/users');
    expect(screen.getByRole('link', { name: /trades/i })).toHaveAttribute('href', '/trades');
    expect(screen.getByRole('link', { name: /kyc review/i })).toHaveAttribute('href', '/kyc-review');
  });

  it('logs out when the log out button is clicked', async () => {
    const { store } = renderShell();
    const logoutSpy = vi.spyOn(store, 'logout');

    await userEvent.click(screen.getByRole('button', { name: /log out/i }));

    expect(logoutSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run src/components/AdminShell.test.tsx` from the `admin-web` directory.
Expected: FAIL — there is no "KYC Review" link yet.

- [ ] **Step 3: Add the new icons — append to `admin-web/src/components/icons.tsx`**

```tsx
export function BuildingIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 shrink-0">
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1" />
    </svg>
  );
}

export function UsersGroupIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 shrink-0">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c0-3.6 3-6 6.5-6s6.5 2.4 6.5 6" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M15 20c0-2.5 1-4.4 3-5.2" />
    </svg>
  );
}

export function ExchangeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 shrink-0">
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  );
}

export function ShieldCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 shrink-0">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 shrink-0">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
```

- [ ] **Step 4: Replace `admin-web/src/components/AdminShell.tsx` with the following**

```tsx
import { NavLink, Outlet } from 'react-router-dom';

import { useAuthStore } from '../stores/AuthContext';
import { BuildingIcon, ExchangeIcon, LogoutIcon, ShieldCheckIcon, UsersGroupIcon } from './icons';

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return `flex items-center gap-2.5 px-3 py-2 rounded text-[13.5px] font-medium ${
    isActive ? 'bg-seal text-white' : 'text-ink-soft hover:bg-line-soft hover:text-ink'
  }`;
}

export function AdminShell() {
  const auth = useAuthStore();

  return (
    <div className="flex min-h-screen">
      <aside className="w-[220px] shrink-0 bg-paper-2 border-r border-line flex flex-col">
        <div className="px-6 py-5 border-b border-line font-serif font-bold text-[15px]">Trade Ledger — Admin</div>
        <nav className="flex-1 flex flex-col gap-1 px-3 py-4">
          <NavLink to="/" end className={navLinkClassName}>
            <BuildingIcon />
            Organizations
          </NavLink>
          <NavLink to="/users" className={navLinkClassName}>
            <UsersGroupIcon />
            Users
          </NavLink>
          <NavLink to="/trades" className={navLinkClassName}>
            <ExchangeIcon />
            Trades
          </NavLink>
          <NavLink to="/kyc-review" className={navLinkClassName}>
            <ShieldCheckIcon />
            KYC Review
          </NavLink>
        </nav>
        <div className="px-3 py-4 border-t border-line">
          <button
            onClick={() => auth.logout()}
            className="flex items-center gap-2.5 px-3 py-2 rounded text-[13.5px] font-medium text-ink-soft hover:bg-line-soft hover:text-ink w-full"
          >
            <LogoutIcon />
            Log out
          </button>
        </div>
      </aside>
      <div className="flex-1 px-8 py-8 bg-paper">
        <Outlet />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/AdminShell.test.tsx` from the `admin-web` directory.
Expected: PASS.

- [ ] **Step 6: Run the full admin-web suite**

Run: `npx vitest run` from the `admin-web` directory.
Expected: all tests pass. (This changes `AdminShell`'s top-level DOM structure — if any other test asserts on the outer layout, re-check it here.)

- [ ] **Step 7: Commit**

```bash
git add admin-web/src/components/icons.tsx admin-web/src/components/AdminShell.tsx admin-web/src/components/AdminShell.test.tsx
git commit -m "Replace the top nav bar with a left sidebar, add a KYC Review link"
```

---

### Task 8: Frontend (admin-web) — foundational plumbing for the KYC review page

**Files:**
- Modify: `admin-web/src/api/types.ts`
- Modify: `admin-web/src/api/client.ts`
- Modify: `admin-web/src/api/admin.ts`
- Modify: `admin-web/src/lib/statusTones.ts`
- Modify: `admin-web/src/lib/statusTones.test.ts`

**Interfaces:**
- Consumes: `GET /admin/kyb-checks/business-registration`, `PATCH /admin/kyb-checks/{id}/decision`, `GET /admin/kyb-checks/{id}/document` (Task 4).
- Produces: `KybCheck`/`KybCheckType`/`KybCheckStatus` types; `kybCheckStatusInfo`; `listAdminBusinessRegistrationChecks`, `decideAdminKybCheck`, `getBusinessRegistrationDocumentBlob` (all in `admin-web/src/api/admin.ts`); `apiFetchBlob` (in `client.ts`) — Task 9 consumes all of these.

`admin-web` currently has no `KybCheck` type or `kybCheckStatusInfo` at all (an earlier feature that would have used them was removed as dead code before this plan). This task adds them fresh, rather than extending something that already exists.

- [ ] **Step 1: Add the types — in `admin-web/src/api/types.ts`, add after the `UserStatus` line**

```typescript
export type KybCheckType = 'BUSINESS_REGISTRATION' | 'SANCTIONS_SCREENING' | 'BANK_ACCOUNT';
export type KybCheckStatus = 'PASSED' | 'PENDING' | 'FAILED' | 'FLAGGED';
```

Add this interface after the `Organization` interface:

```typescript
export interface KybCheck {
  id: string;
  org_id: string;
  check_type: KybCheckType;
  status: KybCheckStatus;
  detail: string | null;
  uploaded_by: string | null;
  ai_summary: string | null;
  checked_at: string;
}
```

- [ ] **Step 2: Write the failing test — in `admin-web/src/lib/statusTones.test.ts`, add an import and a new test**

Add `kybCheckStatusInfo` to the existing import line from `./statusTones`.

Append this test at the end of the file:

```typescript
describe('kybCheckStatusInfo', () => {
  it('maps every KybCheckStatus value to a tone and label', () => {
    expect(kybCheckStatusInfo('PASSED')).toEqual({ tone: 'positive', label: 'Passed' });
    expect(kybCheckStatusInfo('PENDING')).toEqual({ tone: 'warning', label: 'Pending' });
    expect(kybCheckStatusInfo('FAILED')).toEqual({ tone: 'negative', label: 'Failed' });
    expect(kybCheckStatusInfo('FLAGGED')).toEqual({ tone: 'warning', label: 'Needs review' });
  });
});
```

- [ ] **Step 3: Run the test to see it fail**

Run: `npx vitest run src/lib/statusTones.test.ts` from the `admin-web` directory.
Expected: FAIL — `kybCheckStatusInfo` doesn't exist yet.

- [ ] **Step 4: Add the function — in `admin-web/src/lib/statusTones.ts`, add after `kybStatusInfo`**

```typescript
export function kybCheckStatusInfo(status: KybCheckStatus): StatusInfo {
  const map: Record<KybCheckStatus, StatusInfo> = {
    PASSED: { tone: 'positive', label: 'Passed' },
    PENDING: { tone: 'warning', label: 'Pending' },
    FAILED: { tone: 'negative', label: 'Failed' },
    FLAGGED: { tone: 'warning', label: 'Needs review' },
  };
  return map[status];
}
```

Add `KybCheckStatus` to the type-only import from `../api/types` at the top of the file.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/statusTones.test.ts` from the `admin-web` directory.
Expected: PASS.

- [ ] **Step 6: Add a blob-fetching helper — in `admin-web/src/api/client.ts`, add after `apiFetch`**

```typescript
export async function apiFetchBlob(path: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, { headers });

  if (response.status === 401) {
    onUnauthorized();
    throw new ApiError(401, 'Unauthorized');
  }

  if (!response.ok) {
    throw new ApiError(response.status, `Request to ${path} failed with status ${response.status}`);
  }

  return response.blob();
}
```

- [ ] **Step 7: Add the new admin API functions — in `admin-web/src/api/admin.ts`, add `apiFetchBlob` to the import from `./client`, `KybCheck` to the type import from `./types`, and these three functions after `listAdminTrades`**

```typescript
export function listAdminBusinessRegistrationChecks(): Promise<KybCheck[]> {
  return apiFetch<KybCheck[]>('/admin/kyb-checks/business-registration');
}

export function decideAdminKybCheck(checkId: string, decision: 'PASSED' | 'FAILED'): Promise<KybCheck> {
  return apiFetch<KybCheck>(`/admin/kyb-checks/${checkId}/decision`, { method: 'PATCH', body: { status: decision } });
}

export function getBusinessRegistrationDocumentBlob(checkId: string): Promise<Blob> {
  return apiFetchBlob(`/admin/kyb-checks/${checkId}/document`);
}
```

- [ ] **Step 8: Run the full admin-web suite**

Run: `npx vitest run` from the `admin-web` directory.
Expected: all tests pass. Also run `npx tsc --noEmit` from `admin-web` to confirm no type errors.

- [ ] **Step 9: Commit**

```bash
git add admin-web/src/api/types.ts admin-web/src/api/client.ts admin-web/src/api/admin.ts admin-web/src/lib/statusTones.ts admin-web/src/lib/statusTones.test.ts
git commit -m "Add KYB check types, status tones, and API functions for KYC review"
```

---

### Task 9: Frontend (admin-web) — the KYC Review page

**Files:**
- Create: `admin-web/src/pages/AdminKycReviewPage.tsx`
- Create: `admin-web/src/pages/AdminKycReviewPage.test.tsx`
- Modify: `admin-web/src/App.tsx`

**Interfaces:**
- Consumes: `listAdminBusinessRegistrationChecks`, `decideAdminKybCheck`, `getBusinessRegistrationDocumentBlob`, `kybCheckStatusInfo` (Task 8); `listAdminOrganizations`, `listAdminUsers` (existing).
- Produces: route `/kyc-review` — the target the sidebar link from Task 7 already points to.

- [ ] **Step 1: Write the failing test — create `admin-web/src/pages/AdminKycReviewPage.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import * as adminApi from '../api/admin';
import type { KybCheck, Organization, User } from '../api/types';
import { AdminKycReviewPage } from './AdminKycReviewPage';

const orgs: Organization[] = [
  { id: 'o-1', name: 'Indus Exports Pvt. Ltd.', org_type: 'EXPORTER', country: 'India', industry: 'Pharmaceuticals', tax_id: 'TAX-1', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
];

const users: User[] = [
  { id: 'u-1', org_id: 'o-1', name: 'Priya Shah', email: 'priya@example.com', role: 'EXPORTER_ADMIN', status: 'ACTIVE' },
];

const flaggedCheck: KybCheck = {
  id: 'k-1',
  org_id: 'o-1',
  check_type: 'BUSINESS_REGISTRATION',
  status: 'FLAGGED',
  detail: 'org/o-1/abc-certificate.pdf',
  uploaded_by: 'u-1',
  ai_summary: 'The organization name on the document does not match.',
  checked_at: '2026-01-01T00:00:00Z',
};

const passedCheck: KybCheck = { ...flaggedCheck, id: 'k-2', status: 'PASSED', ai_summary: 'Looks genuine.' };

describe('AdminKycReviewPage', () => {
  it('lists checks, resolving org and uploader names', async () => {
    vi.spyOn(adminApi, 'listAdminBusinessRegistrationChecks').mockResolvedValue([flaggedCheck]);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
    vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);

    render(<AdminKycReviewPage />);

    expect(await screen.findByText('Indus Exports Pvt. Ltd.')).toBeInTheDocument();
    expect(screen.getByText('Priya Shah')).toBeInTheDocument();
    expect(screen.getByText('The organization name on the document does not match.')).toBeInTheDocument();
    expect(screen.getByText('Needs review')).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    vi.spyOn(adminApi, 'listAdminBusinessRegistrationChecks').mockRejectedValue(new Error('boom'));
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
    vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);

    render(<AdminKycReviewPage />);

    expect(await screen.findByText(/couldn't load kyc checks/i)).toBeInTheDocument();
  });

  it('shows Approve and Reject only for flagged checks', async () => {
    vi.spyOn(adminApi, 'listAdminBusinessRegistrationChecks').mockResolvedValue([flaggedCheck, passedCheck]);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
    vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);

    render(<AdminKycReviewPage />);
    await screen.findByText('Needs review');

    expect(screen.getAllByRole('button', { name: /approve/i })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /reject/i })).toHaveLength(1);
  });

  it('approves a flagged check', async () => {
    vi.spyOn(adminApi, 'listAdminBusinessRegistrationChecks').mockResolvedValue([flaggedCheck]);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
    vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);
    const decideSpy = vi.spyOn(adminApi, 'decideAdminKybCheck').mockResolvedValue({ ...flaggedCheck, status: 'PASSED' });

    render(<AdminKycReviewPage />);
    await screen.findByText('Needs review');

    await userEvent.click(screen.getByRole('button', { name: /approve/i }));

    expect(decideSpy).toHaveBeenCalledWith('k-1', 'PASSED');
    expect(await screen.findByText('Passed')).toBeInTheDocument();
  });

  it('rejects a flagged check', async () => {
    vi.spyOn(adminApi, 'listAdminBusinessRegistrationChecks').mockResolvedValue([flaggedCheck]);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
    vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);
    const decideSpy = vi.spyOn(adminApi, 'decideAdminKybCheck').mockResolvedValue({ ...flaggedCheck, status: 'FAILED' });

    render(<AdminKycReviewPage />);
    await screen.findByText('Needs review');

    await userEvent.click(screen.getByRole('button', { name: /reject/i }));

    expect(decideSpy).toHaveBeenCalledWith('k-1', 'FAILED');
    expect(await screen.findByText('Failed')).toBeInTheDocument();
  });

  it('opens the uploaded document in a new tab', async () => {
    vi.spyOn(adminApi, 'listAdminBusinessRegistrationChecks').mockResolvedValue([flaggedCheck]);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
    vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);
    const blob = new Blob(['fake pdf bytes'], { type: 'application/pdf' });
    vi.spyOn(adminApi, 'getBusinessRegistrationDocumentBlob').mockResolvedValue(blob);
    // jsdom doesn't implement createObjectURL, so it can't be spied on — assign it directly.
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<AdminKycReviewPage />);
    await screen.findByText('Needs review');

    await userEvent.click(screen.getByRole('button', { name: /view document/i }));

    expect(await screen.findByText('Needs review')).toBeInTheDocument();
    expect(openSpy).toHaveBeenCalledWith('blob:mock-url', '_blank');
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run src/pages/AdminKycReviewPage.test.tsx` from the `admin-web` directory.
Expected: FAIL — `AdminKycReviewPage` doesn't exist yet.

- [ ] **Step 3: Create `admin-web/src/pages/AdminKycReviewPage.tsx`**

```tsx
import { useEffect, useState } from 'react';

import {
  decideAdminKybCheck,
  getBusinessRegistrationDocumentBlob,
  listAdminBusinessRegistrationChecks,
  listAdminOrganizations,
  listAdminUsers,
} from '../api/admin';
import type { KybCheck, Organization, User } from '../api/types';
import { kybCheckStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';

export function AdminKycReviewPage() {
  const [checks, setChecks] = useState<KybCheck[] | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      const [fetchedChecks, fetchedOrgs, fetchedUsers] = await Promise.all([
        listAdminBusinessRegistrationChecks(),
        listAdminOrganizations(),
        listAdminUsers(),
      ]);
      setChecks(fetchedChecks);
      setOrganizations(fetchedOrgs);
      setUsers(fetchedUsers);
    } catch {
      setError("Couldn't load KYC checks. Please try again.");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function orgName(orgId: string): string {
    return organizations.find((org) => org.id === orgId)?.name ?? orgId;
  }

  function uploaderName(userId: string | null): string {
    if (!userId) return '—';
    return users.find((user) => user.id === userId)?.name ?? userId;
  }

  async function handleViewDocument(checkId: string) {
    setError(null);
    try {
      const blob = await getBusinessRegistrationDocumentBlob(checkId);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch {
      setError("Couldn't load the document. Please try again.");
    }
  }

  async function handleDecision(checkId: string, decision: 'PASSED' | 'FAILED') {
    setError(null);
    try {
      const updated = await decideAdminKybCheck(checkId, decision);
      setChecks((current) => current?.map((c) => (c.id === checkId ? updated : c)) ?? current);
    } catch {
      setError("Couldn't record the decision. Please try again.");
    }
  }

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (checks === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">KYC Review</h1>
      {checks.length === 0 ? (
        <p className="text-ink-soft">No business registration checks yet.</p>
      ) : (
        <Panel noPadding>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-soft border-b border-line-strong">
                <th className="py-2.5 px-6">Organization</th>
                <th className="py-2.5 px-6">Uploaded by</th>
                <th className="py-2.5 px-6">AI summary</th>
                <th className="py-2.5 px-6">Status</th>
                <th className="py-2.5 px-6">Actions</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((check) => {
                const statusInfo = kybCheckStatusInfo(check.status);
                return (
                  <tr key={check.id} className="border-b border-line last:border-b-0">
                    <td className="py-3 px-6">{orgName(check.org_id)}</td>
                    <td className="py-3 px-6">{uploaderName(check.uploaded_by)}</td>
                    <td className="py-3 px-6 text-ink-soft max-w-xs">{check.ai_summary ?? '—'}</td>
                    <td className="py-3 px-6">
                      <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                    </td>
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-3">
                        {check.detail && (
                          <button
                            type="button"
                            onClick={() => handleViewDocument(check.id)}
                            className="text-seal text-xs font-semibold hover:underline"
                          >
                            View document
                          </button>
                        )}
                        {check.status === 'FLAGGED' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleDecision(check.id, 'PASSED')}
                              aria-label={`Approve ${orgName(check.org_id)}`}
                              className="text-verified text-xs font-semibold hover:underline"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDecision(check.id, 'FAILED')}
                              aria-label={`Reject ${orgName(check.org_id)}`}
                              className="text-block text-xs font-semibold hover:underline"
                            >
                              Reject
                            </button>
                          </>
                        )}
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

- [ ] **Step 4: Wire the route — in `admin-web/src/App.tsx`, add the import and route**

Add the import alongside the other page imports:

```tsx
import { AdminKycReviewPage } from './pages/AdminKycReviewPage';
```

Add the route right after `/trades`:

```tsx
              <Route path="/trades" element={<AdminTradesPage />} />
              <Route path="/kyc-review" element={<AdminKycReviewPage />} />
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/pages/AdminKycReviewPage.test.tsx` from the `admin-web` directory.
Expected: all tests PASS.

- [ ] **Step 6: Run the full admin-web suite**

Run: `npx vitest run` from the `admin-web` directory.
Expected: all tests pass. Also run `npx tsc --noEmit` from `admin-web` to confirm no type errors.

- [ ] **Step 7: Commit**

```bash
git add admin-web/src/pages/AdminKycReviewPage.tsx admin-web/src/pages/AdminKycReviewPage.test.tsx admin-web/src/App.tsx
git commit -m "Add the KYC Review page for approving or rejecting flagged documents"
```
