import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { listAdminOrganizations, updateOrganizationKybStatus } from '../api/admin';
import type { KybStatus, Organization } from '../api/types';
import { kybStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';
import { EyeIcon } from '../components/icons';

const KYB_STATUS_OPTIONS: KybStatus[] = ['PENDING', 'CLEAR', 'REVIEW', 'BLOCK'];

export function AdminOrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAdminOrganizations()
      .then(setOrganizations)
      .catch(() => setError("Couldn't load organizations. Please try again."));
  }, []);

  async function handleStatusChange(orgId: string, kybStatus: KybStatus) {
    setError(null);
    const previous = organizations;
    setOrganizations((orgs) => orgs?.map((org) => (org.id === orgId ? { ...org, kyb_status: kybStatus } : org)) ?? orgs);
    try {
      await updateOrganizationKybStatus(orgId, kybStatus);
    } catch {
      setOrganizations(previous);
      setError("Couldn't update the KYB status. Please try again.");
    }
  }

  if (organizations === null) {
    if (error) {
      return <p className="text-block text-sm">{error}</p>;
    }
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      {error && <p className="text-block text-sm">{error}</p>}
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
                <th className="py-2.5 px-6">Actions</th>
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
                      <div className="flex items-center gap-2">
                        <Badge tone={status.tone}>{status.label}</Badge>
                        <select
                          aria-label={`Change KYB status for ${org.name}`}
                          value={org.kyb_status}
                          onChange={(e) => handleStatusChange(org.id, e.target.value as KybStatus)}
                          className="text-xs border border-line-strong rounded px-1.5 py-1"
                        >
                          {KYB_STATUS_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {kybStatusInfo(option).label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="py-3 px-6">
                      <Link to={`/organizations/${org.id}`} aria-label={`View ${org.name}`} className="text-ink-soft hover:text-ink">
                        <EyeIcon />
                      </Link>
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
