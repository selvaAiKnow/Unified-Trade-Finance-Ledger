import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as adminApi from '../api/admin';
import type { Organization, Trade } from '../api/types';
import { AdminViewTradePage } from './AdminViewTradePage';

const orgs: Organization[] = [
  { id: 'o-1', name: 'Indus Exports Pvt. Ltd.', org_type: 'EXPORTER', country: 'India', industry: 'Pharmaceuticals', tax_id: 'TAX-1', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
  { id: 'o-2', name: 'Global Imports Co.', org_type: 'BUYER', country: 'Japan', industry: 'Electronics', tax_id: 'TAX-2', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
  { id: 'o-3', name: 'Meiji Trust Bank', org_type: 'BANK', country: 'Japan', industry: 'Banking', tax_id: 'TAX-3', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
  { id: 'o-4', name: 'Canara Bank', org_type: 'BANK', country: 'India', industry: 'Banking', tax_id: 'TAX-4', kyb_status: 'CLEAR', created_at: '2026-01-01T00:00:00Z' },
];

const trade: Trade = {
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
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/trades/t-1']}>
      <Routes>
        <Route path="/trades/:tradeId" element={<AdminViewTradePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminViewTradePage', () => {
  it("shows the trade's details, resolving participant organization names", async () => {
    vi.spyOn(adminApi, 'getAdminTrade').mockResolvedValue(trade);
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    renderPage();

    expect(await screen.findByRole('heading', { name: 'MUFGJP2026LC1187' })).toBeInTheDocument();
    expect(screen.getByText('Paracetamol Tablets 500mg')).toBeInTheDocument();
    expect(screen.getByText('CIF Osaka')).toBeInTheDocument();
    expect(screen.getByText('Indus Exports Pvt. Ltd.')).toBeInTheDocument();
    expect(screen.getByText('Global Imports Co.')).toBeInTheDocument();
    expect(screen.getByText('Meiji Trust Bank')).toBeInTheDocument();
    expect(screen.getByText('Canara Bank')).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    vi.spyOn(adminApi, 'getAdminTrade').mockRejectedValue(new Error('boom'));
    vi.spyOn(adminApi, 'listAdminOrganizations').mockResolvedValue(orgs);

    renderPage();

    expect(await screen.findByText(/couldn't load this trade/i)).toBeInTheDocument();
  });
});
