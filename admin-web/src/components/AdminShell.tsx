import { NavLink, Outlet } from 'react-router-dom';

import { useAuthStore } from '../stores/AuthContext';
import { BuildingIcon, ExchangeIcon, LogoutIcon, ShieldCheckIcon, UsersGroupIcon } from './icons';

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return `flex items-center gap-2.5 px-3 py-2 rounded text-[13.5px] font-medium ${
    isActive ? 'bg-seal text-white' : 'text-ink-soft hover:bg-line-soft hover:text-ink'
  }`;
}

export function AdminShell() {
  const auth = useAuthStore();

  return (
    <div className="flex min-h-screen">
      <aside className="w-[220px] shrink-0 bg-paper-2 border-r border-line flex flex-col">
        <div className="px-6 py-5 border-b border-line font-serif font-bold text-[15px]">Trade Ledger — Admin</div>
        <nav className="flex-1 flex flex-col gap-1 px-3 py-4">
          <NavLink to="/" end className={navLinkClassName}>
            <BuildingIcon />
            Organizations
          </NavLink>
          <NavLink to="/users" className={navLinkClassName}>
            <UsersGroupIcon />
            Users
          </NavLink>
          <NavLink to="/trades" className={navLinkClassName}>
            <ExchangeIcon />
            Trades
          </NavLink>
          <NavLink to="/kyc-review" className={navLinkClassName}>
            <ShieldCheckIcon />
            KYC Review
          </NavLink>
        </nav>
        <div className="px-3 py-4 border-t border-line">
          <button
            onClick={() => auth.logout()}
            className="flex items-center gap-2.5 px-3 py-2 rounded text-[13.5px] font-medium text-ink-soft hover:bg-line-soft hover:text-ink w-full"
          >
            <LogoutIcon />
            Log out
          </button>
        </div>
      </aside>
      <div className="flex-1 px-8 py-8 bg-paper">
        <Outlet />
      </div>
    </div>
  );
}
