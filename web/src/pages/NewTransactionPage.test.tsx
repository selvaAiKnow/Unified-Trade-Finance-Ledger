import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as tradesApi from '../api/trades';
import type { Trade } from '../api/types';
import { NewTransactionPage } from './NewTransactionPage';

describe('NewTransactionPage', () => {
  it('submits the form and creates a trade', async () => {
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
    await userEvent.type(screen.getByLabelText(/exporter org id/i), 'o-1');
    await userEvent.type(screen.getByLabelText(/buyer org id/i), 'o-2');
    await userEvent.type(screen.getByLabelText(/issuing bank org id/i), 'o-3');
    await userEvent.type(screen.getByLabelText(/advising bank org id/i), 'o-4');
    await userEvent.type(screen.getByLabelText(/product description/i), 'Paracetamol Tablets 500mg');
    await userEvent.type(screen.getByLabelText(/order value/i), '80000');
    await userEvent.type(screen.getByLabelText(/currency/i), 'USD');
    await userEvent.type(screen.getByLabelText(/incoterm/i), 'CIF Osaka');
    await userEvent.type(screen.getByLabelText(/payment term/i), 'Usance LC, 60 days');
    await userEvent.click(screen.getByRole('button', { name: /create transaction/i }));

    expect(createTradeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ lc_reference: 'LC-NEW-1', order_value: 80000 }),
    );
  });
});
