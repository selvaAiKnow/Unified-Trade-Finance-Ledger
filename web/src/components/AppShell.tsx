import { observer } from 'mobx-react-lite';
import { Link, Outlet } from 'react-router-dom';

import { isExporterRole } from '../lib/roles';
import { useAuthStore } from '../stores/AuthContext';

export const AppShell = observer(function AppShell() {
  const auth = useAuthStore();
  const user = auth.user!;
  const isExporter = isExporterRole(user.role);

  return (
    <div>
      <div className="h-[60px] bg-ink flex items-center px-6 gap-5 text-paper-2">
        <Link to="/dashboard" className="font-serif text-lg">
          Trade Ledger
        </Link>
      </div>
      <div className="flex">
        <div className="w-[222px] shrink-0 bg-paper-2 border-r border-line-soft min-h-screen p-4">
          <nav className="flex flex-col gap-1">
            <Link to="/dashboard" className="px-2 py-2 rounded hover:bg-line-soft">
              Dashboard
            </Link>
            <Link to="/transactions" className="px-2 py-2 rounded hover:bg-line-soft">
              Transactions
            </Link>
            {isExporter && (
              <Link to="/transactions/new" className="px-2 py-2 rounded hover:bg-line-soft">
                New transaction
              </Link>
            )}
            <Link to="/team" className="px-2 py-2 rounded hover:bg-line-soft">
              Team
            </Link>
          </nav>
          <div className="mt-8 pt-4 border-t border-line-soft flex items-center justify-between">
            <Link to="/profile" className="hover:underline">
              <div className="text-sm font-semibold">{user.name}</div>
              <div className="text-xs text-ink-soft">{user.role}</div>
            </Link>
            <button onClick={() => auth.logout()} className="text-xs text-ink-soft hover:text-block">
              Log out
            </button>
          </div>
        </div>
        <div className="flex-1 p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
});
