import { NavLink, Outlet } from 'react-router-dom';

import { useAuthStore } from '../stores/AuthContext';

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return isActive ? 'text-seal font-semibold' : 'text-ink-soft hover:text-ink';
}

export function AdminShell() {
  const auth = useAuthStore();

  return (
    <div className="min-h-screen bg-paper">
      <div className="h-[60px] border-b border-line bg-paper-2 flex items-center justify-between px-7">
        <div className="font-serif font-bold text-[16.5px]">Trade Ledger — Admin</div>
        <nav className="flex items-center gap-5 text-[13.5px] font-medium">
          <NavLink to="/admin" end className={navLinkClassName}>
            Organizations
          </NavLink>
          <NavLink to="/admin/users" className={navLinkClassName}>
            Users
          </NavLink>
          <NavLink to="/admin/trades" className={navLinkClassName}>
            Trades
          </NavLink>
          <button onClick={() => auth.logout()} className="text-ink-soft hover:text-ink font-semibold">
            Log out
          </button>
        </nav>
      </div>
      <div className="px-8 py-8">
        <Outlet />
      </div>
    </div>
  );
}
