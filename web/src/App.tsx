import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from './components/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';
import { TransactionDetailLayout } from './components/TransactionDetailLayout';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { NewTransactionPage } from './pages/NewTransactionPage';
import { OrganizationProfilePage } from './pages/OrganizationProfilePage';
import { ProfilePage } from './pages/ProfilePage';
import { SignupPage } from './pages/SignupPage';
import { TeamPage } from './pages/TeamPage';
import { TransactionBankReviewPage } from './pages/TransactionBankReviewPage';
import { TransactionCompliancePage } from './pages/TransactionCompliancePage';
import { TransactionDocumentsPage } from './pages/TransactionDocumentsPage';
import { TransactionOverviewPage } from './pages/TransactionOverviewPage';
import { TransactionTimelinePage } from './pages/TransactionTimelinePage';
import { TransactionsPage } from './pages/TransactionsPage';
import { AuthProvider } from './stores/AuthContext';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/transactions" element={<TransactionsPage />} />
              <Route path="/transactions/new" element={<NewTransactionPage />} />
              <Route path="/transactions/:tradeId" element={<TransactionDetailLayout />}>
                <Route path="overview" element={<TransactionOverviewPage />} />
                <Route path="documents" element={<TransactionDocumentsPage />} />
                <Route path="compliance" element={<TransactionCompliancePage />} />
                <Route path="bank-review" element={<TransactionBankReviewPage />} />
                <Route path="timeline" element={<TransactionTimelinePage />} />
              </Route>
              <Route path="/organizations/:orgId" element={<OrganizationProfilePage />} />
              <Route path="/team" element={<TeamPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
