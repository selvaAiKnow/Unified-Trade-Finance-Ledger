import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as sanctionsApi from '../api/sanctionsScreening';
import type { SanctionsScreening } from '../api/types';
import { TransactionCompliancePage } from './TransactionCompliancePage';

const screening: SanctionsScreening = {
  id: 's-1',
  trade_id: 't-1',
  party_screened: 'Osaka Pharma Distribution K.K.',
  status: 'CLEAR',
  raw_response: {},
  checked_at: '2026-01-01T00:00:00Z',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/transactions/t-1/compliance']}>
      <Routes>
        <Route path="/transactions/:tradeId/compliance" element={<TransactionCompliancePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TransactionCompliancePage', () => {
  it('lists past sanctions screenings for the trade', async () => {
    vi.spyOn(sanctionsApi, 'listSanctionsScreenings').mockResolvedValue([screening]);

    renderPage();

    expect(await screen.findByText('Osaka Pharma Distribution K.K.')).toBeInTheDocument();
    expect(screen.getByText('CLEAR')).toBeInTheDocument();
  });

  it('triggers a new screening from the form', async () => {
    vi.spyOn(sanctionsApi, 'listSanctionsScreenings').mockResolvedValue([]);
    const triggerSpy = vi.spyOn(sanctionsApi, 'triggerSanctionsScreening').mockResolvedValue(screening);

    renderPage();

    await screen.findByText(/no screenings yet/i);
    await userEvent.type(screen.getByLabelText(/party to screen/i), 'Osaka Pharma Distribution K.K.');
    await userEvent.click(screen.getByRole('button', { name: /run screening/i }));

    expect(triggerSpy).toHaveBeenCalledWith('t-1', { party_screened: 'Osaka Pharma Distribution K.K.' });
  });

  it('shows an error message when loading screenings fails', async () => {
    vi.spyOn(sanctionsApi, 'listSanctionsScreenings').mockRejectedValue(new Error('network down'));

    renderPage();

    expect(await screen.findByText(/couldn't load the sanctions screenings/i)).toBeInTheDocument();
  });

  it('clears a stale error once a subsequent load for a different trade succeeds', async () => {
    vi.spyOn(sanctionsApi, 'listSanctionsScreenings')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce([screening]);

    const router = createMemoryRouter(
      [{ path: '/transactions/:tradeId/compliance', element: <TransactionCompliancePage /> }],
      { initialEntries: ['/transactions/t-1/compliance'] },
    );

    render(<RouterProvider router={router} />);

    expect(await screen.findByText(/couldn't load the sanctions screenings/i)).toBeInTheDocument();

    await act(async () => {
      await router.navigate('/transactions/t-2/compliance');
    });

    expect(await screen.findByText('Osaka Pharma Distribution K.K.')).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load the sanctions screenings/i)).not.toBeInTheDocument();
    expect(sanctionsApi.listSanctionsScreenings).toHaveBeenCalledWith('t-2');
  });

  it('shows an error message when triggering a screening fails without losing the list', async () => {
    vi.spyOn(sanctionsApi, 'listSanctionsScreenings').mockResolvedValue([screening]);
    vi.spyOn(sanctionsApi, 'triggerSanctionsScreening').mockRejectedValue(new Error('screening failed'));

    renderPage();

    await screen.findByText('Osaka Pharma Distribution K.K.');
    await userEvent.type(screen.getByLabelText(/party to screen/i), 'Suspicious Traders LLC');
    await userEvent.click(screen.getByRole('button', { name: /run screening/i }));

    expect(await screen.findByText(/couldn't run the screening/i)).toBeInTheDocument();
    expect(screen.getByText('Osaka Pharma Distribution K.K.')).toBeInTheDocument();
  });
});
