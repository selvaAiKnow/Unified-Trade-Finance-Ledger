# Phase 1 — API + Data Model Service — Design

Date: 2026-07-22
Source: `docs/claude_code_build_prompt.md` (Blockchain-Integrated Cross-Border Trade Finance Platform), Section 6 Phase 1; UX reference: `prototypes/app.html` (HTML screen-flow prototype)

## Scope

This is the **first of three sub-projects** that make up Phase 1 of the source document (Section 6: "Core trade/document data model, portal, manual document upload, single sanctions API integration"). Phase 1's three deployables — `api`, `sanctions-adapter`, `web` — are each built as their own spec → plan → implementation cycle, in that order, mirroring how the existing Corda CorDapp slice (`docs/superpowers/specs/2026-07-21-corda-trade-finance-cordapp-design.md`) was scoped and built. This document covers only the **`api` service and its Postgres data model**.

**Explicitly out of scope for this sub-project** (deferred to later sub-projects/phases):
- The `web` portal (third sub-project, built against this API's real contracts)
- `sanctions-adapter`'s internals (second sub-project) — this service only depends on a stable HTTP client interface to that service, exercised via a fake in tests
- OCR/document intelligence, risk scoring, decision engine, workflow orchestration (Temporal), blockchain anchoring, business-registration lookup, bank-account confirmation, Kafka event publishing — all real Phase 2+/Phase 3+ work
- The 6-milestone on-chain lifecycle (owned by the CorDapp slice) — Phase 1 trades use a simpler internal status enum; the on-chain Timeline view is a known UI gap until the blockchain-layer bridge exists

**Reference use case:** India → Japan pharmaceutical export LC (matches the source doc and the prototype), generalized across industries/instruments per the document-registry table — nothing pharma-specific is hardcoded.

## Platform choices

- **Python 3.11+, FastAPI**, async throughout (matches Section 5's "Python FastAPI microservices" stack rule; async chosen because this service makes outbound calls to `sanctions-adapter` and the platform's stated direction is event-driven).
- **SQLAlchemy 2.0 (async) + Alembic** migrations, **Pydantic v2** request/response schemas, **pytest** + `httpx.AsyncClient` for tests.
- **PostgreSQL** for all transactional data (trades, documents, decisions) per Section 5.
- **MinIO** (S3-compatible) for document blob storage per Section 5; only `off_chain_storage_ref` pointers and `on_chain_hash` values are stored in Postgres.
- No API gateway service in Phase 1 (Section 7's folder list has no gateway folder) — RBAC is enforced directly in FastAPI route dependencies. Section 5's "REST behind an API Gateway" becomes a later-phase concern once there are enough services to justify fronting them.
- Core API stack is **Python FastAPI**, not Node/NestJS — resolving the contradiction between Section 5 (FastAPI for all backend services) and Section 7's folder note (which named NestJS); Section 5 governs.

## On-chain / off-chain boundary

Per Section 4 of the source doc: this service never anchors anything on-chain (no blockchain integration exists yet in Phase 1) but computes `on_chain_hash` (SHA-256 of the uploaded document) at upload time so Phase 3 has a value ready to anchor rather than a retrofit. No PII, full documents, or commercial-term detail ever leaves Postgres/MinIO for this service — there is nothing in this sub-project that writes to a chain at all yet.

## Data model (Postgres)

### `organizations`
| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | text | |
| `org_type` | enum | `EXPORTER`, `BUYER`, `BANK` |
| `country` | text | |
| `industry` | text | e.g. `Pharmaceuticals`, `Textiles` |
| `tax_id` | text | |
| `kyb_status` | enum | `PENDING`, `CLEAR`, `REVIEW`, `BLOCK` — derived from `kyb_checks` |
| `created_at` | timestamptz | |

### `users`
| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `org_id` | FK → organizations | |
| `name` | text | |
| `email` | text, unique | |
| `password_hash` | text | bcrypt |
| `role` | enum | `EXPORTER_ADMIN`, `DOCS_COMPLIANCE`, `FINANCE`, `VIEWER`, `BUYER`, `BANK_REVIEWER` |
| `status` | enum | `ACTIVE`, `INVITED` |
| `created_at` | timestamptz | |

### `kyb_checks`
| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `org_id` | FK → organizations | |
| `check_type` | enum | `BUSINESS_REGISTRATION`, `SANCTIONS_SCREENING`, `BANK_ACCOUNT` |
| `status` | enum | `PASSED`, `PENDING`, `FAILED` |
| `detail` | text, nullable | populated only for `SANCTIONS_SCREENING` (the one real integration) |
| `checked_at` | timestamptz | |

Only `SANCTIONS_SCREENING` calls the real sanctions-client interface at signup time; `BUSINESS_REGISTRATION` and `BANK_ACCOUNT` rows are inserted as static `PASSED` — matching Section 6's "single sanctions API integration" scope. This is a deliberate, documented shortcut, not an oversight: those two become real integrations only when External Integrations (component 9) is built.

### `document_registry`
| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `industry` | text | |
| `instrument_type` | text | e.g. `Letter of Credit` |
| `document_type` | text | e.g. `Certificate of Analysis (CoA)` |
| `category` | text | matches Section 2's document categories |
| `mandatory` | boolean | |
| `lc_required` | boolean | |

Seeded with the pharmaceutical checklist shown in the prototype's Documents tab (6 rows). This table is what `GET /document-registry` serves, and what the `packages/` registry client (used later by `web`, `document-intelligence`, `compliance-service`) wraps.

### `trades`
| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `lc_reference` | text | e.g. `MUFGJP2026LC1187` |
| `industry` | text | |
| `instrument_type` | text | |
| `exporter_org_id` | FK → organizations | |
| `buyer_org_id` | FK → organizations | |
| `issuing_bank_org_id` | FK → organizations | |
| `advising_bank_org_id` | FK → organizations | |
| `product_description` | text | |
| `order_value` | numeric | |
| `currency` | text | |
| `incoterm` | text | |
| `payment_term` | text | |
| `status` | enum | `DRAFT`, `DOCS_UNDER_REVIEW`, `COMPLIANCE_CLEAR`, `BANK_REVIEW`, `ACCEPTED`, `CLOSED` |
| `created_at` / `updated_at` | timestamptz | |

This Phase-1 status enum is deliberately simpler than the CorDapp's 6-milestone lifecycle (`LC_ISSUED → ... → CLOSED`) — reconciling the two (or replacing this enum with calls into the CorDapp) is future integration work, not part of this sub-project.

### `documents`
| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `trade_id` | FK → trades | |
| `category` | text | per Section 2 |
| `document_type` | text | |
| `uploaded_by` | FK → users | |
| `submitted_to` | FK → organizations | |
| `off_chain_storage_ref` | text | MinIO object key |
| `on_chain_hash` | text | SHA-256 hex, computed at upload, not yet anchored anywhere |
| `verification_status` | enum | `UPLOADED`, `PENDING`, `VERIFIED` |
| `created_at` | timestamptz | |

### `sanctions_screenings`
| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `trade_id` | FK → trades | |
| `party_screened` | text | which counterparty was screened |
| `status` | enum | `CLEAR`, `REVIEW`, `BLOCK` |
| `raw_response` | jsonb | full adapter response — doubles as the audit record for this decision type |
| `checked_at` | timestamptz | |

Distinct from `kyb_checks` (org-level, at signup) — this is trade-level screening, re-run per transaction.

## API surface

**Auth**
- `POST /auth/signup` — creates `organizations` + first `users` row, inserts 3 `kyb_checks` rows (real sanctions call, 2 static `PASSED`)
- `POST /auth/login` — email+password → JWT (`user_id`, `org_id`, `role` in payload)
- `GET /auth/me`

RBAC enforced via FastAPI dependencies (e.g. `require_role("BANK_REVIEWER")`) per route. No separate gateway service. JWT access tokens expire after 24h; no refresh-token flow in Phase 1 (re-login on expiry).

**Core resources**
- `GET/POST /organizations`, `GET /organizations/{id}/kyb-checks`
- `GET/POST /users` (team invite → `INVITED` status), `GET /users/me`
- `GET /document-registry?industry=&instrument_type=`
- `GET/POST /trades`, `GET /trades/{id}`
- `GET/POST /trades/{id}/documents` (upload streams to MinIO, computes `on_chain_hash` server-side). Re-uploading the same `document_type` for a trade creates a new, additional `documents` row (append-only, consistent with the CorDapp slice's append-only `documentHashes` design) rather than overwriting the previous one; the most recent row per `document_type` is what the checklist UI shows as current.
- `GET /trades/{id}/sanctions-screening`, `POST /trades/{id}/sanctions-screening`
- `GET /trades/{id}/bank-review` — Phase 1 is a manual bank-staff-entered verdict per document; automated LC-term matching is Document Intelligence (Phase 2)

All list/detail endpoints are scoped to the caller's org via a shared query filter (an exporter only sees trades where they're the exporter; a bank only sees trades where they're issuing/advising bank), not ad hoc per-endpoint checks.

## Sanctions-adapter contract

`sanctions-adapter` is the next sub-project. This service only needs a stable interface now: a typed async client (living in `packages/`, per Section 7's shared-code note) —

```python
async def screen(name: str, country: str) -> SanctionsResult
# SanctionsResult = { status: CLEAR|REVIEW|BLOCK, matches: list, raw: dict }
```

Tests use an in-memory fake implementing the same interface. The real HTTP-calling implementation is built in the `sanctions-adapter` sub-project against this same contract — nothing here changes when that lands.

## Repo scaffolding

Per Section 9 item 1 and Section 7's exact layout:
- **Built out now:** `api/`
- **Created as empty scaffold** (README stub only), built out in their own later phase: `web/`, `sanctions-adapter/`, `document-intelligence/`, `compliance-service/`, `risk-scoring/`, `decision-engine/`, `ledger-monitoring/`, `packages/` (will hold the sanctions-client + document-registry client types)
- **`infra/`**: gets real minimal content now — a `docker-compose.yml` with Postgres + MinIO, since `api/` needs both to run and be tested
- **Untouched:** `corda/` worktree (`.claude/worktrees/corda-tradefinance-cordapp`, on branch `worktree-corda-tradefinance-cordapp`) stays exactly as-is; this sub-project does not touch or merge it
- **Moved into place:** `screen flow/app.html` → `prototypes/app.html`; `screen flow/claude_code_build_prompt.md` → `docs/claude_code_build_prompt.md`

## Testing

- pytest + `httpx.AsyncClient` against the FastAPI app; Alembic migrations run against a test Postgres started via `infra/docker-compose.yml`.
- Unit tests: `on_chain_hash` computation, RBAC dependency behavior, org-scoping query filter, KYB-check seeding logic (1 real + 2 static rows).
- Integration tests per endpoint group (auth, organizations, users, document-registry, trades, documents, sanctions-screening, bank-review).

## Non-functional notes carried from the source doc

- Audit logging (Section 8, FATF-aligned): Phase 1's only compliance-style event is sanctions screening; each `sanctions_screenings` row (with `raw_response` and `checked_at`) *is* the audit record. A dedicated audit-log table is deferred until Phase 2 introduces multiple decision types to unify.
- `password_hash` via bcrypt; DB connections over TLS outside local dev. Full OAuth2/OIDC provider integration and HSM/KMS key management remain documented production requirements, not built in this sub-project.
- No PII, full documents, or off-chain storage references are ever exposed to anything resembling an on-chain client — there is no on-chain client in this sub-project at all.

## Explicitly deferred to later sub-projects/phases

- `sanctions-adapter` real implementation (next sub-project)
- `web` portal (third sub-project)
- Kafka event publishing, API gateway, Temporal orchestration
- OCR/Document Intelligence, Risk Scoring, Decision Engine, Ledger & Monitoring, remaining External Integrations
- Reconciling Phase 1's simple trade `status` enum with the CorDapp's 6-milestone on-chain lifecycle
- Business-registration lookup and bank-account confirmation as real integrations
