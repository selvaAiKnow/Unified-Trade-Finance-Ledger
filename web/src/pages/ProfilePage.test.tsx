import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as organizationsApi from '../api/organizations';
import type { KybCheck, Organization } from '../api/types';
import { AuthStore } from '../stores/AuthStore';
import { AuthContext } from '../stores/AuthContext';
import { ProfilePage } from './ProfilePage';

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
  { id: 'k-1', org_id: 'o-1', check_type: 'BUSINESS_REGISTRATION', status: 'PASSED', detail: null, uploaded_by: null, ai_summary: null, checked_at: '2026-01-01T00:00:00Z' },
  { id: 'k-2', org_id: 'o-1', check_type: 'SANCTIONS_SCREENING', status: 'PASSED', detail: 'fake:CLEAR', uploaded_by: null, ai_summary: null, checked_at: '2026-01-01T00:00:00Z' },
  { id: 'k-3', org_id: 'o-1', check_type: 'BANK_ACCOUNT', status: 'PASSED', detail: null, uploaded_by: null, ai_summary: null, checked_at: '2026-01-01T00:00:00Z' },
];

const pendingKybChecks: KybCheck[] = [
  { id: 'k-1', org_id: 'o-1', check_type: 'BUSINESS_REGISTRATION', status: 'PENDING', detail: null, uploaded_by: null, ai_summary: null, checked_at: '2026-01-01T00:00:00Z' },
  { id: 'k-2', org_id: 'o-1', check_type: 'SANCTIONS_SCREENING', status: 'PASSED', detail: 'fake:CLEAR', uploaded_by: null, ai_summary: null, checked_at: '2026-01-01T00:00:00Z' },
  { id: 'k-3', org_id: 'o-1', check_type: 'BANK_ACCOUNT', status: 'PASSED', detail: null, uploaded_by: null, ai_summary: null, checked_at: '2026-01-01T00:00:00Z' },
];

function renderPage() {
  const store = new AuthStore();
  store.isHydrating = false;
  store.setSession('tok', { id: 'u-1', org_id: 'o-1', name: 'Priya Shah', email: 'priya@example.com', role: 'EXPORTER_ADMIN', status: 'ACTIVE' });

  return render(
    <AuthContext.Provider value={store}>
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('ProfilePage', () => {
  it("shows the signed-in user's profile fields", () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(kybChecks);

    renderPage();

    expect(screen.getByText('Priya Shah')).toBeInTheDocument();
    expect(screen.getByText('priya@example.com')).toBeInTheDocument();
    expect(screen.getByText('Superuser')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it("shows the user's organization details and KYB verification status", async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(kybChecks);

    renderPage();

    expect(await screen.findByText('Indus Exports Pvt. Ltd.')).toBeInTheDocument();
    expect(screen.getByText('Pharmaceuticals')).toBeInTheDocument();
    expect(screen.getByText('India')).toBeInTheDocument();
    expect(screen.getByText('TAX-1')).toBeInTheDocument();
    expect(screen.getByText('Clear')).toBeInTheDocument();
    expect(screen.getByText('BUSINESS_REGISTRATION')).toBeInTheDocument();
    expect(screen.getByText('SANCTIONS_SCREENING')).toBeInTheDocument();
    expect(screen.getByText('BANK_ACCOUNT')).toBeInTheDocument();
    expect(organizationsApi.getOrganization).toHaveBeenCalledWith('o-1');
    expect(organizationsApi.listOrganizationKybChecks).toHaveBeenCalledWith('o-1');
  });

  it('shows an upload link to /kyc when BUSINESS_REGISTRATION is pending', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(pendingKybChecks);

    renderPage();

    const link = await screen.findByRole('link', { name: /upload business registration certificate/i });
    expect(link).toHaveAttribute('href', '/kyc');
  });

  it('does not show an upload link once BUSINESS_REGISTRATION is passed', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(kybChecks);

    renderPage();

    await screen.findByText('BUSINESS_REGISTRATION');
    expect(screen.queryByRole('link', { name: /upload business registration certificate/i })).not.toBeInTheDocument();
  });

  it('shows an error message when the organization fails to load', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockRejectedValue(new Error('boom'));
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(kybChecks);

    renderPage();

    expect(await screen.findByText(/couldn't load your organization details/i)).toBeInTheDocument();
  });

  it('shows an error message when the KYB checks fail to load', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockRejectedValue(new Error('boom'));

    renderPage();

    await waitFor(() => expect(screen.getByText(/couldn't load your organization details/i)).toBeInTheDocument());
  });

  it('still logs out correctly', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(kybChecks);

    renderPage();

    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });
});
