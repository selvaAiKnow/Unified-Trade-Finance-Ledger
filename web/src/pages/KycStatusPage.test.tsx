import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as organizationsApi from '../api/organizations';
import type { KybCheck, Organization } from '../api/types';
import { AuthStore } from '../stores/AuthStore';
import { AuthContext } from '../stores/AuthContext';
import { KycStatusPage } from './KycStatusPage';

const org: Organization = {
  id: 'o-self',
  name: 'Indus Exports Pvt. Ltd.',
  org_type: 'EXPORTER',
  country: 'India',
  industry: 'Pharmaceuticals',
  tax_id: 'TAX-1',
  kyb_status: 'CLEAR',
  created_at: '2026-01-01T00:00:00Z',
};

const kybChecks: KybCheck[] = [
  { id: 'k-1', org_id: 'o-self', check_type: 'BUSINESS_REGISTRATION', status: 'PASSED', detail: null, checked_at: '2026-01-01T00:00:00Z' },
  { id: 'k-2', org_id: 'o-self', check_type: 'SANCTIONS_SCREENING', status: 'PASSED', detail: 'fake:CLEAR', checked_at: '2026-01-01T00:00:00Z' },
  { id: 'k-3', org_id: 'o-self', check_type: 'BANK_ACCOUNT', status: 'PASSED', detail: null, checked_at: '2026-01-01T00:00:00Z' },
];

function renderPage() {
  const store = new AuthStore();
  store.isHydrating = false;
  store.setSession('tok', { id: 'u-1', org_id: 'o-self', name: 'Priya Shah', email: 'priya@example.com', role: 'EXPORTER_ADMIN' as never, status: 'ACTIVE' });

  return render(
    <AuthContext.Provider value={store}>
      <MemoryRouter>
        <KycStatusPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('KycStatusPage', () => {
  it("renders the current user's own organization KYB status and checks", async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(kybChecks);

    renderPage();

    expect(await screen.findByText('Indus Exports Pvt. Ltd.')).toBeInTheDocument();
    expect(screen.getByText('Clear')).toBeInTheDocument();
    expect(screen.getByText('BUSINESS_REGISTRATION')).toBeInTheDocument();
    expect(screen.getByText('SANCTIONS_SCREENING')).toBeInTheDocument();
    expect(screen.getByText('BANK_ACCOUNT')).toBeInTheDocument();
    expect(organizationsApi.getOrganization).toHaveBeenCalledWith('o-self');
    expect(organizationsApi.listOrganizationKybChecks).toHaveBeenCalledWith('o-self');
  });

  it('shows an error message when the organization fails to load', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockRejectedValue(new Error('boom'));
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(kybChecks);

    renderPage();

    expect(await screen.findByText(/couldn't load your kyc status/i)).toBeInTheDocument();
  });

  it('shows an error message when the KYB checks fail to load', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockRejectedValue(new Error('boom'));

    renderPage();

    await waitFor(() => expect(screen.getByText(/couldn't load your kyc status/i)).toBeInTheDocument());
  });
});
