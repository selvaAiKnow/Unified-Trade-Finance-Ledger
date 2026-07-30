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
    });

    render(
      <MemoryRouter>
        <OrganizationSignupPage />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/organization name/i), 'MedCure Pharma Exports');
    await userEvent.type(screen.getByLabelText(/country/i), 'India');
    await userEvent.type(screen.getByLabelText(/industry/i), 'Pharmaceuticals');
    await userEvent.type(screen.getByLabelText(/tax/i), 'TAX-1');
    await userEvent.type(screen.getByLabelText(/admin name/i), 'Priya Shah');
    await userEvent.type(screen.getByLabelText(/admin email/i), 'priya@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'a good password');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByText(/clear/i)).toBeInTheDocument();
    expect(signupSpy).toHaveBeenCalledWith(expect.objectContaining({ organization: expect.objectContaining({ org_type: 'EXPORTER' }) }));
  });

  it('offers only Exporter and Buyer as organization types', () => {
    render(
      <MemoryRouter>
        <OrganizationSignupPage />
      </MemoryRouter>,
    );

    const select = screen.getByLabelText(/organization type/i) as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(['EXPORTER', 'BUYER']);
  });
});
