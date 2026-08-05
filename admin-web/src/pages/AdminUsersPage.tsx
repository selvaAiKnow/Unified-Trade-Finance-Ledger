import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { listAdminOrganizations, listAdminUsers, updateAdminUserStatus } from '../api/admin';
import type { Organization, User, UserStatus } from '../api/types';
import { roleLabel } from '../lib/roles';
import { userStatusInfo } from '../lib/statusTones';
import { Badge } from '../components/ui/Badge';
import { Panel } from '../components/ui/Panel';
import { BanIcon, CheckCircleIcon, EyeIcon, PencilIcon, PlusIcon } from '../components/icons';

export function AdminUsersPage() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      const [fetchedUsers, fetchedOrganizations] = await Promise.all([listAdminUsers(), listAdminOrganizations()]);
      setUsers(fetchedUsers);
      setOrganizations(fetchedOrganizations);
    } catch {
      setError("Couldn't load users. Please try again.");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function orgName(orgId: string | null): string {
    if (!orgId) return '—';
    return organizations.find((org) => org.id === orgId)?.name ?? orgId;
  }

  async function handleToggleStatus(user: User) {
    const nextStatus: UserStatus = user.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    const verb = nextStatus === 'SUSPENDED' ? 'deactivate' : 'reactivate';
    if (!window.confirm(`Are you sure you want to ${verb} ${user.name}?`)) return;

    const previous = users;
    setUsers((current) => current?.map((u) => (u.id === user.id ? { ...u, status: nextStatus } : u)) ?? current);
    try {
      await updateAdminUserStatus(user.id, nextStatus);
    } catch {
      setUsers(previous);
      setError(`Couldn't ${verb} ${user.name}. Please try again.`);
    }
  }

  if (error && users === null) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (users === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      {error && <p className="text-block text-sm mb-4">{error}</p>}
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-serif text-2xl">Users</h1>
        <Link
          to="/users/new"
          aria-label="Add user"
          className="w-8 h-8 flex items-center justify-center rounded border border-line-strong text-ink-soft hover:text-ink hover:border-ink"
        >
          <PlusIcon />
        </Link>
      </div>
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
                <th className="py-2.5 px-6">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const status = userStatusInfo(user.status);
                const isPlatformAdmin = user.role === 'PLATFORM_ADMIN';
                return (
                  <tr key={user.id} className="border-b border-line last:border-b-0">
                    <td className="py-3 px-6">{user.name}</td>
                    <td className="py-3 px-6 font-mono">{user.email}</td>
                    <td className="py-3 px-6">{orgName(user.org_id)}</td>
                    <td className="py-3 px-6">{roleLabel(user.role)}</td>
                    <td className="py-3 px-6">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-3 text-ink-soft">
                        <Link to={`/users/${user.id}`} aria-label={`View ${user.name}`} className="hover:text-ink">
                          <EyeIcon />
                        </Link>
                        {!isPlatformAdmin && (
                          <>
                            <Link to={`/users/${user.id}/edit`} aria-label={`Edit ${user.name}`} className="hover:text-ink">
                              <PencilIcon />
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(user)}
                              aria-label={user.status === 'SUSPENDED' ? `Reactivate ${user.name}` : `Deactivate ${user.name}`}
                              className="hover:text-ink"
                            >
                              {user.status === 'SUSPENDED' ? <CheckCircleIcon /> : <BanIcon />}
                            </button>
                          </>
                        )}
                      </div>
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
