import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../utils/api'
import { daysUsingEventFlow, formatRelativeTime } from '../utils/formatRelativeTime'
import { useAuthStore } from '../store/authStore'
import { useLangStore } from '../store/langStore'
import { t } from '../utils/i18n'

const StatCardSkeleton = () => (
  <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200 animate-pulse">
    <div className="h-8 bg-slate-200 rounded w-28 mb-2" />
    <div className="h-4 bg-slate-100 rounded w-36" />
  </div>
)

export const UsageView = () => {
  const { lang } = useLangStore()
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
    const relative = formatRelativeTime(usage?.lastActiveAt)
    if (relative) return relative
    if (usage?.firstActivityAt) return '—'
    return t(lang, 'noData')
  }, [usage, lang])

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
            {t(lang, 'retry')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-6 min-w-0">
      <h1 className="text-xl md:text-2xl font-bold text-slate-800">{t(lang, 'usageHeading')}</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200">
          <p className="text-2xl font-bold text-slate-800">{usage?.loginsThisWeek ?? 0}</p>
          <p className="text-sm text-slate-500 mt-1">{t(lang, 'usageLoginsWeek')}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200">
          <p className="text-2xl font-bold text-slate-800">
            {usage?.bookingsCreatedThisMonth ?? 0}
          </p>
          <p className="text-sm text-slate-500 mt-1">{t(lang, 'usageBookingsMonth')}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200">
          <p className="text-2xl font-bold text-slate-800">
            {usage?.whatsappMessagesSentThisMonth ?? 0}
          </p>
          <p className="text-sm text-slate-500 mt-1">{t(lang, 'usageWhatsappMonth')}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200">
          <p className="text-2xl font-bold text-slate-800">{lastActiveLabel}</p>
          <p className="text-sm text-slate-500 mt-1">{t(lang, 'usageLastActive')}</p>
        </div>
      </div>

      <p className="text-sm text-slate-500 text-center pt-2">
        {t(lang, 'usageFooter')}
      </p>
    </div>
  )
}
