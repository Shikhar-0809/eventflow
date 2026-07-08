import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '../utils/api'
import { formatCurrency } from '../utils/formatCurrency'
import { useAuthStore } from '../store/authStore'

const formatMonthLabel = (yyyyMm) => {
  const [year, month] = yyyyMm.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  return date.toLocaleString('en-IN', { month: 'short' })
}

const formatPeakMonthLabel = (peakMonth) => {
  if (!peakMonth?.month) return null
  const [year, month] = peakMonth.month.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  return date.toLocaleString('en-IN', { month: 'long' })
}

const formatPeakMonthCount = (peakMonth) => {
  const count = peakMonth?.count ?? 0
  return `${count} ${count === 1 ? 'booking' : 'bookings'}`
}

const ChartTooltip = ({ active, payload, label, valueFormatter }) => {
  if (!active || !payload?.length) return null
  const value = payload[0].value
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-800">
        {valueFormatter ? valueFormatter(value) : value}
      </p>
    </div>
  )
}

const StatCardSkeleton = () => (
  <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200 animate-pulse">
    <div className="h-8 bg-slate-200 rounded w-28 mb-2" />
    <div className="h-4 bg-slate-100 rounded w-36" />
  </div>
)

const ChartCardSkeleton = () => (
  <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200 animate-pulse">
    <div className="h-5 bg-slate-200 rounded w-40 mb-4" />
    <div className="h-[300px] bg-slate-100 rounded-lg" />
  </div>
)

const EmptyChartsMessage = () => (
  <>
    <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">Bookings per Month</h2>
      <p className="text-center text-slate-500 py-16 text-sm">
        Not enough data yet — analytics will appear as you add more bookings.
      </p>
    </div>
    <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">Revenue per Month</h2>
      <p className="text-center text-slate-500 py-16 text-sm">
        Not enough data yet — analytics will appear as you add more bookings.
      </p>
    </div>
  </>
)

export const AnalyticsView = () => {
  const [summary, setSummary] = useState(null)
  const [monthly, setMonthly] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [summaryData, monthlyData] = await Promise.all([
        api.getAnalyticsSummary(),
        api.getMonthlyAnalytics(),
      ])
      setSummary(summaryData)
      setMonthly(monthlyData)
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
    fetchAnalytics()
  }, [fetchAnalytics])

  const chartData = useMemo(
    () =>
      (monthly ?? []).map((row) => ({
        ...row,
        label: formatMonthLabel(row.month),
      })),
    [monthly],
  )

  const hasEnoughData = useMemo(
    () => (monthly ?? []).filter((row) => row.bookings > 0).length >= 2,
    [monthly],
  )

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto p-6 space-y-6">
        <div className="h-8 bg-slate-200 rounded w-56 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        <ChartCardSkeleton />
        <ChartCardSkeleton />
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
            onClick={fetchAnalytics}
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
      <h1 className="text-xl md:text-2xl font-bold text-slate-800">Business Analytics</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200 min-w-0">
          <p className="text-xl md:text-2xl font-bold text-slate-800 truncate">
            {formatCurrency(summary?.revenueThisMonth ?? 0)}
          </p>
          <p className="text-sm text-slate-500 mt-1">Revenue This Month</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200 min-w-0">
          <p className="text-xl md:text-2xl font-bold text-slate-800">
            {summary?.bookingsThisMonth ?? 0}
          </p>
          <p className="text-sm text-slate-500 mt-1">Bookings This Month</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200 min-w-0">
          {formatPeakMonthLabel(summary?.peakMonth) ? (
            <>
              <p className="text-lg md:text-xl font-bold text-slate-800 leading-tight">
                {formatPeakMonthLabel(summary?.peakMonth)}
              </p>
              <p className="text-sm font-medium text-slate-600 mt-0.5">
                {formatPeakMonthCount(summary?.peakMonth)}
              </p>
            </>
          ) : (
            <p className="text-xl md:text-2xl font-bold text-slate-800">—</p>
          )}
          <p className="text-sm text-slate-500 mt-1">Peak Month</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200 min-w-0">
          <p className="text-xl md:text-2xl font-bold text-slate-800">
            {summary?.totalClients ?? 0}
          </p>
          <p className="text-sm text-slate-500 mt-1">Total Clients</p>
        </div>
      </div>

      {!hasEnoughData ? (
        <EmptyChartsMessage />
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200 min-w-0 overflow-hidden">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Bookings per Month</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 12 }} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="bookings" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200 min-w-0 overflow-hidden">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Revenue per Month</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  tickFormatter={(value) => formatCurrency(value)}
                />
                <Tooltip
                  content={
                    <ChartTooltip valueFormatter={(value) => formatCurrency(value)} />
                  }
                />
                <Bar dataKey="revenue" fill="#d97706" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
