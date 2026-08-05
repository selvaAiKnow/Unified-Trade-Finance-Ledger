import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { getAdminUser, listAdminOrganizations } from '../api/admin';
import type { Organization, User } from '../api/types';
import { roleLabel } from '../lib/roles';
import { userStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';

export function ViewUserPage() {
  const { userId } = useParams<{ userId: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    Promise.all([getAdminUser(userId), listAdminOrganizations()])
      .then(([fetchedUser, orgs]) => {
        setUser(fetchedUser);
        setOrganizations(orgs);
      })
      .catch(() => setError("Couldn't load this user. Please try again."));
  }, [userId]);

  function orgName(orgId: string | null): string {
    if (!orgId) return '—';
    return organizations.find((org) => org.id === orgId)?.name ?? orgId;
  }

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (user === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  const status = userStatusInfo(user.status);

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">{user.name}</h1>
      <Panel className="max-w-md">
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Email</span>
            <span className="font-mono">{user.email}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-3">
            <span className="text-ink-soft">Organization</span>
            <span className="font-semibold">{orgName(user.org_id)}</span>
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
        {user.role !== 'PLATFORM_ADMIN' && (
          <Link to={`/users/${user.id}/edit`} className="inline-block mt-4 text-seal text-sm font-semibold hover:underline">
            Edit user
          </Link>
        )}
      </Panel>
    </div>
  );
}
