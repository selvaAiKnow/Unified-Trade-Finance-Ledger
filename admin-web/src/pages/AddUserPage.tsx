import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { createAdminUser, listAdminOrganizations } from '../api/admin';
import type { Organization, UserRole } from '../api/types';
import { ASSIGNABLE_ROLE_OPTIONS } from '../lib/roles';
import { Panel } from '../components/ui/Panel';

export function AddUserPage() {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [orgId, setOrgId] = useState('');
  const [role, setRole] = useState<UserRole>(ASSIGNABLE_ROLE_OPTIONS[0].value);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    listAdminOrganizations()
      .then((orgs) => {
        setOrganizations(orgs);
        if (orgs.length > 0) setOrgId(orgs[0].id);
      })
      .catch(() => setLoadError("Couldn't load organizations. Please try again."));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    try {
      await createAdminUser({ name, email, org_id: orgId, role });
      navigate('/users');
    } catch {
      setSubmitError("Couldn't create the user. Please check the details and try again.");
    }
  }

  if (loadError) {
    return <p className="text-block text-sm">{loadError}</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Add user</h1>
      <Panel className="max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
            <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wide text-ink-soft mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
          {submitError && <p className="text-block text-sm">{submitError}</p>}
          <button type="submit" className="bg-seal text-white rounded py-2.5 font-semibold hover:bg-seal-dark">
            Create user
          </button>
        </form>
      </Panel>
    </div>
  );
}
