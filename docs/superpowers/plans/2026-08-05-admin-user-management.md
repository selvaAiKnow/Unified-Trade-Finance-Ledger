# Admin User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Add/View/Edit/Deactivate for users to the `admin-web` app's `/users` page, with per-row actions as icon buttons.

**Architecture:** A new `SUSPENDED` value is added to `UserStatus` (a plain string column — no migration). New admin-only backend endpoints (`POST/GET/PATCH /admin/users...`) create, fetch, and update users across any org, restricted to org-level roles (never `PLATFORM_ADMIN`). "Delete" is implemented as deactivation (status → `SUSPENDED`) rather than a hard row delete, since `documents.uploaded_by` and `bank_review_findings.reviewed_by` reference `users.id` with no cascade — a hard delete would fail for any user with activity history. `/auth/login` rejects suspended users. On the frontend, three new pages (`/users/new`, `/users/:userId`, `/users/:userId/edit`) are added to `admin-web`, and the existing `/users` list gains icon-button row actions (view/edit/deactivate-or-reactivate) plus an icon-button "Add user" control.

**Tech Stack:** FastAPI + SQLAlchemy (`api/`), React + TypeScript + Vite (`admin-web/`, `web/`).

## Global Constraints

- `UserStatus` gains `SUSPENDED = "SUSPENDED"`. The column is a plain `String` with no DB-level enum/check constraint, so this needs no Alembic migration — only the Python enum and the TypeScript unions in both frontends.
- Deactivating a user means setting `status=SUSPENDED`, never a DB row delete. `/auth/login` rejects `SUSPENDED` users with 401. There is no separate revocation of already-issued tokens (out of scope — this app has no session/token revocation infrastructure anywhere today; blocking at login matches the codebase's existing security posture).
- New admin endpoints only ever create/assign org-level roles (`EXPORTER_ADMIN`, `DOCS_COMPLIANCE`, `FINANCE`, `VIEWER`, `BUYER`, `BANK_REVIEWER`) — never `PLATFORM_ADMIN`. `PLATFORM_ADMIN` stays creatable only via the existing secret-gated `/admin/bootstrap` flow.
- An existing `PLATFORM_ADMIN` user can never be edited, have its status changed, or be targeted by these new admin endpoints (400 if attempted) — a platform admin has no org, so the edit form's required org field would be structurally meaningless for them anyway. The frontend hides Edit/Deactivate for `PLATFORM_ADMIN` rows; the backend independently rejects it too (defense in depth, matching the existing "belt-and-suspenders" pattern already used in `api/app/routers/users.py`).
- New user creation is invite-style, matching the existing `POST /users` convention: `password_hash=""`, `status=INVITED`, no password set by the admin.
- On the Edit page, name, organization, role, and status are all changeable. Email is fixed (it's the login identity) and shown read-only.
- The View page shows only the user's own fields (name, email, organization, role, status) — no additional activity data.
- Per-row actions (View/Edit/Deactivate-or-Reactivate) are icon buttons with `aria-label`s, not text links. The "Add user" control is also an icon button. Icons follow the existing SVG convention already used in `web/src/components/AppShell.tsx`: `viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 shrink-0"`.
- No new shared "UserForm" component — Add and Edit pages each own their local form state, matching this codebase's existing convention of small, independent page components over premature shared abstractions.

---

### Task 1: Backend — SUSPENDED status and login rejection

**Files:**
- Modify: `api/app/models/enums.py`
- Modify: `api/app/routers/auth.py`
- Modify: `api/tests/test_auth_login.py`

**Interfaces:**
- Produces: `UserStatus.SUSPENDED` — every later task in this plan relies on this enum value existing.

- [ ] **Step 1: Add the new status value — in `api/app/models/enums.py`, replace the `UserStatus` class**

```python
class UserStatus(str, Enum):
    ACTIVE = "ACTIVE"
    INVITED = "INVITED"
    SUSPENDED = "SUSPENDED"
```

- [ ] **Step 2: Write the failing test — add to the top of `api/tests/test_auth_login.py` and append a new test at the end**

Add these two imports as the very first lines of the file (the file currently has no imports):

```python
from sqlalchemy import select

from app.models.user import User
```

Append this test at the end of the file:

```python
async def test_login_rejects_suspended_user(async_client, db_session):
    await _signup(async_client, "suspended-login@example.com", "a good password")
    user = (await db_session.execute(select(User).where(User.email == "suspended-login@example.com"))).scalar_one()
    user.status = "SUSPENDED"
    await db_session.commit()

    response = await async_client.post(
        "/auth/login", json={"email": "suspended-login@example.com", "password": "a good password"}
    )
    assert response.status_code == 401
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `api/venv/Scripts/python.exe -m pytest tests/test_auth_login.py::test_login_rejects_suspended_user -v` from the `api` directory.
Expected: FAIL — login currently only checks the password, not status, so this would currently return 200.

- [ ] **Step 4: Implement — in `api/app/routers/auth.py`, replace the `login` function**

```python
@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> LoginResponse:
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if user.status == UserStatus.SUSPENDED.value:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="This account has been suspended")

    token = create_access_token(user_id=str(user.id), org_id=str(user.org_id) if user.org_id else None, role=user.role)
    return LoginResponse(access_token=token)
```

(`UserStatus` is already imported in this file's top-level import from `app.models.enums` — no new import needed.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `api/venv/Scripts/python.exe -m pytest tests/test_auth_login.py -v` from the `api` directory.
Expected: all tests in the file PASS.

- [ ] **Step 6: Run the full backend suite**

Run: `api/venv/Scripts/python.exe -m pytest -q` from the `api` directory.
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add api/app/models/enums.py api/app/routers/auth.py api/tests/test_auth_login.py
git commit -m "Add a SUSPENDED user status and reject it at login"
```

---

### Task 2: Frontend (main web app) — propagate SUSPENDED so it doesn't crash existing pages

**Files:**
- Modify: `web/src/api/types.ts`
- Modify: `web/src/lib/statusTones.ts`
- Modify: `web/src/lib/statusTones.test.ts`

**Interfaces:**
- Consumes: `UserStatus.SUSPENDED` (Task 1).

**Why this task exists:** `web/src/pages/TeamPage.tsx` and `web/src/pages/ProfilePage.tsx` both call `userStatusInfo(user.status)` and immediately read `.label`/`.tone` off the result with no null check. `userStatusInfo`'s map is typed as `Record<UserStatus, StatusInfo>`, so once `UserStatus` includes `'SUSPENDED'`, TypeScript will refuse to compile `web/src/lib/statusTones.ts` until the map covers it — but until that's fixed, a teammate a platform admin has suspended would crash `TeamPage` for their org (an org admin can see a suspended teammate's row long before the row-level deactivate feature in this plan is even built, since deactivation happens platform-wide).

- [ ] **Step 1: Write the failing test — in `web/src/lib/statusTones.test.ts`, replace the `userStatusInfo` test**

```typescript
describe('userStatusInfo', () => {
  it('maps every UserStatus value to a tone and label', () => {
    expect(userStatusInfo('ACTIVE')).toEqual({ tone: 'positive', label: 'Active' });
    expect(userStatusInfo('INVITED')).toEqual({ tone: 'warning', label: 'Invited' });
    expect(userStatusInfo('SUSPENDED')).toEqual({ tone: 'negative', label: 'Suspended' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/statusTones.test.ts` from the `web` directory.
Expected: FAIL — `'SUSPENDED'` isn't a valid `UserStatus` yet, so this won't even compile.

- [ ] **Step 3: Add the type — in `web/src/api/types.ts`, replace the `UserStatus` line**

```typescript
export type UserStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED';
```

- [ ] **Step 4: Add the mapping — in `web/src/lib/statusTones.ts`, replace the `userStatusInfo` function**

```typescript
export function userStatusInfo(status: UserStatus): StatusInfo {
  const map: Record<UserStatus, StatusInfo> = {
    ACTIVE: { tone: 'positive', label: 'Active' },
    INVITED: { tone: 'warning', label: 'Invited' },
    SUSPENDED: { tone: 'negative', label: 'Suspended' },
  };
  return map[status];
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/statusTones.test.ts` from the `web` directory.
Expected: PASS.

- [ ] **Step 6: Run the full frontend suite**

Run: `npx vitest run` from the `web` directory.
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add web/src/api/types.ts web/src/lib/statusTones.ts web/src/lib/statusTones.test.ts
git commit -m "Propagate the SUSPENDED user status to the main web app"
```

---

### Task 3: Backend — admin user create/get/update/status endpoints

**Files:**
- Modify: `api/app/schemas/admin.py`
- Modify: `api/app/routers/admin.py`
- Modify: `api/tests/test_admin_endpoints.py`

**Interfaces:**
- Consumes: `UserStatus.SUSPENDED` (Task 1).
- Produces: `POST /admin/users`, `GET /admin/users/{user_id}`, `PATCH /admin/users/{user_id}`, `PATCH /admin/users/{user_id}/status` — all `response_model=UserOut`, all gated by `require_admin` — Tasks 5-8 (`admin-web`) consume these exactly.

- [ ] **Step 1: Write the failing tests — extend `api/tests/test_admin_endpoints.py`**

In the existing `test_non_admin_gets_403_from_admin_routes` test, insert this block right after the existing `# Test GET /admin/users` block (i.e. right before `# Test GET /admin/trades`):

```python
    # Test POST /admin/users
    response = await async_client.post(
        "/admin/users",
        json={"name": "X", "email": "x@example.com", "org_id": org_id, "role": "VIEWER"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403

    # Test GET /admin/users/{id}
    response = await async_client.get(
        "/admin/users/00000000-0000-0000-0000-000000000000", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403

    # Test PATCH /admin/users/{id}
    response = await async_client.patch(
        "/admin/users/00000000-0000-0000-0000-000000000000",
        json={"name": "X", "org_id": org_id, "role": "VIEWER", "status": "ACTIVE"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403

    # Test PATCH /admin/users/{id}/status
    response = await async_client.patch(
        "/admin/users/00000000-0000-0000-0000-000000000000/status",
        json={"status": "SUSPENDED"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403
```

Then append these tests at the end of the file:

```python
async def test_admin_can_create_a_user(async_client, monkeypatch):
    org_id, _ = await _signup_and_login(async_client, "create-target-org@example.com")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.post(
        "/admin/users",
        json={"name": "New Hire", "email": "new-hire@example.com", "org_id": org_id, "role": "VIEWER"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "New Hire"
    assert body["email"] == "new-hire@example.com"
    assert body["org_id"] == org_id
    assert body["role"] == "VIEWER"
    assert body["status"] == "INVITED"


async def test_admin_create_user_rejects_platform_admin_role(async_client, monkeypatch):
    org_id, _ = await _signup_and_login(async_client, "reject-role-org@example.com")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.post(
        "/admin/users",
        json={"name": "Wannabe Admin", "email": "wannabe@example.com", "org_id": org_id, "role": "PLATFORM_ADMIN"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 400


async def test_admin_create_user_rejects_unknown_organization(async_client, monkeypatch):
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.post(
        "/admin/users",
        json={
            "name": "Ghost",
            "email": "ghost@example.com",
            "org_id": "00000000-0000-0000-0000-000000000000",
            "role": "VIEWER",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 404


async def test_admin_create_user_rejects_duplicate_email(async_client, monkeypatch):
    org_id, _ = await _signup_and_login(async_client, "dupe-target-org@example.com")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.post(
        "/admin/users",
        json={"name": "Duplicate", "email": "dupe-target-org@example.com", "org_id": org_id, "role": "VIEWER"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 409


async def test_admin_can_get_a_single_user(async_client, monkeypatch):
    await _signup_and_login(async_client, "get-target-org@example.com")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)
    users_response = await async_client.get("/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    target = next(u for u in users_response.json() if u["email"] == "get-target-org@example.com")

    response = await async_client.get(f"/admin/users/{target['id']}", headers={"Authorization": f"Bearer {admin_token}"})

    assert response.status_code == 200
    assert response.json()["email"] == "get-target-org@example.com"


async def test_admin_get_user_404_for_unknown_id(async_client, monkeypatch):
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.get(
        "/admin/users/00000000-0000-0000-0000-000000000000", headers={"Authorization": f"Bearer {admin_token}"}
    )

    assert response.status_code == 404


async def test_admin_can_update_a_user(async_client, monkeypatch):
    await _signup_and_login(async_client, "update-target-org@example.com")
    other_org_id, _ = await _signup_and_login(async_client, "update-other-org@example.com", org_type="BUYER")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)
    users_response = await async_client.get("/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    target = next(u for u in users_response.json() if u["email"] == "update-target-org@example.com")

    response = await async_client.patch(
        f"/admin/users/{target['id']}",
        json={"name": "Renamed User", "org_id": other_org_id, "role": "FINANCE", "status": "ACTIVE"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Renamed User"
    assert body["org_id"] == other_org_id
    assert body["role"] == "FINANCE"
    assert body["status"] == "ACTIVE"


async def test_admin_update_user_rejects_platform_admin_target(async_client, monkeypatch):
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)
    org_id, _ = await _signup_and_login(async_client, "irrelevant-org-for-admin-target@example.com")
    users_response = await async_client.get("/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    admin_user = next(u for u in users_response.json() if u["role"] == "PLATFORM_ADMIN")

    response = await async_client.patch(
        f"/admin/users/{admin_user['id']}",
        json={"name": "Hijacked", "org_id": org_id, "role": "VIEWER", "status": "ACTIVE"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 400


async def test_admin_can_update_a_users_status(async_client, monkeypatch):
    await _signup_and_login(async_client, "status-target-org@example.com")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)
    users_response = await async_client.get("/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    target = next(u for u in users_response.json() if u["email"] == "status-target-org@example.com")

    response = await async_client.patch(
        f"/admin/users/{target['id']}/status",
        json={"status": "SUSPENDED"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "SUSPENDED"


async def test_admin_update_status_rejects_platform_admin_target(async_client, monkeypatch):
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)
    users_response = await async_client.get("/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    admin_user = next(u for u in users_response.json() if u["role"] == "PLATFORM_ADMIN")

    response = await async_client.patch(
        f"/admin/users/{admin_user['id']}/status",
        json={"status": "SUSPENDED"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 400
```

- [ ] **Step 2: Run the new tests to see them fail**

Run: `api/venv/Scripts/python.exe -m pytest tests/test_admin_endpoints.py -v` from the `api` directory.
Expected: FAIL — the routes don't exist yet (404/405), and the extended 403 test also fails on the new blocks.

- [ ] **Step 3: Replace `api/app/schemas/admin.py` with the following**

```python
import uuid

from pydantic import BaseModel, EmailStr

from app.models.enums import KybStatus, UserRole, UserStatus


class AdminBootstrapRequest(BaseModel):
    secret: str
    name: str
    email: EmailStr
    password: str


class AdminKybStatusUpdate(BaseModel):
    kyb_status: KybStatus


class AdminUserCreate(BaseModel):
    name: str
    email: EmailStr
    org_id: uuid.UUID
    role: UserRole


class AdminUserUpdate(BaseModel):
    name: str
    org_id: uuid.UUID
    role: UserRole
    status: UserStatus


class AdminUserStatusUpdate(BaseModel):
    status: UserStatus
```

- [ ] **Step 4: Update the import line in `api/app/routers/admin.py`**

Replace:
```python
from app.schemas.admin import AdminBootstrapRequest, AdminKybStatusUpdate
```
with:
```python
from app.schemas.admin import (
    AdminBootstrapRequest,
    AdminKybStatusUpdate,
    AdminUserCreate,
    AdminUserStatusUpdate,
    AdminUserUpdate,
)
```

- [ ] **Step 5: Add the assignable-roles constant right after `require_admin = require_role(UserRole.PLATFORM_ADMIN.value)`**

```python
require_admin = require_role(UserRole.PLATFORM_ADMIN.value)

# Mirrors the INVITABLE_ROLES rule in app/routers/users.py: PLATFORM_ADMIN is a
# platform-wide role that must only ever be created through the secret-gated
# POST /admin/bootstrap, so admin-driven user create/edit can never grant or
# retarget it.
ADMIN_ASSIGNABLE_ROLES = {r.value for r in UserRole} - {UserRole.PLATFORM_ADMIN.value}
```

- [ ] **Step 6: Add the four new endpoints, right after `list_all_users` and before `list_all_trades`**

```python
@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
async def create_user(payload: AdminUserCreate, db: AsyncSession = Depends(get_db)) -> User:
    if payload.role.value not in ADMIN_ASSIGNABLE_ROLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot assign the platform admin role here")

    org = await db.get(Organization, payload.org_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    new_user = User(
        org_id=payload.org_id,
        name=payload.name,
        email=payload.email,
        password_hash="",  # invite-style, matching POST /users: no invite-acceptance/password-set flow yet
        role=payload.role.value,
        status=UserStatus.INVITED.value,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user


@router.get("/users/{user_id}", response_model=UserOut, dependencies=[Depends(require_admin)])
async def get_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.patch("/users/{user_id}", response_model=UserOut, dependencies=[Depends(require_admin)])
async def update_user(user_id: uuid.UUID, payload: AdminUserUpdate, db: AsyncSession = Depends(get_db)) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.role == UserRole.PLATFORM_ADMIN.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot edit a platform admin through this endpoint")
    if payload.role.value not in ADMIN_ASSIGNABLE_ROLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot assign the platform admin role here")

    org = await db.get(Organization, payload.org_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    user.name = payload.name
    user.org_id = payload.org_id
    user.role = payload.role.value
    user.status = payload.status.value
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/users/{user_id}/status", response_model=UserOut, dependencies=[Depends(require_admin)])
async def update_user_status(user_id: uuid.UUID, payload: AdminUserStatusUpdate, db: AsyncSession = Depends(get_db)) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.role == UserRole.PLATFORM_ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot change a platform admin's status through this endpoint"
        )
    user.status = payload.status.value
    await db.commit()
    await db.refresh(user)
    return user
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `api/venv/Scripts/python.exe -m pytest tests/test_admin_endpoints.py -v` from the `api` directory.
Expected: all tests in the file PASS.

- [ ] **Step 8: Run the full backend suite**

Run: `api/venv/Scripts/python.exe -m pytest -q` from the `api` directory.
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add api/app/schemas/admin.py api/app/routers/admin.py api/tests/test_admin_endpoints.py
git commit -m "Add admin endpoints to create, view, and update users across any org"
```

---

### Task 4: Frontend (admin-web) — foundational plumbing

**Files:**
- Modify: `admin-web/src/api/types.ts`
- Modify: `admin-web/src/api/admin.ts`
- Modify: `admin-web/src/lib/roles.ts`
- Modify: `admin-web/src/lib/roles.test.ts`
- Modify: `admin-web/src/lib/statusTones.ts`
- Modify: `admin-web/src/lib/statusTones.test.ts`
- Create: `admin-web/src/components/icons.tsx`

**Interfaces:**
- Consumes: `POST/GET/PATCH /admin/users...` (Task 3).
- Produces: `createAdminUser`, `getAdminUser`, `updateAdminUser`, `updateAdminUserStatus` (all in `admin-web/src/api/admin.ts`); `ASSIGNABLE_ROLE_OPTIONS` (in `admin-web/src/lib/roles.ts`); `EyeIcon`, `PencilIcon`, `BanIcon`, `CheckCircleIcon`, `PlusIcon` (in `admin-web/src/components/icons.tsx`) — Tasks 5-8 consume all of these.

- [ ] **Step 1: Write the failing test — in `admin-web/src/lib/statusTones.test.ts`, replace the `userStatusInfo` test**

```typescript
describe('userStatusInfo', () => {
  it('maps every UserStatus value to a tone and label', () => {
    expect(userStatusInfo('ACTIVE')).toEqual({ tone: 'positive', label: 'Active' });
    expect(userStatusInfo('INVITED')).toEqual({ tone: 'warning', label: 'Invited' });
    expect(userStatusInfo('SUSPENDED')).toEqual({ tone: 'negative', label: 'Suspended' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/statusTones.test.ts` from the `admin-web` directory.
Expected: FAIL — same reasoning as Task 2: `'SUSPENDED'` isn't a valid `UserStatus` yet, so this won't even compile.

- [ ] **Step 3: Add `SUSPENDED` to the type — in `admin-web/src/api/types.ts`, replace the `UserStatus` line**

```typescript
export type UserStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED';
```

- [ ] **Step 4: Add the mapping — in `admin-web/src/lib/statusTones.ts`, replace the `userStatusInfo` function**

```typescript
export function userStatusInfo(status: UserStatus): StatusInfo {
  const map: Record<UserStatus, StatusInfo> = {
    ACTIVE: { tone: 'positive', label: 'Active' },
    INVITED: { tone: 'warning', label: 'Invited' },
    SUSPENDED: { tone: 'negative', label: 'Suspended' },
  };
  return map[status];
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/statusTones.test.ts` from the `admin-web` directory.
Expected: PASS.

- [ ] **Step 6: Write the failing test — in `admin-web/src/lib/roles.test.ts`, add a new test**

```typescript
import { ASSIGNABLE_ROLE_OPTIONS, roleLabel } from './roles';
```

(replace the existing `import { roleLabel } from './roles';` line with the line above), then append this test at the end of the file:

```typescript
describe('ASSIGNABLE_ROLE_OPTIONS', () => {
  it('offers every org-level role with a distinct label, excluding platform admin', () => {
    expect(ASSIGNABLE_ROLE_OPTIONS).toEqual([
      { value: 'EXPORTER_ADMIN', label: 'Exporter Admin' },
      { value: 'BUYER', label: 'Buyer' },
      { value: 'BANK_REVIEWER', label: 'Bank Reviewer' },
      { value: 'DOCS_COMPLIANCE', label: 'Docs & Compliance' },
      { value: 'FINANCE', label: 'Finance' },
      { value: 'VIEWER', label: 'Viewer' },
    ]);
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npx vitest run src/lib/roles.test.ts` from the `admin-web` directory.
Expected: FAIL — `ASSIGNABLE_ROLE_OPTIONS` doesn't exist yet.

- [ ] **Step 8: Replace `admin-web/src/lib/roles.ts` with the following**

```typescript
import type { UserRole } from '../api/types';

const ROLE_LABELS: Record<UserRole, string> = {
  EXPORTER_ADMIN: 'Superuser',
  BANK_REVIEWER: 'Superuser',
  BUYER: 'Superuser',
  DOCS_COMPLIANCE: 'Docs & Compliance',
  FINANCE: 'Finance',
  VIEWER: 'Viewer',
  PLATFORM_ADMIN: 'Platform Admin',
};

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role];
}

export const ASSIGNABLE_ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: 'EXPORTER_ADMIN', label: 'Exporter Admin' },
  { value: 'BUYER', label: 'Buyer' },
  { value: 'BANK_REVIEWER', label: 'Bank Reviewer' },
  { value: 'DOCS_COMPLIANCE', label: 'Docs & Compliance' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'VIEWER', label: 'Viewer' },
];
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx vitest run src/lib/roles.test.ts` from the `admin-web` directory.
Expected: PASS.

- [ ] **Step 10: Add the API functions — replace `admin-web/src/api/admin.ts` with the following**

```typescript
import { apiFetch } from './client';
import type { KybStatus, Organization, Trade, User, UserRole, UserStatus } from './types';

export function listAdminOrganizations(): Promise<Organization[]> {
  return apiFetch<Organization[]>('/admin/organizations');
}

export function updateOrganizationKybStatus(orgId: string, kybStatus: KybStatus): Promise<Organization> {
  return apiFetch<Organization>(`/admin/organizations/${orgId}/kyb-status`, {
    method: 'PATCH',
    body: { kyb_status: kybStatus },
  });
}

export function listAdminUsers(): Promise<User[]> {
  return apiFetch<User[]>('/admin/users');
}

export function createAdminUser(payload: { name: string; email: string; org_id: string; role: UserRole }): Promise<User> {
  return apiFetch<User>('/admin/users', { method: 'POST', body: payload });
}

export function getAdminUser(userId: string): Promise<User> {
  return apiFetch<User>(`/admin/users/${userId}`);
}

export function updateAdminUser(
  userId: string,
  payload: { name: string; org_id: string; role: UserRole; status: UserStatus },
): Promise<User> {
  return apiFetch<User>(`/admin/users/${userId}`, { method: 'PATCH', body: payload });
}

export function updateAdminUserStatus(userId: string, status: UserStatus): Promise<User> {
  return apiFetch<User>(`/admin/users/${userId}/status`, { method: 'PATCH', body: { status } });
}

export function listAdminTrades(): Promise<Trade[]> {
  return apiFetch<Trade[]>('/admin/trades');
}
```

- [ ] **Step 11: Create `admin-web/src/components/icons.tsx`**

```tsx
export function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 shrink-0">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 shrink-0">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

export function BanIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 shrink-0">
      <circle cx="12" cy="12" r="9" />
      <path d="M5.5 5.5l13 13" />
    </svg>
  );
}

export function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 shrink-0">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l3 3 5-6" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 shrink-0">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
```

(Icons are not unit-tested individually, consistent with this codebase's existing convention — the equivalent icon components in `web/src/components/AppShell.tsx` have no dedicated tests either. They get exercised through the page tests in Tasks 5-8.)

- [ ] **Step 12: Run the full frontend suite**

Run: `npx vitest run` from the `admin-web` directory.
Expected: all tests pass. Also run `npx tsc --noEmit` from `admin-web` to confirm no type errors.

- [ ] **Step 13: Commit**

```bash
git add admin-web/src/api/types.ts admin-web/src/api/admin.ts admin-web/src/lib/roles.ts admin-web/src/lib/roles.test.ts admin-web/src/lib/statusTones.ts admin-web/src/lib/statusTones.test.ts admin-web/src/components/icons.tsx
git commit -m "Add admin API functions, assignable-role options, and action icons"
```

---

### Task 5: Frontend (admin-web) — Add User page

**Files:**
- Create: `admin-web/src/pages/AddUserPage.tsx`
- Create: `admin-web/src/pages/AddUserPage.test.tsx`
- Modify: `admin-web/src/App.tsx`

**Interfaces:**
- Consumes: `createAdminUser`, `listAdminOrganizations` (Task 4/existing); `ASSIGNABLE_ROLE_OPTIONS` (Task 4).
- Produces: route `/users/new`.

- [ ] **Step 1: Write the failing test — create `admin-web/src/pages/AddUserPage.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as adminApi from '../api/admin';
import type { Organization } from '../api/types';
import { AddUserPage } from './AddUserPage';

const orgs: Organization[] = [
  { id: 'o-1', name: 'Indus Exports Pvt. Ltd.', org_type: 'EXPORTER', country: 'India', industry: 'Pharmaceuticals', tax_id: 'TAX-1', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/users/new']}>
      <Routes>
        <Route path="/users/new" element={<AddUserPage />} />
        <Route path="/users" element={<div>Users list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AddUserPage', () => {
  it('creates a user and navigates back to the list', async () => {
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
    const createSpy = vi.spyOn(adminApi, 'createAdminUser').mockResolvedValue({
      id: 'u-1',
      org_id: 'o-1',
      name: 'Priya Shah',
      email: 'priya@example.com',
      role: 'EXPORTER_ADMIN',
      status: 'INVITED',
    });

    renderPage();
    await screen.findByText('Indus Exports Pvt. Ltd.');

    await userEvent.type(screen.getByLabelText(/name/i), 'Priya Shah');
    await userEvent.type(screen.getByLabelText(/email/i), 'priya@example.com');
    await userEvent.selectOptions(screen.getByLabelText(/role/i), 'EXPORTER_ADMIN');
    await userEvent.click(screen.getByRole('button', { name: /create user/i }));

    expect(createSpy).toHaveBeenCalledWith({ name: 'Priya Shah', email: 'priya@example.com', org_id: 'o-1', role: 'EXPORTER_ADMIN' });
    expect(await screen.findByText('Users list')).toBeInTheDocument();
  });

  it('shows an error when creation fails', async () => {
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
    vi.spyOn(adminApi, 'createAdminUser').mockRejectedValue(new Error('boom'));

    renderPage();
    await screen.findByText('Indus Exports Pvt. Ltd.');

    await userEvent.type(screen.getByLabelText(/name/i), 'Priya Shah');
    await userEvent.type(screen.getByLabelText(/email/i), 'priya@example.com');
    await userEvent.click(screen.getByRole('button', { name: /create user/i }));

    expect(await screen.findByText(/couldn't create the user/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pages/AddUserPage.test.tsx` from the `admin-web` directory.
Expected: FAIL — `AddUserPage` doesn't exist yet.

- [ ] **Step 3: Create `admin-web/src/pages/AddUserPage.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { createAdminUser, listAdminOrganizations } from '../api/admin';
import type { Organization, UserRole } from '../api/types';
import { ASSIGNABLE_ROLE_OPTIONS } from '../lib/roles';
import { Panel } from '../components/ui/Panel';

export function AddUserPage() {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [orgId, setOrgId] = useState('');
  const [role, setRole] = useState<UserRole>(ASSIGNABLE_ROLE_OPTIONS[0].value);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    listAdminOrganizations()
      .then((orgs) => {
        setOrganizations(orgs);
        if (orgs.length > 0) setOrgId(orgs[0].id);
      })
      .catch(() => setLoadError("Couldn't load organizations. Please try again."));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    try {
      await createAdminUser({ name, email, org_id: orgId, role });
      navigate('/users');
    } catch {
      setSubmitError("Couldn't create the user. Please check the details and try again.");
    }
  }

  if (loadError) {
    return <p className="text-block text-sm">{loadError}</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Add user</h1>
      <Panel className="max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label htmlFor="name" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Name
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Email
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
          <div>
            <label htmlFor="org" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Organization
            </label>
            <select
              id="org"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="role" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Role
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
            >
              {ASSIGNABLE_ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {submitError && <p className="text-block text-sm">{submitError}</p>}
          <button type="submit" className="bg-seal text-white rounded py-2.5 font-semibold hover:bg-seal-dark">
            Create user
          </button>
        </form>
      </Panel>
    </div>
  );
}
```

- [ ] **Step 4: Wire the route — in `admin-web/src/App.tsx`, add the import and route**

Add the import alongside the other page imports:

```tsx
import { AddUserPage } from './pages/AddUserPage';
```

Add the route right after `/users`:

```tsx
              <Route path="/users" element={<AdminUsersPage />} />
              <Route path="/users/new" element={<AddUserPage />} />
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/pages/AddUserPage.test.tsx` from the `admin-web` directory.
Expected: PASS.

- [ ] **Step 6: Run the full frontend suite**

Run: `npx vitest run` from the `admin-web` directory.
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add admin-web/src/pages/AddUserPage.tsx admin-web/src/pages/AddUserPage.test.tsx admin-web/src/App.tsx
git commit -m "Add the Add User page"
```

---

### Task 6: Frontend (admin-web) — Edit User page

**Files:**
- Create: `admin-web/src/pages/EditUserPage.tsx`
- Create: `admin-web/src/pages/EditUserPage.test.tsx`
- Modify: `admin-web/src/App.tsx`

**Interfaces:**
- Consumes: `getAdminUser`, `updateAdminUser`, `listAdminOrganizations` (Task 4/existing); `ASSIGNABLE_ROLE_OPTIONS` (Task 4).
- Produces: route `/users/:userId/edit`.

- [ ] **Step 1: Write the failing test — create `admin-web/src/pages/EditUserPage.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as adminApi from '../api/admin';
import type { Organization, User } from '../api/types';
import { EditUserPage } from './EditUserPage';

const orgs: Organization[] = [
  { id: 'o-1', name: 'Indus Exports Pvt. Ltd.', org_type: 'EXPORTER', country: 'India', industry: 'Pharmaceuticals', tax_id: 'TAX-1', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
  { id: 'o-2', name: 'Global Imports Co.', org_type: 'BUYER', country: 'Japan', industry: 'Electronics', tax_id: 'TAX-2', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
];

const user: User = { id: 'u-1', org_id: 'o-1', name: 'Priya Shah', email: 'priya@example.com', role: 'EXPORTER_ADMIN', status: 'ACTIVE' };

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/users/u-1/edit']}>
      <Routes>
        <Route path="/users/:userId/edit" element={<EditUserPage />} />
        <Route path="/users" element={<div>Users list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('EditUserPage', () => {
  it('pre-fills the form with the current user and saves changes', async () => {
    vi.spyOn(adminApi, 'getAdminUser').mockResolvedValue(user);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
    const updateSpy = vi.spyOn(adminApi, 'updateAdminUser').mockResolvedValue({ ...user, name: 'Priya Renamed' });

    renderPage();

    expect(await screen.findByDisplayValue('Priya Shah')).toBeInTheDocument();
    expect(screen.getByText('priya@example.com')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText(/name/i));
    await userEvent.type(screen.getByLabelText(/name/i), 'Priya Renamed');
    await userEvent.selectOptions(screen.getByLabelText(/organization/i), 'o-2');
    await userEvent.selectOptions(screen.getByLabelText(/role/i), 'FINANCE');
    await userEvent.selectOptions(screen.getByLabelText(/status/i), 'SUSPENDED');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(updateSpy).toHaveBeenCalledWith('u-1', { name: 'Priya Renamed', org_id: 'o-2', role: 'FINANCE', status: 'SUSPENDED' });
    expect(await screen.findByText('Users list')).toBeInTheDocument();
  });

  it('shows an error when loading the user fails', async () => {
    vi.spyOn(adminApi, 'getAdminUser').mockRejectedValue(new Error('boom'));
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    renderPage();

    expect(await screen.findByText(/couldn't load this user/i)).toBeInTheDocument();
  });

  it('shows an error when saving fails', async () => {
    vi.spyOn(adminApi, 'getAdminUser').mockResolvedValue(user);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
    vi.spyOn(adminApi, 'updateAdminUser').mockRejectedValue(new Error('boom'));

    renderPage();
    await screen.findByDisplayValue('Priya Shah');

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/couldn't save the changes/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pages/EditUserPage.test.tsx` from the `admin-web` directory.
Expected: FAIL — `EditUserPage` doesn't exist yet.

- [ ] **Step 3: Create `admin-web/src/pages/EditUserPage.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { getAdminUser, listAdminOrganizations, updateAdminUser } from '../api/admin';
import type { Organization, UserRole, UserStatus } from '../api/types';
import { ASSIGNABLE_ROLE_OPTIONS } from '../lib/roles';
import { Panel } from '../components/ui/Panel';

const STATUS_OPTIONS: Array<{ value: UserStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INVITED', label: 'Invited' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

export function EditUserPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [orgId, setOrgId] = useState('');
  const [role, setRole] = useState<UserRole>('VIEWER');
  const [userStatus, setUserStatus] = useState<UserStatus>('ACTIVE');
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    Promise.all([getAdminUser(userId), listAdminOrganizations()])
      .then(([user, orgs]) => {
        setEmail(user.email);
        setName(user.name);
        setOrgId(user.org_id ?? '');
        setRole(user.role);
        setUserStatus(user.status);
        setOrganizations(orgs);
        setLoaded(true);
      })
      .catch(() => setLoadError("Couldn't load this user. Please try again."));
  }, [userId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!userId) return;
    setSubmitError(null);
    try {
      await updateAdminUser(userId, { name, org_id: orgId, role, status: userStatus });
      navigate('/users');
    } catch {
      setSubmitError("Couldn't save the changes. Please try again.");
    }
  }

  if (loadError) {
    return <p className="text-block text-sm">{loadError}</p>;
  }

  if (!loaded) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Edit user</h1>
      <Panel className="max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">Email</label>
            <p className="font-mono text-sm">{email}</p>
          </div>
          <div>
            <label htmlFor="name" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Name
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="org" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Organization
            </label>
            <select
              id="org"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="role" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Role
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
            >
              {ASSIGNABLE_ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="status" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Status
            </label>
            <select
              id="status"
              value={userStatus}
              onChange={(e) => setUserStatus(e.target.value as UserStatus)}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {submitError && <p className="text-block text-sm">{submitError}</p>}
          <button type="submit" className="bg-seal text-white rounded py-2.5 font-semibold hover:bg-seal-dark">
            Save changes
          </button>
        </form>
      </Panel>
    </div>
  );
}
```

- [ ] **Step 4: Wire the route — in `admin-web/src/App.tsx`, add the import and route**

Add the import alongside the other page imports:

```tsx
import { EditUserPage } from './pages/EditUserPage';
```

Add the route right after `/users/new`:

```tsx
              <Route path="/users/new" element={<AddUserPage />} />
              <Route path="/users/:userId/edit" element={<EditUserPage />} />
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/pages/EditUserPage.test.tsx` from the `admin-web` directory.
Expected: PASS.

- [ ] **Step 6: Run the full frontend suite**

Run: `npx vitest run` from the `admin-web` directory.
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add admin-web/src/pages/EditUserPage.tsx admin-web/src/pages/EditUserPage.test.tsx admin-web/src/App.tsx
git commit -m "Add the Edit User page"
```

---

### Task 7: Frontend (admin-web) — View User page

**Files:**
- Create: `admin-web/src/pages/ViewUserPage.tsx`
- Create: `admin-web/src/pages/ViewUserPage.test.tsx`
- Modify: `admin-web/src/App.tsx`

**Interfaces:**
- Consumes: `getAdminUser`, `listAdminOrganizations` (Task 4/existing); `roleLabel`, `userStatusInfo` (existing).
- Produces: route `/users/:userId`.

**Note on route ordering:** `/users/:userId` must be registered so it does not shadow the more specific `/users/new` and `/users/:userId/edit` routes. React Router v6 ranks static segments above dynamic params automatically, so `/users/new` always wins over `/users/:userId` regardless of declaration order — but for readability, declare `/users/:userId` after `/users/new` in `App.tsx`, as shown below.

- [ ] **Step 1: Write the failing test — create `admin-web/src/pages/ViewUserPage.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as adminApi from '../api/admin';
import type { Organization, User } from '../api/types';
import { ViewUserPage } from './ViewUserPage';

const orgs: Organization[] = [
  { id: 'o-1', name: 'Indus Exports Pvt. Ltd.', org_type: 'EXPORTER', country: 'India', industry: 'Pharmaceuticals', tax_id: 'TAX-1', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
];

function renderPage(user: User) {
  vi.spyOn(adminApi, 'getAdminUser').mockResolvedValue(user);
  vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

  return render(
    <MemoryRouter initialEntries={['/users/u-1']}>
      <Routes>
        <Route path="/users/:userId" element={<ViewUserPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ViewUserPage', () => {
  it("shows the user's details, resolving their organization name", async () => {
    renderPage({ id: 'u-1', org_id: 'o-1', name: 'Priya Shah', email: 'priya@example.com', role: 'EXPORTER_ADMIN', status: 'ACTIVE' });

    expect(await screen.findByRole('heading', { name: 'Priya Shah' })).toBeInTheDocument();
    expect(screen.getByText('priya@example.com')).toBeInTheDocument();
    expect(screen.getByText('Indus Exports Pvt. Ltd.')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows an Edit link for a non-platform-admin user', async () => {
    renderPage({ id: 'u-1', org_id: 'o-1', name: 'Priya Shah', email: 'priya@example.com', role: 'EXPORTER_ADMIN', status: 'ACTIVE' });

    expect(await screen.findByRole('link', { name: /edit user/i })).toHaveAttribute('href', '/users/u-1/edit');
  });

  it('hides the Edit link for a platform admin', async () => {
    renderPage({ id: 'u-2', org_id: null, name: 'Ops Admin', email: 'admin@utfl.example', role: 'PLATFORM_ADMIN', status: 'ACTIVE' });

    await screen.findByRole('heading', { name: 'Ops Admin' });
    expect(screen.queryByRole('link', { name: /edit user/i })).not.toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    vi.spyOn(adminApi, 'getAdminUser').mockRejectedValue(new Error('boom'));
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    render(
      <MemoryRouter initialEntries={['/users/u-1']}>
        <Routes>
          <Route path="/users/:userId" element={<ViewUserPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/couldn't load this user/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pages/ViewUserPage.test.tsx` from the `admin-web` directory.
Expected: FAIL — `ViewUserPage` doesn't exist yet.

- [ ] **Step 3: Create `admin-web/src/pages/ViewUserPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { getAdminUser, listAdminOrganizations } from '../api/admin';
import type { Organization, User } from '../api/types';
import { roleLabel } from '../lib/roles';
import { userStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';

export function ViewUserPage() {
  const { userId } = useParams<{ userId: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    Promise.all([getAdminUser(userId), listAdminOrganizations()])
      .then(([fetchedUser, orgs]) => {
        setUser(fetchedUser);
        setOrganizations(orgs);
      })
      .catch(() => setError("Couldn't load this user. Please try again."));
  }, [userId]);

  function orgName(orgId: string | null): string {
    if (!orgId) return '—';
    return organizations.find((org) => org.id === orgId)?.name ?? orgId;
  }

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (user === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  const status = userStatusInfo(user.status);

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">{user.name}</h1>
      <Panel className="max-w-md">
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Email</span>
            <span className="font-mono">{user.email}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Organization</span>
            <span className="font-semibold">{orgName(user.org_id)}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Role</span>
            <span className="font-semibold">{roleLabel(user.role)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-soft">Status</span>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
        </div>
        {user.role !== 'PLATFORM_ADMIN' && (
          <Link to={`/users/${user.id}/edit`} className="inline-block mt-4 text-seal text-sm font-semibold hover:underline">
            Edit user
          </Link>
        )}
      </Panel>
    </div>
  );
}
```

- [ ] **Step 4: Wire the route — in `admin-web/src/App.tsx`, add the import and route**

Add the import alongside the other page imports:

```tsx
import { ViewUserPage } from './pages/ViewUserPage';
```

Add the route right after `/users/:userId/edit`:

```tsx
              <Route path="/users/:userId/edit" element={<EditUserPage />} />
              <Route path="/users/:userId" element={<ViewUserPage />} />
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/pages/ViewUserPage.test.tsx` from the `admin-web` directory.
Expected: PASS.

- [ ] **Step 6: Run the full frontend suite**

Run: `npx vitest run` from the `admin-web` directory.
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add admin-web/src/pages/ViewUserPage.tsx admin-web/src/pages/ViewUserPage.test.tsx admin-web/src/App.tsx
git commit -m "Add the View User page"
```

---

### Task 8: Frontend (admin-web) — icon row actions and Add button on the Users list

**Files:**
- Modify: `admin-web/src/pages/AdminUsersPage.tsx`
- Modify: `admin-web/src/pages/AdminUsersPage.test.tsx`

**Interfaces:**
- Consumes: `updateAdminUserStatus` (Task 4); `EyeIcon`, `PencilIcon`, `BanIcon`, `CheckCircleIcon`, `PlusIcon` (Task 4); routes `/users/new`, `/users/:userId`, `/users/:userId/edit` (Tasks 5-7).

This is the last task — after this, the `/users` list page from the bug report is fully wired to Add/View/Edit/Deactivate.

- [ ] **Step 1: Write the failing tests — replace `admin-web/src/pages/AdminUsersPage.test.tsx` with the following**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as adminApi from '../api/admin';
import type { Organization, User } from '../api/types';
import { AdminUsersPage } from './AdminUsersPage';

const orgs: Organization[] = [
  { id: 'o-1', name: 'Indus Exports Pvt. Ltd.', org_type: 'EXPORTER', country: 'India', industry: 'Pharmaceuticals', tax_id: 'TAX-1', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
  { id: 'o-2', name: 'Global Imports Co.', org_type: 'BUYER', country: 'Japan', industry: 'Electronics', tax_id: 'TAX-2', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
];

const users: User[] = [
  { id: 'u-1', org_id: 'o-1', name: 'Priya Shah', email: 'priya@example.com', role: 'EXPORTER_ADMIN', status: 'ACTIVE' },
  { id: 'u-2', org_id: null, name: 'Ops Admin', email: 'admin@utfl.example', role: 'PLATFORM_ADMIN', status: 'ACTIVE' },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminUsersPage />
    </MemoryRouter>,
  );
}

describe('AdminUsersPage', () => {
  it('renders every user platform-wide, resolving org_id to the correct organization name', async () => {
    vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    renderPage();

    expect(await screen.findByText('Priya Shah')).toBeInTheDocument();
    expect(screen.getByText('Indus Exports Pvt. Ltd.')).toBeInTheDocument();
    expect(screen.queryByText('Global Imports Co.')).not.toBeInTheDocument();
    expect(screen.getByText('Ops Admin')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    vi.spyOn(adminApi, 'listAdminUsers').mockRejectedValue(new Error('boom'));
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    renderPage();

    expect(await screen.findByText(/couldn't load users/i)).toBeInTheDocument();
  });

  it('has an Add user link pointing to /users/new', async () => {
    vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    renderPage();
    await screen.findByText('Priya Shah');

    expect(screen.getByRole('link', { name: /add user/i })).toHaveAttribute('href', '/users/new');
  });

  it('links View and Edit icons to the correct per-user routes', async () => {
    vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    renderPage();
    await screen.findByText('Priya Shah');

    expect(screen.getByRole('link', { name: /view priya shah/i })).toHaveAttribute('href', '/users/u-1');
    expect(screen.getByRole('link', { name: /edit priya shah/i })).toHaveAttribute('href', '/users/u-1/edit');
  });

  it('hides Edit and Deactivate for a platform admin row, but keeps View', async () => {
    vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    renderPage();
    await screen.findByText('Ops Admin');

    expect(screen.getByRole('link', { name: /view ops admin/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /edit ops admin/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /deactivate ops admin/i })).not.toBeInTheDocument();
  });

  describe('deactivating a user', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('deactivates an active user after confirming', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);
      vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
      const statusSpy = vi.spyOn(adminApi, 'updateAdminUserStatus').mockResolvedValue({ ...users[0], status: 'SUSPENDED' });

      renderPage();
      await screen.findByText('Priya Shah');

      await userEvent.click(screen.getByRole('button', { name: /deactivate priya shah/i }));

      expect(statusSpy).toHaveBeenCalledWith('u-1', 'SUSPENDED');
      expect(await screen.findByRole('button', { name: /reactivate priya shah/i })).toBeInTheDocument();
    });

    it('does nothing if the confirmation is declined', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);
      vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
      const statusSpy = vi.spyOn(adminApi, 'updateAdminUserStatus');

      renderPage();
      await screen.findByText('Priya Shah');

      await userEvent.click(screen.getByRole('button', { name: /deactivate priya shah/i }));

      expect(statusSpy).not.toHaveBeenCalled();
    });

    it('reverts and shows an error if deactivating fails', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);
      vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
      vi.spyOn(adminApi, 'updateAdminUserStatus').mockRejectedValue(new Error('boom'));

      renderPage();
      await screen.findByText('Priya Shah');

      await userEvent.click(screen.getByRole('button', { name: /deactivate priya shah/i }));

      expect(await screen.findByText(/couldn't deactivate priya shah/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /deactivate priya shah/i })).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/pages/AdminUsersPage.test.tsx` from the `admin-web` directory.
Expected: FAIL — no icons, no Add link, no deactivate action exist yet, and the page isn't wrapped for `<Link>` in the current test file (this replacement fixes that too).

- [ ] **Step 3: Replace `admin-web/src/pages/AdminUsersPage.tsx` with the following**

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { listAdminOrganizations, listAdminUsers, updateAdminUserStatus } from '../api/admin';
import type { Organization, User, UserStatus } from '../api/types';
import { roleLabel } from '../lib/roles';
import { userStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';
import { BanIcon, CheckCircleIcon, EyeIcon, PencilIcon, PlusIcon } from '../components/icons';

export function AdminUsersPage() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      const [fetchedUsers, fetchedOrganizations] = await Promise.all([listAdminUsers(), listAdminOrganizations()]);
      setUsers(fetchedUsers);
      setOrganizations(fetchedOrganizations);
    } catch {
      setError("Couldn't load users. Please try again.");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function orgName(orgId: string | null): string {
    if (!orgId) return '—';
    return organizations.find((org) => org.id === orgId)?.name ?? orgId;
  }

  async function handleToggleStatus(user: User) {
    const nextStatus: UserStatus = user.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    const verb = nextStatus === 'SUSPENDED' ? 'deactivate' : 'reactivate';
    if (!window.confirm(`Are you sure you want to ${verb} ${user.name}?`)) return;

    const previous = users;
    setUsers((current) => current?.map((u) => (u.id === user.id ? { ...u, status: nextStatus } : u)) ?? current);
    try {
      await updateAdminUserStatus(user.id, nextStatus);
    } catch {
      setUsers(previous);
      setError(`Couldn't ${verb} ${user.name}. Please try again.`);
    }
  }

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (users === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-serif text-2xl">Users</h1>
        <Link
          to="/users/new"
          aria-label="Add user"
          className="w-8 h-8 flex items-center justify-center rounded border border-line-strong text-ink-soft hover:text-ink hover:border-ink"
        >
          <PlusIcon />
        </Link>
      </div>
      {users.length === 0 ? (
        <p className="text-ink-soft">No users yet.</p>
      ) : (
        <Panel noPadding>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-soft border-b border-line-strong">
                <th className="py-2.5 px-6">Name</th>
                <th className="py-2.5 px-6">Email</th>
                <th className="py-2.5 px-6">Organization</th>
                <th className="py-2.5 px-6">Role</th>
                <th className="py-2.5 px-6">Status</th>
                <th className="py-2.5 px-6">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const status = userStatusInfo(user.status);
                const isPlatformAdmin = user.role === 'PLATFORM_ADMIN';
                return (
                  <tr key={user.id} className="border-b border-line last:border-b-0">
                    <td className="py-3 px-6">{user.name}</td>
                    <td className="py-3 px-6 font-mono">{user.email}</td>
                    <td className="py-3 px-6">{orgName(user.org_id)}</td>
                    <td className="py-3 px-6">{roleLabel(user.role)}</td>
                    <td className="py-3 px-6">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-3 text-ink-soft">
                        <Link to={`/users/${user.id}`} aria-label={`View ${user.name}`} className="hover:text-ink">
                          <EyeIcon />
                        </Link>
                        {!isPlatformAdmin && (
                          <>
                            <Link to={`/users/${user.id}/edit`} aria-label={`Edit ${user.name}`} className="hover:text-ink">
                              <PencilIcon />
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(user)}
                              aria-label={user.status === 'SUSPENDED' ? `Reactivate ${user.name}` : `Deactivate ${user.name}`}
                              className="hover:text-ink"
                            >
                              {user.status === 'SUSPENDED' ? <CheckCircleIcon /> : <BanIcon />}
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/pages/AdminUsersPage.test.tsx` from the `admin-web` directory.
Expected: all tests in the file PASS.

- [ ] **Step 5: Run the full frontend suite**

Run: `npx vitest run` from the `admin-web` directory.
Expected: all tests pass. Also run `npx tsc --noEmit` from `admin-web` to confirm no type errors.

- [ ] **Step 6: Commit**

```bash
git add admin-web/src/pages/AdminUsersPage.tsx admin-web/src/pages/AdminUsersPage.test.tsx
git commit -m "Add icon row actions and an Add user control to the Users list"
```
