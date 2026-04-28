import { StrictMode, Component, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('App crash:', error, info) }
  render() {
    if (this.state.error) {
      return (
        <div dir="rtl" style={{ padding: 40, textAlign: 'center', color: '#fff', background: '#1e293b', minHeight: '100vh' }}>
          <h1>שגיאה בטעינת האפליקציה</h1>
          <pre style={{ color: '#f87171', marginTop: 20, textAlign: 'left', direction: 'ltr', whiteSpace: 'pre-wrap' }}>
            {this.state.error.message}
            {'\n'}
            {this.state.error.stack}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 20, padding: '10px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            נסה שוב
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

import { AuthProvider } from '@/hooks/useAuth'
import { BuildingProvider } from '@/hooks/useStore'
import { AuthGuard } from '@/components/layout/AuthGuard'
import { Layout } from '@/components/layout/Layout'
import Login from '@/pages/Login'
import NotFound from '@/pages/NotFound'

// Lazy-load all page components for code splitting
const Dashboard        = lazy(() => import('@/pages/Dashboard'))
const Buildings        = lazy(() => import('@/pages/Buildings'))
const Units            = lazy(() => import('@/pages/Units'))
const Residents        = lazy(() => import('@/pages/Residents'))
const Payments         = lazy(() => import('@/pages/Payments'))
const Expenses         = lazy(() => import('@/pages/Expenses'))
const Issues           = lazy(() => import('@/pages/Issues'))
const Vendors          = lazy(() => import('@/pages/Vendors'))
const Compliance       = lazy(() => import('@/pages/Compliance'))
const RecurringTasks   = lazy(() => import('@/pages/RecurringTasks'))
const BuildingAgent    = lazy(() => import('@/pages/BuildingAgent'))
const BuildingAssets   = lazy(() => import('@/pages/BuildingAssets'))
const Announcements    = lazy(() => import('@/pages/Announcements'))
const Documents        = lazy(() => import('@/pages/Documents'))
const Reports          = lazy(() => import('@/pages/Reports'))
const SmartAgents      = lazy(() => import('@/pages/SmartAgents'))
const VendorFinder     = lazy(() => import('@/pages/VendorFinder'))
const AdminSettings    = lazy(() => import('@/pages/AdminSettings'))
const WorkOrders       = lazy(() => import('@/pages/WorkOrders'))
const BankSettings     = lazy(() => import('@/pages/BankSettings'))
const BankTransactions = lazy(() => import('@/pages/BankTransactions'))
const BankIncome       = lazy(() => import('@/pages/BankIncome'))
const Balance          = lazy(() => import('@/pages/Balance'))
const ExpenseAnalysis  = lazy(() => import('@/pages/ExpenseAnalysis'))
const CollectionCases  = lazy(() => import('@/pages/CollectionCases'))
const RoomBooking      = lazy(() => import('@/pages/RoomBooking'))

// Shared page loading fallback
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>טוען...</p>
      </div>
    </div>
  )
}

import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public route */}
          <Route path="/login" element={<Login />} />

          {/* Protected routes */}
          <Route element={<AuthGuard />}>
            <Route element={<BuildingProvider><Layout /></BuildingProvider>}>
              <Route index element={<Suspense fallback={<PageLoader />}><Dashboard /></Suspense>} />
              <Route path="buildings" element={<Suspense fallback={<PageLoader />}><Buildings /></Suspense>} />
              <Route path="units" element={<Suspense fallback={<PageLoader />}><Units /></Suspense>} />
              <Route path="residents" element={<Suspense fallback={<PageLoader />}><Residents /></Suspense>} />
              <Route path="payments" element={<Suspense fallback={<PageLoader />}><Payments /></Suspense>} />
              <Route path="expenses" element={<Suspense fallback={<PageLoader />}><Expenses /></Suspense>} />
              <Route path="issues" element={<Suspense fallback={<PageLoader />}><Issues /></Suspense>} />
              <Route path="vendors" element={<Suspense fallback={<PageLoader />}><Vendors /></Suspense>} />
              <Route path="compliance" element={<Suspense fallback={<PageLoader />}><Compliance /></Suspense>} />
              <Route path="recurring-tasks" element={<Suspense fallback={<PageLoader />}><RecurringTasks /></Suspense>} />
              <Route path="building-assets" element={<Suspense fallback={<PageLoader />}><BuildingAssets /></Suspense>} />
              <Route path="announcements" element={<Suspense fallback={<PageLoader />}><Announcements /></Suspense>} />
              <Route path="documents" element={<Suspense fallback={<PageLoader />}><Documents /></Suspense>} />
              <Route path="reports" element={<Suspense fallback={<PageLoader />}><Reports /></Suspense>} />
              <Route path="vendor-finder" element={<Suspense fallback={<PageLoader />}><VendorFinder /></Suspense>} />
              <Route path="smart-agents" element={<Suspense fallback={<PageLoader />}><SmartAgents /></Suspense>} />
              <Route path="building-agent" element={<Suspense fallback={<PageLoader />}><BuildingAgent /></Suspense>} />
              <Route path="work-orders" element={<Suspense fallback={<PageLoader />}><WorkOrders /></Suspense>} />
              <Route path="bank-settings" element={<Suspense fallback={<PageLoader />}><BankSettings /></Suspense>} />
              <Route path="bank-transactions" element={<Suspense fallback={<PageLoader />}><BankTransactions /></Suspense>} />
              <Route path="income" element={<Suspense fallback={<PageLoader />}><BankIncome /></Suspense>} />
              <Route path="balance" element={<Suspense fallback={<PageLoader />}><Balance /></Suspense>} />
              <Route path="expense-analysis" element={<Suspense fallback={<PageLoader />}><ExpenseAnalysis /></Suspense>} />
              <Route path="collection-cases" element={<Suspense fallback={<PageLoader />}><CollectionCases /></Suspense>} />
              <Route path="room-booking" element={<Suspense fallback={<PageLoader />}><RoomBooking /></Suspense>} />
              <Route path="admin" element={<Suspense fallback={<PageLoader />}><AdminSettings /></Suspense>} />
            </Route>
          </Route>

          {/* 404 catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
