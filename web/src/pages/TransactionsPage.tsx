import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { listTrades } from '../api/trades';
import type { Trade } from '../api/types';
import { tradeStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';

export function TransactionsPage() {
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTrades()
      .then(setTrades)
      .catch(() => setError("Couldn't load transactions. Please try again."));
  }, []);

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (trades === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Transactions</h1>
      {trades.length === 0 ? (
        <p className="text-ink-soft">No transactions yet.</p>
      ) : (
        <Panel noPadding>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-soft border-b border-line-strong">
                <th className="py-2.5 px-6">LC / Ref</th>
                <th className="py-2.5 px-6">Industry</th>
                <th className="py-2.5 px-6">Value</th>
                <th className="py-2.5 px-6">Status</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => {
                const status = tradeStatusInfo(trade.status);
                return (
                  <tr key={trade.id} className="border-b border-line last:border-b-0">
                    <td className="py-3 px-6">
                      <Link to={`/transactions/${trade.id}/overview`} className="font-mono">
                        {trade.lc_reference}
                      </Link>
                    </td>
                    <td className="py-3 px-6">{trade.industry}</td>
                    <td className="py-3 px-6 font-mono">
                      {trade.currency} {trade.order_value.toLocaleString()}
                    </td>
                    <td className="py-3 px-6">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
