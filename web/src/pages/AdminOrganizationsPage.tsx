import { useEffect, useState } from 'react';

import { listAdminOrganizations } from '../api/admin';
import type { Organization } from '../api/types';
import { kybStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';

export function AdminOrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAdminOrganizations()
      .then(setOrganizations)
      .catch(() => setError("Couldn't load organizations. Please try again."));
  }, []);

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (organizations === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Organizations</h1>
      {organizations.length === 0 ? (
        <p className="text-ink-soft">No organizations yet.</p>
      ) : (
        <Panel noPadding>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-soft border-b border-line-strong">
                <th className="py-2.5 px-6">Name</th>
                <th className="py-2.5 px-6">Type</th>
                <th className="py-2.5 px-6">Country</th>
                <th className="py-2.5 px-6">Industry</th>
                <th className="py-2.5 px-6">KYB status</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((org) => {
                const status = kybStatusInfo(org.kyb_status);
                return (
                  <tr key={org.id} className="border-b border-line last:border-b-0">
                    <td className="py-3 px-6">{org.name}</td>
                    <td className="py-3 px-6">{org.org_type}</td>
                    <td className="py-3 px-6">{org.country}</td>
                    <td className="py-3 px-6">{org.industry}</td>
                    <td className="py-3 px-6">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
