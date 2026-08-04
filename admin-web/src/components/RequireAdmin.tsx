import { observer } from 'mobx-react-lite';
import { Navigate, Outlet } from 'react-router-dom';

import { useAuthStore } from '../stores/AuthContext';

export const RequireAdmin = observer(function RequireAdmin() {
  const auth = useAuthStore();

  if (auth.isHydrating) {
    return <div className="p-6 text-ink-soft">Loading…</div>;
  }

  if (!auth.isAuthenticated || auth.user?.role !== 'PLATFORM_ADMIN') {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
});
