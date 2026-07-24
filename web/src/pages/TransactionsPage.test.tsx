import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as tradesApi from '../api/trades';
import type { Trade } from '../api/types';
import { TransactionsPage } from './TransactionsPage';

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

describe('TransactionsPage', () => {
  it('renders the list of trades returned by the API', async () => {
    vi.spyOn(tradesApi, 'listTrades').mockResolvedValue([sampleTrade]);

    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('MUFGJP2026LC1187')).toBeInTheDocument();
  });

  it('shows an empty state when there are no trades', async () => {
    vi.spyOn(tradesApi, 'listTrades').mockResolvedValue([]);

    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/no transactions/i)).toBeInTheDocument();
  });

  it('shows an error message when loading trades fails', async () => {
    vi.spyOn(tradesApi, 'listTrades').mockRejectedValue(new Error('network down'));

    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/couldn't load transactions/i)).toBeInTheDocument();
  });
});
