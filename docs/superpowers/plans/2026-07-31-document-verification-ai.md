# Document Verification (AI-Assisted) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the document-verification stub (upload always sets `verification_status = "UPLOADED"` and nothing ever changes it) with a real AI-assisted check: on upload, a background task sends the document to Claude, which compares it against the trade's own recorded terms and flags contradictions, updating the document's status to `VERIFIED` or `DISCREPANCY`.

**Architecture:** A new `app/document_intelligence/` module (mirroring the existing `app/sanctions/` client pattern) defines a swappable `DocumentChecker` protocol with a Claude-backed implementation and a fake used automatically when no API key is configured. The upload endpoint sets `PENDING` and schedules a `BackgroundTasks` job; the job opens its own DB session (bound to the same connection the request used, so tests stay isolated) and writes the result. The frontend polls while any document is `PENDING` and shows a status badge plus a discrepancy list.

**Tech Stack:** FastAPI + SQLAlchemy (async) + Alembic + pytest (backend, existing); React + TypeScript + Tailwind + Vitest (frontend, existing); `anthropic` Python SDK (new dependency), model `claude-opus-5`.

## Global Constraints

- No changes to existing `/auth/*`, `/trades` (except the one documented upload-endpoint change), `/organizations`, `/sanctions-screening`, or `/bank-review` behavior.
- The AI call is made only from `api` — never from the frontend, never from any other service. `document-intelligence/` (the empty placeholder folder from Phase 1 scaffolding) is not touched by this plan; the real logic lives inside `api/app/document_intelligence/`.
- The AI backend must stay swappable: all access to it goes through the `DocumentChecker` protocol, never a direct SDK call from the router or background task.
- When `settings.anthropic_api_key` is unset, `get_document_checker()` must return the fake (always-compliant) checker — mirrors `get_sanctions_client()`'s existing fallback exactly. This keeps dev/test/CI free of accidental API calls or cost.
- Every backend task ends with `cd api && python -m pytest` clean. Every frontend task ends with `cd web && npx vitest run && npx tsc -b` clean.
- Model: `claude-opus-5` (per this session's model-selection default — no other model was requested for this feature).

---

### Task 1: `DISCREPANCY` status and AI-check columns on `Document`

**Files:**
- Modify: `api/app/models/enums.py`
- Modify: `api/app/models/document.py`
- Create: `api/alembic/versions/0011_add_document_ai_check_columns.py`
- Test: `api/tests/test_document_model.py` (new)

**Interfaces:**
- Produces: `DocumentVerificationStatus.DISCREPANCY`; `Document.ai_summary: str | None`, `Document.ai_discrepancies: list[str] | None`, `Document.ai_checked_at: datetime | None` — consumed by Tasks 2-4.
- Produces: `Document.verification_status` now defaults to `PENDING` (was `UPLOADED`) at the model level — consumed by Task 3, which relies on this default rather than setting it explicitly in the router.

- [ ] **Step 1: Add `DISCREPANCY` to the enum**

In `api/app/models/enums.py`, change:

```python
class DocumentVerificationStatus(str, Enum):
    UPLOADED = "UPLOADED"
    PENDING = "PENDING"
    VERIFIED = "VERIFIED"
```

to:

```python
class DocumentVerificationStatus(str, Enum):
    UPLOADED = "UPLOADED"
    PENDING = "PENDING"
    VERIFIED = "VERIFIED"
    DISCREPANCY = "DISCREPANCY"
```

- [ ] **Step 2: Write the failing test for the model's new columns and default**

Create `api/tests/test_document_model.py`:

```python
from app.models.document import Document
from app.models.enums import DocumentVerificationStatus


def test_document_defaults_to_pending_verification_status():
    document = Document(
        trade_id="00000000-0000-0000-0000-000000000001",
        category="Regulatory / Compliance",
        document_type="Certificate of Analysis (CoA)",
        uploaded_by="00000000-0000-0000-0000-000000000002",
        submitted_to="00000000-0000-0000-0000-000000000003",
        off_chain_storage_ref="ref",
        on_chain_hash="hash",
    )
    assert document.verification_status == DocumentVerificationStatus.PENDING.value


def test_document_ai_check_fields_default_to_none():
    document = Document(
        trade_id="00000000-0000-0000-0000-000000000001",
        category="Regulatory / Compliance",
        document_type="Certificate of Analysis (CoA)",
        uploaded_by="00000000-0000-0000-0000-000000000002",
        submitted_to="00000000-0000-0000-0000-000000000003",
        off_chain_storage_ref="ref",
        on_chain_hash="hash",
    )
    assert document.ai_summary is None
    assert document.ai_discrepancies is None
    assert document.ai_checked_at is None
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd api && python -m pytest tests/test_document_model.py -v`
Expected: FAIL — `verification_status` currently defaults to `"UPLOADED"`, and `ai_summary`/`ai_discrepancies`/`ai_checked_at` don't exist yet (AttributeError or TypeError from the unexpected columns not existing on the model, or the default-status assertion failing).

- [ ] **Step 4: Update the model**

In `api/app/models/document.py`, change:

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

to:

```python
import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, func
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
    verification_status: Mapped[str] = mapped_column(String, nullable=False, default=DocumentVerificationStatus.PENDING.value)
    ai_summary: Mapped[str | None] = mapped_column(String, nullable=True)
    ai_discrepancies: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    ai_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 5: Create the migration**

Create `api/alembic/versions/0011_add_document_ai_check_columns.py`:

```python
"""add ai check columns to documents

Revision ID: c4f82e91a3b6
Revises: b3a71c40d2f5
Create Date: 2026-07-31 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4f82e91a3b6'
down_revision: Union[str, None] = 'b3a71c40d2f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('documents', sa.Column('ai_summary', sa.String(), nullable=True))
    op.add_column('documents', sa.Column('ai_discrepancies', sa.JSON(), nullable=True))
    op.add_column('documents', sa.Column('ai_checked_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('documents', 'ai_checked_at')
    op.drop_column('documents', 'ai_discrepancies')
    op.drop_column('documents', 'ai_summary')
```

`down_revision` (`b3a71c40d2f5`) is the revision id inside `api/alembic/versions/0010_index_password_reset_otps.py` — the current head. This file's own `revision` id (`c4f82e91a3b6`) was generated fresh and does not collide with any existing revision id in `api/alembic/versions/`.

- [ ] **Step 6: Run the new test to verify it passes**

Run: `cd api && python -m pytest tests/test_document_model.py -v`
Expected: PASS (2 tests)

- [ ] **Step 7: Fix the one existing test that hardcodes the old default**

`api/tests/test_documents_endpoints.py:24` currently asserts:

```python
    assert document["verification_status"] == "UPLOADED"
```

Change it to:

```python
    assert document["verification_status"] == "PENDING"
```

This is the only place in the existing suite that asserts the pre-upload-check status of a freshly-created document; the default change from `UPLOADED` to `PENDING` (Step 4 above) makes this the correct expectation regardless of anything Task 3 adds later. Do not change anything else in this file yet — Task 3 adds new tests here, but this one-line fix belongs to this task since this task is what breaks it.

- [ ] **Step 8: Run the full backend test suite**

Run: `cd api && python -m pytest`
Expected: all tests pass, including the corrected `test_upload_and_list_documents`. The session-scoped `_migrate_test_db` fixture runs `alembic downgrade base` then `alembic upgrade head`, exercising the new migration both ways.

- [ ] **Step 9: Commit**

```bash
git add api/app/models/enums.py api/app/models/document.py api/alembic/versions/0011_add_document_ai_check_columns.py api/tests/test_document_model.py api/tests/test_documents_endpoints.py
git commit -m "Add DISCREPANCY status and AI-check columns to Document"
```

---

### Task 2: `document_intelligence` module — swappable AI checker

**Files:**
- Create: `api/app/document_intelligence/__init__.py`
- Create: `api/app/document_intelligence/checker.py`
- Create: `api/app/document_intelligence/fake_checker.py`
- Create: `api/app/document_intelligence/claude_checker.py`
- Create: `api/app/document_intelligence/dependency.py`
- Modify: `api/app/config.py`
- Modify: `api/requirements.txt`
- Test: `api/tests/test_document_checker.py` (new)

**Interfaces:**
- Produces: `DocumentCheckResult` (Pydantic model: `compliant: bool`, `discrepancies: list[str]`, `summary: str`), `DocumentChecker` (Protocol with `async def check(content: bytes, trade_terms: dict[str, str]) -> DocumentCheckResult`), `FakeDocumentChecker`, `ClaudeDocumentChecker`, `get_document_checker() -> DocumentChecker` — all consumed by Task 3.
- Produces: `settings.anthropic_api_key: str | None` — consumed by `get_document_checker()` and by Task 3's tests.

This task does not touch the documents router — these are new, unused-so-far classes and functions, exercised only by this task's own unit tests.

- [ ] **Step 1: Add the setting**

In `api/app/config.py`, add one line to the `Settings` class, alongside `sanctions_adapter_url`:

```python
    sanctions_adapter_url: str | None = None
    anthropic_api_key: str | None = None
```

- [ ] **Step 2: Add the `anthropic` dependency**

In `api/requirements.txt`, add a new line:

```
anthropic==0.69.0
```

Run: `cd api && pip install -r requirements.txt`
Expected: `anthropic` installs cleanly alongside existing dependencies.

- [ ] **Step 3: Write the failing tests**

Create `api/tests/test_document_checker.py`:

```python
from app.config import settings
from app.document_intelligence.dependency import get_document_checker
from app.document_intelligence.fake_checker import FakeDocumentChecker


async def test_fake_document_checker_always_returns_compliant():
    checker = FakeDocumentChecker()
    result = await checker.check(b"fake pdf bytes", {"product_description": "Widgets"})
    assert result.compliant is True
    assert result.discrepancies == []
    assert isinstance(result.summary, str) and result.summary


def test_get_document_checker_returns_fake_when_no_api_key_configured(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", None)
    checker = get_document_checker()
    assert isinstance(checker, FakeDocumentChecker)


def test_get_document_checker_returns_claude_checker_when_api_key_configured(monkeypatch):
    from app.document_intelligence.claude_checker import ClaudeDocumentChecker

    monkeypatch.setattr(settings, "anthropic_api_key", "sk-ant-test-key")
    checker = get_document_checker()
    assert isinstance(checker, ClaudeDocumentChecker)
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd api && python -m pytest tests/test_document_checker.py -v`
Expected: FAIL — none of `app.document_intelligence.*` exist yet (`ModuleNotFoundError`).

- [ ] **Step 5: Create `checker.py`**

Create `api/app/document_intelligence/__init__.py` (empty file).

Create `api/app/document_intelligence/checker.py`:

```python
from typing import Protocol

from pydantic import BaseModel


class DocumentCheckResult(BaseModel):
    compliant: bool
    discrepancies: list[str]
    summary: str


class DocumentChecker(Protocol):
    async def check(self, content: bytes, trade_terms: dict[str, str]) -> DocumentCheckResult: ...
```

- [ ] **Step 6: Create `fake_checker.py`**

Create `api/app/document_intelligence/fake_checker.py`:

```python
from app.document_intelligence.checker import DocumentCheckResult


class FakeDocumentChecker:
    async def check(self, content: bytes, trade_terms: dict[str, str]) -> DocumentCheckResult:
        return DocumentCheckResult(
            compliant=True,
            discrepancies=[],
            summary="Fake checker: no discrepancies (stub result, no AI call made).",
        )
```

- [ ] **Step 7: Create `claude_checker.py`**

Create `api/app/document_intelligence/claude_checker.py`:

```python
import base64

import anthropic

from app.document_intelligence.checker import DocumentCheckResult


class ClaudeDocumentChecker:
    def __init__(self, api_key: str) -> None:
        self._client = anthropic.AsyncAnthropic(api_key=api_key)

    async def check(self, content: bytes, trade_terms: dict[str, str]) -> DocumentCheckResult:
        encoded = base64.standard_b64encode(content).decode("utf-8")
        terms_text = "\n".join(f"- {key}: {value}" for key, value in trade_terms.items())
        response = await self._client.messages.parse(
            model="claude-opus-5",
            max_tokens=4096,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "document",
                            "source": {
                                "type": "base64",
                                "media_type": "application/pdf",
                                "data": encoded,
                            },
                        },
                        {
                            "type": "text",
                            "text": (
                                "This document was submitted as part of a trade finance transaction "
                                "with these recorded terms:\n"
                                f"{terms_text}\n\n"
                                "Does anything in the document contradict these terms? Consider "
                                "values, dates, descriptions, and party names. List any contradictions "
                                "as discrepancies; if there are none, return an empty list and mark "
                                "the document compliant."
                            ),
                        },
                    ],
                }
            ],
            output_format=DocumentCheckResult,
        )
        return response.parsed_output
```

- [ ] **Step 8: Create `dependency.py`**

Create `api/app/document_intelligence/dependency.py`:

```python
from app.config import settings
from app.document_intelligence.checker import DocumentChecker
from app.document_intelligence.claude_checker import ClaudeDocumentChecker
from app.document_intelligence.fake_checker import FakeDocumentChecker


def get_document_checker() -> DocumentChecker:
    if settings.anthropic_api_key:
        return ClaudeDocumentChecker(api_key=settings.anthropic_api_key)
    return FakeDocumentChecker()
```

This mirrors `api/app/sanctions/dependency.py`'s `get_sanctions_client()` exactly.

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd api && python -m pytest tests/test_document_checker.py -v`
Expected: PASS (3 tests)

- [ ] **Step 10: Run the full backend test suite**

Run: `cd api && python -m pytest`
Expected: all tests pass — these are new, unused-so-far additions with no existing call sites, so nothing else should be affected.

- [ ] **Step 11: Commit**

```bash
git add api/app/document_intelligence/ api/app/config.py api/requirements.txt api/tests/test_document_checker.py
git commit -m "Add swappable DocumentChecker (Claude-backed, with a fake fallback)"
```

---

### Task 3: Wire the AI check into document upload

**Files:**
- Modify: `api/app/db.py`
- Modify: `api/app/routers/documents.py`
- Modify: `api/app/schemas/document.py`
- Create: `api/app/document_intelligence/service.py`
- Modify: `api/tests/conftest.py`
- Modify: `api/tests/test_documents_endpoints.py`

**Interfaces:**
- Consumes: `DocumentChecker`/`get_document_checker` (Task 2), `Document.ai_summary`/`ai_discrepancies`/`ai_checked_at` (Task 1).
- Produces: `get_session_factory() -> async_sessionmaker` in `app/db.py` — a FastAPI-dependency-injectable seam so tests can redirect the background task's DB session the same way they already redirect `get_db`, without ever touching the real dev database.
- Produces: `build_trade_terms(trade: Trade, db: AsyncSession) -> dict[str, str]` and `run_document_check(document_id, content, trade_terms, session_factory) -> None` in `app/document_intelligence/service.py`.

This is the task where the earlier tasks' pieces get connected to a real HTTP endpoint, so read the whole task before starting — the test-isolation seam (Step 1) is not optional scaffolding, it is what stops a background task from ever writing to the real dev database during tests, the same class of incident this repo already suffered once (see the ledger for the auth-self-service branch's alembic incident, now historical, if you want the full story).

- [ ] **Step 1: Add a test-overridable session factory to `app/db.py`**

In `api/app/db.py`, current content is:

```python
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import DATABASE_URL


class Base(DeclarativeBase):
    pass


engine = create_async_engine(DATABASE_URL, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncSession:
    async with SessionLocal() as session:
        yield session
```

Add one function after `get_db`:

```python
async def get_db() -> AsyncSession:
    async with SessionLocal() as session:
        yield session


def get_session_factory() -> async_sessionmaker:
    return SessionLocal
```

**Why this exists:** `BackgroundTasks` run after the request's own `get_db` session has already closed, so the background task needs to open a fresh session. In production that fresh session should use the same engine as everything else (`SessionLocal`) — but in tests, `get_db` is overridden to a session bound to one specific connection wrapped in a rollback-at-teardown transaction (see `api/tests/conftest.py`), and a background task that called `SessionLocal()` directly would silently bypass that isolation and hit whatever `DATABASE_URL` points at. Routing the background task's session through this same `Depends()`-injectable function means the test override in Step 5 below can redirect it exactly like `get_db` already is.

- [ ] **Step 2: Add `build_trade_terms` and `run_document_check`**

Create `api/app/document_intelligence/service.py`:

```python
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.document_intelligence.dependency import get_document_checker
from app.models.document import Document
from app.models.organization import Organization
from app.models.trade import Trade

logger = logging.getLogger(__name__)


async def build_trade_terms(trade: Trade, db: AsyncSession) -> dict[str, str]:
    exporter = await db.get(Organization, trade.exporter_org_id)
    buyer = await db.get(Organization, trade.buyer_org_id)
    return {
        "lc_reference": trade.lc_reference,
        "exporter": exporter.name if exporter else str(trade.exporter_org_id),
        "buyer": buyer.name if buyer else str(trade.buyer_org_id),
        "product_description": trade.product_description,
        "order_value": str(trade.order_value),
        "currency": trade.currency,
        "incoterm": trade.incoterm,
        "payment_term": trade.payment_term,
    }


async def run_document_check(
    document_id: uuid.UUID,
    content: bytes,
    trade_terms: dict[str, str],
    session_factory: async_sessionmaker,
) -> None:
    try:
        checker = get_document_checker()
        result = await checker.check(content, trade_terms)
    except Exception:
        logger.exception("Document AI check failed for document %s", document_id)
        return

    async with session_factory() as db:
        document = await db.get(Document, document_id)
        document.verification_status = "VERIFIED" if result.compliant else "DISCREPANCY"
        document.ai_summary = result.summary
        document.ai_discrepancies = result.discrepancies
        document.ai_checked_at = datetime.now(timezone.utc)
        await db.commit()
```

If the checker raises (network error, rate limit, malformed PDF), the document is deliberately left at `PENDING` with no retry — this is a documented scope cut, not an oversight (see the design spec's Error Handling section).

- [ ] **Step 3: Extend `DocumentOut`**

In `api/app/schemas/document.py`, change:

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

to:

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
    ai_summary: str | None
    ai_discrepancies: list[str] | None
    ai_checked_at: datetime | None
    created_at: datetime
```

- [ ] **Step 4: Wire the background task into the upload endpoint**

In `api/app/routers/documents.py`, current content is:

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


async def get_accessible_trade(trade_id: uuid.UUID, db: AsyncSession, user: User) -> Trade:
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
    trade = await get_accessible_trade(trade_id, db, current_user)
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
```

Replace it with:

```python
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.access import user_can_access_trade
from app.auth.dependencies import get_current_user
from app.db import get_db, get_session_factory
from app.document_intelligence.service import build_trade_terms, run_document_check
from app.hashing import sha256_hex
from app.models.document import Document
from app.models.trade import Trade
from app.models.user import User
from app.schemas.document import DocumentOut
from app.storage import upload_bytes

router = APIRouter(prefix="/trades/{trade_id}/documents", tags=["documents"])


async def get_accessible_trade(trade_id: uuid.UUID, db: AsyncSession, user: User) -> Trade:
    trade = await db.get(Trade, trade_id)
    if trade is None or not user_can_access_trade(user, trade):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")
    return trade


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    trade_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    category: str = Form(...),
    document_type: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    session_factory: async_sessionmaker = Depends(get_session_factory),
) -> DocumentOut:
    trade = await get_accessible_trade(trade_id, db, current_user)
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

    trade_terms = await build_trade_terms(trade, db)
    background_tasks.add_task(run_document_check, document.id, content, trade_terms, session_factory)

    return document


@router.get("", response_model=list[DocumentOut])
async def list_documents(
    trade_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[DocumentOut]:
    await get_accessible_trade(trade_id, db, current_user)
    result = await db.execute(select(Document).where(Document.trade_id == trade_id))
    return list(result.scalars().all())
```

(Only `upload_document` changed — `get_accessible_trade` and `list_documents` are unchanged, reproduced above for context.)

- [ ] **Step 5: Add the test seam for the background task's session**

In `api/tests/conftest.py`, the current `async_client` fixture is:

```python
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

`api/tests/conftest.py` already has `from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine` at the top (used to build `db_session`), so no new import of `async_sessionmaker` is needed. Only change the `app.db` import line:

```python
from app.db import get_db
```

to:

```python
from app.db import get_db, get_session_factory
```

Change the fixture to:

```python
@pytest_asyncio.fixture
async def async_client(db_session):
    async def override_get_db():
        yield db_session

    session_factory = async_sessionmaker(
        bind=db_session.bind, expire_on_commit=False, join_transaction_mode="create_savepoint"
    )

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_session_factory] = lambda: session_factory
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()
```

`db_session.bind` is the same connection `db_session` itself was built on (see the `db_session` fixture immediately above this one) — a session the background task opens against that connection, in the same `create_savepoint` mode, joins the same rollback-at-teardown transaction the rest of the test uses. This does not change `db_session` or any other fixture.

- [ ] **Step 6: Write the failing integration tests**

Add to `api/tests/test_documents_endpoints.py` (read the existing file first to match its helper functions — it already has a `_signup_and_login`-style helper and an existing upload test; add these after the existing tests, reusing whatever trade/org setup helper the file already uses rather than duplicating one):

```python
async def test_uploaded_document_is_verified_compliant_by_the_background_check(async_client):
    exporter_org_id, exporter_token = await signup_and_login(async_client, "docai-exporter-1@example.com")
    buyer_org_id, _ = await signup_and_login(async_client, "docai-buyer-1@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await signup_and_login(async_client, "docai-issuing-1@example.com", org_type="BANK")
    advising_bank_org_id, _ = await signup_and_login(async_client, "docai-advising-1@example.com", org_type="BANK")
    trade_response = await create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)
    trade_id = trade_response.json()["id"]

    files = {"file": ("invoice.pdf", b"%PDF-1.4 fake content", "application/pdf")}
    data = {"category": "Regulatory / Compliance", "document_type": "Commercial Invoice"}
    upload_response = await async_client.post(
        f"/trades/{trade_id}/documents", data=data, files=files, headers={"Authorization": f"Bearer {exporter_token}"}
    )
    assert upload_response.status_code == 201

    list_response = await async_client.get(f"/trades/{trade_id}/documents", headers={"Authorization": f"Bearer {exporter_token}"})
    documents = list_response.json()
    assert len(documents) == 1
    assert documents[0]["verification_status"] == "VERIFIED"
    assert documents[0]["ai_discrepancies"] == []
    assert documents[0]["ai_checked_at"] is not None


async def test_uploaded_document_is_flagged_discrepancy_when_checker_finds_one(async_client):
    from app.document_intelligence.checker import DocumentCheckResult
    from app.document_intelligence.dependency import get_document_checker
    from app.main import app

    class StubDiscrepancyChecker:
        async def check(self, content, trade_terms):
            return DocumentCheckResult(compliant=False, discrepancies=["Invoice value does not match trade terms."], summary="Found a value mismatch.")

    app.dependency_overrides[get_document_checker] = lambda: StubDiscrepancyChecker()
    try:
        exporter_org_id, exporter_token = await signup_and_login(async_client, "docai-exporter-2@example.com")
        buyer_org_id, _ = await signup_and_login(async_client, "docai-buyer-2@example.com", org_type="BUYER")
        issuing_bank_org_id, _ = await signup_and_login(async_client, "docai-issuing-2@example.com", org_type="BANK")
        advising_bank_org_id, _ = await signup_and_login(async_client, "docai-advising-2@example.com", org_type="BANK")
        trade_response = await create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)
        trade_id = trade_response.json()["id"]

        files = {"file": ("invoice.pdf", b"%PDF-1.4 fake content", "application/pdf")}
        data = {"category": "Regulatory / Compliance", "document_type": "Commercial Invoice"}
        upload_response = await async_client.post(
            f"/trades/{trade_id}/documents", data=data, files=files, headers={"Authorization": f"Bearer {exporter_token}"}
        )
        assert upload_response.status_code == 201

        list_response = await async_client.get(f"/trades/{trade_id}/documents", headers={"Authorization": f"Bearer {exporter_token}"})
        documents = list_response.json()
        assert documents[0]["verification_status"] == "DISCREPANCY"
        assert documents[0]["ai_discrepancies"] == ["Invoice value does not match trade terms."]
    finally:
        app.dependency_overrides.pop(get_document_checker, None)
```

Check the top of `api/tests/test_documents_endpoints.py` for its existing imports (likely `from tests.test_trades_endpoints import create_trade, signup_and_login` or similar, matching the pattern used in `test_organizations_endpoints.py` and `test_sanctions_screening_endpoints.py`) — reuse those names rather than reimplementing signup/trade-creation helpers.

- [ ] **Step 7: Run tests to verify they fail first, for the right reason**

Run: `cd api && python -m pytest tests/test_documents_endpoints.py -v`
Expected: FAIL — before Step 4-5's changes this would fail because `ai_discrepancies` doesn't exist on the response yet / the background task never runs. After implementing Steps 1-5, re-run and expect these two new tests to PASS. (If you are following TDD strictly: write this test file's additions first against the *pre-Step-4* router to see them fail with a clear `KeyError`/`AttributeError`, then apply Steps 1-5 and re-run to see them pass. Given the size of the router change, it is also acceptable to implement Steps 1-5 together and use this step purely as the GREEN check — note which you did in your report.)

- [ ] **Step 8: Run the full backend test suite**

Run: `cd api && python -m pytest`
Expected: all tests pass, including the 2 new ones. Note why the new tests assert the settled status (`VERIFIED`/`DISCREPANCY`) on the subsequent `GET .../documents` call rather than on the `POST`'s own response body: FastAPI serializes the `POST` response from the in-memory `Document` object *before* `BackgroundTasks` run, so the JSON the client receives from `POST` still reads `PENDING` even though — because `httpx`'s `ASGITransport` awaits the whole ASGI cycle, including background tasks, before returning control to the test — the background task has already completed against the database by the time your test's next `await async_client...` call runs. If you see the two new tests fail with `verification_status == "PENDING"` where you expected `VERIFIED`, you are almost certainly asserting against the `POST` response instead of a follow-up `GET`.

- [ ] **Step 9: Commit**

```bash
git add api/app/db.py api/app/routers/documents.py api/app/schemas/document.py api/app/document_intelligence/service.py api/tests/conftest.py api/tests/test_documents_endpoints.py
git commit -m "Wire the AI document checker into POST /trades/{id}/documents"
```

---

### Task 4: Frontend — status badge, discrepancy list, polling

**Files:**
- Modify: `web/src/api/types.ts`
- Modify: `web/src/lib/statusTones.ts`
- Modify: `web/src/pages/TransactionDocumentsPage.tsx`
- Modify: `web/src/pages/TransactionDocumentsPage.test.tsx`
- Modify: `web/src/lib/statusTones.test.ts`

**Interfaces:**
- Consumes: `ai_summary`/`ai_discrepancies`/`ai_checked_at` on `Document` (Task 3), existing `Badge` component (`web/src/components/ui/Badge.tsx`, unchanged).
- Produces: `documentVerificationStatusInfo(status: DocumentVerificationStatus): StatusInfo` in `statusTones.ts`, following the exact existing pattern for `tradeStatusInfo`/`kybStatusInfo`/etc.

- [ ] **Step 1: Update the `Document` type and status union**

In `web/src/api/types.ts`, change:

```ts
export type DocumentVerificationStatus = 'UPLOADED' | 'PENDING' | 'VERIFIED';
```

to:

```ts
export type DocumentVerificationStatus = 'UPLOADED' | 'PENDING' | 'VERIFIED' | 'DISCREPANCY';
```

And change the `Document` interface (currently at line 121):

```ts
export interface Document {
  id: string;
  trade_id: string;
  category: string;
  document_type: string;
  uploaded_by: string;
  submitted_to: string;
  off_chain_storage_ref: string;
  on_chain_hash: string;
  verification_status: DocumentVerificationStatus;
  created_at: string;
}
```

to:

```ts
export interface Document {
  id: string;
  trade_id: string;
  category: string;
  document_type: string;
  uploaded_by: string;
  submitted_to: string;
  off_chain_storage_ref: string;
  on_chain_hash: string;
  verification_status: DocumentVerificationStatus;
  ai_summary: string | null;
  ai_discrepancies: string[] | null;
  ai_checked_at: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Write the failing test for `documentVerificationStatusInfo`**

`web/src/lib/statusTones.test.ts` doesn't exist yet as a file you've read in full — create it if it doesn't exist, or add to it if it does (check first: run `ls web/src/lib/statusTones.test.ts`). If it doesn't exist, create it with:

```ts
import { describe, expect, it } from 'vitest';

import { documentVerificationStatusInfo } from './statusTones';

describe('documentVerificationStatusInfo', () => {
  it('maps each status to the expected tone and label', () => {
    expect(documentVerificationStatusInfo('UPLOADED')).toEqual({ tone: 'neutral', label: 'Uploaded' });
    expect(documentVerificationStatusInfo('PENDING')).toEqual({ tone: 'warning', label: 'Processing' });
    expect(documentVerificationStatusInfo('VERIFIED')).toEqual({ tone: 'positive', label: 'Compliant' });
    expect(documentVerificationStatusInfo('DISCREPANCY')).toEqual({ tone: 'negative', label: 'Discrepancy' });
  });
});
```

If `statusTones.test.ts` already exists with other `describe` blocks, add this `describe` block alongside them rather than replacing the file.

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd web && npx vitest run src/lib/statusTones.test.ts`
Expected: FAIL — `documentVerificationStatusInfo` is not exported yet.

- [ ] **Step 4: Add `documentVerificationStatusInfo`**

In `web/src/lib/statusTones.ts`, add the import for the new status type to the existing import block:

```ts
import type {
  BankReviewResult,
  DocumentVerificationStatus,
  KybCheckStatus,
  KybStatus,
  SanctionsStatus,
  TradeStatus,
  UserStatus,
} from '../api/types';
```

Add this function at the end of the file (after `bankReviewResultInfo`):

```ts
export function documentVerificationStatusInfo(status: DocumentVerificationStatus): StatusInfo {
  const map: Record<DocumentVerificationStatus, StatusInfo> = {
    UPLOADED: { tone: 'neutral', label: 'Uploaded' },
    PENDING: { tone: 'warning', label: 'Processing' },
    VERIFIED: { tone: 'positive', label: 'Compliant' },
    DISCREPANCY: { tone: 'negative', label: 'Discrepancy' },
  };
  return map[status];
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd web && npx vitest run src/lib/statusTones.test.ts`
Expected: PASS

- [ ] **Step 6: Write the failing tests for `TransactionDocumentsPage`**

Add to `web/src/pages/TransactionDocumentsPage.test.tsx`, after the existing tests, inside the `describe('TransactionDocumentsPage', ...)` block. First add `Badge`-relevant sample documents near the top of the file, alongside the existing `uploadedDoc` constant:

```ts
const verifiedDoc: Document = {
  id: 'd-2',
  trade_id: 't-1',
  category: 'Regulatory / Compliance',
  document_type: 'Certificate of Analysis (CoA)',
  uploaded_by: 'u-1',
  submitted_to: 'o-3',
  off_chain_storage_ref: 'ref',
  on_chain_hash: 'hash',
  verification_status: 'VERIFIED',
  ai_summary: 'No discrepancies found.',
  ai_discrepancies: [],
  ai_checked_at: '2026-01-01T00:01:00Z',
  created_at: '2026-01-01T00:00:00Z',
};

const discrepancyDoc: Document = {
  id: 'd-3',
  trade_id: 't-1',
  category: 'Regulatory / Compliance',
  document_type: 'Certificate of Analysis (CoA)',
  uploaded_by: 'u-1',
  submitted_to: 'o-3',
  off_chain_storage_ref: 'ref',
  on_chain_hash: 'hash',
  verification_status: 'DISCREPANCY',
  ai_summary: 'Found a mismatch.',
  ai_discrepancies: ['Invoice value does not match trade terms.'],
  ai_checked_at: '2026-01-01T00:01:00Z',
  created_at: '2026-01-01T00:00:00Z',
};

const pendingDoc: Document = {
  id: 'd-4',
  trade_id: 't-1',
  category: 'Regulatory / Compliance',
  document_type: 'Certificate of Analysis (CoA)',
  uploaded_by: 'u-1',
  submitted_to: 'o-3',
  off_chain_storage_ref: 'ref',
  on_chain_hash: 'hash',
  verification_status: 'PENDING',
  ai_summary: null,
  ai_discrepancies: null,
  ai_checked_at: null,
  created_at: '2026-01-01T00:00:00Z',
};
```

The existing `uploadedDoc` constant (verification_status `'UPLOADED'`) needs `ai_summary: null, ai_discrepancies: null, ai_checked_at: null` added to it too, or TypeScript will fail to compile since `Document` now requires those fields.

Then add these tests:

```ts
  it('shows a Compliant badge for a verified document', async () => {
    vi.spyOn(tradesApi, 'getTrade').mockResolvedValue(sampleTrade);
    vi.spyOn(documentRegistryApi, 'listDocumentRegistry').mockResolvedValue([registryEntry]);
    vi.spyOn(documentsApi, 'listDocuments').mockResolvedValue([verifiedDoc]);

    renderPage();

    expect(await screen.findByText('Compliant')).toBeInTheDocument();
  });

  it('shows a Discrepancy badge and the discrepancy list for a flagged document', async () => {
    vi.spyOn(tradesApi, 'getTrade').mockResolvedValue(sampleTrade);
    vi.spyOn(documentRegistryApi, 'listDocumentRegistry').mockResolvedValue([registryEntry]);
    vi.spyOn(documentsApi, 'listDocuments').mockResolvedValue([discrepancyDoc]);

    renderPage();

    expect(await screen.findByText('Discrepancy')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Discrepancy'));
    expect(await screen.findByText('Invoice value does not match trade terms.')).toBeInTheDocument();
  });

  it('polls for updates while a document is Processing and stops once resolved', async () => {
    vi.spyOn(tradesApi, 'getTrade').mockResolvedValue(sampleTrade);
    vi.spyOn(documentRegistryApi, 'listDocumentRegistry').mockResolvedValue([registryEntry]);
    const listDocumentsSpy = vi
      .spyOn(documentsApi, 'listDocuments')
      .mockResolvedValueOnce([pendingDoc])
      .mockResolvedValueOnce([verifiedDoc]);

    renderPage();

    expect(await screen.findByText('Processing')).toBeInTheDocument();
    expect(await screen.findByText('Compliant', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(listDocumentsSpy).toHaveBeenCalledTimes(2);
  });
```

The polling test relies on the 3-second interval from Step 8 below; `findByText` with a generous timeout waits for it. If this makes the test suite noticeably slow, note it in your report — reducing the production interval is not in scope for this task, but flagging it is fair.

- [ ] **Step 7: Run tests to verify they fail**

Run: `cd web && npx vitest run src/pages/TransactionDocumentsPage.test.tsx`
Expected: FAIL — the page still shows a plain "Uploaded" text span for every document regardless of status, and there's no `<details>`/discrepancy list, and no polling.

- [ ] **Step 8: Update `TransactionDocumentsPage.tsx`**

Current content is:

```tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { listDocumentRegistry } from '../api/documentRegistry';
import { listDocuments, uploadDocument } from '../api/documents';
import { getTrade } from '../api/trades';
import type { Document, DocumentRegistryEntry, Trade } from '../api/types';
import { Panel } from '../components/ui/Panel';

export function TransactionDocumentsPage() {
  const { tradeId } = useParams<{ tradeId: string }>();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [registry, setRegistry] = useState<DocumentRegistryEntry[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!tradeId) return;
    let cancelled = false;

    async function load() {
      setError(null);
      try {
        const fetchedTrade = await getTrade(tradeId as string);
        const [registryEntries, fetchedDocuments] = await Promise.all([
          listDocumentRegistry(fetchedTrade.industry, fetchedTrade.instrument_type),
          listDocuments(tradeId as string),
        ]);
        if (cancelled) return;
        setTrade(fetchedTrade);
        setRegistry(registryEntries);
        setDocuments(fetchedDocuments);
        setError(null);
      } catch {
        if (!cancelled) setError("Couldn't load the transaction. Please try again.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tradeId]);

  async function handleUpload(entry: DocumentRegistryEntry, file: File) {
    if (!tradeId) return;
    setUploadError(null);
    try {
      await uploadDocument(tradeId, entry.category, entry.document_type, file);
      setDocuments(await listDocuments(tradeId));
    } catch {
      setUploadError("Couldn't upload the document. Please try again.");
    }
  }

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (!trade) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-1">{trade.lc_reference}</h1>
      <p className="text-ink-soft mb-6">Document checklist for {trade.industry}</p>
      {uploadError && <p className="text-block text-sm mb-4">{uploadError}</p>}
      <Panel noPadding>
        <div className="divide-y divide-line">
          {registry.map((entry) => {
            const uploaded = documents.find((doc) => doc.document_type === entry.document_type);
            return (
              <div key={entry.id} className="flex items-center justify-between px-6 py-3.5">
                <div>
                  <div className="font-medium text-sm">{entry.document_type}</div>
                  <div className="text-xs text-ink-soft">{entry.mandatory ? 'Mandatory' : 'Optional'}</div>
                </div>
                {uploaded ? (
                  <span className="text-verified text-sm font-semibold">Uploaded</span>
                ) : (
                  <label className="text-seal-dark text-sm font-semibold cursor-pointer">
                    Upload
                    <input
                      type="file"
                      className="hidden"
                      aria-label={`Upload ${entry.document_type}`}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(entry, file);
                      }}
                    />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
```

Replace it with:

```tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { listDocumentRegistry } from '../api/documentRegistry';
import { listDocuments, uploadDocument } from '../api/documents';
import { getTrade } from '../api/trades';
import type { Document, DocumentRegistryEntry, Trade } from '../api/types';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';
import { documentVerificationStatusInfo } from '../lib/statusTones';

export function TransactionDocumentsPage() {
  const { tradeId } = useParams<{ tradeId: string }>();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [registry, setRegistry] = useState<DocumentRegistryEntry[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!tradeId) return;
    let cancelled = false;

    async function load() {
      setError(null);
      try {
        const fetchedTrade = await getTrade(tradeId as string);
        const [registryEntries, fetchedDocuments] = await Promise.all([
          listDocumentRegistry(fetchedTrade.industry, fetchedTrade.instrument_type),
          listDocuments(tradeId as string),
        ]);
        if (cancelled) return;
        setTrade(fetchedTrade);
        setRegistry(registryEntries);
        setDocuments(fetchedDocuments);
        setError(null);
      } catch {
        if (!cancelled) setError("Couldn't load the transaction. Please try again.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tradeId]);

  useEffect(() => {
    if (!tradeId) return;
    if (!documents.some((doc) => doc.verification_status === 'PENDING')) return;

    const interval = setInterval(async () => {
      try {
        setDocuments(await listDocuments(tradeId));
      } catch {
        // A transient polling failure isn't worth surfacing as a page-level error;
        // the next tick retries.
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [tradeId, documents]);

  async function handleUpload(entry: DocumentRegistryEntry, file: File) {
    if (!tradeId) return;
    setUploadError(null);
    try {
      await uploadDocument(tradeId, entry.category, entry.document_type, file);
      setDocuments(await listDocuments(tradeId));
    } catch {
      setUploadError("Couldn't upload the document. Please try again.");
    }
  }

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (!trade) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-1">{trade.lc_reference}</h1>
      <p className="text-ink-soft mb-6">Document checklist for {trade.industry}</p>
      {uploadError && <p className="text-block text-sm mb-4">{uploadError}</p>}
      <Panel noPadding>
        <div className="divide-y divide-line">
          {registry.map((entry) => {
            const uploaded = documents.find((doc) => doc.document_type === entry.document_type);
            return (
              <div key={entry.id} className="px-6 py-3.5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{entry.document_type}</div>
                    <div className="text-xs text-ink-soft">{entry.mandatory ? 'Mandatory' : 'Optional'}</div>
                  </div>
                  {uploaded ? (
                    <Badge tone={documentVerificationStatusInfo(uploaded.verification_status).tone}>
                      {documentVerificationStatusInfo(uploaded.verification_status).label}
                    </Badge>
                  ) : (
                    <label className="text-seal-dark text-sm font-semibold cursor-pointer">
                      Upload
                      <input
                        type="file"
                        className="hidden"
                        aria-label={`Upload ${entry.document_type}`}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUpload(entry, file);
                        }}
                      />
                    </label>
                  )}
                </div>
                {uploaded && uploaded.ai_discrepancies && uploaded.ai_discrepancies.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs text-block cursor-pointer">Discrepancy</summary>
                    <ul className="mt-1.5 ml-4 list-disc text-xs text-ink-soft">
                      {uploaded.ai_discrepancies.map((discrepancy, index) => (
                        <li key={index}>{discrepancy}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
```

Note the discrepancy test clicks the text "Discrepancy" to open the `<details>` — this works because the `<summary>` element's text is "Discrepancy" and clicking a `<summary>` toggles the parent `<details>` open, revealing the `<ul>` beneath it.

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd web && npx vitest run src/pages/TransactionDocumentsPage.test.tsx`
Expected: PASS (8 tests: the 5 existing plus these 3 new ones)

- [ ] **Step 10: Run the full suite and build check**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: all tests pass, `tsc -b` prints nothing. Pay attention to `tsc` errors from the existing `uploadedDoc` constant in the test file — it needs the three new `ai_*` fields added (per Step 6) or the build fails.

- [ ] **Step 11: Commit**

```bash
git add web/src/api/types.ts web/src/lib/statusTones.ts web/src/lib/statusTones.test.ts web/src/pages/TransactionDocumentsPage.tsx web/src/pages/TransactionDocumentsPage.test.tsx
git commit -m "Show AI verification status and discrepancies on the documents page"
```

---

## Final Verification

- [ ] Run `cd api && python -m pytest` — expect all tests passing, including the new ones from Tasks 1-3.
- [ ] Run `cd web && npx vitest run` — expect all tests passing, including the new ones from Task 4.
- [ ] Run `cd web && npx tsc -b` — expect a clean build with no output.
- [ ] Start both the API and web dev servers, upload a document on a real transaction, and confirm: the badge shows "Processing" immediately, then (since `ANTHROPIC_API_KEY` is unset in dev by default, per the Global Constraints) settles to "Compliant" within one poll interval via the fake checker. If you want to see a real Claude call, set `ANTHROPIC_API_KEY` in `api/.env` first and re-test with a real PDF.
