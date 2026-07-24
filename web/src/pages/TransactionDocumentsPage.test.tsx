import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as documentRegistryApi from '../api/documentRegistry';
import * as documentsApi from '../api/documents';
import * as tradesApi from '../api/trades';
import type { Document, DocumentRegistryEntry, Trade } from '../api/types';
import { TransactionDocumentsPage } from './TransactionDocumentsPage';

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

const registryEntry: DocumentRegistryEntry = {
  id: 'r-1',
  industry: 'Pharmaceuticals',
  instrument_type: 'Letter of Credit',
  document_type: 'Certificate of Analysis (CoA)',
  category: 'Regulatory / Compliance',
  mandatory: true,
  lc_required: true,
};

const uploadedDoc: Document = {
  id: 'd-1',
  trade_id: 't-1',
  category: 'Regulatory / Compliance',
  document_type: 'Certificate of Analysis (CoA)',
  uploaded_by: 'u-1',
  submitted_to: 'o-3',
  off_chain_storage_ref: 'ref',
  on_chain_hash: 'hash',
  verification_status: 'UPLOADED',
  created_at: '2026-01-01T00:00:00Z',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/transactions/t-1/documents']}>
      <Routes>
        <Route path="/transactions/:tradeId/documents" element={<TransactionDocumentsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TransactionDocumentsPage', () => {
  it('shows registry document types marked as uploaded when already present', async () => {
    vi.spyOn(tradesApi, 'getTrade').mockResolvedValue(sampleTrade);
    vi.spyOn(documentRegistryApi, 'listDocumentRegistry').mockResolvedValue([registryEntry]);
    vi.spyOn(documentsApi, 'listDocuments').mockResolvedValue([uploadedDoc]);

    renderPage();

    expect(await screen.findByText('Certificate of Analysis (CoA)')).toBeInTheDocument();
    expect(screen.getByText(/uploaded/i)).toBeInTheDocument();
  });

  it('shows an upload control for registry document types not yet uploaded', async () => {
    vi.spyOn(tradesApi, 'getTrade').mockResolvedValue(sampleTrade);
    vi.spyOn(documentRegistryApi, 'listDocumentRegistry').mockResolvedValue([registryEntry]);
    vi.spyOn(documentsApi, 'listDocuments').mockResolvedValue([]);

    renderPage();

    expect(await screen.findByLabelText(/upload certificate of analysis/i)).toBeInTheDocument();
  });

  it('shows an error message when loading the transaction fails', async () => {
    vi.spyOn(tradesApi, 'getTrade').mockRejectedValue(new Error('network down'));

    renderPage();

    expect(await screen.findByText(/couldn't load the transaction/i)).toBeInTheDocument();
  });

  it('clears a stale error once a subsequent load for a different trade succeeds', async () => {
    vi.spyOn(tradesApi, 'getTrade')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(sampleTrade);
    vi.spyOn(documentRegistryApi, 'listDocumentRegistry').mockResolvedValue([registryEntry]);
    vi.spyOn(documentsApi, 'listDocuments').mockResolvedValue([]);

    const router = createMemoryRouter(
      [{ path: '/transactions/:tradeId/documents', element: <TransactionDocumentsPage /> }],
      { initialEntries: ['/transactions/t-1/documents'] },
    );

    render(<RouterProvider router={router} />);

    expect(await screen.findByText(/couldn't load the transaction/i)).toBeInTheDocument();

    await act(async () => {
      await router.navigate('/transactions/t-2/documents');
    });

    expect(await screen.findByText('MUFGJP2026LC1187')).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load the transaction/i)).not.toBeInTheDocument();
    expect(tradesApi.getTrade).toHaveBeenCalledWith('t-2');
  });

  it('shows an error message when an upload fails without losing the checklist', async () => {
    vi.spyOn(tradesApi, 'getTrade').mockResolvedValue(sampleTrade);
    vi.spyOn(documentRegistryApi, 'listDocumentRegistry').mockResolvedValue([registryEntry]);
    vi.spyOn(documentsApi, 'listDocuments').mockResolvedValue([]);
    vi.spyOn(documentsApi, 'uploadDocument').mockRejectedValue(new Error('upload failed'));

    renderPage();

    const input = await screen.findByLabelText(/upload certificate of analysis/i);
    const file = new File(['data'], 'coa.pdf', { type: 'application/pdf' });
    await userEvent.upload(input, file);

    expect(await screen.findByText(/couldn't upload the document/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/upload certificate of analysis/i)).toBeInTheDocument();
  });
});
