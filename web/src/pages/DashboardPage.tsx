import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { listTrades } from '../api/trades';
import type { Trade } from '../api/types';
import { useAuthStore } from '../stores/AuthContext';

export const DashboardPage = observer(function DashboardPage() {
  const auth = useAuthStore();
  const user = auth.user!;
  const isExporter = ['EXPORTER_ADMIN', 'DOCS_COMPLIANCE', 'FINANCE', 'VIEWER'].includes(user.role);
  const [trades, setTrades] = useState<Trade[] | null>(null);

  useEffect(() => {
    listTrades().then(setTrades);
  }, []);

  const firstName = user.name.split(' ')[0];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-2xl">Welcome back, {firstName}</h1>
        {isExporter && (
          <Link to="/transactions/new" className="bg-ink text-paper-2 rounded px-4 py-2 font-semibold">
            + New transaction
          </Link>
        )}
      </div>
      {trades === null ? (
        <p className="text-ink-soft">Loading…</p>
      ) : trades.length === 0 ? (
        <p className="text-ink-soft">No active transactions.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {trades.map((trade) => (
            <li key={trade.id} className="border border-line rounded p-3">
              <Link to={`/transactions/${trade.id}/overview`} className="font-mono">
                {trade.lc_reference}
              </Link>{' '}
              — {trade.status}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
