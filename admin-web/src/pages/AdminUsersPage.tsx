import { useEffect, useState } from 'react';

import { listAdminOrganizations, listAdminUsers } from '../api/admin';
import type { Organization, User } from '../api/types';
import { roleLabel } from '../lib/roles';
import { userStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';

export function AdminUsersPage() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listAdminUsers(), listAdminOrganizations()])
      .then(([fetchedUsers, fetchedOrganizations]) => {
        setUsers(fetchedUsers);
        setOrganizations(fetchedOrganizations);
      })
      .catch(() => setError("Couldn't load users. Please try again."));
  }, []);

  function orgName(orgId: string | null): string {
    if (!orgId) return '—';
    return organizations.find((org) => org.id === orgId)?.name ?? orgId;
  }

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (users === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Users</h1>
      {users.length === 0 ? (
        <p className="text-ink-soft">No users yet.</p>
      ) : (
        <Panel noPadding>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-soft border-b border-line-strong">
                <th className="py-2.5 px-6">Name</th>
                <th className="py-2.5 px-6">Email</th>
                <th className="py-2.5 px-6">Organization</th>
                <th className="py-2.5 px-6">Role</th>
                <th className="py-2.5 px-6">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const status = userStatusInfo(user.status);
                return (
                  <tr key={user.id} className="border-b border-line last:border-b-0">
                    <td className="py-3 px-6">{user.name}</td>
                    <td className="py-3 px-6 font-mono">{user.email}</td>
                    <td className="py-3 px-6">{orgName(user.org_id)}</td>
                    <td className="py-3 px-6">{roleLabel(user.role)}</td>
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
