import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { listTrades } from '../api/trades';
import type { Trade } from '../api/types';
import { canCreateTransaction } from '../lib/roles';
import { tradeStatusInfo } from '../lib/statusTones';
import { useAuthStore } from '../stores/AuthContext';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';
import { StatCard } from '../components/ui/StatCard';

export const DashboardPage = observer(function DashboardPage() {
  const auth = useAuthStore();
  const user = auth.user!;
  const canCreateNewTransaction = canCreateTransaction(user.role);
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTrades()
      .then(setTrades)
      .catch(() => setError("Couldn't load transactions. Please try again."));
  }, []);

  const firstName = user.name.split(' ')[0];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-2xl">Welcome back, {firstName}</h1>
        {canCreateNewTransaction && (
          <Link
            to="/transactions/new"
            className="bg-seal text-white rounded px-4 py-2 font-semibold hover:bg-seal-dark"
          >
            + New transaction
          </Link>
        )}
      </div>
      {error ? (
        <p className="text-block text-sm">{error}</p>
      ) : trades === null ? (
        <p className="text-ink-soft">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3.5 mb-6">
            <StatCard label="Active transactions" value={trades.length} />
          </div>
          <Panel title="Recent activity" description="Latest updates across your transaction pipeline." noPadding>
            {trades.length === 0 ? (
              <p className="text-ink-soft p-6">No active transactions.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-ink-soft border-b border-line-strong">
                    <th className="py-2.5 px-6">Reference</th>
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
                        <td className="py-3 px-6">
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Panel>
        </>
      )}
    </div>
  );
});
