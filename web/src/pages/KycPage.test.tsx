import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as organizationsApi from '../api/organizations';
import type { KybCheck, Organization } from '../api/types';
import { AuthContext } from '../stores/AuthContext';
import { AuthStore } from '../stores/AuthStore';
import { KycPage } from './KycPage';

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

const pendingChecks: KybCheck[] = [
  { id: 'k-1', org_id: 'o-1', check_type: 'BUSINESS_REGISTRATION', status: 'PENDING', detail: null, checked_at: '2026-01-01T00:00:00Z' },
  { id: 'k-2', org_id: 'o-1', check_type: 'SANCTIONS_SCREENING', status: 'PASSED', detail: 'fake:CLEAR', checked_at: '2026-01-01T00:00:00Z' },
  { id: 'k-3', org_id: 'o-1', check_type: 'BANK_ACCOUNT', status: 'PASSED', detail: null, checked_at: '2026-01-01T00:00:00Z' },
];

const passedChecks: KybCheck[] = [
  { ...pendingChecks[0], status: 'PASSED', detail: 'org/o-1/abc-certificate.pdf' },
  pendingChecks[1],
  pendingChecks[2],
];

function renderPage() {
  const store = new AuthStore();
  store.isHydrating = false;
  store.setSession('tok', { id: 'u-1', org_id: 'o-1', name: 'Priya Shah', email: 'priya@example.com', role: 'EXPORTER_ADMIN', status: 'ACTIVE' });

  return render(
    <AuthContext.Provider value={store}>
      <MemoryRouter>
        <KycPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('KycPage', () => {
  it('shows the KYB verification breakdown', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(pendingChecks);

    renderPage();

    expect(await screen.findByText('Clear')).toBeInTheDocument();
    expect(screen.getByText('BUSINESS_REGISTRATION')).toBeInTheDocument();
    expect(screen.getByText('SANCTIONS_SCREENING')).toBeInTheDocument();
    expect(screen.getByText('BANK_ACCOUNT')).toBeInTheDocument();
  });

  it('shows the upload form when BUSINESS_REGISTRATION is pending', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(pendingChecks);

    renderPage();

    expect(await screen.findByText('Upload business registration certificate')).toBeInTheDocument();
  });

  it('hides the upload form once BUSINESS_REGISTRATION is passed', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(passedChecks);

    renderPage();

    await screen.findByText('BUSINESS_REGISTRATION');
    expect(screen.queryByText('Upload business registration certificate')).not.toBeInTheDocument();
  });

  it('uploads the document and refreshes the checks', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    const listSpy = vi
      .spyOn(organizationsApi, 'listOrganizationKybChecks')
      .mockResolvedValueOnce(pendingChecks)
      .mockResolvedValueOnce(passedChecks);
    const uploadSpy = vi.spyOn(organizationsApi, 'uploadBusinessRegistrationDocument').mockResolvedValue(passedChecks[0]);

    renderPage();

    await screen.findByText('Upload business registration certificate');
    await userEvent.upload(
      screen.getByLabelText(/business registration certificate/i),
      new File(['certificate bytes'], 'certificate.pdf', { type: 'application/pdf' }),
    );
    await userEvent.click(screen.getByRole('button', { name: /upload certificate/i }));

    await waitFor(() => expect(uploadSpy).toHaveBeenCalledWith('o-1', expect.any(File)));
    expect(listSpy).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByText('Upload business registration certificate')).not.toBeInTheDocument());
  });

  it('requires a file before submitting the upload form', async () => {
    vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(org);
    vi.spyOn(organizationsApi, 'listOrganizationKybChecks').mockResolvedValue(pendingChecks);
    const uploadSpy = vi.spyOn(organizationsApi, 'uploadBusinessRegistrationDocument');

    renderPage();

    await screen.findByText('Upload business registration certificate');
    await userEvent.click(screen.getByRole('button', { name: /upload certificate/i }));

    expect(await screen.findByText(/please choose a file/i)).toBeInTheDocument();
    expect(uploadSpy).not.toHaveBeenCalled();
  });
});
