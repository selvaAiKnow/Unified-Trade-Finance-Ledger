import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as organizationsApi from '../api/organizations';
import * as tradesApi from '../api/trades';
import type { Organization, Trade } from '../api/types';
import { NewTransactionPage } from './NewTransactionPage';

const exporterOrg: Organization = {
  id: 'o-1',
  name: 'Indus Exports Pvt. Ltd.',
  org_type: 'EXPORTER',
  country: 'India',
  industry: 'Pharmaceuticals',
  tax_id: 'TAX-1',
  kyb_status: 'CLEAR',
  created_at: '2026-01-01T00:00:00Z',
};

const buyerOrg: Organization = {
  id: 'o-2',
  name: 'Sakura Textiles K.K.',
  org_type: 'BUYER',
  country: 'Japan',
  industry: 'Textiles & Apparel',
  tax_id: 'TAX-2',
  kyb_status: 'CLEAR',
  created_at: '2026-01-01T00:00:00Z',
};

const issuingBankOrg: Organization = {
  id: 'o-3',
  name: 'MUFG Bank, Ltd.',
  org_type: 'BANK',
  country: 'Japan',
  industry: 'Banking',
  tax_id: 'TAX-3',
  kyb_status: 'CLEAR',
  created_at: '2026-01-01T00:00:00Z',
};

const advisingBankOrg: Organization = {
  id: 'o-4',
  name: 'Canara Bank',
  org_type: 'BANK',
  country: 'India',
  industry: 'Banking',
  tax_id: 'TAX-4',
  kyb_status: 'CLEAR',
  created_at: '2026-01-01T00:00:00Z',
};

function mockOrgSearch() {
  vi.spyOn(organizationsApi, 'listOrganizations').mockImplementation(async (search?: string) => {
    const all = [exporterOrg, buyerOrg, issuingBankOrg, advisingBankOrg];
    if (!search) return all;
    return all.filter((org) => org.name.toLowerCase().includes(search.toLowerCase()));
  });
}

async function pickOrg(labelPattern: RegExp, query: string, orgName: string) {
  await userEvent.type(screen.getByLabelText(labelPattern), query);
  await userEvent.click(await screen.findByText(orgName));
}

describe('NewTransactionPage', () => {
  it('submits the form and creates a trade, resolving org pickers to IDs', async () => {
    mockOrgSearch();
    const created: Trade = {
      id: 't-new',
      lc_reference: 'LC-NEW-1',
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
      status: 'DRAFT',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const createTradeSpy = vi.spyOn(tradesApi, 'createTrade').mockResolvedValue(created);

    render(
      <MemoryRouter>
        <NewTransactionPage />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/lc reference/i), 'LC-NEW-1');
    await userEvent.type(screen.getByLabelText(/^industry/i), 'Pharmaceuticals');
    await userEvent.type(screen.getByLabelText(/instrument type/i), 'Letter of Credit');
    await pickOrg(/^exporter/i, 'Indus', exporterOrg.name);
    await pickOrg(/^importer/i, 'Sakura', buyerOrg.name);
    await pickOrg(/^issuing bank/i, 'MUFG', issuingBankOrg.name);
    await pickOrg(/^advising bank/i, 'Canara', advisingBankOrg.name);
    await userEvent.type(screen.getByLabelText(/product description/i), 'Paracetamol Tablets 500mg');
    await userEvent.type(screen.getByLabelText(/order value/i), '80000');
    await userEvent.type(screen.getByLabelText(/currency/i), 'USD');
    await userEvent.type(screen.getByLabelText(/incoterm/i), 'CIF Osaka');
    await userEvent.type(screen.getByLabelText(/payment term/i), 'Usance LC, 60 days');
    await userEvent.click(screen.getByRole('button', { name: /create transaction/i }));

    expect(createTradeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        lc_reference: 'LC-NEW-1',
        order_value: 80000,
        exporter_org_id: 'o-1',
        buyer_org_id: 'o-2',
        issuing_bank_org_id: 'o-3',
        advising_bank_org_id: 'o-4',
      }),
    );
  });

  it('shows an error and does not submit when an organization has not been selected from the list', async () => {
    mockOrgSearch();
    const createTradeSpy = vi.spyOn(tradesApi, 'createTrade');

    render(
      <MemoryRouter>
        <NewTransactionPage />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/lc reference/i), 'LC-NEW-1');
    await userEvent.type(screen.getByLabelText(/^industry/i), 'Pharmaceuticals');
    await userEvent.type(screen.getByLabelText(/instrument type/i), 'Letter of Credit');
    await userEvent.type(screen.getByLabelText(/^exporter/i), 'not a real org, just typed text');
    await userEvent.type(screen.getByLabelText(/product description/i), 'Paracetamol Tablets 500mg');
    await userEvent.type(screen.getByLabelText(/order value/i), '80000');
    await userEvent.type(screen.getByLabelText(/currency/i), 'USD');
    await userEvent.type(screen.getByLabelText(/incoterm/i), 'CIF Osaka');
    await userEvent.type(screen.getByLabelText(/payment term/i), 'Usance LC, 60 days');
    await userEvent.click(screen.getByRole('button', { name: /create transaction/i }));

    expect(await screen.findByText(/select.*from the list/i)).toBeInTheDocument();
    expect(createTradeSpy).not.toHaveBeenCalled();
  });
});
