import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { getTrade } from '../api/trades';
import type { Trade } from '../api/types';

export function TransactionOverviewPage() {
  const { tradeId } = useParams<{ tradeId: string }>();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tradeId) {
      getTrade(tradeId)
        .then(setTrade)
        .catch(() => setError("Couldn't load the transaction. Please try again."));
    }
  }, [tradeId]);

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (!trade) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-1">{trade.lc_reference}</h1>
      <p className="text-ink-soft mb-6">
        {trade.industry} · {trade.currency} {trade.order_value.toLocaleString()}
      </p>
      <div className="grid grid-cols-2 gap-6">
        <div className="border border-line rounded-lg p-5">
          <h3 className="font-serif text-lg mb-3">Terms</h3>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-soft">Incoterm</dt>
              <dd>{trade.incoterm}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Payment term</dt>
              <dd>{trade.payment_term}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Order value</dt>
              <dd>
                {trade.currency} {trade.order_value.toLocaleString()}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Status</dt>
              <dd>{trade.status}</dd>
            </div>
          </dl>
        </div>
        <div className="border border-line rounded-lg p-5">
          <h3 className="font-serif text-lg mb-3">Product</h3>
          <p className="text-sm">{trade.product_description}</p>
        </div>
      </div>
    </div>
  );
}
