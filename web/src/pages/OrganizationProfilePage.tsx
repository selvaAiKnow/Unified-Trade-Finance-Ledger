import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { getOrganization, listOrganizationKybChecks } from '../api/organizations';
import type { KybCheck, Organization } from '../api/types';

export function OrganizationProfilePage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [org, setOrg] = useState<Organization | null>(null);
  const [kybChecks, setKybChecks] = useState<KybCheck[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    async function load() {
      setError(null);
      try {
        const [fetchedOrg, fetchedKybChecks] = await Promise.all([
          getOrganization(orgId as string),
          listOrganizationKybChecks(orgId as string),
        ]);
        if (cancelled) return;
        setOrg(fetchedOrg);
        setKybChecks(fetchedKybChecks);
        setError(null);
      } catch {
        if (!cancelled) setError("Couldn't load the organization. Please try again.");
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

  return (
    <div>
      <h1 className="font-serif text-2xl mb-1">{org.name}</h1>
      <p className="text-ink-soft mb-6">
        {org.industry} · {org.country} · KYB status: <strong>{org.kyb_status}</strong>
      </p>
      <div className="border border-line rounded-lg divide-y divide-line-soft">
        {kybChecks.map((check) => (
          <div key={check.id} className="flex items-center justify-between p-4">
            <span>{check.check_type}</span>
            <span className="text-sm font-semibold">{check.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
