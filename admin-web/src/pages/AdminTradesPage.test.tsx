import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import * as adminApi from '../api/admin';
import type { Trade } from '../api/types';
import { AdminTradesPage } from './AdminTradesPage';

const trades: Trade[] = [
  {
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
    shipment_deadline: '2026-09-15',
    status: 'DOCS_UNDER_REVIEW',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 't-2',
    lc_reference: 'SGDIN2026LC2491',
    industry: 'Electronics',
    instrument_type: 'Letter of Credit',
    exporter_org_id: 'o-5',
    buyer_org_id: 'o-6',
    issuing_bank_org_id: 'o-7',
    advising_bank_org_id: 'o-8',
    product_description: 'Circuit boards',
    order_value: 42000,
    currency: 'SGD',
    incoterm: 'FOB Singapore',
    payment_term: 'Sight LC',
    shipment_deadline: '2026-10-20',
    status: 'ACCEPTED',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

describe('AdminTradesPage', () => {
  it('renders every trade platform-wide', async () => {
    vi.spyOn(adminApi, 'listAdminTrades').mockResolvedValue(trades);

    render(<AdminTradesPage />);

    expect(await screen.findByText('MUFGJP2026LC1187')).toBeInTheDocument();
    expect(screen.getByText('2026-09-15')).toBeInTheDocument();
    expect(screen.getByText('SGDIN2026LC2491')).toBeInTheDocument();
    expect(screen.getByText('2026-10-20')).toBeInTheDocument();
    expect(screen.getByText('Electronics')).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    vi.spyOn(adminApi, 'listAdminTrades').mockRejectedValue(new Error('boom'));

    render(<AdminTradesPage />);

    expect(await screen.findByText(/couldn't load trades/i)).toBeInTheDocument();
  });
});
