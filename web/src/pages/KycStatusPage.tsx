import { useEffect, useState } from 'react';

import { getOrganization, listOrganizationKybChecks } from '../api/organizations';
import type { KybCheck, Organization } from '../api/types';
import { kybCheckStatusInfo, kybStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';
import { useAuthStore } from '../stores/AuthContext';

export function KycStatusPage() {
  const auth = useAuthStore();
  const orgId = auth.user!.org_id;
  const [org, setOrg] = useState<Organization | null>(null);
  const [kybChecks, setKybChecks] = useState<KybCheck[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      try {
        const [fetchedOrg, fetchedKybChecks] = await Promise.all([
          getOrganization(orgId),
          listOrganizationKybChecks(orgId),
        ]);
        if (cancelled) return;
        setOrg(fetchedOrg);
        setKybChecks(fetchedKybChecks);
        setError(null);
      } catch {
        if (!cancelled) setError("Couldn't load your KYC status. Please try again.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (!org) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  const kyb = kybStatusInfo(org.kyb_status);

  return (
    <div>
      <h1 className="font-serif text-2xl mb-1">{org.name}</h1>
      <p className="text-ink-soft mb-6 flex items-center gap-2">
        {org.industry} · {org.country} · KYB status: <Badge tone={kyb.tone}>{kyb.label}</Badge>
      </p>
      <Panel title="Verification checks" noPadding>
        <div className="divide-y divide-line">
          {kybChecks.map((check) => {
            const status = kybCheckStatusInfo(check.status);
            return (
              <div key={check.id} className="flex items-center justify-between px-6 py-3.5">
                <span className="text-sm">{check.check_type}</span>
                <Badge tone={status.tone}>{status.label}</Badge>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
