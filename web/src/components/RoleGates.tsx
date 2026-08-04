import { observer } from 'mobx-react-lite';
import { Navigate, Outlet } from 'react-router-dom';

import { useAuthStore } from '../stores/AuthContext';

export const RequireAdmin = observer(function RequireAdmin() {
  const auth = useAuthStore();
  if (auth.user?.role !== 'PLATFORM_ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
});

export const RequireBusinessUser = observer(function RequireBusinessUser() {
  const auth = useAuthStore();
  if (auth.user?.role === 'PLATFORM_ADMIN') {
    return <Navigate to="/admin" replace />;
  }
  return <Outlet />;
});
