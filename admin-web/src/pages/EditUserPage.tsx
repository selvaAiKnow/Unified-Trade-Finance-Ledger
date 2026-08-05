import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { getAdminUser, listAdminOrganizations, updateAdminUser } from '../api/admin';
import type { Organization, UserRole, UserStatus } from '../api/types';
import { ASSIGNABLE_ROLE_OPTIONS } from '../lib/roles';
import { Panel } from '../components/ui/Panel';

const STATUS_OPTIONS: Array<{ value: UserStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INVITED', label: 'Invited' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

export function EditUserPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [orgId, setOrgId] = useState('');
  const [role, setRole] = useState<UserRole>('VIEWER');
  const [userStatus, setUserStatus] = useState<UserStatus>('ACTIVE');
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    Promise.all([getAdminUser(userId), listAdminOrganizations()])
      .then(([user, orgs]) => {
        setEmail(user.email);
        setName(user.name);
        setOrgId(user.org_id ?? '');
        setRole(user.role);
        setUserStatus(user.status);
        setOrganizations(orgs);
        setLoaded(true);
      })
      .catch(() => setLoadError("Couldn't load this user. Please try again."));
  }, [userId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!userId) return;
    setSubmitError(null);
    try {
      await updateAdminUser(userId, { name, org_id: orgId, role, status: userStatus });
      navigate('/users');
    } catch {
      setSubmitError("Couldn't save the changes. Please try again.");
    }
  }

  if (loadError) {
    return <p className="text-block text-sm">{loadError}</p>;
  }

  if (!loaded) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Edit user</h1>
      <Panel className="max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">Email</label>
            <p className="font-mono text-sm">{email}</p>
          </div>
          <div>
            <label htmlFor="name" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Name
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="org" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Organization
            </label>
            <select
              id="org"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
              required
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="role" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Role
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
            >
              {ASSIGNABLE_ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="status" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Status
            </label>
            <select
              id="status"
              value={userStatus}
              onChange={(e) => setUserStatus(e.target.value as UserStatus)}
              className="w-full px-3 py-2.5 border border-line-strong rounded"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {submitError && <p className="text-block text-sm">{submitError}</p>}
          <button type="submit" className="bg-seal text-white rounded py-2.5 font-semibold hover:bg-seal-dark">
            Save changes
          </button>
        </form>
      </Panel>
    </div>
  );
}
