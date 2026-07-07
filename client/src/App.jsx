import { useEffect, useState } from 'react'
import { Menu, RefreshCw } from 'lucide-react'
import { useAuthStore } from './store/authStore'
import { useLangStore } from './store/langStore'
import { LoginScreen } from './components/LoginScreen'
import { Sidebar } from './components/Sidebar'
import { CalendarView } from './components/CalendarView'
import { AnalyticsView } from './components/AnalyticsView'
import { UsageView } from './components/UsageView'
import { InventoryView } from './components/InventoryView'
import { BookingModal } from './components/BookingModal'
import { BookingDetail } from './components/BookingDetail'
import { useBookingStore } from './store/bookingStore'
import { t } from './utils/i18n'

export default function App() {
  const { isAuthenticated, isLoading, connectionError, checkAuth } = useAuthStore()
  const { activeView } = useBookingStore()
  const { lang } = useLangStore()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    if (connectionError) {
      document.title = 'EventFlow'
      return
    }
    if (!isAuthenticated) {
      document.title = t(lang, 'loginTitle')
      return
    }
    document.title = lang === 'hi'
      ? 'EventFlow — बाला जी टेंट हाउस'
      : 'EventFlow — Bala Ji Tent House'
  }, [isAuthenticated, connectionError, lang])

  if (isLoading) {
    return (
      <div className="h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500">{t(lang, 'loading')}</p>
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
    return <LoginScreen />
  }

  return (
    <div className="h-screen flex flex-col md:flex-row overflow-hidden">
      {mobileNavOpen && (
        <button
          type="button"
          className="md:hidden fixed inset-0 bg-black/40 z-[55]"
          aria-label="Close navigation menu"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <Sidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />

      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800 shrink-0 z-20">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="p-1.5 text-slate-300 hover:text-white transition-all duration-200"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-white font-bold text-sm">{t(lang, 'businessName')}</span>
        </header>

        <main className="flex-1 relative overflow-hidden bg-slate-50 min-w-0">
          {activeView === 'analytics' && <AnalyticsView />}
          {activeView === 'usage' && <UsageView />}
          {activeView === 'inventory' && <InventoryView />}
          {activeView === 'calendar' && <CalendarView />}
          <BookingModal />
          <BookingDetail />
        </main>
      </div>
    </div>
  )
}
