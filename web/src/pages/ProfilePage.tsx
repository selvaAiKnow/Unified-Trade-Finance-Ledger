import { observer } from 'mobx-react-lite';

import { roleLabel } from '../lib/roles';
import { useAuthStore } from '../stores/AuthContext';
import { Panel } from '../components/ui/Panel';

export const ProfilePage = observer(function ProfilePage() {
  const auth = useAuthStore();
  const user = auth.user!;

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
          <div className="flex justify-between">
            <span className="text-ink-soft">Role</span>
            <span className="font-semibold">{roleLabel(user.role)}</span>
          </div>
        </div>
        <button onClick={() => auth.logout()} className="mt-4 text-block text-sm font-semibold hover:underline">
          Log out
        </button>
      </Panel>
    </div>
  );
});
