import { useEffect, useState } from 'react'
import { Tent, Calendar, Package, TableProperties, BarChart2, Activity, IndianRupee, UserCircle } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useBookingStore } from '../store/bookingStore'
import { useSettingsStore } from '../store/settingsStore'
import { api } from '../utils/api'
import { formatCurrency } from '../utils/formatCurrency'

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
  const [revenueThisMonth, setRevenueThisMonth] = useState(null)
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [logoutError, setLogoutError] = useState(null)
  const [pendingBalanceCount, setPendingBalanceCount] = useState(null)
  const { logout, businessName } = useAuthStore()
  const { activeView, setActiveView, bookings } = useBookingStore()
  const { monthlyRevenueTarget, loadSettings } = useSettingsStore()

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
    loadSettings()
    const loadRevenue = async () => {
      try {
        const summary = await api.getAnalyticsSummary()
        setRevenueThisMonth(Number(summary.revenueThisMonth) || 0)
      } catch {
        setRevenueThisMonth(null)
      }
    }
    loadRevenue()
    const loadPendingBalanceCount = async () => {
      try {
        const data = await api.getPendingBalances()
        if (Array.isArray(data)) {
          setPendingBalanceCount(data.length)
        }
      } catch {
        // Silent fail — badge hidden on error
      }
    }
    loadPendingBalanceCount()
  }, [loadSettings])

  useEffect(() => {
    if (activeView === 'analytics') {
      loadSettings()
    }
  }, [activeView, loadSettings])

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

  const target = monthlyRevenueTarget ?? 0
  const revenue = revenueThisMonth ?? 0
  const showRevenueTarget = monthlyRevenueTarget != null && revenueThisMonth != null
  const targetReached = showRevenueTarget && target > 0 && revenue >= target
  const progressPct = showRevenueTarget && target > 0
    ? Math.min(100, (revenue / target) * 100)
    : 0

  const openTargetSettings = () => {
    setActiveView('analytics')
    onMobileClose?.()
  }

  return (
    <aside
      className={`w-60 h-screen bg-slate-900 flex flex-col fixed left-0 top-0 z-[60] transition-transform duration-200 ease-out ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}
    >
      {/* Logo */}
      <div className="shrink-0 px-4 py-5 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <Tent className="w-5 h-5 text-teal-400 shrink-0" />
          <h1 className="text-white font-bold text-sm leading-tight">{businessName || 'EventFlow'}</h1>
        </div>
      </div>

      {/* Nav links + stat cards — scrollable */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-1">
        <button
          type="button"
          onClick={() => navigate('calendar')}
          className={navButtonClass('calendar')}
        >
          <Calendar className="w-4 h-4" />
          Calendar
        </button>
        <button
          type="button"
          onClick={() => navigate('inventory')}
          className={navButtonClass('inventory')}
        >
          <Package className="w-4 h-4" />
          Inventory
        </button>
        <button
          type="button"
          onClick={() => navigate('pending-balances')}
          className={navButtonClass('pending-balances')}
        >
          <IndianRupee className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left">Pending Balances</span>
          {pendingBalanceCount > 0 && (
            <span className="rounded-full bg-amber-500 text-white text-xs px-1.5 font-medium">
              {pendingBalanceCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => navigate('records')}
          className={navButtonClass('records')}
        >
          <TableProperties className="w-4 h-4" />
          Records
        </button>
        <button
          type="button"
          onClick={() => navigate('analytics')}
          className={navButtonClass('analytics')}
        >
          <BarChart2 className="w-4 h-4" />
          Analytics
        </button>
        <button
          type="button"
          onClick={() => navigate('usage')}
          className={navButtonClass('usage')}
        >
          <Activity className="w-4 h-4" />
          My Activity
        </button>

        {error && (
          <p className="mt-4 text-xs text-red-400 bg-red-950 border border-red-800 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Stat cards */}
        <div className="mt-4 space-y-2">
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-400">This Month</p>
            <p className="text-white font-bold text-lg">
              {isLoading ? '…' : error ? '—' : stats.thisMonth}
            </p>
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-400">Pending Advances</p>
            <p className="text-white font-bold text-lg">
              {isLoading ? '…' : error ? '—' : stats.pendingAdvances}
            </p>
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-400">Next Event</p>
            <p className="text-white font-bold text-lg">
              {isLoading ? '…' : error ? '—' : formatEventDate(stats.nextEvent)}
            </p>
          </div>

          {showRevenueTarget && target > 0 && (
            <div className="bg-slate-800 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-2">
                {targetReached ? 'Target reached! 🎯' : 'Revenue Target'}
              </p>
              <div className="h-2 w-full bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-200 ${
                    targetReached ? 'bg-emerald-500' : 'bg-teal-500'
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-xs text-slate-300 mt-2">
                {formatCurrency(revenue)} of {formatCurrency(target)} target
              </p>
            </div>
          )}

          {showRevenueTarget && target <= 0 && (
            <div className="bg-slate-800 rounded-lg p-3">
              <button
                type="button"
                onClick={openTargetSettings}
                className="text-xs text-slate-400 hover:text-slate-200 transition-all duration-200"
              >
                Set target →
              </button>
            </div>
          )}
        </div>

        {logoutError && (
          <p className="text-xs text-red-400 mt-2">{logoutError}</p>
        )}
      </nav>

      {/* Profile and Log Out — always pinned at bottom */}
      <div className="shrink-0 px-3 pb-4 pt-2 border-t border-slate-700">
        <button
          type="button"
          onClick={() => navigate('profile')}
          className={navButtonClass('profile')}
        >
          <UserCircle className="w-4 h-4" />
          Profile
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full text-sm text-slate-400 hover:text-white transition-all duration-200 py-1"
        >
          Log Out
        </button>
      </div>
    </aside>
  )
}
