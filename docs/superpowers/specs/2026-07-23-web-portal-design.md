# Phase 1 — Web Portal — Design

Date: 2026-07-23
Source: `docs/claude_code_build_prompt.md`, Section 6 Phase 1 ("portal"), Section 1 component 1 ("Portal Layer"), Section 5 ("Frontend/Portal: React + Tailwind CSS, MOBX, SSE for live status"); UX reference: `prototypes/app.html`

## Scope

This is the **third and final sub-project of Phase 1** (`api`, `sanctions-adapter`, `web`), following the same spec → plan → implementation cycle used for the first two. It builds the React portal against the already-merged `api` service's real endpoints — no mock backend, no new server-side work (the one exception: none needed, `api` already exposes everything this portal consumes).

**Explicitly out of scope for this sub-project:**
- Any change to `api` or `sanctions-adapter` — this is a pure frontend consumer of what already exists
- SSE / live push updates — no event/Kafka infrastructure exists yet (Section 1's Workflow Orchestration component); pages fetch on mount and refetch after mutating actions instead
- A real on-chain Timeline — rendered with static/placeholder milestone data until the blockchain-layer bridge exists (a documented gap, not an oversight)
- OCR-assisted document upload, automated LC-term matching, risk scoring, decision engine — all Phase 2 components with no backing API yet
- Team-invite acceptance flow (accepting an invite and setting a password) — `api`'s `POST /users` already documents this as a Phase 1 gap (invited users get an empty, unusable password hash); this portal will not invent a flow for something the backend doesn't support

**Reference use case:** same India → Japan pharmaceutical export LC scenario used throughout — the portal renders whatever industry/instrument data the API returns, nothing pharma-specific is hardcoded in the UI.

## Platform choices

- **Vite + React 18 + TypeScript**, not Next.js — this is an internal, auth-gated dashboard with no SSR/SEO need, so a plain SPA bundler is the better fit than a heavier framework.
- **Tailwind CSS** for styling, **MobX** for state, **React Router** for navigation — matching Section 5's stated stack (SSR/framework choice within "React" was unspecified there, resolved above).
- **No SSE.** Section 5 names it, but no backend push mechanism exists to serve it (confirmed: no Kafka, no Workflow Orchestration service, no SSE endpoint anywhere in `api`). Pages use plain REST fetch, refetching on navigation and after mutating actions (e.g., after a document upload, refetch that trade's document list). SSE becomes a real option once Workflow Orchestration exists to publish trade-state-change events.
- **Visual language carried over from `prototypes/app.html`** (the HTML screen-flow reference): the ink/paper/seal color palette, serif+sans font pairing, card/badge/timeline visual components. Reimplemented as proper React/Tailwind components, not copied as literal markup — the prototype is explicitly "reference only, not deployed" per Section 7.

## Auth & session

- JWT stored in `localStorage` (no refresh-token flow exists server-side — `api`'s tokens are 24h, no refresh, by design). A thin API client wraps `fetch`, attaches `Authorization: Bearer <token>` when present, and on any `401` clears the stored session and redirects to `/login`.
- `AuthStore` (MobX) holds `{user, org, role, token}`, hydrated via `GET /auth/me` on app load if a token exists in storage.
- Role (read from the hydrated user) drives nav visibility: "Compliance" nav item and the Bank Review tab's record-verdict form only render for `BANK_REVIEWER`; "New transaction" only for exporter-side roles; team-invite form only for `ADMIN_ROLES` (`EXPORTER_ADMIN`, `BANK_REVIEWER`, `BUYER`) — mirroring `api`'s own role gates exactly, not inventing new client-side rules.
- **Signup verify-step behavior differs from the prototype:** the prototype shows a "pending, typical review under 24 hours" screen. `api`'s `POST /auth/signup` runs all 3 KYB checks synchronously and returns the final `kyb_status`/check results in the same response — there is nothing to poll for. The portal's verify step renders the already-resolved result immediately, not a pending/waiting state.

## Pages & routes

| Route | Backing endpoint(s) | Notes |
|---|---|---|
| `/signup` | `POST /auth/signup` | 3-step wizard (account, verify, team) matching the prototype's stepper; verify step shows immediate result per above |
| `/login` | `POST /auth/login` | Real email/password form, not the prototype's role-picker stand-in |
| `/dashboard` | `GET /trades` | Role-aware heading/subtext (exporter/buyer/bank framing), matching the prototype |
| `/transactions` | `GET /trades` | Full list |
| `/transactions/new` | `GET /document-registry`, `POST /trades` | Industry/instrument selection drives which document checklist is fetched for the next screen |
| `/transactions/:id/overview` | `GET /trades/:id` | Parties + terms cards |
| `/transactions/:id/documents` | `GET /document-registry?industry=&instrument_type=`, `GET/POST /trades/:id/documents` | Registry entries not yet uploaded show an upload control; uploaded ones show status |
| `/transactions/:id/compliance` | `GET/POST /trades/:id/sanctions-screening` | Trigger + list past screenings |
| `/transactions/:id/bank-review` | `GET/POST /trades/:id/bank-review` | List findings for all roles; record-verdict form only for `BANK_REVIEWER` |
| `/transactions/:id/timeline` | *(none — static/placeholder)* | Renders the 6-milestone visual per the prototype with placeholder state; explicitly not wired to any real data source |
| `/organizations/:id` | `GET /organizations/:id`, `GET /organizations/:id/kyb-checks` | Org/counterparty profile — new relative to the prototype (which has no such page), needed because trade participants must be viewable and `api` already supports it with shared-trade scoping |
| `/team` | `GET/POST /users` | Invite form gated to admin-tier roles per above |
| `/profile` | `GET /auth/me` | |

## State management

MobX kept deliberately lean: `AuthStore` is the only long-lived global store. Each page owns its own local fetch/loading/error state for its own data — no shared global entity cache, since no Phase 1 page needs to stay live-synced with another (e.g., the trade list and a trade detail page never need to reflect each other's in-flight changes without a full navigation/refetch in between). Introducing a normalized global store now would be premature for what Phase 1 actually needs.

## Testing

Vitest + React Testing Library. The API client is mocked in tests (no real network calls to a live `api` instance — consistent with how `api` and `sanctions-adapter`'s own suites avoid live external dependencies). Per page: renders correctly with fetched data, handles loading/error/empty states, and exercises the page's primary user action (e.g., submitting the new-transaction form calls `POST /trades` with the expected payload; uploading a document calls `POST /trades/:id/documents` with the right multipart fields).

## Non-functional notes carried from the source doc

- RBAC enforcement is still primarily `api`'s job (Section 8 / the `api` design's own stated boundary) — the portal's role-based UI hiding is a UX convenience, not a security boundary; `api` independently rejects unauthorized requests regardless of what the UI shows.
- No PII or full documents are ever sent anywhere except `api` itself (the portal talks only to `api`, never directly to MinIO or any other store) — the portal introduces no new on-chain/off-chain boundary concerns since it has no chain-adjacent code at all.

## Explicitly deferred to later phases

- SSE / live push updates (once Workflow Orchestration/Kafka exist)
- Real Timeline data (once the blockchain-layer bridge exists)
- OCR-assisted upload, discrepancy auto-detection, risk scoring, decision engine UI (Phase 2)
- Team-invite acceptance/password-set flow (a documented `api` gap, not this portal's to solve)
