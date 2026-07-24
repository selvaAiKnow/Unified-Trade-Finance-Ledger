import { NavLink } from 'react-router-dom';

const TABS = [
  { segment: 'overview', label: 'Overview' },
  { segment: 'documents', label: 'Documents' },
  { segment: 'compliance', label: 'Compliance' },
  { segment: 'bank-review', label: 'Bank Review' },
  { segment: 'timeline', label: 'Timeline' },
] as const;

function tabClassName({ isActive }: { isActive: boolean }) {
  return `px-3 py-2 text-sm font-semibold border-b-2 ${
    isActive ? 'border-ink text-ink' : 'border-transparent text-ink-soft hover:text-ink'
  }`;
}

export function TransactionTabs({ tradeId }: { tradeId: string }) {
  return (
    <nav className="flex gap-2 border-b border-line mb-6" aria-label="Transaction sections">
      {TABS.map((tab) => (
        <NavLink key={tab.segment} to={`/transactions/${tradeId}/${tab.segment}`} className={tabClassName}>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
