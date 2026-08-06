# Admin View Pages and Document Viewer Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add View (detail) pages for Organizations and Trades in `admin-web`, matching the existing Users page's icon-link pattern, and fix the KYC Review page's "View document" action, which currently triggers a download instead of opening the document in a new tab.

**Architecture:** Two new admin-only single-fetch backend endpoints (`GET /admin/organizations/{org_id}`, `GET /admin/trades/{trade_id}`) back two new `admin-web` detail pages, reusing the existing `OrganizationOut`/`TradeOut` response shapes — no new schemas needed. Both list pages gain a new "Actions" column with a View (eye) icon, reusing the `EyeIcon` already defined in `admin-web/src/components/icons.tsx`. The document-viewer bug is a client-side timing fix: `window.open` is currently called *after* an `await`, which most browsers no longer treat as a direct user action — the fix opens a blank tab synchronously (inside the click handler, before any `await`) and points it at the document once the blob is ready.

**Tech Stack:** FastAPI (`api/`), React + TypeScript + Vite (`admin-web/`).

## Global Constraints

- Scope is View only — no Edit or Delete for Organizations or Trades in this plan. Organizations keeps its existing inline KYB-status-change dropdown untouched, in its own column; the new Actions column only ever contains the View icon.
- The two new backend endpoints reuse `OrganizationOut`/`TradeOut` exactly as already used by the existing list endpoints — no new response schema.
- The document-viewer fix must open a real (non-popup-blocked, non-downloaded) browser tab showing the PDF/image inline. The blank tab is opened synchronously in the click handler; its `location` is set once the authenticated blob fetch resolves.

---

### Task 1: Backend — single-fetch admin endpoints for organizations and trades

**Files:**
- Modify: `api/app/routers/admin.py`
- Modify: `api/tests/test_admin_endpoints.py`

**Interfaces:**
- Produces: `GET /admin/organizations/{org_id}` → `OrganizationOut`, `GET /admin/trades/{trade_id}` → `TradeOut` — Task 2 (`admin-web` API functions) consumes both exactly.

- [ ] **Step 1: Write the failing tests — extend `api/tests/test_admin_endpoints.py`**

In the existing `test_non_admin_gets_403_from_admin_routes` test, insert this block right after the existing `# Test GET /admin/organizations/{org_id}/kyb-checks` block (i.e. right before `# Test PATCH /admin/organizations/{org_id}/kyb-status`):

```python
    # Test GET /admin/organizations/{org_id}
    response = await async_client.get(
        f"/admin/organizations/{org_id}", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403
```

And insert this block at the very end of the same test function, right after the existing `# Test GET /admin/trades` block:

```python

    # Test GET /admin/trades/{id}
    response = await async_client.get(
        "/admin/trades/00000000-0000-0000-0000-000000000000", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403
```

Then append these tests at the end of the file:

```python
async def test_admin_can_get_a_single_organization(async_client, monkeypatch):
    org_id, _ = await _signup_and_login(async_client, "org-get-1@example.com")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.get(f"/admin/organizations/{org_id}", headers={"Authorization": f"Bearer {admin_token}"})

    assert response.status_code == 200
    assert response.json()["id"] == org_id


async def test_admin_get_organization_404_for_unknown_id(async_client, monkeypatch):
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.get(
        "/admin/organizations/00000000-0000-0000-0000-000000000000", headers={"Authorization": f"Bearer {admin_token}"}
    )

    assert response.status_code == 404


async def test_admin_can_get_a_single_trade(async_client, monkeypatch):
    exporter_org_id, exporter_token = await _signup_and_login(async_client, "trade-get-exporter@example.com")
    buyer_org_id, _ = await _signup_and_login(async_client, "trade-get-buyer@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await _signup_and_login(async_client, "trade-get-issuing@example.com", org_type="BANK")
    advising_bank_org_id, _ = await _signup_and_login(async_client, "trade-get-advising@example.com", org_type="BANK")
    trade_response = await _create_trade(
        async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id
    )
    trade_id = trade_response.json()["id"]

    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)
    response = await async_client.get(f"/admin/trades/{trade_id}", headers={"Authorization": f"Bearer {admin_token}"})

    assert response.status_code == 200
    assert response.json()["id"] == trade_id


async def test_admin_get_trade_404_for_unknown_id(async_client, monkeypatch):
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.get(
        "/admin/trades/00000000-0000-0000-0000-000000000000", headers={"Authorization": f"Bearer {admin_token}"}
    )

    assert response.status_code == 404
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `api/venv/Scripts/python.exe -m pytest tests/test_admin_endpoints.py -v` from the `api` directory.
Expected: FAIL — the two new routes don't exist yet (404/405), and the two extended 403-test blocks also fail.

- [ ] **Step 3: Add the endpoint right after `list_all_organizations` in `api/app/routers/admin.py`**

```python
@router.get("/organizations/{org_id}", response_model=OrganizationOut, dependencies=[Depends(require_admin)])
async def get_organization(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Organization:
    org = await db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return org
```

- [ ] **Step 4: Add the endpoint right after `list_all_trades` in `api/app/routers/admin.py`**

```python
@router.get("/trades/{trade_id}", response_model=TradeOut, dependencies=[Depends(require_admin)])
async def get_trade(trade_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Trade:
    trade = await db.get(Trade, trade_id)
    if trade is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")
    return trade
```

(All imports these two functions need — `uuid`, `Depends`, `HTTPException`, `status`, `AsyncSession`, `get_db`, `require_admin`, `Organization`, `Trade`, `OrganizationOut`, `TradeOut` — are already imported at the top of `admin.py`; no import changes needed.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `api/venv/Scripts/python.exe -m pytest tests/test_admin_endpoints.py -v` from the `api` directory.
Expected: all tests in the file PASS.

- [ ] **Step 6: Run the full backend suite**

Run: `api/venv/Scripts/python.exe -m pytest -q` from the `api` directory.
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add api/app/routers/admin.py api/tests/test_admin_endpoints.py
git commit -m "Add admin endpoints to fetch a single organization or trade"
```

---

### Task 2: Frontend (admin-web) — foundational API functions

**Files:**
- Modify: `admin-web/src/api/admin.ts`

**Interfaces:**
- Consumes: `GET /admin/organizations/{org_id}`, `GET /admin/trades/{trade_id}` (Task 1).
- Produces: `getAdminOrganization(orgId)`, `getAdminOrganizationKybChecks(orgId)`, `getAdminTrade(tradeId)` — Tasks 3 and 4 consume these.

`getAdminOrganizationKybChecks` is included here even though its backend endpoint (`GET /admin/organizations/{org_id}/kyb-checks`) already existed before this plan — `admin-web` just never had a client function for it, since nothing used it until now.

- [ ] **Step 1: Add three functions to `admin-web/src/api/admin.ts`, right after `getAdminUser`**

```typescript
export function getAdminOrganization(orgId: string): Promise<Organization> {
  return apiFetch<Organization>(`/admin/organizations/${orgId}`);
}

export function getAdminOrganizationKybChecks(orgId: string): Promise<KybCheck[]> {
  return apiFetch<KybCheck[]>(`/admin/organizations/${orgId}/kyb-checks`);
}

export function getAdminTrade(tradeId: string): Promise<Trade> {
  return apiFetch<Trade>(`/admin/trades/${tradeId}`);
}
```

(`Organization`, `KybCheck`, and `Trade` are already imported in this file's type-only import from `./types` — no import changes needed.)

- [ ] **Step 2: Run the full admin-web suite**

Run: `npx vitest run` from the `admin-web` directory.
Expected: all tests pass (this task adds no new tests of its own — these functions are exercised by Tasks 3 and 4's page tests). Also run `npx tsc --noEmit` to confirm no type errors.

- [ ] **Step 3: Commit**

```bash
git add admin-web/src/api/admin.ts
git commit -m "Add API functions for fetching a single organization or trade"
```

---

### Task 3: Frontend (admin-web) — View Organization page

**Files:**
- Create: `admin-web/src/pages/AdminViewOrganizationPage.tsx`
- Create: `admin-web/src/pages/AdminViewOrganizationPage.test.tsx`
- Modify: `admin-web/src/pages/AdminOrganizationsPage.tsx`
- Modify: `admin-web/src/pages/AdminOrganizationsPage.test.tsx`
- Modify: `admin-web/src/App.tsx`

**Interfaces:**
- Consumes: `getAdminOrganization`, `getAdminOrganizationKybChecks` (Task 2); `EyeIcon` (existing, `admin-web/src/components/icons.tsx`).
- Produces: route `/organizations/:orgId`.

- [ ] **Step 1: Write the failing test — create `admin-web/src/pages/AdminViewOrganizationPage.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as adminApi from '../api/admin';
import type { KybCheck, Organization } from '../api/types';
import { AdminViewOrganizationPage } from './AdminViewOrganizationPage';

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

const kybChecks: KybCheck[] = [
  { id: 'k-1', org_id: 'o-1', check_type: 'BUSINESS_REGISTRATION', status: 'PASSED', detail: 'org/o-1/cert.pdf', uploaded_by: 'u-1', ai_summary: 'Looks genuine.', checked_at: '2026-01-01T00:00:00Z' },
  { id: 'k-2', org_id: 'o-1', check_type: 'SANCTIONS_SCREENING', status: 'PASSED', detail: 'fake:CLEAR', uploaded_by: null, ai_summary: null, checked_at: '2026-01-01T00:00:00Z' },
  { id: 'k-3', org_id: 'o-1', check_type: 'BANK_ACCOUNT', status: 'PASSED', detail: null, uploaded_by: null, ai_summary: null, checked_at: '2026-01-01T00:00:00Z' },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/organizations/o-1']}>
      <Routes>
        <Route path="/organizations/:orgId" element={<AdminViewOrganizationPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminViewOrganizationPage', () => {
  it("shows the organization's details and KYB verification breakdown", async () => {
    vi.spyOn(adminApi, 'getAdminOrganization').mockResolvedValue(org);
    vi.spyOn(adminApi, 'getAdminOrganizationKybChecks').mockResolvedValue(kybChecks);

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Indus Exports Pvt. Ltd.' })).toBeInTheDocument();
    expect(screen.getByText('EXPORTER')).toBeInTheDocument();
    expect(screen.getByText('India')).toBeInTheDocument();
    expect(screen.getByText('TAX-1')).toBeInTheDocument();
    expect(screen.getByText('BUSINESS_REGISTRATION')).toBeInTheDocument();
    expect(screen.getByText('SANCTIONS_SCREENING')).toBeInTheDocument();
    expect(screen.getByText('BANK_ACCOUNT')).toBeInTheDocument();
    expect(adminApi.getAdminOrganization).toHaveBeenCalledWith('o-1');
    expect(adminApi.getAdminOrganizationKybChecks).toHaveBeenCalledWith('o-1');
  });

  it('shows an error message when loading fails', async () => {
    vi.spyOn(adminApi, 'getAdminOrganization').mockRejectedValue(new Error('boom'));
    vi.spyOn(adminApi, 'getAdminOrganizationKybChecks').mockResolvedValue(kybChecks);

    renderPage();

    expect(await screen.findByText(/couldn't load this organization/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run src/pages/AdminViewOrganizationPage.test.tsx` from the `admin-web` directory.
Expected: FAIL — `AdminViewOrganizationPage` doesn't exist yet.

- [ ] **Step 3: Create `admin-web/src/pages/AdminViewOrganizationPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { getAdminOrganization, getAdminOrganizationKybChecks } from '../api/admin';
import type { KybCheck, Organization } from '../api/types';
import { kybCheckStatusInfo, kybStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';

export function AdminViewOrganizationPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [org, setOrg] = useState<Organization | null>(null);
  const [kybChecks, setKybChecks] = useState<KybCheck[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    Promise.all([getAdminOrganization(orgId), getAdminOrganizationKybChecks(orgId)])
      .then(([fetchedOrg, fetchedChecks]) => {
        setOrg(fetchedOrg);
        setKybChecks(fetchedChecks);
      })
      .catch(() => setError("Couldn't load this organization. Please try again."));
  }, [orgId]);

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (org === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">{org.name}</h1>
      <Panel className="max-w-md">
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Type</span>
            <span className="font-semibold">{org.org_type}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Country</span>
            <span className="font-semibold">{org.country}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Industry</span>
            <span className="font-semibold">{org.industry}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Tax / business ID</span>
            <span className="font-mono">{org.tax_id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-soft">Member since</span>
            <span className="font-semibold">{new Date(org.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </Panel>

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
    </div>
  );
}
```

- [ ] **Step 4: Add the View icon to the Organizations list — replace `admin-web/src/pages/AdminOrganizationsPage.tsx` with the following**

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { listAdminOrganizations, updateOrganizationKybStatus } from '../api/admin';
import type { KybStatus, Organization } from '../api/types';
import { kybStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';
import { EyeIcon } from '../components/icons';

const KYB_STATUS_OPTIONS: KybStatus[] = ['PENDING', 'CLEAR', 'REVIEW', 'BLOCK'];

export function AdminOrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAdminOrganizations()
      .then(setOrganizations)
      .catch(() => setError("Couldn't load organizations. Please try again."));
  }, []);

  async function handleStatusChange(orgId: string, kybStatus: KybStatus) {
    setError(null);
    const previous = organizations;
    setOrganizations((orgs) => orgs?.map((org) => (org.id === orgId ? { ...org, kyb_status: kybStatus } : org)) ?? orgs);
    try {
      await updateOrganizationKybStatus(orgId, kybStatus);
    } catch {
      setOrganizations(previous);
      setError("Couldn't update the KYB status. Please try again.");
    }
  }

  if (organizations === null) {
    if (error) {
      return <p className="text-block text-sm">{error}</p>;
    }
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      {error && <p className="text-block text-sm">{error}</p>}
      <h1 className="font-serif text-2xl mb-4">Organizations</h1>
      {organizations.length === 0 ? (
        <p className="text-ink-soft">No organizations yet.</p>
      ) : (
        <Panel noPadding>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-soft border-b border-line-strong">
                <th className="py-2.5 px-6">Name</th>
                <th className="py-2.5 px-6">Type</th>
                <th className="py-2.5 px-6">Country</th>
                <th className="py-2.5 px-6">Industry</th>
                <th className="py-2.5 px-6">KYB status</th>
                <th className="py-2.5 px-6">Actions</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((org) => {
                const status = kybStatusInfo(org.kyb_status);
                return (
                  <tr key={org.id} className="border-b border-line last:border-b-0">
                    <td className="py-3 px-6">{org.name}</td>
                    <td className="py-3 px-6">{org.org_type}</td>
                    <td className="py-3 px-6">{org.country}</td>
                    <td className="py-3 px-6">{org.industry}</td>
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-2">
                        <Badge tone={status.tone}>{status.label}</Badge>
                        <select
                          aria-label={`Change KYB status for ${org.name}`}
                          value={org.kyb_status}
                          onChange={(e) => handleStatusChange(org.id, e.target.value as KybStatus)}
                          className="text-xs border border-line-strong rounded px-1.5 py-1"
                        >
                          {KYB_STATUS_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {kybStatusInfo(option).label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="py-3 px-6">
                      <Link to={`/organizations/${org.id}`} aria-label={`View ${org.name}`} className="text-ink-soft hover:text-ink">
                        <EyeIcon />
                      </Link>
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

- [ ] **Step 5: Wire the route — in `admin-web/src/App.tsx`, add the import and route**

Add the import alongside the other page imports:

```tsx
import { AdminViewOrganizationPage } from './pages/AdminViewOrganizationPage';
```

Add the route right after `/`:

```tsx
              <Route path="/" element={<AdminOrganizationsPage />} />
              <Route path="/organizations/:orgId" element={<AdminViewOrganizationPage />} />
```

- [ ] **Step 6: Update the existing list-page test — replace `admin-web/src/pages/AdminOrganizationsPage.test.tsx` with the following**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as adminApi from '../api/admin';
import type { Organization } from '../api/types';
import { AdminOrganizationsPage } from './AdminOrganizationsPage';

const orgs: Organization[] = [
  { id: 'o-1', name: 'Indus Exports Pvt. Ltd.', org_type: 'EXPORTER', country: 'India', industry: 'Pharmaceuticals', tax_id: 'TAX-1', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
  { id: 'o-2', name: 'Sakura Textiles K.K.', org_type: 'BUYER', country: 'Japan', industry: 'Textiles & Apparel', tax_id: 'TAX-2', kyb_status: 'REVIEW', created_at: '2026-01-01T00:00:00Z' },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminOrganizationsPage />
    </MemoryRouter>,
  );
}

describe('AdminOrganizationsPage', () => {
  it('renders every organization platform-wide with its KYB status', async () => {
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    renderPage();

    expect(await screen.findByText('Indus Exports Pvt. Ltd.')).toBeInTheDocument();
    expect(screen.getByText('Sakura Textiles K.K.')).toBeInTheDocument();
    expect(screen.getAllByText('Clear').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Review').length).toBeGreaterThan(0);
  });

  it('shows an error message when loading fails', async () => {
    vi.spyOn(adminApi, 'listAdminOrganizations').mockRejectedValue(new Error('boom'));

    renderPage();

    expect(await screen.findByText(/couldn't load organizations/i)).toBeInTheDocument();
  });

  it("lets an admin change an organization's KYB status", async () => {
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue([orgs[0]]);
    const updateSpy = vi.spyOn(adminApi, 'updateOrganizationKybStatus').mockResolvedValue({ ...orgs[0], kyb_status: 'BLOCK' });

    renderPage();
    await screen.findByText('Indus Exports Pvt. Ltd.');

    await userEvent.selectOptions(screen.getByLabelText(/change kyb status for indus exports/i), 'BLOCK');

    expect(updateSpy).toHaveBeenCalledWith('o-1', 'BLOCK');
    expect((screen.getByLabelText(/change kyb status for indus exports/i) as HTMLSelectElement).value).toBe('BLOCK');
  });

  it('reverts the status and shows an error if the update fails', async () => {
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue([orgs[0]]);
    vi.spyOn(adminApi, 'updateOrganizationKybStatus').mockRejectedValue(new Error('boom'));

    renderPage();
    await screen.findByText('Indus Exports Pvt. Ltd.');

    await userEvent.selectOptions(screen.getByLabelText(/change kyb status for indus exports/i), 'BLOCK');

    expect(await screen.findByText(/couldn't update the kyb status/i)).toBeInTheDocument();
    expect((screen.getByLabelText(/change kyb status for indus exports/i) as HTMLSelectElement).value).toBe('CLEAR');
  });

  it('links the View icon to the correct organization detail route', async () => {
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    renderPage();
    await screen.findByText('Indus Exports Pvt. Ltd.');

    expect(screen.getByRole('link', { name: /view indus exports pvt\. ltd\./i })).toHaveAttribute('href', '/organizations/o-1');
  });
});
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/pages/AdminViewOrganizationPage.test.tsx src/pages/AdminOrganizationsPage.test.tsx` from the `admin-web` directory.
Expected: all tests PASS.

- [ ] **Step 8: Run the full admin-web suite**

Run: `npx vitest run` from the `admin-web` directory.
Expected: all tests pass. Also run `npx tsc --noEmit` to confirm no type errors.

- [ ] **Step 9: Commit**

```bash
git add admin-web/src/pages/AdminViewOrganizationPage.tsx admin-web/src/pages/AdminViewOrganizationPage.test.tsx admin-web/src/pages/AdminOrganizationsPage.tsx admin-web/src/pages/AdminOrganizationsPage.test.tsx admin-web/src/App.tsx
git commit -m "Add the View Organization page and a View icon on the Organizations list"
```

---

### Task 4: Frontend (admin-web) — View Trade page

**Files:**
- Create: `admin-web/src/pages/AdminViewTradePage.tsx`
- Create: `admin-web/src/pages/AdminViewTradePage.test.tsx`
- Modify: `admin-web/src/pages/AdminTradesPage.tsx`
- Modify: `admin-web/src/pages/AdminTradesPage.test.tsx`
- Modify: `admin-web/src/App.tsx`

**Interfaces:**
- Consumes: `getAdminTrade` (Task 2), `listAdminOrganizations` (existing); `EyeIcon` (existing, `admin-web/src/components/icons.tsx`).
- Produces: route `/trades/:tradeId`.

- [ ] **Step 1: Write the failing test — create `admin-web/src/pages/AdminViewTradePage.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as adminApi from '../api/admin';
import type { Organization, Trade } from '../api/types';
import { AdminViewTradePage } from './AdminViewTradePage';

const orgs: Organization[] = [
  { id: 'o-1', name: 'Indus Exports Pvt. Ltd.', org_type: 'EXPORTER', country: 'India', industry: 'Pharmaceuticals', tax_id: 'TAX-1', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
  { id: 'o-2', name: 'Global Imports Co.', org_type: 'BUYER', country: 'Japan', industry: 'Electronics', tax_id: 'TAX-2', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
  { id: 'o-3', name: 'Meiji Trust Bank', org_type: 'BANK', country: 'Japan', industry: 'Banking', tax_id: 'TAX-3', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
  { id: 'o-4', name: 'Canara Bank', org_type: 'BANK', country: 'India', industry: 'Banking', tax_id: 'TAX-4', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
];

const trade: Trade = {
  id: 't-1',
  lc_reference: 'MUFGJP2026LC1187',
  industry: 'Pharmaceuticals',
  instrument_type: 'Letter of Credit',
  exporter_org_id: 'o-1',
  buyer_org_id: 'o-2',
  issuing_bank_org_id: 'o-3',
  advising_bank_org_id: 'o-4',
  product_description: 'Paracetamol Tablets 500mg',
  order_value: 80000,
  currency: 'USD',
  incoterm: 'CIF Osaka',
  payment_term: 'Usance LC, 60 days',
  shipment_deadline: '2026-09-15',
  status: 'DOCS_UNDER_REVIEW',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/trades/t-1']}>
      <Routes>
        <Route path="/trades/:tradeId" element={<AdminViewTradePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminViewTradePage', () => {
  it("shows the trade's details, resolving participant organization names", async () => {
    vi.spyOn(adminApi, 'getAdminTrade').mockResolvedValue(trade);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    renderPage();

    expect(await screen.findByRole('heading', { name: 'MUFGJP2026LC1187' })).toBeInTheDocument();
    expect(screen.getByText('Paracetamol Tablets 500mg')).toBeInTheDocument();
    expect(screen.getByText('CIF Osaka')).toBeInTheDocument();
    expect(screen.getByText('Indus Exports Pvt. Ltd.')).toBeInTheDocument();
    expect(screen.getByText('Global Imports Co.')).toBeInTheDocument();
    expect(screen.getByText('Meiji Trust Bank')).toBeInTheDocument();
    expect(screen.getByText('Canara Bank')).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    vi.spyOn(adminApi, 'getAdminTrade').mockRejectedValue(new Error('boom'));
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    renderPage();

    expect(await screen.findByText(/couldn't load this trade/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run src/pages/AdminViewTradePage.test.tsx` from the `admin-web` directory.
Expected: FAIL — `AdminViewTradePage` doesn't exist yet.

- [ ] **Step 3: Create `admin-web/src/pages/AdminViewTradePage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { getAdminTrade, listAdminOrganizations } from '../api/admin';
import type { Organization, Trade } from '../api/types';
import { tradeStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';

export function AdminViewTradePage() {
  const { tradeId } = useParams<{ tradeId: string }>();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tradeId) return;
    Promise.all([getAdminTrade(tradeId), listAdminOrganizations()])
      .then(([fetchedTrade, orgs]) => {
        setTrade(fetchedTrade);
        setOrganizations(orgs);
      })
      .catch(() => setError("Couldn't load this trade. Please try again."));
  }, [tradeId]);

  function orgName(orgId: string): string {
    return organizations.find((org) => org.id === orgId)?.name ?? orgId;
  }

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (trade === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  const status = tradeStatusInfo(trade.status);

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">{trade.lc_reference}</h1>
      <Panel className="max-w-md">
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Status</span>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Industry</span>
            <span className="font-semibold">{trade.industry}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Instrument type</span>
            <span className="font-semibold">{trade.instrument_type}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Product description</span>
            <span className="font-semibold text-right">{trade.product_description}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Order value</span>
            <span className="font-mono">
              {trade.currency} {trade.order_value.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Incoterm</span>
            <span className="font-semibold">{trade.incoterm}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Payment term</span>
            <span className="font-semibold">{trade.payment_term}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-soft">Shipment deadline</span>
            <span className="font-semibold">{trade.shipment_deadline ?? '—'}</span>
          </div>
        </div>
      </Panel>

      <Panel title="Participants" className="max-w-md">
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Exporter</span>
            <span className="font-semibold">{orgName(trade.exporter_org_id)}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Buyer</span>
            <span className="font-semibold">{orgName(trade.buyer_org_id)}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Issuing bank</span>
            <span className="font-semibold">{orgName(trade.issuing_bank_org_id)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-soft">Advising bank</span>
            <span className="font-semibold">{orgName(trade.advising_bank_org_id)}</span>
          </div>
        </div>
      </Panel>
    </div>
  );
}
```

- [ ] **Step 4: Add the View icon to the Trades list — replace `admin-web/src/pages/AdminTradesPage.tsx` with the following**

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { listAdminTrades } from '../api/admin';
import type { Trade } from '../api/types';
import { tradeStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';
import { EyeIcon } from '../components/icons';

export function AdminTradesPage() {
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAdminTrades()
      .then(setTrades)
      .catch(() => setError("Couldn't load trades. Please try again."));
  }, []);

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (trades === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Trades</h1>
      {trades.length === 0 ? (
        <p className="text-ink-soft">No trades yet.</p>
      ) : (
        <Panel noPadding>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-soft border-b border-line-strong">
                <th className="py-2.5 px-6">LC reference</th>
                <th className="py-2.5 px-6">Industry</th>
                <th className="py-2.5 px-6">Order value</th>
                <th className="py-2.5 px-6">Shipment deadline</th>
                <th className="py-2.5 px-6">Status</th>
                <th className="py-2.5 px-6">Actions</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => {
                const status = tradeStatusInfo(trade.status);
                return (
                  <tr key={trade.id} className="border-b border-line last:border-b-0">
                    <td className="py-3 px-6">{trade.lc_reference}</td>
                    <td className="py-3 px-6">{trade.industry}</td>
                    <td className="py-3 px-6 font-mono">
                      {trade.currency} {trade.order_value.toLocaleString()}
                    </td>
                    <td className="py-3 px-6">{trade.shipment_deadline ?? '—'}</td>
                    <td className="py-3 px-6">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td className="py-3 px-6">
                      <Link to={`/trades/${trade.id}`} aria-label={`View ${trade.lc_reference}`} className="text-ink-soft hover:text-ink">
                        <EyeIcon />
                      </Link>
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

- [ ] **Step 5: Wire the route — in `admin-web/src/App.tsx`, add the import and route**

Add the import alongside the other page imports:

```tsx
import { AdminViewTradePage } from './pages/AdminViewTradePage';
```

Add the route right after `/trades`:

```tsx
              <Route path="/trades" element={<AdminTradesPage />} />
              <Route path="/trades/:tradeId" element={<AdminViewTradePage />} />
```

- [ ] **Step 6: Update the existing list-page test — replace `admin-web/src/pages/AdminTradesPage.test.tsx` with the following**

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as adminApi from '../api/admin';
import type { Trade } from '../api/types';
import { AdminTradesPage } from './AdminTradesPage';

const trades: Trade[] = [
  {
    id: 't-1',
    lc_reference: 'MUFGJP2026LC1187',
    industry: 'Pharmaceuticals',
    instrument_type: 'Letter of Credit',
    exporter_org_id: 'o-1',
    buyer_org_id: 'o-2',
    issuing_bank_org_id: 'o-3',
    advising_bank_org_id: 'o-4',
    product_description: 'Paracetamol Tablets 500mg',
    order_value: 80000,
    currency: 'USD',
    incoterm: 'CIF Osaka',
    payment_term: 'Usance LC, 60 days',
    shipment_deadline: '2026-09-15',
    status: 'DOCS_UNDER_REVIEW',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 't-2',
    lc_reference: 'SGDIN2026LC2491',
    industry: 'Electronics',
    instrument_type: 'Letter of Credit',
    exporter_org_id: 'o-5',
    buyer_org_id: 'o-6',
    issuing_bank_org_id: 'o-7',
    advising_bank_org_id: 'o-8',
    product_description: 'Circuit boards',
    order_value: 42000,
    currency: 'SGD',
    incoterm: 'FOB Singapore',
    payment_term: 'Sight LC',
    shipment_deadline: '2026-10-20',
    status: 'ACCEPTED',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminTradesPage />
    </MemoryRouter>,
  );
}

describe('AdminTradesPage', () => {
  it('renders every trade platform-wide', async () => {
    vi.spyOn(adminApi, 'listAdminTrades').mockResolvedValue(trades);

    renderPage();

    expect(await screen.findByText('MUFGJP2026LC1187')).toBeInTheDocument();
    expect(screen.getByText('2026-09-15')).toBeInTheDocument();
    expect(screen.getByText('SGDIN2026LC2491')).toBeInTheDocument();
    expect(screen.getByText('2026-10-20')).toBeInTheDocument();
    expect(screen.getByText('Electronics')).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    vi.spyOn(adminApi, 'listAdminTrades').mockRejectedValue(new Error('boom'));

    renderPage();

    expect(await screen.findByText(/couldn't load trades/i)).toBeInTheDocument();
  });

  it('links the View icon to the correct trade detail route', async () => {
    vi.spyOn(adminApi, 'listAdminTrades').mockResolvedValue(trades);

    renderPage();
    await screen.findByText('MUFGJP2026LC1187');

    expect(screen.getByRole('link', { name: /view mufgjp2026lc1187/i })).toHaveAttribute('href', '/trades/t-1');
  });
});
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/pages/AdminViewTradePage.test.tsx src/pages/AdminTradesPage.test.tsx` from the `admin-web` directory.
Expected: all tests PASS.

- [ ] **Step 8: Run the full admin-web suite**

Run: `npx vitest run` from the `admin-web` directory.
Expected: all tests pass. Also run `npx tsc --noEmit` to confirm no type errors.

- [ ] **Step 9: Commit**

```bash
git add admin-web/src/pages/AdminViewTradePage.tsx admin-web/src/pages/AdminViewTradePage.test.tsx admin-web/src/pages/AdminTradesPage.tsx admin-web/src/pages/AdminTradesPage.test.tsx admin-web/src/App.tsx
git commit -m "Add the View Trade page and a View icon on the Trades list"
```

---

### Task 5: Frontend (admin-web) — fix the KYC document viewer to open, not download

**Files:**
- Modify: `admin-web/src/pages/AdminKycReviewPage.tsx`
- Modify: `admin-web/src/pages/AdminKycReviewPage.test.tsx`

**Interfaces:**
- No new interfaces — this is a behavioral fix to the existing `handleViewDocument` function.

**Root cause:** `handleViewDocument` currently calls `window.open(url, '_blank')` *after* `await getBusinessRegistrationDocumentBlob(checkId)`. By the time that `await` resolves, the call is no longer inside the synchronous call stack of the click event, so most browsers no longer treat it as a direct user-initiated action — the tab either gets popup-blocked outright, or the browser falls back to a download instead of an inline view. The fix: open a blank tab *synchronously*, inside the click handler, before any `await` — this preserves the "user gesture" browsers require — then set that tab's `location` once the blob URL is ready.

- [ ] **Step 1: Write the failing test — in `admin-web/src/pages/AdminKycReviewPage.test.tsx`, replace the `'opens the uploaded document in a new tab'` test**

Add `waitFor` to the existing `@testing-library/react` import (currently `import { render, screen } from '@testing-library/react';` — change to `import { render, screen, waitFor } from '@testing-library/react';`).

Replace the test:

```tsx
  it('opens the uploaded document in a new tab without triggering a download', async () => {
    vi.spyOn(adminApi, 'listAdminBusinessRegistrationChecks').mockResolvedValue([flaggedCheck]);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
    vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);
    const blob = new Blob(['fake pdf bytes'], { type: 'application/pdf' });
    vi.spyOn(adminApi, 'getBusinessRegistrationDocumentBlob').mockResolvedValue(blob);
    // jsdom doesn't implement createObjectURL, so it can't be spied on — assign it directly.
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    const fakeTab = { location: { href: '' } } as unknown as Window;
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(fakeTab);

    render(<AdminKycReviewPage />);
    await screen.findByText('Needs review');

    await userEvent.click(screen.getByRole('button', { name: /view document/i }));

    // The tab must be opened synchronously (empty URL, filled in once the blob is ready) —
    // opening it only after the async fetch resolves is what caused the original bug, since
    // browsers stop treating window.open as a user gesture once it's past an await.
    expect(openSpy).toHaveBeenCalledWith('', '_blank');
    await waitFor(() => expect(fakeTab.location.href).toBe('blob:mock-url'));
  });
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run src/pages/AdminKycReviewPage.test.tsx` from the `admin-web` directory.
Expected: FAIL — `handleViewDocument` still calls `window.open` with the URL directly, after the `await`, so `openSpy` is never called with `('', '_blank')`.

- [ ] **Step 3: Replace `handleViewDocument` in `admin-web/src/pages/AdminKycReviewPage.tsx`**

```tsx
  async function handleViewDocument(checkId: string) {
    setError(null);
    const newTab = window.open('', '_blank');
    try {
      const blob = await getBusinessRegistrationDocumentBlob(checkId);
      const url = URL.createObjectURL(blob);
      if (newTab) {
        newTab.location.href = url;
      }
    } catch {
      newTab?.close();
      setError("Couldn't load the document. Please try again.");
    }
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/pages/AdminKycReviewPage.test.tsx` from the `admin-web` directory.
Expected: all tests PASS.

- [ ] **Step 5: Run the full admin-web suite**

Run: `npx vitest run` from the `admin-web` directory.
Expected: all tests pass. Also run `npx tsc --noEmit` to confirm no type errors.

- [ ] **Step 6: Commit**

```bash
git add admin-web/src/pages/AdminKycReviewPage.tsx admin-web/src/pages/AdminKycReviewPage.test.tsx
git commit -m "Open the KYC document viewer synchronously so it displays instead of downloading"
```
