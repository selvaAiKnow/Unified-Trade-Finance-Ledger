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
