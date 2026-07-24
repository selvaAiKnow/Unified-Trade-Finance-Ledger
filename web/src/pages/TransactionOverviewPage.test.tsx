import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as tradesApi from '../api/trades';
import type { Trade } from '../api/types';
import { TransactionOverviewPage } from './TransactionOverviewPage';

const sampleTrade: Trade = {
  id: 't-1',
  lc_reference: 'MUFGJP2026LC1187',
  industry: 'Pharmaceuticals',
  instrument_type: 'Letter of Credit',
  exporter_org_id: 'o-1',
  buyer_org_id: 'o-2',
  issuing_bank_org_id: 'o-3',
  advising_bank_org_id: 'o-4',
  product_description: 'Paracetamol Tablets 500mg',
  order_value: 80000,
  currency: 'USD',
  incoterm: 'CIF Osaka',
  payment_term: 'Usance LC, 60 days',
  status: 'DOCS_UNDER_REVIEW',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('TransactionOverviewPage', () => {
  it('renders the trade terms fetched by ID from the route', async () => {
    vi.spyOn(tradesApi, 'getTrade').mockResolvedValue(sampleTrade);

    render(
      <MemoryRouter initialEntries={['/transactions/t-1/overview']}>
        <Routes>
          <Route path="/transactions/:tradeId/overview" element={<TransactionOverviewPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('MUFGJP2026LC1187')).toBeInTheDocument();
    expect(screen.getByText('CIF Osaka')).toBeInTheDocument();
    expect(tradesApi.getTrade).toHaveBeenCalledWith('t-1');
  });

  it('shows an error message when loading the trade fails', async () => {
    vi.spyOn(tradesApi, 'getTrade').mockRejectedValue(new Error('network down'));

    render(
      <MemoryRouter initialEntries={['/transactions/t-1/overview']}>
        <Routes>
          <Route path="/transactions/:tradeId/overview" element={<TransactionOverviewPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/couldn't load the transaction/i)).toBeInTheDocument();
  });

  it('clears a stale error once a subsequent load for a different trade succeeds', async () => {
    vi.spyOn(tradesApi, 'getTrade')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(sampleTrade);

    const router = createMemoryRouter(
      [{ path: '/transactions/:tradeId/overview', element: <TransactionOverviewPage /> }],
      { initialEntries: ['/transactions/t-1/overview'] },
    );

    render(<RouterProvider router={router} />);

    expect(await screen.findByText(/couldn't load the transaction/i)).toBeInTheDocument();

    await act(async () => {
      await router.navigate('/transactions/t-2/overview');
    });

    expect(await screen.findByText('MUFGJP2026LC1187')).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load the transaction/i)).not.toBeInTheDocument();
    expect(tradesApi.getTrade).toHaveBeenCalledWith('t-2');
  });
});
