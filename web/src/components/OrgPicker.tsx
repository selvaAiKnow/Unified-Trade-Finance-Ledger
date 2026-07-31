import { useEffect, useState } from 'react';

import { listOrganizations } from '../api/organizations';
import type { Organization } from '../api/types';

export interface OrgPickerProps {
  id: string;
  label: string;
  value: string;
  onChange: (orgId: string) => void;
}

export function OrgPicker({ id, label, value, onChange }: OrgPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Organization[]>([]);
  const [isResolved, setIsResolved] = useState(false);

  useEffect(() => {
    if (!query || isResolved) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      listOrganizations(query)
        .then((orgs) => {
          if (!cancelled) setResults(orgs);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, isResolved]);

  function handleInputChange(next: string) {
    setQuery(next);
    if (isResolved) {
      setIsResolved(false);
      onChange('');
    }
  }

  function handleSelect(org: Organization) {
    setQuery(org.name);
    setIsResolved(true);
    setResults([]);
    onChange(org.id);
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
        {label}
      </label>
      <input
        id={id}
        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        autoComplete="off"
        className="w-full px-3 py-2.5 border border-line-strong rounded"
      />
      <input type="hidden" value={value} />
      {results.length > 0 && (
        <ul className="absolute z-10 w-full bg-paper-2 border border-line-strong rounded mt-1 max-h-48 overflow-auto">
          {results.map((org) => (
            <li key={org.id}>
              <button
                type="button"
                onClick={() => handleSelect(org)}
                className="w-full text-left px-3 py-2 hover:bg-paper text-sm"
              >
                {org.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
