# Platform Admin Panel — Design

Date: 2026-08-04

## Scope

Today every `User` belongs to exactly one business `Organization` (exporter, importer, bank), and every role (`EXPORTER_ADMIN`, `BUYER`, `BANK_REVIEWER`, `DOCS_COMPLIANCE`, `FINANCE`, `VIEWER`) is scoped to that org's own data. There is no way for UTFL platform staff to see across organizations, and no way to correct a KYB status that was set automatically by the (fake) sanctions check — `Organization.kyb_status` can currently only ever be written by `POST /auth/signup`.

**In scope:**
- A new `PLATFORM_ADMIN` account type, not tied to any business organization, with its own login (reusing the existing auth mechanism) and a one-time bootstrap path to create the first one.
- Read access, platform-wide, to organizations, users, and trades.
- The one write action: manually setting an organization's `kyb_status` (Pending / Clear / Review / Block).
- A separate frontend area (`/admin/...`) with its own shell, since the existing `AppShell` assumes every signed-in user has an org.

**Explicitly out of scope (see Deferred):**
- Editing anything other than `kyb_status` (no user/org CRUD, no suspending accounts).
- An authenticated "invite another admin" flow — only the secret-gated bootstrap exists.
- An audit log of admin actions.
- Pagination on the admin list endpoints (dataset is small at this stage).

## Data model & auth

`users.org_id` is `NOT NULL` today (`api/app/models/user.py:15`), which cannot represent a platform-staff account. Migration 0013 makes it nullable. `role` is an unconstrained string column (not a DB enum), so adding `PLATFORM_ADMIN` to `UserRole` (`api/app/models/enums.py`) needs no migration — `require_role()` (`api/app/auth/dependencies.py:27`) already works generically off that string.

The existing JWT/login flow is reused as-is:
- `create_access_token(user_id, org_id, role)` (`api/app/auth/security.py:21`) changes its `org_id` parameter to `str | None`; `POST /auth/login` (`api/app/routers/auth.py:110`) passes `str(user.org_id) if user.org_id else None`.
- `get_current_user` / `require_role` need no changes — they already resolve a `User` row by ID and check `role` generically.

No parallel `/admin/login` endpoint or separate token type — a platform admin logs in through the same `/auth/login` an org user does; the frontend routes them differently afterward based on `role`.

## Bootstrapping the first admin

There is no public admin signup page (there shouldn't be one), and no existing seed/script precedent in this repo — every row today is created via an HTTP endpoint. Following that convention rather than introducing a new `scripts/` pattern:

- New setting `admin_bootstrap_secret: str | None = None` in `api/app/config.py`, mirroring `anthropic_api_key`.
- `POST /admin/bootstrap` — **no JWT required**, guarded by the secret instead:
  - body: `{ secret, name, email, password }`
  - 403 if `admin_bootstrap_secret` is unset or the provided secret doesn't match
  - 409 if a `PLATFORM_ADMIN` user already exists
  - creates a `User` with `org_id=None`, `role=PLATFORM_ADMIN`, `status=ACTIVE`
  - returns `UserOut` (not a token) — the admin then logs in normally via `/auth/login`, same two-step pattern signup already uses

Unset by default means this endpoint 403s in every environment until someone deliberately configures the secret — same safe-by-default posture as `anthropic_api_key`/`sanctions_adapter_url`.

## Backend API

New `api/app/routers/admin.py`, prefix `/admin`, every route except bootstrap gated by `require_role(UserRole.PLATFORM_ADMIN.value)`:

| Route | Behavior |
|---|---|
| `POST /admin/bootstrap` | Described above. |
| `GET /admin/organizations` | All organizations, ordered by name. `GET /organizations` already lists globally but caps at 20 for typeahead use (`api/app/routers/organizations.py:28`) — the admin route is separate rather than reusing/changing that endpoint's contract. |
| `GET /admin/organizations/{org_id}/kyb-checks` | All `KybCheck` rows for an org — same query as the existing endpoint minus the `user_can_access_org` scoping check. |
| `PATCH /admin/organizations/{org_id}/kyb-status` | Body `{ kyb_status: KybStatus }` → sets `Organization.kyb_status` directly, returns `OrganizationOut`. The one new write capability this feature adds. |
| `GET /admin/users` | All users platform-wide (today's `GET /users` is `WHERE org_id = current_user.org_id`, `api/app/routers/users.py:21` — this bypasses that). Reuses `UserOut`, which now needs `org_id: uuid.UUID | None`. |
| `GET /admin/trades` | All trades platform-wide, no `access.py` scoping. Reuses `TradeOut` as-is. |

## Frontend

- `web/src/api/types.ts`: `UserRole` gains `'PLATFORM_ADMIN'`; `User.org_id: string | null`.
- New `web/src/api/admin.ts`: thin wrappers over the five endpoints above, following the existing `apiFetch` pattern in `organizations.ts`/`trades.ts`.
- `LoginPage.tsx` (`web/src/pages/LoginPage.tsx:30`): after `getMe()`, navigate to `/admin` if `role === 'PLATFORM_ADMIN'`, else `/dashboard` (unchanged for everyone else).
- `App.tsx`: inside the existing `<ProtectedRoute />`, split into two guarded branches:
  - `RequireAdmin` (new, small component) — redirects to `/dashboard` unless `role === 'PLATFORM_ADMIN'`; wraps a new `AdminShell` with routes `/admin` (organizations + KYB status editor), `/admin/users`, `/admin/trades`.
  - `RequireBusinessUser` (new) — redirects to `/admin` if `role === 'PLATFORM_ADMIN'`; wraps the existing `AppShell` and all its current routes, unchanged otherwise.
- New `AdminShell.tsx`: a simple top-nav layout (Organizations / Users / Trades / Log out) — deliberately not a reuse of `AppShell`, which assumes an org (its Team/Profile links, breadcrumb map, and `getOrganization(user.org_id)` calls would all break for `org_id: null`).
- `AdminOrganizationsPage.tsx`: table of all orgs (name, type, country, industry, KYB badge) with an inline `<select>` per row to change `kyb_status`, calling the PATCH endpoint.
- `AdminUsersPage.tsx`: table of all users (name, email, role label via existing `roleLabel()`, status badge via existing `userStatusInfo()`). Also fetches the organizations list to resolve `org_id` → org name for display, rather than adding a join to the backend response.
- `AdminTradesPage.tsx`: table of all trades (LC reference, industry, status badge via existing `tradeStatusInfo()`, currency/order value, shipment deadline).
- No bootstrap UI — creating the first admin is a one-time ops action via direct API call, not a recurring user journey.

## Testing

- Backend: `test_admin_bootstrap.py` — missing/unset secret rejected, wrong secret rejected, success creates a `PLATFORM_ADMIN` with `org_id=None`, a second bootstrap call after one exists returns 409. `test_admin_endpoints.py` — non-admin roles get 403 from every `/admin/*` route (except bootstrap); an admin sees organizations/users/trades across multiple orgs created via normal signup; the KYB status PATCH updates the row and is reflected in a subsequent `GET /admin/organizations`.
- Frontend: `LoginPage.test.tsx` gains a case asserting a `PLATFORM_ADMIN` login redirects to `/admin`. New tests for `AdminShell`, each admin page (rendering + the KYB status change action), and a routing test asserting `RequireAdmin`/`RequireBusinessUser` redirect each role away from the wrong area.

## Non-functional notes

- This is a new trust boundary: a `PLATFORM_ADMIN` token can read every organization's KYB detail and every trade on the platform. It reuses the same JWT expiry and bcrypt hashing as every other account — no additional MFA or audit trail in this version (see Deferred).
- `admin_bootstrap_secret` unset (the default) means the panel is fully inert until someone opts in by configuring it.

## Deferred

- Org/user editing beyond `kyb_status` (suspending accounts, changing roles, etc.)
- An authenticated endpoint to invite additional admins (only the one-time secret-gated bootstrap exists)
- An audit log of who changed what KYB status and when
- Pagination on the admin list endpoints
