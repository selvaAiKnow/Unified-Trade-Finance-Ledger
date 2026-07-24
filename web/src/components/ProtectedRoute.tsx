import { observer } from 'mobx-react-lite';
import { Navigate, Outlet } from 'react-router-dom';

import { useAuthStore } from '../stores/AuthContext';

export const ProtectedRoute = observer(function ProtectedRoute() {
  const auth = useAuthStore();

  if (auth.isHydrating) {
    return <div className="p-6 text-ink-soft">Loading…</div>;
  }

  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
});
