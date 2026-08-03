import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { getTrade } from '../api/trades';
import type { Trade } from '../api/types';
import { tradeStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';

export function TransactionOverviewPage() {
  const { tradeId } = useParams<{ tradeId: string }>();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tradeId) {
      setError(null);
      getTrade(tradeId)
        .then((fetchedTrade) => {
          setTrade(fetchedTrade);
          setError(null);
        })
        .catch(() => setError("Couldn't load the transaction. Please try again."));
    }
  }, [tradeId]);

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (!trade) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  const status = tradeStatusInfo(trade.status);

  return (
    <div>
      <h1 className="font-serif text-2xl mb-1">{trade.lc_reference}</h1>
      <p className="text-ink-soft mb-6">
        {trade.industry} · {trade.currency} {trade.order_value.toLocaleString()}
      </p>
      <div className="grid grid-cols-2 gap-5">
        <Panel title="Terms">
          <dl className="flex flex-col gap-2.5 text-sm">
            <div className="flex justify-between border-b border-line pb-2.5">
              <dt className="text-ink-soft">Incoterm</dt>
              <dd className="font-semibold">{trade.incoterm}</dd>
            </div>
            <div className="flex justify-between border-b border-line pb-2.5">
              <dt className="text-ink-soft">Payment term</dt>
              <dd className="font-semibold">{trade.payment_term}</dd>
            </div>
            <div className="flex justify-between border-b border-line pb-2.5">
              <dt className="text-ink-soft">Shipment deadline</dt>
              <dd className="font-semibold">{trade.shipment_deadline ?? '—'}</dd>
            </div>
            <div className="flex justify-between border-b border-line pb-2.5">
              <dt className="text-ink-soft">Order value</dt>
              <dd className="font-mono font-semibold">
                {trade.currency} {trade.order_value.toLocaleString()}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Status</dt>
              <dd>
                <Badge tone={status.tone}>{status.label}</Badge>
              </dd>
            </div>
          </dl>
        </Panel>
        <Panel title="Product">
          <p className="text-sm">{trade.product_description}</p>
        </Panel>
      </div>
    </div>
  );
}
