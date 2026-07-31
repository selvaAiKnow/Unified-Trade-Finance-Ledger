# Document Verification (AI-Assisted) — Design

Date: 2026-07-31
Source: `docs/claude_code_build_prompt.md` Section 1 component 3 ("Document Intelligence — OCR extraction and cross-document consistency checks against LC terms"), Section 6 Phase 2; UX reference: `prototypes/trade_finance_platform_app.html` ("AI check result" column, Discrepancy/Compliant/Processing badges)

## Scope

Today, document verification is a pure stub: `POST /trades/{id}/documents` always sets `verification_status = "UPLOADED"` and nothing in the codebase ever transitions it to `PENDING` or `VERIFIED` — no endpoint, no service, no scheduled job. This design closes that gap by wiring in a real AI check.

**In scope:**
- A background check that runs after each document upload, comparing the document's content against the trade's own recorded commercial terms, and updating `verification_status` to a real outcome.
- A pluggable checker interface so the AI backend is swappable, with Claude as the first (and for now, only) real implementation.
- Frontend badges (Compliant / Discrepancy / Processing) and a simple discrepancy-detail disclosure, replacing the current static "Uploaded" label.

**Explicitly out of scope:**
- Per-document-type field schemas (e.g., "a Commercial Invoice must contain fields X/Y/Z"). The `document_registry` table has no such schema today, and building one is a separate, larger design decision. This version does a **generic** check instead: does anything in the document contradict the trade's own terms?
- A dedicated cloud OCR provider (AWS Textract / Google Document AI / Azure Form Recognizer), despite being the Section 5 suggestion. Claude's multimodal API does extraction and discrepancy reasoning in one call, needs no separate cloud account, and is easier to iterate on via prompts. The checker interface is provider-agnostic, so a Textract-backed implementation remains a future option, not a redesign.
- Retry/failure handling beyond "leave it in progress." See Error Handling below.
- Any change to the `blockchain-layer`/CorDapp calling architecture. A related question came up during this design (whether CorDapp should also only be callable from `api`) — investigated and found that `ledger-monitoring` is documented and implemented as blockchain-layer's direct caller today, bypassing `api` by design (oracle-event driven, not user-driven traffic). That's accepted as-is and is unrelated to this slice.
- A modal/detail view matching the prototype's "Open discrepancies" panel with rule IDs and severity. A simple inline disclosure is enough for a first version.

**Reference use case:** same India → Japan pharmaceutical export LC scenario used throughout — nothing pharma-specific is hardcoded; the check works against whatever terms a trade actually has.

## Why Claude, and why it must stay swappable

Claude was chosen for the first implementation because it can read a PDF directly and do both field extraction and discrepancy reasoning in a single call, with no separate OCR account to provision. This is a recommendation, not a hard dependency: the design isolates the AI call behind a `Protocol` interface (mirroring the existing `sanctions-adapter` client pattern in `api/app/sanctions/`), so a different provider — another LLM, a dedicated OCR service, a local model — can be added later as a second implementation of the same interface, without touching the router, the data model, or the frontend.

**The AI call is made only from `api`.** No other service (`document-intelligence/`, still an empty placeholder; any future service) and not the frontend directly ever holds the API key or calls the AI provider. `api` is the sole caller, matching how `sanctions-adapter` is only ever called from `api` today.

## Architecture

New module `api/app/document_intelligence/`, structured exactly like `api/app/sanctions/`:

| File | Purpose |
|---|---|
| `checker.py` | `DocumentChecker` Protocol: `async def check(content: bytes, trade_terms: TradeTerms) -> DocumentCheckResult` |
| `claude_checker.py` | Real implementation — sends the PDF as a document content block to Claude's Messages API with a prompt describing the trade's terms, asking for a structured result |
| `fake_checker.py` | Always returns compliant — used automatically whenever `ANTHROPIC_API_KEY` is unset |
| `dependency.py` | `get_document_checker()` — returns the fake unless `settings.anthropic_api_key` is configured, mirroring `get_sanctions_client()`'s fallback exactly |

**Flow:**
1. `POST /trades/{id}/documents` persists the document as it does today (hash, MinIO upload, insert row), but sets `verification_status = "PENDING"` instead of `"UPLOADED"`, and schedules `background_tasks.add_task(run_document_check, document.id, content, trade)` — `content` is the bytes already read into memory for hashing, not re-fetched from MinIO.
2. The background task opens its own DB session via the existing `SessionLocal` factory (`app/db.py`) — background tasks run after the request's session has closed, so they can't reuse it. It calls `get_document_checker().check(...)`, then updates the document row with the result and commits.
3. `build_trade_terms(trade, db)` resolves the exporter/buyer org names (documents reference parties by name, not UUID) and assembles: product description, order value, currency, incoterm, payment term, LC reference, exporter/buyer names.

## Data Model

- `DocumentVerificationStatus` enum gains `DISCREPANCY` (alongside existing `UPLOADED`, `PENDING`, `VERIFIED`). New flow: upload → `PENDING` → `VERIFIED` or `DISCREPANCY`. `UPLOADED` remains in the enum for any pre-existing rows but is no longer produced by new uploads.
- Three new nullable columns on `documents` rather than a new table — a check is 1:1 with a document, and re-uploads already create a new row under the existing append-only design, so there's no history to model separately:
  - `ai_summary: str | None` — one-paragraph plain-language explanation
  - `ai_discrepancies: JSON | None` — list of discrepancy strings (empty list if compliant)
  - `ai_checked_at: datetime | None`
- New setting: `anthropic_api_key: str | None = None` in `api/app/config.py`.

## Error Handling & Limitations

If the Claude call fails (network error, rate limit, malformed PDF), the background task catches the exception, logs it, and leaves the document at `PENDING`. There is no `FAILED` status and no automatic retry in this version — a failed check shows "Processing" indefinitely with no user-visible indication that it stalled. This is a conscious scope cut, not an oversight: a retry mechanism or a distinct failure state is natural follow-up work once real usage shows how often it matters.

**The AI result is advisory, not authoritative.** Both inputs to the check are attacker-influenceable: the uploaded document's content is arbitrary bytes the model reads directly, so a submitted PDF could contain adversarial text attempting to steer the model's verdict (e.g. embedded instructions trying to get itself marked compliant). The trade's own recorded terms (`product_description` and the rest of `build_trade_terms`) are user-supplied at trade-creation time and are interpolated verbatim into the prompt, so they are not a trusted, independently-verified reference either. Given that, a `"Compliant"` / `VERIFIED` result must never be treated as a compliance guarantee — it is a first-pass signal for a human reviewer, not a substitute for one. This is a known, accepted limitation of using an LLM for this kind of check; it is not something this fix wave (or prompt engineering in general) is expected to fully solve.

## Frontend

- `web/src/lib/statusTones.ts` gains `documentVerificationStatusInfo()`, following the existing pattern used for trade/KYB/sanctions statuses: `UPLOADED` → neutral "Uploaded", `PENDING` → warning "Processing", `VERIFIED` → positive "Compliant", `DISCREPANCY` → negative "Discrepancy" (matching the prototype's own badge language).
- `TransactionDocumentsPage.tsx`: the static "Uploaded" text is replaced with a `<Badge>` driven by this status. When discrepancies exist, they're shown in a `<details>` disclosure under the row (summary text + bulleted list) — no modal.
- Lightweight polling: while any document is `PENDING`, `listDocuments` is re-fetched every 3 seconds (a new small `setInterval` in a `useEffect`; no polling pattern exists elsewhere in this codebase yet), stopping once nothing is pending or on unmount.

## Testing

- Backend: mirrors the existing `sanctions-adapter` test approach. `get_document_checker()` naturally returns `FakeDocumentChecker` in tests (no `ANTHROPIC_API_KEY` configured), so the compliant path needs no mocking. The discrepancy path uses `app.dependency_overrides[get_document_checker]` — the same override mechanism `conftest.py` already uses for `get_db` — to inject a stub returning a discrepancy result. Since this suite's `async_client` runs requests in-process over ASGI, `BackgroundTasks` execute before the response returns, so tests can assert the final `verification_status` immediately after upload with no sleep/poll needed.
- Frontend: `TransactionDocumentsPage.test.tsx` mocks `listDocuments` to return documents in each status and asserts the right badge/discrepancy list renders. A polling test mocks two successive `listDocuments` calls (first `PENDING`, then `VERIFIED`) and asserts the badge updates.

## Non-functional notes

- Cost/safety: exactly like `sanctions_adapter_url`, `anthropic_api_key` being unset means every environment (dev, test, CI) runs against the fake checker by default — no accidental API spend unless a key is explicitly configured.
- RBAC/security boundary is unaffected — this feature adds no new endpoint; it rides on the existing upload/list endpoints' existing auth.

## Explicitly deferred to later phases

- Per-document-type field schemas and structured validation
- A dedicated cloud OCR provider as an alternative `DocumentChecker` implementation
- Retry/failure status handling
- The full prototype discrepancy modal (rule IDs, severity, "resubmit corrected documents" flow)
- Wiring `blockchain-layer`/CorDapp so `api` is its sole caller (separate, already-identified architectural gap, not part of this slice)
