import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { getAdminOrganization, getAdminOrganizationKybChecks } from '../api/admin';
import type { KybCheck, Organization } from '../api/types';
import { kybCheckStatusInfo, kybStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';

export function AdminViewOrganizationPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [org, setOrg] = useState<Organization | null>(null);
  const [kybChecks, setKybChecks] = useState<KybCheck[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    Promise.all([getAdminOrganization(orgId), getAdminOrganizationKybChecks(orgId)])
      .then(([fetchedOrg, fetchedChecks]) => {
        setOrg(fetchedOrg);
        setKybChecks(fetchedChecks);
      })
      .catch(() => setError("Couldn't load this organization. Please try again."));
  }, [orgId]);

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (org === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">{org.name}</h1>
      <Panel className="max-w-md">
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Type</span>
            <span className="font-semibold">{org.org_type}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Country</span>
            <span className="font-semibold">{org.country}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Industry</span>
            <span className="font-semibold">{org.industry}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Tax / business ID</span>
            <span className="font-mono">{org.tax_id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-soft">Member since</span>
            <span className="font-semibold">{new Date(org.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </Panel>

      <Panel title="KYB verification" noPadding className="max-w-md">
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-line">
          <span className="text-sm text-ink-soft">Overall status</span>
          <Badge tone={kybStatusInfo(org.kyb_status).tone}>{kybStatusInfo(org.kyb_status).label}</Badge>
        </div>
        <div className="divide-y divide-line">
          {kybChecks.map((check) => {
            const checkStatus = kybCheckStatusInfo(check.status);
            return (
              <div key={check.id} className="flex items-center justify-between px-6 py-3.5">
                <span className="text-sm">{check.check_type}</span>
                <Badge tone={checkStatus.tone}>{checkStatus.label}</Badge>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
