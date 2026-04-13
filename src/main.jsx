import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
import { BuildingProvider } from '@/hooks/useStore'
import { AuthGuard } from '@/components/layout/AuthGuard'
import { Layout } from '@/components/layout/Layout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Buildings from '@/pages/Buildings'
import Units from '@/pages/Units'
import Residents from '@/pages/Residents'
import Payments from '@/pages/Payments'
import Expenses from '@/pages/Expenses'
import Issues from '@/pages/Issues'
import Vendors from '@/pages/Vendors'
import Compliance from '@/pages/Compliance'
import RecurringTasks from '@/pages/RecurringTasks'
import BuildingAgent from '@/pages/BuildingAgent'
import BuildingAssets from '@/pages/BuildingAssets'
import Announcements from '@/pages/Announcements'
import Documents from '@/pages/Documents'
import Reports from '@/pages/Reports'
import SmartAgents from '@/pages/SmartAgents'
import VendorFinder from '@/pages/VendorFinder'
import AdminSettings from '@/pages/AdminSettings'
import WorkOrders from '@/pages/WorkOrders'
import BankSettings from '@/pages/BankSettings'
import BankTransactions from '@/pages/BankTransactions'
import BankIncome from '@/pages/BankIncome'
import Balance from '@/pages/Balance'
import ExpenseAnalysis from '@/pages/ExpenseAnalysis'
import CollectionCases from '@/pages/CollectionCases'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public route */}
          <Route path="/login" element={<Login />} />

          {/* Protected routes */}
          <Route element={<AuthGuard />}>
            <Route element={<BuildingProvider><Layout /></BuildingProvider>}>
              <Route index element={<Dashboard />} />
              <Route path="buildings" element={<Buildings />} />
              <Route path="units" element={<Units />} />
              <Route path="residents" element={<Residents />} />
              <Route path="payments" element={<Payments />} />
              <Route path="expenses" element={<Expenses />} />
              <Route path="issues" element={<Issues />} />
              <Route path="vendors" element={<Vendors />} />
              <Route path="compliance" element={<Compliance />} />
              <Route path="recurring-tasks" element={<RecurringTasks />} />
              <Route path="building-assets" element={<BuildingAssets />} />
              <Route path="announcements" element={<Announcements />} />
              <Route path="documents" element={<Documents />} />
              <Route path="reports" element={<Reports />} />
              <Route path="vendor-finder" element={<VendorFinder />} />
              <Route path="smart-agents" element={<SmartAgents />} />
              <Route path="building-agent" element={<BuildingAgent />} />
              <Route path="work-orders" element={<WorkOrders />} />
              <Route path="bank-settings" element={<BankSettings />} />
              <Route path="bank-transactions" element={<BankTransactions />} />
              <Route path="income" element={<BankIncome />} />
              <Route path="balance" element={<Balance />} />
              <Route path="expense-analysis" element={<ExpenseAnalysis />} />
              <Route path="collection-cases" element={<CollectionCases />} />
              <Route path="admin" element={<AdminSettings />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
