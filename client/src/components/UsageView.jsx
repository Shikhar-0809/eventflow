import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarCheck, ChevronLeft, ChevronRight, Eye, FileText, Pencil } from 'lucide-react'
import { api } from '../utils/api'
import { formatRelativeTime } from '../utils/formatRelativeTime'
import { useAuthStore } from '../store/authStore'

const StatCardSkeleton = () => (
  <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200 animate-pulse">
    <div className="h-8 bg-slate-200 rounded w-28 mb-2" />
    <div className="h-4 bg-slate-100 rounded w-36" />
  </div>
)

const StatCard = ({ value, label, valueClassName = 'text-2xl font-bold text-slate-800', icon: Icon, iconClassName = 'text-slate-300' }) => (
  <div className="relative bg-white rounded-xl shadow-sm p-4 border border-slate-200">
    {Icon && (
      <Icon className={`absolute top-4 right-4 w-4 h-4 ${iconClassName}`} aria-hidden="true" />
    )}
    <p className={valueClassName}>{value}</p>
    <p className="text-sm text-slate-500 mt-1">{label}</p>
  </div>
)

const activitySummary = (weekOffset, daysActive, weekLabel) => {
  if (weekOffset > 0) {
    return `Activity for the week of ${weekLabel}.`
  }
  if (daysActive >= 5) {
    return `Great week — you've been active ${daysActive} out of 7 days.`
  }
  if (daysActive >= 2) {
    return `You've been active ${daysActive} days this week. Keep the streak going.`
  }
  return 'Just getting started this week — every booking logged saves time on paper.'
}

export const UsageView = () => {
  const [weekOffset, setWeekOffset] = useState(0)
  const [usage, setUsage] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const isInitialMount = useRef(true)

  const fetchUsage = useCallback(async (offset, { initial = false } = {}) => {
    if (initial) {
      setIsLoading(true)
    } else {
      setIsRefreshing(true)
    }
    setError(null)
    try {
      const data = await api.getMyUsage(offset)
      setUsage(data)
    } catch (err) {
      if (err.status === 401) {
        useAuthStore.setState({ isAuthenticated: false, isLoading: false })
        return
      }
      setError(err.message)
    } finally {
      if (initial) setIsLoading(false)
      else setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const initial = isInitialMount.current
    isInitialMount.current = false
    fetchUsage(weekOffset, { initial })
  }, [weekOffset, fetchUsage])

  const lastActiveLabel = useMemo(() => {
    if (!usage?.lastActiveAt) return 'Never'
    return formatRelativeTime(usage.lastActiveAt) ?? 'Never'
  }, [usage])

  const summaryLine = useMemo(
    () => activitySummary(
      weekOffset,
      usage?.daysActiveThisWeek ?? 0,
      usage?.weekLabel ?? '',
    ),
    [weekOffset, usage?.daysActiveThisWeek, usage?.weekLabel],
  )

  const weekLabel = usage?.weekLabel ?? '—'

  const goToOlderWeek = () => setWeekOffset((prev) => prev + 1)
  const goToNewerWeek = () => setWeekOffset((prev) => Math.max(0, prev - 1))

  if (isLoading && !usage) {
    return (
      <div className="h-full overflow-y-auto p-6 space-y-6">
        <div className="h-8 bg-slate-200 rounded w-48 animate-pulse" />
        <div className="h-10 bg-slate-100 rounded w-64 animate-pulse" />
        <div className="h-4 bg-slate-100 rounded w-full max-w-xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
      </div>
    )
  }

  if (error && !usage) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8 text-center max-w-md">
          <p className="text-red-700 bg-red-100 border border-red-400 rounded-lg px-4 py-3 text-sm">
            {error}
          </p>
          <button
            type="button"
            onClick={() => fetchUsage(weekOffset, { initial: true })}
            className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-all duration-200"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const statGrids = isRefreshing ? (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
    </>
  ) : (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard value={usage?.loginsThisWeek ?? 0} label="Logins This Week" />
        <StatCard value={usage?.bookingsCreatedThisWeek ?? 0} label="Bookings Created This Week" />
        <StatCard value={usage?.whatsappMessagesSentThisWeek ?? 0} label="WhatsApp Messages Sent This Week" />
        <StatCard value={lastActiveLabel} label="Last Active" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          value={usage?.bookingsViewedThisWeek ?? 0}
          label="Bookings Viewed This Week"
          icon={Eye}
        />
        <StatCard
          value={usage?.bookingsEditedThisWeek ?? 0}
          label="Bookings Edited This Week"
          icon={Pencil}
        />
        <StatCard
          value={usage?.changeNotesLoggedThisWeek ?? 0}
          label="Change Notes Logged This Week"
          icon={FileText}
        />
        <StatCard
          value={usage?.daysActiveThisWeek ?? 0}
          label="Days Active This Week"
          valueClassName="text-3xl font-extrabold text-slate-800"
          icon={CalendarCheck}
          iconClassName="text-teal-500"
        />
      </div>
    </>
  )

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-6 min-w-0">
      <div className="space-y-3">
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Your Activity</h1>

        <div className="inline-flex items-center gap-3">
          <button
            type="button"
            onClick={goToOlderWeek}
            disabled={isRefreshing}
            className="bg-white border border-slate-200 rounded-lg p-1.5 hover:bg-slate-50 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Previous week"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
          <span className="text-slate-700 font-medium min-w-[12rem] text-center">
            {isRefreshing ? 'Loading…' : weekLabel}
          </span>
          <button
            type="button"
            onClick={goToNewerWeek}
            disabled={weekOffset === 0 || isRefreshing}
            className="bg-white border border-slate-200 rounded-lg p-1.5 hover:bg-slate-50 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Next week"
          >
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <p className="text-sm text-slate-500 max-w-2xl">{summaryLine}</p>
      </div>

      {error && usage && (
        <p className="text-sm text-red-700 bg-red-100 border border-red-400 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      {statGrids}
    </div>
  )
}
