import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';

import { getOrganization, listOrganizationKybChecks } from '../api/organizations';
import type { KybCheck, Organization } from '../api/types';
import { roleLabel } from '../lib/roles';
import { kybCheckStatusInfo, kybStatusInfo, userStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';
import { useAuthStore } from '../stores/AuthContext';

export const ProfilePage = observer(function ProfilePage() {
  const auth = useAuthStore();
  const user = auth.user!;
  const status = userStatusInfo(user.status);

  const [org, setOrg] = useState<Organization | null>(null);
  const [kybChecks, setKybChecks] = useState<KybCheck[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      try {
        const [fetchedOrg, fetchedKybChecks] = await Promise.all([
          getOrganization(user.org_id!),
          listOrganizationKybChecks(user.org_id!),
        ]);
        if (cancelled) return;
        setOrg(fetchedOrg);
        setKybChecks(fetchedKybChecks);
        setError(null);
      } catch {
        if (!cancelled) setError("Couldn't load your organization details. Please try again.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user.org_id]);

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Your profile</h1>
      <Panel className="max-w-md">
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Name</span>
            <span className="font-semibold">{user.name}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Email</span>
            <span className="font-mono">{user.email}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Role</span>
            <span className="font-semibold">{roleLabel(user.role)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-soft">Status</span>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
        </div>
        <button onClick={() => auth.logout()} className="mt-4 text-block text-sm font-semibold hover:underline">
          Log out
        </button>
      </Panel>

      {error && <p className="text-block text-sm max-w-md">{error}</p>}

      {org && (
        <Panel title="Organization" className="max-w-md">
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between border-b border-line pb-3">
              <span className="text-ink-soft">Name</span>
              <span className="font-semibold">{org.name}</span>
            </div>
            <div className="flex justify-between border-b border-line pb-3">
              <span className="text-ink-soft">Industry</span>
              <span className="font-semibold">{org.industry}</span>
            </div>
            <div className="flex justify-between border-b border-line pb-3">
              <span className="text-ink-soft">Country</span>
              <span className="font-semibold">{org.country}</span>
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
      )}

      {org && (
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
      )}
    </div>
  );
});
