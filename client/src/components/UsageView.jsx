import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarCheck, Eye, FileText, Pencil } from 'lucide-react'
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

const activitySummary = (daysActive) => {
  if (daysActive >= 15) {
    return `You've been on a roll this month — active ${daysActive} days and counting.`
  }
  if (daysActive >= 5) {
    return `You've been active ${daysActive} days this month — good habit forming.`
  }
  return `You've logged in ${daysActive} days this month. Every booking here saves you time on paper.`
}

export const UsageView = () => {
  const [usage, setUsage] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchUsage = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await api.getMyUsage()
      setUsage(data)
    } catch (err) {
      if (err.status === 401) {
        useAuthStore.setState({ isAuthenticated: false, isLoading: false })
        return
      }
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsage()
  }, [fetchUsage])

  const lastActiveLabel = useMemo(() => {
    if (!usage?.lastActiveAt) return 'Never'
    return formatRelativeTime(usage.lastActiveAt) ?? 'Never'
  }, [usage])

  const summaryLine = useMemo(
    () => activitySummary(usage?.daysActiveThisMonth ?? 0),
    [usage?.daysActiveThisMonth],
  )

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto p-6 space-y-6">
        <div className="h-8 bg-slate-200 rounded w-48 animate-pulse" />
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

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8 text-center max-w-md">
          <p className="text-red-700 bg-red-100 border border-red-400 rounded-lg px-4 py-3 text-sm">
            {error}
          </p>
          <button
            type="button"
            onClick={fetchUsage}
            className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-all duration-200"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-6 min-w-0">
      <div className="space-y-2">
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Your Activity</h1>
        <p className="text-sm text-slate-500 max-w-2xl">{summaryLine}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard value={usage?.loginsThisWeek ?? 0} label="Logins This Week" />
        <StatCard value={usage?.bookingsCreatedThisMonth ?? 0} label="Bookings Created This Month" />
        <StatCard value={usage?.whatsappMessagesSentThisMonth ?? 0} label="WhatsApp Messages Sent This Month" />
        <StatCard value={lastActiveLabel} label="Last Active" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          value={usage?.bookingsViewedThisMonth ?? 0}
          label="Bookings Viewed This Month"
          icon={Eye}
        />
        <StatCard
          value={usage?.bookingsEditedThisMonth ?? 0}
          label="Bookings Edited This Month"
          icon={Pencil}
        />
        <StatCard
          value={usage?.changeNotesLoggedThisMonth ?? 0}
          label="Change Notes Logged"
          icon={FileText}
        />
        <StatCard
          value={usage?.daysActiveThisMonth ?? 0}
          label="Days Active This Month"
          valueClassName="text-3xl font-extrabold text-slate-800"
          icon={CalendarCheck}
          iconClassName="text-teal-500"
        />
      </div>
    </div>
  )
}
