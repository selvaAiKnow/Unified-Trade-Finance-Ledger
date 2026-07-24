import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { listTrades } from '../api/trades';
import type { Trade } from '../api/types';

export function TransactionsPage() {
  const [trades, setTrades] = useState<Trade[] | null>(null);

  useEffect(() => {
    listTrades().then(setTrades);
  }, []);

  if (trades === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Transactions</h1>
      {trades.length === 0 ? (
        <p className="text-ink-soft">No transactions yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-soft border-b border-line">
              <th className="py-2">LC / Ref</th>
              <th className="py-2">Industry</th>
              <th className="py-2">Value</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={trade.id} className="border-b border-line-soft">
                <td className="py-2">
                  <Link to={`/transactions/${trade.id}/overview`} className="font-mono">
                    {trade.lc_reference}
                  </Link>
                </td>
                <td className="py-2">{trade.industry}</td>
                <td className="py-2">
                  {trade.currency} {trade.order_value.toLocaleString()}
                </td>
                <td className="py-2">{trade.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
