import { useEffect, useState } from 'react'
import { Tent, Calendar, Package, BarChart2, Activity } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useBookingStore } from '../store/bookingStore'
import { useLangStore } from '../store/langStore'
import { api } from '../utils/api'
import { t } from '../utils/i18n'

const formatEventDate = (dateStr) => {
  if (!dateStr || dateStr === '—') return '—'
  const date = new Date(`${dateStr}T00:00:00`)
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

const computeStats = (bookings) => {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const today = `${year}-${String(month + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const thisMonth = bookings.filter((b) => {
    const d = new Date(`${b.event_date}T00:00:00`)
    return d.getFullYear() === year && d.getMonth() === month && b.status !== 'cancelled'
  }).length

  const pendingAdvances = bookings.filter((b) => b.status === 'pending').length

  const upcoming = bookings
    .filter((b) => b.event_date >= today && b.status !== 'cancelled')
    .sort((a, b) => a.event_date.localeCompare(b.event_date))

  const nextEvent = upcoming[0]?.event_date ?? '—'

  return { thisMonth, pendingAdvances, nextEvent }
}

export const Sidebar = ({ mobileOpen = false, onMobileClose }) => {
  const [stats, setStats] = useState({ thisMonth: 0, pendingAdvances: 0, nextEvent: '—' })
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [logoutError, setLogoutError] = useState(null)
  const { logout } = useAuthStore()
  const { activeView, setActiveView, bookings } = useBookingStore()
  const { lang, setLang } = useLangStore()

  const navButtonClass = (view) =>
    view === activeView
      ? 'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-teal-600 text-white font-medium transition-all duration-200'
      : 'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-all duration-200'

  const fetchStats = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const bookings = await api.getBookings()
      setStats(computeStats(bookings))
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  useEffect(() => {
    if (bookings.length > 0) {
      setStats(computeStats(bookings))
    }
  }, [bookings])

  const navigate = (view) => {
    setActiveView(view)
    onMobileClose?.()
  }

  const handleLogout = async () => {
    setLogoutError(null)
    try {
      await logout()
    } catch (err) {
      setLogoutError(err.message)
    }
  }

  return (
    <aside
      className={`w-60 h-screen bg-slate-900 flex flex-col shrink-0 fixed md:relative left-0 top-0 z-[60] md:z-auto transition-transform duration-200 ease-out ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}
    >
      <div className="shrink-0 px-4 py-5 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <Tent className="w-5 h-5 text-teal-400 shrink-0" />
          <h1 className="text-white font-bold text-sm leading-tight">{t(lang, 'businessName')}</h1>
        </div>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-1">
        <button
          type="button"
          onClick={() => navigate('calendar')}
          className={navButtonClass('calendar')}
        >
          <Calendar className="w-4 h-4" />
          {t(lang, 'navCalendar')}
        </button>
        <button
          type="button"
          onClick={() => navigate('inventory')}
          className={navButtonClass('inventory')}
        >
          <Package className="w-4 h-4" />
          {t(lang, 'navInventory')}
        </button>
        <button
          type="button"
          onClick={() => navigate('analytics')}
          className={navButtonClass('analytics')}
        >
          <BarChart2 className="w-4 h-4" />
          {t(lang, 'navAnalytics')}
        </button>
        <button
          type="button"
          onClick={() => navigate('usage')}
          className={navButtonClass('usage')}
        >
          <Activity className="w-4 h-4" />
          {t(lang, 'navActivity')}
        </button>

        {error && (
          <p className="mt-4 text-xs text-red-400 bg-red-950 border border-red-800 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="mt-4 space-y-2">
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-400">{t(lang, 'statThisMonth')}</p>
            <p className="text-white font-bold text-lg">
              {isLoading ? '…' : error ? '—' : stats.thisMonth}
            </p>
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-400">{t(lang, 'statPendingAdvances')}</p>
            <p className="text-white font-bold text-lg">
              {isLoading ? '…' : error ? '—' : stats.pendingAdvances}
            </p>
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-400">{t(lang, 'statNextEvent')}</p>
            <p className="text-white font-bold text-lg">
              {isLoading ? '…' : error ? '—' : formatEventDate(stats.nextEvent)}
            </p>
          </div>
        </div>

        {logoutError && (
          <p className="text-xs text-red-400">{logoutError}</p>
        )}
      </nav>

      <div className="shrink-0 px-3 pb-4 pt-2 border-t border-slate-700">
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={() => setLang('en')}
            className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all duration-200 ${
              lang === 'en'
                ? 'bg-teal-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLang('hi')}
            className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all duration-200 ${
              lang === 'hi'
                ? 'bg-teal-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            हिं
          </button>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="w-full text-sm text-slate-400 hover:text-white transition-all duration-200 py-1"
        >
          {t(lang, 'logOut')}
        </button>
      </div>
    </aside>
  )
}
