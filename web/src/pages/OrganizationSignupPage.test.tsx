import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as authApi from '../api/auth';
import { OrganizationSignupPage } from './OrganizationSignupPage';

describe('OrganizationSignupPage', () => {
  it('submits the account step and shows the immediate KYB verify result', async () => {
    const signupSpy = vi.spyOn(authApi, 'signup').mockResolvedValue({
      organization: { id: '1', name: 'MedCure Pharma Exports', org_type: 'EXPORTER', country: 'India', industry: 'Pharmaceuticals', tax_id: 'TAX-1', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
      user: { id: '2', org_id: '1', name: 'Priya Shah', email: 'priya@example.com', role: 'EXPORTER_ADMIN', status: 'ACTIVE' },
      kyb_checks: [
        { id: 'k-1', org_id: '1', check_type: 'BUSINESS_REGISTRATION', status: 'PASSED', detail: null, checked_at: '2026-01-01T00:00:00Z' },
        { id: 'k-2', org_id: '1', check_type: 'SANCTIONS_SCREENING', status: 'PASSED', detail: 'fake:CLEAR', checked_at: '2026-01-01T00:00:00Z' },
        { id: 'k-3', org_id: '1', check_type: 'BANK_ACCOUNT', status: 'PASSED', detail: null, checked_at: '2026-01-01T00:00:00Z' },
      ],
    });

    render(
      <MemoryRouter>
        <OrganizationSignupPage />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/organization name/i), 'MedCure Pharma Exports');
    await userEvent.selectOptions(screen.getByLabelText(/country/i), 'India');
    await userEvent.selectOptions(screen.getByLabelText(/industry/i), 'Pharmaceuticals');
    await userEvent.type(screen.getByLabelText(/tax/i), 'TAX-1');
    await userEvent.type(screen.getByLabelText(/admin name/i), 'Priya Shah');
    await userEvent.type(screen.getByLabelText(/admin email/i), 'priya@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'a good password');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByText(/clear/i)).toBeInTheDocument();
    expect(screen.getByText('BUSINESS_REGISTRATION')).toBeInTheDocument();
    expect(screen.getByText('SANCTIONS_SCREENING')).toBeInTheDocument();
    expect(screen.getByText('BANK_ACCOUNT')).toBeInTheDocument();
    expect(signupSpy).toHaveBeenCalledWith(expect.objectContaining({ organization: expect.objectContaining({ org_type: 'EXPORTER' }) }));
  });

  it('offers Exporter, Importer, and Both as organization types', () => {
    render(
      <MemoryRouter>
        <OrganizationSignupPage />
      </MemoryRouter>,
    );

    const select = screen.getByLabelText(/organization type/i) as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionValues).toEqual(['EXPORTER', 'BUYER', 'BOTH']);
    expect(optionLabels).toEqual(['Exporter', 'Importer', 'Both']);
  });

  it('offers India and Japan as country options', () => {
    render(
      <MemoryRouter>
        <OrganizationSignupPage />
      </MemoryRouter>,
    );

    const select = screen.getByLabelText(/country/i) as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).toEqual(['India', 'Japan']);
  });

  it('offers the nine trade industries as industry options', () => {
    render(
      <MemoryRouter>
        <OrganizationSignupPage />
      </MemoryRouter>,
    );

    const select = screen.getByLabelText(/industry/i) as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).toEqual([
      'Pharmaceuticals',
      'Textiles & Apparel',
      'Electronics & Electrical Equipment',
      'Automotive & Auto Components',
      'Chemicals & Petrochemicals',
      'Agriculture & Food Products',
      'Machinery & Industrial Equipment',
      'Steel & Metals',
      'Oil & Gas / Energy',
    ]);
  });

  it('links to the login page from the account step', () => {
    render(
      <MemoryRouter>
        <OrganizationSignupPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  });
});
