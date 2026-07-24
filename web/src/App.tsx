import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from './components/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { NewTransactionPage } from './pages/NewTransactionPage';
import { SignupPage } from './pages/SignupPage';
import { TransactionBankReviewPage } from './pages/TransactionBankReviewPage';
import { TransactionCompliancePage } from './pages/TransactionCompliancePage';
import { TransactionDocumentsPage } from './pages/TransactionDocumentsPage';
import { TransactionOverviewPage } from './pages/TransactionOverviewPage';
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
              <Route path="/transactions/:tradeId/overview" element={<TransactionOverviewPage />} />
              <Route path="/transactions/:tradeId/documents" element={<TransactionDocumentsPage />} />
              <Route path="/transactions/:tradeId/compliance" element={<TransactionCompliancePage />} />
              <Route path="/transactions/:tradeId/bank-review" element={<TransactionBankReviewPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
