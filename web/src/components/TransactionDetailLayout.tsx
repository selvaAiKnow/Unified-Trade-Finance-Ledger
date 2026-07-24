import { Outlet, useParams } from 'react-router-dom';

import { TransactionTabs } from './TransactionTabs';

export function TransactionDetailLayout() {
  const { tradeId } = useParams<{ tradeId: string }>();

  return (
    <div>
      {tradeId && <TransactionTabs tradeId={tradeId} />}
      <Outlet />
    </div>
  );
}
