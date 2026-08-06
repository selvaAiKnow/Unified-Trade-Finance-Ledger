import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import * as adminApi from '../api/admin';
import type { KybCheck, Organization, User } from '../api/types';
import { AdminKycReviewPage } from './AdminKycReviewPage';

const orgs: Organization[] = [
  { id: 'o-1', name: 'Indus Exports Pvt. Ltd.', org_type: 'EXPORTER', country: 'India', industry: 'Pharmaceuticals', tax_id: 'TAX-1', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
];

const users: User[] = [
  { id: 'u-1', org_id: 'o-1', name: 'Priya Shah', email: 'priya@example.com', role: 'EXPORTER_ADMIN', status: 'ACTIVE' },
];

const flaggedCheck: KybCheck = {
  id: 'k-1',
  org_id: 'o-1',
  check_type: 'BUSINESS_REGISTRATION',
  status: 'FLAGGED',
  detail: 'org/o-1/abc-certificate.pdf',
  uploaded_by: 'u-1',
  ai_summary: 'The organization name on the document does not match.',
  checked_at: '2026-01-01T00:00:00Z',
};

const passedCheck: KybCheck = { ...flaggedCheck, id: 'k-2', status: 'PASSED', ai_summary: 'Looks genuine.' };

describe('AdminKycReviewPage', () => {
  it('lists checks, resolving org and uploader names', async () => {
    vi.spyOn(adminApi, 'listAdminBusinessRegistrationChecks').mockResolvedValue([flaggedCheck]);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
    vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);

    render(<AdminKycReviewPage />);

    expect(await screen.findByText('Indus Exports Pvt. Ltd.')).toBeInTheDocument();
    expect(screen.getByText('Priya Shah')).toBeInTheDocument();
    expect(screen.getByText('The organization name on the document does not match.')).toBeInTheDocument();
    expect(screen.getByText('Needs review')).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    vi.spyOn(adminApi, 'listAdminBusinessRegistrationChecks').mockRejectedValue(new Error('boom'));
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
    vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);

    render(<AdminKycReviewPage />);

    expect(await screen.findByText(/couldn't load kyc checks/i)).toBeInTheDocument();
  });

  it('shows Approve and Reject only for flagged checks', async () => {
    vi.spyOn(adminApi, 'listAdminBusinessRegistrationChecks').mockResolvedValue([flaggedCheck, passedCheck]);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
    vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);

    render(<AdminKycReviewPage />);
    await screen.findByText('Needs review');

    expect(screen.getAllByRole('button', { name: /approve/i })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /reject/i })).toHaveLength(1);
  });

  it('approves a flagged check', async () => {
    vi.spyOn(adminApi, 'listAdminBusinessRegistrationChecks').mockResolvedValue([flaggedCheck]);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
    vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);
    const decideSpy = vi.spyOn(adminApi, 'decideAdminKybCheck').mockResolvedValue({ ...flaggedCheck, status: 'PASSED' });

    render(<AdminKycReviewPage />);
    await screen.findByText('Needs review');

    await userEvent.click(screen.getByRole('button', { name: /approve/i }));

    expect(decideSpy).toHaveBeenCalledWith('k-1', 'PASSED');
    expect(await screen.findByText('Passed')).toBeInTheDocument();
  });

  it("shows an error banner but keeps the table visible when a decision fails", async () => {
    vi.spyOn(adminApi, 'listAdminBusinessRegistrationChecks').mockResolvedValue([flaggedCheck]);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
    vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);
    vi.spyOn(adminApi, 'decideAdminKybCheck').mockRejectedValue(new Error('boom'));

    render(<AdminKycReviewPage />);
    await screen.findByText('Needs review');

    await userEvent.click(screen.getByRole('button', { name: /approve/i }));

    expect(await screen.findByText(/couldn't record the decision/i)).toBeInTheDocument();
    expect(screen.getByText('Indus Exports Pvt. Ltd.')).toBeInTheDocument();
    expect(screen.getByText('Needs review')).toBeInTheDocument();
  });

  it('rejects a flagged check', async () => {
    vi.spyOn(adminApi, 'listAdminBusinessRegistrationChecks').mockResolvedValue([flaggedCheck]);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
    vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);
    const decideSpy = vi.spyOn(adminApi, 'decideAdminKybCheck').mockResolvedValue({ ...flaggedCheck, status: 'FAILED' });

    render(<AdminKycReviewPage />);
    await screen.findByText('Needs review');

    await userEvent.click(screen.getByRole('button', { name: /reject/i }));

    expect(decideSpy).toHaveBeenCalledWith('k-1', 'FAILED');
    expect(await screen.findByText('Failed')).toBeInTheDocument();
  });

  it('opens the uploaded document in a new tab', async () => {
    vi.spyOn(adminApi, 'listAdminBusinessRegistrationChecks').mockResolvedValue([flaggedCheck]);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);
    vi.spyOn(adminApi, 'listAdminUsers').mockResolvedValue(users);
    const blob = new Blob(['fake pdf bytes'], { type: 'application/pdf' });
    vi.spyOn(adminApi, 'getBusinessRegistrationDocumentBlob').mockResolvedValue(blob);
    // jsdom doesn't implement createObjectURL, so it can't be spied on — assign it directly.
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<AdminKycReviewPage />);
    await screen.findByText('Needs review');

    await userEvent.click(screen.getByRole('button', { name: /view document/i }));

    expect(await screen.findByText('Needs review')).toBeInTheDocument();
    expect(openSpy).toHaveBeenCalledWith('blob:mock-url', '_blank');
  });
});
