import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as authApi from '../api/auth';
import { BankSignupPage } from './BankSignupPage';

describe('BankSignupPage', () => {
  it('submits the account step with org_type fixed to BANK and no type dropdown shown', async () => {
    const signupSpy = vi.spyOn(authApi, 'signup').mockResolvedValue({
      organization: { id: '1', name: 'Canara Bank', org_type: 'BANK', country: 'India', industry: 'Banking', tax_id: 'TAX-2', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
      user: { id: '2', org_id: '1', name: 'Rahul Mehta', email: 'rahul@example.com', role: 'BANK_REVIEWER', status: 'ACTIVE' },
      kyb_checks: [
        { id: 'k-1', org_id: '1', check_type: 'BUSINESS_REGISTRATION', status: 'PASSED', detail: null, checked_at: '2026-01-01T00:00:00Z' },
        { id: 'k-2', org_id: '1', check_type: 'SANCTIONS_SCREENING', status: 'PASSED', detail: 'fake:CLEAR', checked_at: '2026-01-01T00:00:00Z' },
        { id: 'k-3', org_id: '1', check_type: 'BANK_ACCOUNT', status: 'PASSED', detail: null, checked_at: '2026-01-01T00:00:00Z' },
      ],
    });

    render(
      <MemoryRouter>
        <BankSignupPage />
      </MemoryRouter>,
    );

    expect(screen.queryByLabelText(/organization type/i)).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/institution name/i), 'Canara Bank');
    await userEvent.selectOptions(screen.getByLabelText(/country/i), 'India');
    await userEvent.type(screen.getByLabelText(/industry/i), 'Banking');
    await userEvent.type(screen.getByLabelText(/tax/i), 'TAX-2');
    await userEvent.type(screen.getByLabelText(/admin name/i), 'Rahul Mehta');
    await userEvent.type(screen.getByLabelText(/admin email/i), 'rahul@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'a good password');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByText(/clear/i)).toBeInTheDocument();
    expect(screen.getByText('Institution verified')).toBeInTheDocument();
    expect(screen.queryByText('Organization verified')).not.toBeInTheDocument();
    expect(signupSpy).toHaveBeenCalledWith(expect.objectContaining({ organization: expect.objectContaining({ org_type: 'BANK' }) }));
  });
});
