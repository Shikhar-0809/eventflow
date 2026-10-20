import { lazy, useEffect, useState } from 'react'
import { Menu, RefreshCw } from 'lucide-react'
import { useAuthStore } from './store/authStore'
import { Sidebar } from './components/Sidebar'
import { CalendarView } from './components/CalendarView'
import { ScreenBoundary } from './components/ScreenBoundary'
import { useBookingStore } from './store/bookingStore'
import { useProfileStore } from './store/profileStore'
import { navigate } from './utils/router'
import { handleProfileError } from './utils/profileErrors'

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
const ProfileView = lazyNamed(() => import('./components/ProfileView'), 'ProfileView')

// Tab title per screen: "<screen> — <business name>". Names match the sidebar.
const VIEW_TITLES = {
  calendar: 'Calendar',
  inventory: 'Inventory',
  'pending-balances': 'Pending Balances',
  records: 'Records',
  analytics: 'Analytics',
  usage: 'My Activity',
  profile: 'Profile',
}

export default function App() {
  const { isAuthenticated, isLoading, connectionError, businessName, checkAuth } = useAuthStore()
  const loadProfile = useProfileStore((state) => state.loadProfile)
  const { activeView } = useBookingStore()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // Arriving from the login screen the session is already known; a fresh load (or refresh) asks the server.
  useEffect(() => {
    if (!useAuthStore.getState().isAuthenticated) checkAuth()
  }, [checkAuth])

  // No session (never had one, expired, or another device signed this one out): the login screen, then back here.
  useEffect(() => {
    if (!isLoading && !connectionError && !isAuthenticated) navigate('/login?next=/app', { replace: true })
  }, [isLoading, connectionError, isAuthenticated])

  // The merchant's own WhatsApp number (and business details) come from their profile, fetched once per login.
  useEffect(() => {
    if (!isAuthenticated) return
    loadProfile().catch((err) => handleProfileError(err))
  }, [isAuthenticated, loadProfile])

  useEffect(() => {
    if (connectionError || !isAuthenticated) {
      document.title = 'EventFlow'
      return
    }
    document.title = `${VIEW_TITLES[activeView] ?? 'EventFlow'} — ${businessName || 'EventFlow'}`
  }, [isAuthenticated, connectionError, businessName, activeView])

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

  // The effect above is already sending a logged-out visitor to /login.
  if (!isAuthenticated) return null

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

        <div className="flex-1 flex flex-col min-h-0 md:ml-60">
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
              {activeView === 'profile' && <ProfileView />}
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
