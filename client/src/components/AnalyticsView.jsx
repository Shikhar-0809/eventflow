import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { FileText, Loader2, X } from 'lucide-react'
import { api } from '../utils/api'
import { formatCurrency } from '../utils/formatCurrency'
import { monthStartISO, todayISO } from '../utils/merchantTime'
import { openReportWindow } from '../utils/reportPrinter'
import { useAuthStore } from '../store/authStore'
import { useBookingStore } from '../store/bookingStore'
import { useSettingsStore } from '../store/settingsStore'

const MAX_MONTHLY_TARGET = 100000000

// The report's default range uses the merchant's (Asia/Kolkata) month and day (BUGS #100).
const firstDayOfCurrentMonth = () => monthStartISO()

const todayDateString = () => todayISO()

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
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsError, setSettingsError] = useState(null)
  const [targetInput, setTargetInput] = useState('')
  const [targetSaveError, setTargetSaveError] = useState(null)
  const [isSavingTarget, setIsSavingTarget] = useState(false)
  const [savedMessage, setSavedMessage] = useState(null)
  const [reportFrom, setReportFrom] = useState(() => firstDayOfCurrentMonth())
  const [reportTo, setReportTo] = useState(() => todayDateString())
  const [reportDateError, setReportDateError] = useState(null)
  const [reportApiError, setReportApiError] = useState(null)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const { loadSettings, setMonthlyRevenueTarget } = useSettingsStore()
  const businessName = useAuthStore((state) => state.businessName)

  const fetchSettings = useCallback(async () => {
    setSettingsLoading(true)
    setSettingsError(null)
    try {
      const data = await api.getSettings()
      const parsed = Number.parseInt(data.monthly_revenue_target, 10)
      const value = Number.isFinite(parsed) ? parsed : 0
      setTargetInput(value > 0 ? String(value) : '')
      setMonthlyRevenueTarget(value)
    } catch (err) {
      if (err.status === 401) {
        useAuthStore.setState({ isAuthenticated: false, isLoading: false })
        return
      }
      setSettingsError(err.message)
    } finally {
      setSettingsLoading(false)
    }
  }, [setMonthlyRevenueTarget])

  const fetchAnalytics = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) {
      setIsLoading(true)
      setError(null)
    }
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
      // A quiet refetch (after a booking change) keeps the numbers already on screen.
      if (!quiet) setError(err.message)
    } finally {
      if (!quiet) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAnalytics()
    fetchSettings()
  }, [fetchAnalytics, fetchSettings])

  // A booking was created, edited, cancelled, completed or deleted while this screen is open (BUGS #097).
  const analyticsVersion = useBookingStore((state) => state.analyticsVersion)
  const seenVersion = useRef(analyticsVersion)
  useEffect(() => {
    if (seenVersion.current === analyticsVersion) return
    seenVersion.current = analyticsVersion
    fetchAnalytics({ quiet: true })
  }, [analyticsVersion, fetchAnalytics])

  const handleSaveTarget = async (e) => {
    e.preventDefault()
    setTargetSaveError(null)
    setSavedMessage(null)

    const trimmed = targetInput.trim()
    const parsed = trimmed === '' ? 0 : Number(trimmed)
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_MONTHLY_TARGET) {
      setTargetSaveError(`Enter a whole number from 0 to ${MAX_MONTHLY_TARGET.toLocaleString('en-IN')}.`)
      return
    }

    setIsSavingTarget(true)
    try {
      await api.updateSettings({ monthly_revenue_target: parsed })
      setMonthlyRevenueTarget(parsed)
      setTargetInput(parsed > 0 ? String(parsed) : '')
      setSavedMessage('Saved')
      await loadSettings()
      setTimeout(() => setSavedMessage(null), 2500)
    } catch (err) {
      if (err.status === 401) {
        useAuthStore.setState({ isAuthenticated: false, isLoading: false })
        return
      }
      setTargetSaveError(err.message ?? 'Something went wrong. Please try again.')
    } finally {
      setIsSavingTarget(false)
    }
  }

  const handleGenerateReport = async () => {
    setReportApiError(null)

    if (!reportFrom || !reportTo) {
      setReportDateError('Start date must be before end date.')
      return
    }
    if (reportFrom > reportTo) {
      setReportDateError('Start date must be before end date.')
      return
    }
    setReportDateError(null)

    setIsGeneratingReport(true)
    try {
      const data = await api.getReport(reportFrom, reportTo)
      openReportWindow({ ...data, businessName })
    } catch (err) {
      if (err.status === 401) {
        useAuthStore.setState({ isAuthenticated: false, isLoading: false })
        return
      }
      setReportApiError(err.message ?? 'Something went wrong. Please try again.')
    } finally {
      setIsGeneratingReport(false)
    }
  }

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

      <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Set Monthly Target</h2>
        {settingsLoading ? (
          <div className="animate-pulse space-y-2">
            <div className="h-10 bg-slate-100 rounded-lg" />
            <div className="h-8 bg-slate-100 rounded w-20" />
          </div>
        ) : settingsError ? (
          <div>
            <p className="text-sm text-red-700 bg-red-100 border border-red-400 rounded-lg px-3 py-2 mb-3">
              {settingsError}
            </p>
            <button
              type="button"
              onClick={fetchSettings}
              className="px-3 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-all duration-200"
            >
              Retry
            </button>
          </div>
        ) : (
          <form onSubmit={handleSaveTarget} className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 min-w-0">
              <label htmlFor="monthly_revenue_target" className="block text-xs text-slate-500 mb-1">
                Monthly revenue target (₹)
              </label>
              <input
                id="monthly_revenue_target"
                type="number"
                min="0"
                max={MAX_MONTHLY_TARGET}
                step="1"
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                placeholder="e.g. 200000"
                className="border border-slate-300 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all duration-200"
              />
            </div>
            <button
              type="submit"
              disabled={isSavingTarget}
              className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:text-slate-500 text-white rounded-lg font-medium transition-all duration-200 shrink-0"
            >
              {isSavingTarget ? 'Saving…' : 'Save'}
            </button>
            {savedMessage && (
              <p className="text-sm text-teal-700 font-medium sm:pb-2">{savedMessage}</p>
            )}
          </form>
        )}
        {targetSaveError && !settingsLoading && !settingsError && (
          <p role="alert" className="mt-2 text-sm text-red-700">{targetSaveError}</p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-teal-600 shrink-0" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-slate-700">Export Report</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label htmlFor="report_from" className="block text-xs text-slate-500 mb-1">
              From
            </label>
            <input
              id="report_from"
              type="date"
              value={reportFrom}
              onChange={(e) => {
                setReportFrom(e.target.value)
                setReportDateError(null)
                setReportApiError(null)
              }}
              className="border border-slate-300 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all duration-200"
            />
          </div>
          <div>
            <label htmlFor="report_to" className="block text-xs text-slate-500 mb-1">
              To
            </label>
            <input
              id="report_to"
              type="date"
              value={reportTo}
              onChange={(e) => {
                setReportTo(e.target.value)
                setReportDateError(null)
                setReportApiError(null)
              }}
              className="border border-slate-300 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all duration-200"
            />
          </div>
        </div>
        {reportDateError && (
          <p role="alert" className="text-sm text-red-700 mb-3">
            {reportDateError}
          </p>
        )}
        <button
          type="button"
          onClick={handleGenerateReport}
          disabled={isGeneratingReport}
          className="w-full sm:w-auto px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:text-slate-500 text-white rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2"
        >
          {isGeneratingReport && <Loader2 className="w-4 h-4 animate-spin" />}
          {isGeneratingReport ? 'Generating…' : 'Generate Report'}
        </button>
        {reportApiError && (
          <div
            role="alert"
            className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 flex items-start justify-between gap-3"
          >
            <p className="flex-1">{reportApiError}</p>
            <button
              type="button"
              onClick={() => setReportApiError(null)}
              className="p-0.5 text-red-500 hover:text-red-800 shrink-0"
              aria-label="Dismiss error"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
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
