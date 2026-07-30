import { observer } from 'mobx-react-lite';
import { Link, Outlet, useLocation } from 'react-router-dom';

import { isExporterRole, roleLabel } from '../lib/roles';
import { useAuthStore } from '../stores/AuthContext';

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}

function TransactionsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  );
}

function NewTransactionIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function TeamIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20c0-3.6 3-6 7-6s7 2.4 7 6" />
    </svg>
  );
}

interface BreadcrumbMeta {
  section: string;
  title: string;
}

const BREADCRUMBS: Array<{ test: (path: string) => boolean } & BreadcrumbMeta> = [
  { test: (p) => p === '/dashboard', section: 'Overview', title: 'Dashboard' },
  { test: (p) => p === '/transactions/new', section: 'Trade Operations', title: 'New transaction' },
  { test: (p) => p === '/transactions', section: 'Trade Operations', title: 'Transactions' },
  { test: (p) => p.startsWith('/transactions/'), section: 'Trade Operations', title: 'Transaction detail' },
  { test: (p) => p === '/team', section: 'Account', title: 'Team' },
  { test: (p) => p === '/profile', section: 'Account', title: 'Profile' },
  { test: (p) => p.startsWith('/organizations/'), section: 'Account', title: 'Organization' },
];

function getBreadcrumb(pathname: string): BreadcrumbMeta {
  return BREADCRUMBS.find((entry) => entry.test(pathname)) ?? { section: '', title: '' };
}

export const AppShell = observer(function AppShell() {
  const auth = useAuthStore();
  const location = useLocation();
  const user = auth.user!;
  const isExporter = isExporterRole(user.role);
  const breadcrumb = getBreadcrumb(location.pathname);
  const initials = user.name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="flex min-h-screen">
      <aside className="w-[236px] shrink-0 bg-ink-2 text-[#CBD3D8] flex flex-col sticky top-0 h-screen">
        <div className="px-[22px] pt-[22px] pb-[18px] border-b border-white/10">
          <div className="font-serif font-bold text-white text-[16.5px]">Trade Ledger</div>
        </div>
        <nav className="flex-1 px-3 py-3.5 flex flex-col gap-0.5">
          <div className="text-[10.5px] uppercase tracking-wide text-[#71838F] px-3 pt-2.5 pb-1.5">Overview</div>
          <Link
            to="/dashboard"
            className="flex items-center gap-2.5 px-3 py-2 rounded text-[13.5px] font-medium text-[#B7C1C9] hover:bg-white/5 hover:text-white"
          >
            <DashboardIcon />
            Dashboard
          </Link>
          <div className="text-[10.5px] uppercase tracking-wide text-[#71838F] px-3 pt-3.5 pb-1.5">
            Trade Operations
          </div>
          <Link
            to="/transactions"
            className="flex items-center gap-2.5 px-3 py-2 rounded text-[13.5px] font-medium text-[#B7C1C9] hover:bg-white/5 hover:text-white"
          >
            <TransactionsIcon />
            Transactions
          </Link>
          {isExporter && (
            <Link
              to="/transactions/new"
              className="flex items-center gap-2.5 px-3 py-2 rounded text-[13.5px] font-medium text-[#B7C1C9] hover:bg-white/5 hover:text-white"
            >
              <NewTransactionIcon />
              New transaction
            </Link>
          )}
          <div className="text-[10.5px] uppercase tracking-wide text-[#71838F] px-3 pt-3.5 pb-1.5">Account</div>
          <Link
            to="/team"
            className="flex items-center gap-2.5 px-3 py-2 rounded text-[13.5px] font-medium text-[#B7C1C9] hover:bg-white/5 hover:text-white"
          >
            <TeamIcon />
            Team
          </Link>
        </nav>
        <div className="px-5 py-4 border-t border-white/10">
          <Link to="/profile" className="flex items-center gap-2.5 hover:opacity-90">
            <div className="w-[30px] h-[30px] rounded-full bg-seal text-white font-serif font-bold text-[12.5px] flex items-center justify-center shrink-0">
              {initials}
            </div>
            <div>
              <div className="text-[12.5px] font-semibold text-white">{user.name}</div>
              <div className="text-[11px] text-[#8C9BA6]">{roleLabel(user.role)}</div>
            </div>
          </Link>
          <button onClick={() => auth.logout()} className="mt-3 text-xs text-[#8C9BA6] underline hover:text-white">
            Log out
          </button>
        </div>
      </aside>
      <div className="flex-1 min-w-0">
        <div className="h-[60px] border-b border-line bg-paper-2 flex items-center justify-between px-7 sticky top-0 z-10">
          <div>
            <div className="text-[12.5px] uppercase tracking-wide text-ink-soft">{breadcrumb.section}</div>
            <div className="font-serif text-[16.5px]">{breadcrumb.title}</div>
          </div>
        </div>
        <div className="px-8 py-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
});
