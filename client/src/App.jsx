import { lazy, useEffect, useState } from 'react'
import { Menu, RefreshCw } from 'lucide-react'
import { useAuthStore } from './store/authStore'
import { LoginScreen } from './components/LoginScreen'
import { SignupScreen } from './components/SignupScreen'
import { PrivacyPolicyPage, PRIVACY_POLICY_PATH } from './components/PrivacyPolicyPage'
import { NotFoundPage } from './components/NotFoundPage'
import { Sidebar } from './components/Sidebar'
import { CalendarView } from './components/CalendarView'
import { ScreenBoundary } from './components/ScreenBoundary'
import { useBookingStore } from './store/bookingStore'

// Everything except the first screen (the calendar) loads on demand, so the first page load stays small.
// The components are named exports, hence the .then().
const lazyNamed = (load, name) => lazy(() => load().then((module) => ({ default: module[name] })))
const AnalyticsView = lazyNamed(() => import('./components/AnalyticsView'), 'AnalyticsView')
const UsageView = lazyNamed(() => import('./components/UsageView'), 'UsageView')
const InventoryView = lazyNamed(() => import('./components/InventoryView'), 'InventoryView')
const RecordsView = lazyNamed(() => import('./components/RecordsView'), 'RecordsView')
const PendingBalancesView = lazyNamed(() => import('./components/PendingBalancesView'), 'PendingBalancesView')
const BookingPage = lazyNamed(() => import('./components/BookingPage'), 'BookingPage')
const BookingDetail = lazyNamed(() => import('./components/BookingDetail'), 'BookingDetail')

// Tab title per screen: "<screen> — <business name>". Names match the sidebar.
const VIEW_TITLES = {
  calendar: 'Calendar',
  inventory: 'Inventory',
  'pending-balances': 'Pending Balances',
  records: 'Records',
  analytics: 'Analytics',
  usage: 'My Activity',
}

// The app lives at "/" and the public privacy policy at "/privacy" (a trailing slash is fine). Any other
// path is a 404. Both are decided before the auth gate: they render without needing a login or the API.
const getRoute = () => {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  if (path === '/') return 'app'
  return path === PRIVACY_POLICY_PATH ? 'privacy' : 'not-found'
}

export default function App() {
  const route = getRoute()
  const { isAuthenticated, isLoading, connectionError, businessName, checkAuth } = useAuthStore()
  const { activeView } = useBookingStore()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [authScreen, setAuthScreen] = useState('login')

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // After signing up and logging out, return to the login screen, not the sign-up form.
  useEffect(() => {
    if (isAuthenticated) setAuthScreen('login')
  }, [isAuthenticated])

  useEffect(() => {
    if (route !== 'app') return
    if (connectionError) {
      document.title = 'EventFlow'
      return
    }
    if (!isAuthenticated) {
      document.title = authScreen === 'signup' ? 'Create account — EventFlow' : 'Sign in — EventFlow'
      return
    }
    document.title = `${VIEW_TITLES[activeView] ?? 'EventFlow'} — ${businessName || 'EventFlow'}`
  }, [isAuthenticated, connectionError, businessName, route, authScreen, activeView])

  if (route === 'privacy') return <PrivacyPolicyPage />
  if (route === 'not-found') return <NotFoundPage />

  if (isLoading) {
    return (
      <div className="h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500">Loading...</p>
      </div>
    )
  }

  if (connectionError) {
    return (
      <div className="h-screen bg-slate-50 flex flex-col items-center justify-center px-6 text-slate-700">
        <RefreshCw className="w-10 h-10 mb-4" aria-hidden="true" />
        <p className="text-center max-w-md mb-6">
          Can&apos;t reach the server. Make sure the backend is running and refresh the page.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-all duration-200"
        >
          Refresh
        </button>
      </div>
    )
  }

  if (!isAuthenticated) {
    return authScreen === 'signup'
      ? <SignupScreen onShowLogin={() => setAuthScreen('login')} />
      : <LoginScreen onShowSignup={() => setAuthScreen('signup')} />
  }

  return (
    <>
      <div className="h-screen flex overflow-hidden">
        {mobileNavOpen && (
          <button
            type="button"
            className="md:hidden fixed inset-0 bg-black/40 z-[55]"
            aria-label="Close navigation menu"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        <Sidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />

        <div className="flex-1 flex flex-col min-h-0 ml-60">
          <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800 shrink-0 z-20">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="p-1.5 text-slate-300 hover:text-white transition-all duration-200"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-white font-bold text-sm">{businessName || 'EventFlow'}</span>
          </header>

          <main className="flex-1 min-h-0 overflow-auto bg-slate-50 min-w-0">
            <ScreenBoundary key={activeView}>
              {activeView === 'analytics' && <AnalyticsView />}
              {activeView === 'usage' && <UsageView />}
              {activeView === 'inventory' && <InventoryView />}
              {activeView === 'records' && <RecordsView />}
              {activeView === 'pending-balances' && <PendingBalancesView />}
              {activeView === 'calendar' && <CalendarView />}
            </ScreenBoundary>
          </main>
        </div>
      </div>

      <ScreenBoundary variant="overlay" fallback={null}>
        <BookingDetail />
        <BookingPage />
      </ScreenBoundary>
    </>
  )
}
