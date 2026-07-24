import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as bankReviewApi from '../api/bankReview';
import * as documentsApi from '../api/documents';
import type { BankReviewFinding, Document } from '../api/types';
import { AuthStore } from '../stores/AuthStore';
import { AuthContext } from '../stores/AuthContext';
import { TransactionBankReviewPage } from './TransactionBankReviewPage';

const finding: BankReviewFinding = {
  id: 'f-1',
  trade_id: 't-1',
  document_id: 'd-1',
  result: 'DISCREPANCY',
  note: 'Tenor mismatch',
  reviewed_by: 'u-1',
  reviewed_at: '2026-01-01T00:00:00Z',
};

const document: Document = {
  id: 'd-1',
  trade_id: 't-1',
  category: 'Banking / LC',
  document_type: 'Bill of Exchange',
  uploaded_by: 'u-2',
  submitted_to: 'o-3',
  off_chain_storage_ref: 'ref',
  on_chain_hash: 'hash',
  verification_status: 'UPLOADED',
  created_at: '2026-01-01T00:00:00Z',
};

function renderWithRole(role: string) {
  const store = new AuthStore();
  store.isHydrating = false;
  store.setSession('tok', { id: 'u-1', org_id: 'o-1', name: 'Sana Iyer', email: 's@example.com', role: role as never, status: 'ACTIVE' });

  return render(
    <AuthContext.Provider value={store}>
      <MemoryRouter initialEntries={['/transactions/t-1/bank-review']}>
        <Routes>
          <Route path="/transactions/:tradeId/bank-review" element={<TransactionBankReviewPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

function renderWithRoleAtRouter(role: string, router: ReturnType<typeof createMemoryRouter>) {
  const store = new AuthStore();
  store.isHydrating = false;
  store.setSession('tok', { id: 'u-1', org_id: 'o-1', name: 'Sana Iyer', email: 's@example.com', role: role as never, status: 'ACTIVE' });

  return render(
    <AuthContext.Provider value={store}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  );
}

describe('TransactionBankReviewPage', () => {
  it('lists existing findings for any role', async () => {
    vi.spyOn(bankReviewApi, 'listBankReviewFindings').mockResolvedValue([finding]);
    vi.spyOn(documentsApi, 'listDocuments').mockResolvedValue([document]);

    renderWithRole('EXPORTER_ADMIN');

    expect(await screen.findByText('Tenor mismatch')).toBeInTheDocument();
  });

  it('shows the record-verdict form only for a bank reviewer', async () => {
    vi.spyOn(bankReviewApi, 'listBankReviewFindings').mockResolvedValue([]);
    vi.spyOn(documentsApi, 'listDocuments').mockResolvedValue([document]);

    renderWithRole('BANK_REVIEWER');

    expect(await screen.findByRole('button', { name: /record finding/i })).toBeInTheDocument();
  });

  it('hides the record-verdict form for a non-bank-reviewer', async () => {
    vi.spyOn(bankReviewApi, 'listBankReviewFindings').mockResolvedValue([]);
    vi.spyOn(documentsApi, 'listDocuments').mockResolvedValue([document]);

    renderWithRole('EXPORTER_ADMIN');

    await screen.findByText(/no findings yet/i);
    expect(screen.queryByRole('button', { name: /record finding/i })).not.toBeInTheDocument();
  });

  it('shows an error message when loading findings or documents fails', async () => {
    vi.spyOn(bankReviewApi, 'listBankReviewFindings').mockRejectedValue(new Error('network down'));
    vi.spyOn(documentsApi, 'listDocuments').mockResolvedValue([document]);

    renderWithRole('BANK_REVIEWER');

    expect(await screen.findByText(/couldn't load the bank review data/i)).toBeInTheDocument();
  });

  it('clears a stale error once a subsequent load for a different trade succeeds', async () => {
    vi.spyOn(bankReviewApi, 'listBankReviewFindings')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce([finding]);
    vi.spyOn(documentsApi, 'listDocuments').mockResolvedValue([document]);

    const router = createMemoryRouter(
      [{ path: '/transactions/:tradeId/bank-review', element: <TransactionBankReviewPage /> }],
      { initialEntries: ['/transactions/t-1/bank-review'] },
    );

    renderWithRoleAtRouter('EXPORTER_ADMIN', router);

    expect(await screen.findByText(/couldn't load the bank review data/i)).toBeInTheDocument();

    await act(async () => {
      await router.navigate('/transactions/t-2/bank-review');
    });

    expect(await screen.findByText('Tenor mismatch')).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load the bank review data/i)).not.toBeInTheDocument();
    expect(bankReviewApi.listBankReviewFindings).toHaveBeenCalledWith('t-2');
  });

  it('shows an error message when recording a finding fails without losing the findings list', async () => {
    vi.spyOn(bankReviewApi, 'listBankReviewFindings').mockResolvedValue([finding]);
    vi.spyOn(documentsApi, 'listDocuments').mockResolvedValue([document]);
    vi.spyOn(bankReviewApi, 'createBankReviewFinding').mockRejectedValue(new Error('save failed'));

    renderWithRole('BANK_REVIEWER');

    await screen.findByText('Tenor mismatch');
    await userEvent.selectOptions(screen.getByLabelText(/document/i), 'd-1');
    await userEvent.click(screen.getByRole('button', { name: /record finding/i }));

    expect(await screen.findByText(/couldn't record the finding/i)).toBeInTheDocument();
    expect(screen.getByText('Tenor mismatch')).toBeInTheDocument();
  });
});
