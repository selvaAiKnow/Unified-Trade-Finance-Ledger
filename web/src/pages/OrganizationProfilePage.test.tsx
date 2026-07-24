import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as organizationsApi from '../api/organizations';
import type { KybCheck, Organization } from '../api/types';
import { OrganizationProfilePage } from './OrganizationProfilePage';

const org: Organization = {
  id: 'o-1',
  name: 'MedCure Pharma Exports',
  org_type: 'EXPORTER',
  country: 'India',
  industry: 'Pharmaceuticals',
  tax_id: 'TAX-1',
  kyb_status: 'CLEAR',
  created_at: '2026-01-01T00:00:00Z',
};

const kybChecks: KybCheck[] = [
  { id: 'k-1', org_id: 'o-1', check_type: 'SANCTIONS_SCREENING', status: 'PASSED', detail: 'fake:CLEAR', checked_at: '2026-01-01T00:00:00Z' },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/organizations/o-1']}>
      <Routes>
        <Route path="/organizations/:orgId" element={<OrganizationProfilePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OrganizationProfilePage', () => {
  it('renders the organization profile and KYB checks', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(kybChecks);

    renderPage();

    expect(await screen.findByText('MedCure Pharma Exports')).toBeInTheDocument();
    expect(screen.getByText('CLEAR')).toBeInTheDocument();
    expect(screen.getByText('SANCTIONS_SCREENING')).toBeInTheDocument();
  });

  it('shows an error message when the organization fails to load', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockRejectedValue(new Error('boom'));
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(kybChecks);

    renderPage();

    expect(await screen.findByText(/couldn't load the organization/i)).toBeInTheDocument();
    expect(screen.queryByText('MedCure Pharma Exports')).not.toBeInTheDocument();
  });

  it('shows an error message when the KYB checks fail to load', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockRejectedValue(new Error('boom'));

    renderPage();

    await waitFor(() => expect(screen.getByText(/couldn't load the organization/i)).toBeInTheDocument());
  });
});
