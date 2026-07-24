import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { listDocumentRegistry } from '../api/documentRegistry';
import { listDocuments, uploadDocument } from '../api/documents';
import { getTrade } from '../api/trades';
import type { Document, DocumentRegistryEntry, Trade } from '../api/types';

export function TransactionDocumentsPage() {
  const { tradeId } = useParams<{ tradeId: string }>();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [registry, setRegistry] = useState<DocumentRegistryEntry[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!tradeId) return;
    let cancelled = false;

    async function load() {
      try {
        const fetchedTrade = await getTrade(tradeId as string);
        const [registryEntries, fetchedDocuments] = await Promise.all([
          listDocumentRegistry(fetchedTrade.industry, fetchedTrade.instrument_type),
          listDocuments(tradeId as string),
        ]);
        if (cancelled) return;
        setTrade(fetchedTrade);
        setRegistry(registryEntries);
        setDocuments(fetchedDocuments);
      } catch {
        if (!cancelled) setError("Couldn't load the transaction. Please try again.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tradeId]);

  async function handleUpload(entry: DocumentRegistryEntry, file: File) {
    if (!tradeId) return;
    setUploadError(null);
    try {
      await uploadDocument(tradeId, entry.category, entry.document_type, file);
      setDocuments(await listDocuments(tradeId));
    } catch {
      setUploadError("Couldn't upload the document. Please try again.");
    }
  }

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (!trade) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-1">{trade.lc_reference}</h1>
      <p className="text-ink-soft mb-6">Document checklist for {trade.industry}</p>
      {uploadError && <p className="text-block text-sm mb-4">{uploadError}</p>}
      <div className="border border-line rounded-lg divide-y divide-line-soft">
        {registry.map((entry) => {
          const uploaded = documents.find((doc) => doc.document_type === entry.document_type);
          return (
            <div key={entry.id} className="flex items-center justify-between p-4">
              <div>
                <div className="font-medium">{entry.document_type}</div>
                <div className="text-xs text-ink-soft">{entry.mandatory ? 'Mandatory' : 'Optional'}</div>
              </div>
              {uploaded ? (
                <span className="text-verified text-sm font-semibold">Uploaded</span>
              ) : (
                <label className="text-seal-dark text-sm font-semibold cursor-pointer">
                  Upload
                  <input
                    type="file"
                    className="hidden"
                    aria-label={`Upload ${entry.document_type}`}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(entry, file);
                    }}
                  />
                </label>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
