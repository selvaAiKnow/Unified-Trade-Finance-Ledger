import { observer } from 'mobx-react-lite';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';

import { createBankReviewFinding, listBankReviewFindings } from '../api/bankReview';
import { listDocuments } from '../api/documents';
import type { BankReviewFinding, BankReviewResult, Document } from '../api/types';
import { isBankReviewerRole } from '../lib/roles';
import { useAuthStore } from '../stores/AuthContext';

export const TransactionBankReviewPage = observer(function TransactionBankReviewPage() {
  const { tradeId } = useParams<{ tradeId: string }>();
  const auth = useAuthStore();
  const isBankReviewer = auth.user ? isBankReviewerRole(auth.user.role) : false;

  const [findings, setFindings] = useState<BankReviewFinding[] | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentId, setDocumentId] = useState('');
  const [result, setResult] = useState<BankReviewResult>('MATCHES_LC');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function refreshFindings() {
    if (!tradeId) return;
    try {
      setFindings(await listBankReviewFindings(tradeId));
      setError(null);
    } catch {
      setError("Couldn't load the bank review findings. Please try again.");
    }
  }

  useEffect(() => {
    if (!tradeId) return;
    let cancelled = false;

    async function load() {
      setError(null);
      try {
        const [fetchedFindings, fetchedDocuments] = await Promise.all([
          listBankReviewFindings(tradeId as string),
          listDocuments(tradeId as string),
        ]);
        if (cancelled) return;
        setFindings(fetchedFindings);
        setDocuments(fetchedDocuments);
        setError(null);
      } catch {
        if (!cancelled) setError("Couldn't load the bank review data. Please try again.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tradeId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!tradeId || !documentId) return;
    setSubmitError(null);
    try {
      await createBankReviewFinding(tradeId, { document_id: documentId, result, note: note || null });
      setNote('');
      await refreshFindings();
    } catch {
      setSubmitError("Couldn't record the finding. Please try again.");
    }
  }

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (findings === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Bank Review</h1>
      {isBankReviewer && (
        <form onSubmit={handleSubmit} className="border border-line rounded-lg p-4 mb-6 max-w-lg flex flex-col gap-3">
          <div>
            <label htmlFor="documentId" className="block text-xs font-semibold text-ink-soft mb-1">
              Document
            </label>
            <select
              id="documentId"
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
              className="w-full px-3 py-2 border border-line rounded"
              required
            >
              <option value="">Select a document</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.document_type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="result" className="block text-xs font-semibold text-ink-soft mb-1">
              Result
            </label>
            <select
              id="result"
              value={result}
              onChange={(e) => setResult(e.target.value as BankReviewResult)}
              className="w-full px-3 py-2 border border-line rounded"
            >
              <option value="MATCHES_LC">Matches LC</option>
              <option value="DISCREPANCY">Discrepancy</option>
            </select>
          </div>
          <div>
            <label htmlFor="note" className="block text-xs font-semibold text-ink-soft mb-1">
              Note
            </label>
            <input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 border border-line rounded"
            />
          </div>
          {submitError && <p className="text-block text-sm">{submitError}</p>}
          <button type="submit" className="bg-ink text-paper-2 rounded py-2 font-semibold">
            Record finding
          </button>
        </form>
      )}
      {findings.length === 0 ? (
        <p className="text-ink-soft">No findings yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {findings.map((finding) => (
            <li key={finding.id} className="border border-line rounded p-3">
              <span className="font-semibold">{finding.result}</span>
              {finding.note && (
                <>
                  {' — '}
                  <span>{finding.note}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
