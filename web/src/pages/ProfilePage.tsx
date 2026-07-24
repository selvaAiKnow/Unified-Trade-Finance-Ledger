import { observer } from 'mobx-react-lite';

import { useAuthStore } from '../stores/AuthContext';

export const ProfilePage = observer(function ProfilePage() {
  const auth = useAuthStore();
  const user = auth.user!;

  return (
    <div>
      <h1 className="font-serif text-2xl mb-4">Your profile</h1>
      <div className="border border-line rounded-lg p-5 max-w-md flex flex-col gap-3 text-sm">
        <div className="flex justify-between">
          <span className="text-ink-soft">Name</span>
          <span>{user.name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-soft">Email</span>
          <span className="font-mono">{user.email}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-soft">Role</span>
          <span>{user.role}</span>
        </div>
        <button onClick={() => auth.logout()} className="self-start text-block text-sm font-semibold mt-2">
          Log out
        </button>
      </div>
    </div>
  );
});
