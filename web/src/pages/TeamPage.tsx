import { observer } from 'mobx-react-lite';
import { useEffect, useState, type FormEvent } from 'react';

import { inviteUser, listUsers } from '../api/users';
import type { User, UserRole } from '../api/types';
import { canInviteTeamMembers } from '../lib/roles';
import { useAuthStore } from '../stores/AuthContext';

export const TeamPage = observer(function TeamPage() {
  const auth = useAuthStore();
  const canInvite = auth.user ? canInviteTeamMembers(auth.user.role) : false;

  const [users, setUsers] = useState<User[] | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('VIEWER');
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      const fetchedUsers = await listUsers();
      setUsers(fetchedUsers);
      setError(null);
    } catch {
      setError("Couldn't load the team. Please try again.");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    try {
      await inviteUser({ name, email, role });
      setName('');
      setEmail('');
      await refresh();
    } catch {
      setSubmitError("Couldn't send the invite. Please try again.");
    }
  }

  if (error) {
    return <p className="text-block text-sm">{error}</p>;
  }

  if (users === null) {
    return <p className="text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Team</h1>
      {canInvite && (
        <form onSubmit={handleSubmit} className="border border-line rounded-lg p-4 mb-6 max-w-lg flex flex-col gap-3">
          <div>
            <label htmlFor="name" className="block text-xs font-semibold text-ink-soft mb-1">
              Name
            </label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-line rounded" required />
          </div>
          <div>
            <label htmlFor="email" className="block text-xs font-semibold text-ink-soft mb-1">
              Email
            </label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 border border-line rounded" required />
          </div>
          <div>
            <label htmlFor="role" className="block text-xs font-semibold text-ink-soft mb-1">
              Role
            </label>
            <select id="role" value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="w-full px-3 py-2 border border-line rounded">
              <option value="DOCS_COMPLIANCE">Docs & Compliance</option>
              <option value="FINANCE">Finance</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </div>
          {submitError && <p className="text-block text-sm">{submitError}</p>}
          <button type="submit" className="bg-ink text-paper-2 rounded py-2 font-semibold">
            + Invite
          </button>
        </form>
      )}
      {users.length === 0 ? (
        <p className="text-ink-soft">No team members yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-soft border-b border-line">
              <th className="py-2">Name</th>
              <th className="py-2">Email</th>
              <th className="py-2">Role</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-line-soft">
                <td className="py-2">{user.name}</td>
                <td className="py-2 font-mono">{user.email}</td>
                <td className="py-2">{user.role}</td>
                <td className="py-2">{user.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
});
