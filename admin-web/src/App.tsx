import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AdminShell } from './components/AdminShell';
import { RequireAdmin } from './components/RequireAdmin';
import { LoginPage } from './pages/LoginPage';
import { AdminOrganizationsPage } from './pages/AdminOrganizationsPage';
import { AdminTradesPage } from './pages/AdminTradesPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AddUserPage } from './pages/AddUserPage';
import { EditUserPage } from './pages/EditUserPage';
import { AuthProvider } from './stores/AuthContext';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAdmin />}>
            <Route element={<AdminShell />}>
              <Route path="/" element={<AdminOrganizationsPage />} />
              <Route path="/users" element={<AdminUsersPage />} />
              <Route path="/users/new" element={<AddUserPage />} />
              <Route path="/users/:userId/edit" element={<EditUserPage />} />
              <Route path="/trades" element={<AdminTradesPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
