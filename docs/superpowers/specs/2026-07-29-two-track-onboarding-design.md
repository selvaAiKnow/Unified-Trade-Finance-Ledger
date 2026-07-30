# Two-Track Onboarding & Superuser Labeling — Design

## Purpose

The `web` portal's `/signup` page currently handles all three organization
types (Exporter, Buyer, Bank) through one generic form. Per the updated
prototype (`prototypes/trade_finance_platform_app.html`) and explicit
direction, this becomes two distinct onboarding paths — "organization"
(trade entities: exporters/importers) and "banking" (banks/financiers) —
and the existing admin-per-organization role concept gets a consistent
"Superuser" label in the UI.

This slice covers exactly these three points from the prototype's much
larger scope. Document verification (AI discrepancy checks), the bank
rules console (policy upload/diffing), and the richer multi-step wizard
content (beneficial owners, technical integration, SWIFT BIC, etc.) are
explicitly deferred — the prototype is reference material for a future
slice, not implemented here.

## What already exists (no backend changes needed)

- `Organization.org_type` already supports `EXPORTER`/`BUYER`/`BANK`
  (`api/app/models/enums.py`'s `OrgType`).
- `POST /auth/signup` already creates an `Organization` + one admin `User`
  together in one call, with the admin role auto-derived from `org_type`
  (`EXPORTER_ADMIN`/`BUYER`/`BANK_REVIEWER`).
- `POST /users` (invite) already lets that admin add further, non-admin
  users to the same org.
- `web/src/lib/roles.ts`'s `TEAM_INVITE_ROLES = ['EXPORTER_ADMIN',
  'BANK_REVIEWER', 'BUYER']` is already exactly the "admin per org" set —
  this is the existing mechanism "superuser" labels.

## Scope Decisions (from brainstorming)

- **Superuser is a display label, not a new role.** No schema/migration
  change. `TEAM_INVITE_ROLES`'s three values are relabeled "Superuser" in
  the UI; other roles keep their existing readable labels.
- **Two-track onboarding is web-only.** Both tracks reuse the exact same
  `signup()` API call and field set that exists today. Only the entry
  point, copy/framing, and which `org_type` values are selectable differ.

## Architecture

**Onboarding hub** (`web/src/pages/SignupPage.tsx` becomes a hub, replacing
its current single-form content): two cards, "Organization" (exporter/
importer) and "Banking" (bank/financier), each navigating to its own
route.

**Two new pages**, `OrganizationSignupPage.tsx` and `BankSignupPage.tsx`,
both rendering a shared internal form component (`SignupForm`, extracted
from the current `SignupPage.tsx` form) configured differently:
- `OrganizationSignupPage`: org type selectable between Exporter/Buyer
  (dropdown, matching today's two non-bank options).
- `BankSignupPage`: org type fixed to Bank — no dropdown, since the path
  chosen already determines it.

Both call the same `signup()` from `api/auth.ts` with the same
`SignupRequest` shape — no new endpoint, no new request/response fields.

**Routing** (`web/src/App.tsx`): `/signup` renders the hub;
`/signup/organization` and `/signup/banking` render the two new pages.

**Superuser labeling** (`web/src/lib/roles.ts`): add
`roleLabel(role: UserRole): string`, mapping `EXPORTER_ADMIN`/
`BANK_REVIEWER`/`BUYER` → `"Superuser"`, and the remaining roles
(`DOCS_COMPLIANCE`/`FINANCE`/`VIEWER`) to existing readable labels
(`"Docs & Compliance"`/`"Finance"`/`"Viewer"`, matching the labels already
used in `TeamPage.tsx`'s invite-role dropdown). Used in `TeamPage.tsx`'s
role column, which currently renders the raw enum value.

## Testing

Unit/component tests for the hub (renders both cards, navigates
correctly), both new signup pages (renders the right org-type
selection — dropdown vs. fixed — and calls `signup()` with the right
`org_type`), and `roleLabel()` (each of the 6 `UserRole` values maps to
its expected label) — matching the existing Vitest/Testing Library
convention already used throughout `web/src/pages/*.test.tsx`.
