import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as organizationsApi from '../api/organizations';
import * as tradesApi from '../api/trades';
import type { Organization, Trade } from '../api/types';
import { AuthStore } from '../stores/AuthStore';
import { AuthContext } from '../stores/AuthContext';
import { NewTransactionPage } from './NewTransactionPage';

const selfOrg: Organization = {
  id: 'o-self',
  name: 'Indus Exports Pvt. Ltd.',
  org_type: 'BOTH',
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

const exporterOrg: Organization = {
  id: 'o-5',
  name: 'Bharat Steel Exports Ltd.',
  org_type: 'EXPORTER',
  country: 'India',
  industry: 'Steel & Metals',
  tax_id: 'TAX-5',
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
    const all = [buyerOrg, exporterOrg, issuingBankOrg, advisingBankOrg];
    if (!search) return all;
    return all.filter((org) => org.name.toLowerCase().includes(search.toLowerCase()));
  });
  vi.spyOn(organizationsApi, 'getOrganization').mockResolvedValue(selfOrg);
}

async function pickOrg(labelPattern: RegExp, query: string, orgName: string) {
  await userEvent.type(screen.getByLabelText(labelPattern), query);
  await userEvent.click(await screen.findByText(orgName));
}

function renderPage() {
  const store = new AuthStore();
  store.isHydrating = false;
  store.setSession('tok', { id: 'u-1', org_id: 'o-self', name: 'Priya Shah', email: 'priya@example.com', role: 'EXPORTER_ADMIN' as never, status: 'ACTIVE' });

  return render(
    <AuthContext.Provider value={store}>
      <MemoryRouter>
        <NewTransactionPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

async function answerTradeRole(role: 'Exporter' | 'Importer') {
  await userEvent.click(screen.getByRole('button', { name: role }));
}

describe('NewTransactionPage', () => {
  it('asks whether the user is the Exporter or Importer before showing the rest of the form', () => {
    mockOrgSearch();
    renderPage();

    expect(screen.getByText(/are you the exporter or importer/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/lc reference/i)).not.toBeInTheDocument();
  });

  it('locks the Exporter field to the current user\'s own org after answering Exporter', async () => {
    mockOrgSearch();
    renderPage();

    await answerTradeRole('Exporter');

    expect(await screen.findByText(selfOrg.name)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^exporter/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^importer/i)).toBeInTheDocument();
  });

  it('locks the Importer field to the current user\'s own org after answering Importer', async () => {
    mockOrgSearch();
    renderPage();

    await answerTradeRole('Importer');

    expect(await screen.findByText(selfOrg.name)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^importer/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^exporter/i)).toBeInTheDocument();
  });

  it('lets the user change their answer', async () => {
    mockOrgSearch();
    renderPage();

    await answerTradeRole('Exporter');
    await screen.findByText(selfOrg.name);
    await userEvent.click(screen.getByRole('button', { name: /change/i }));

    expect(screen.getByText(/are you the exporter or importer/i)).toBeInTheDocument();
  });

  it('offers the fixed industry, instrument type, and currency option lists', async () => {
    mockOrgSearch();
    renderPage();
    await answerTradeRole('Exporter');
    await screen.findByText(selfOrg.name);

    const industrySelect = screen.getByLabelText(/^industry/i) as HTMLSelectElement;
    expect(Array.from(industrySelect.options).map((o) => o.value)).toEqual([
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

    const instrumentSelect = screen.getByLabelText(/instrument type/i) as HTMLSelectElement;
    expect(Array.from(instrumentSelect.options).map((o) => o.value)).toEqual([
      'Letter of Credit',
      'Documentary Collection',
      'Open Account',
    ]);

    const currencySelect = screen.getByLabelText(/currency/i) as HTMLSelectElement;
    expect(Array.from(currencySelect.options).map((o) => o.value)).toEqual(['INR', 'JPY']);
  });

  it('submits the form with the locked exporter org, the picked counterparties, and the shipment deadline', async () => {
    mockOrgSearch();
    const created: Trade = {
      id: 't-new',
      lc_reference: 'LC-NEW-1',
      industry: 'Pharmaceuticals',
      instrument_type: 'Letter of Credit',
      exporter_org_id: 'o-self',
      buyer_org_id: 'o-2',
      issuing_bank_org_id: 'o-3',
      advising_bank_org_id: 'o-4',
      product_description: 'Paracetamol Tablets 500mg',
      order_value: 80000,
      currency: 'INR',
      incoterm: 'CIF Osaka',
      payment_term: 'Usance LC, 60 days',
      shipment_deadline: '2026-09-15',
      status: 'DRAFT',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const createTradeSpy = vi.spyOn(tradesApi, 'createTrade').mockResolvedValue(created);

    renderPage();
    await answerTradeRole('Exporter');
    await screen.findByText(selfOrg.name);

    await userEvent.type(screen.getByLabelText(/lc reference/i), 'LC-NEW-1');
    await pickOrg(/^importer/i, 'Sakura', buyerOrg.name);
    await pickOrg(/^issuing bank/i, 'MUFG', issuingBankOrg.name);
    await pickOrg(/^advising bank/i, 'Canara', advisingBankOrg.name);
    await userEvent.type(screen.getByLabelText(/product description/i), 'Paracetamol Tablets 500mg');
    await userEvent.type(screen.getByLabelText(/order value/i), '80000');
    await userEvent.type(screen.getByLabelText(/incoterm/i), 'CIF Osaka');
    await userEvent.type(screen.getByLabelText(/payment term/i), 'Usance LC, 60 days');
    await userEvent.type(screen.getByLabelText(/shipment deadline/i), '2026-09-15');
    await userEvent.click(screen.getByRole('button', { name: /create transaction/i }));

    expect(createTradeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        lc_reference: 'LC-NEW-1',
        industry: 'Pharmaceuticals',
        instrument_type: 'Letter of Credit',
        currency: 'INR',
        exporter_org_id: 'o-self',
        buyer_org_id: 'o-2',
        issuing_bank_org_id: 'o-3',
        advising_bank_org_id: 'o-4',
        shipment_deadline: '2026-09-15',
      }),
    );
  });

  it('shows an error and does not submit when a counterparty has not been selected from the list', async () => {
    mockOrgSearch();
    const createTradeSpy = vi.spyOn(tradesApi, 'createTrade');

    renderPage();
    await answerTradeRole('Exporter');
    await screen.findByText(selfOrg.name);

    await userEvent.type(screen.getByLabelText(/lc reference/i), 'LC-NEW-1');
    await userEvent.type(screen.getByLabelText(/^importer/i), 'not a real org, just typed text');
    await userEvent.type(screen.getByLabelText(/product description/i), 'Paracetamol Tablets 500mg');
    await userEvent.type(screen.getByLabelText(/order value/i), '80000');
    await userEvent.type(screen.getByLabelText(/incoterm/i), 'CIF Osaka');
    await userEvent.type(screen.getByLabelText(/payment term/i), 'Usance LC, 60 days');
    await userEvent.type(screen.getByLabelText(/shipment deadline/i), '2026-09-15');
    await userEvent.click(screen.getByRole('button', { name: /create transaction/i }));

    expect(await screen.findByText(/select.*from the list/i)).toBeInTheDocument();
    expect(createTradeSpy).not.toHaveBeenCalled();
  });
});
