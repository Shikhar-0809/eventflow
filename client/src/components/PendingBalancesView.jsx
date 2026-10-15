import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ExternalLink,
  IndianRupee,
  MessageCircle,
  Send,
} from 'lucide-react'
import { api } from '../utils/api'
import { formatCurrency } from '../utils/formatCurrency'
import { paymentReminderMessage } from '../utils/whatsapp'
import { useAuthStore } from '../store/authStore'
import { useBookingStore } from '../store/bookingStore'
import { ConfirmDialog } from './ConfirmDialog'

const EVENT_TYPE_LABELS = {
  wedding: 'Wedding',
  birthday: 'Birthday',
  corporate: 'Corporate',
  other: 'Other',
}

const formatEventType = (type) => EVENT_TYPE_LABELS[type] ?? 'Other'

const formatDisplayDate = (dateStr) => {
  const normalized = String(dateStr).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return '—'
  const date = new Date(`${normalized}T00:00:00`)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const truncateVenue = (venue, max = 20) => {
  const text = venue?.trim() || '—'
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

const getUrgencyChip = (daysUntil) => {
  if (daysUntil === 0) {
    return { label: 'Today', className: 'bg-red-100 text-red-700' }
  }
  if (daysUntil === 1) {
    return { label: 'Tomorrow', className: 'bg-red-100 text-red-700' }
  }
  if (daysUntil >= 2 && daysUntil <= 3) {
    return { label: `${daysUntil} days left`, className: 'bg-red-100 text-red-700' }
  }
  if (daysUntil >= 4 && daysUntil <= 7) {
    return { label: `${daysUntil} days left`, className: 'bg-amber-100 text-amber-700' }
  }
  return { label: `${daysUntil} days left`, className: 'bg-slate-100 text-slate-600' }
}

const CardSkeleton = () => (
  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 animate-pulse space-y-3">
    <div className="h-5 bg-slate-100 rounded w-2/3" />
    <div className="h-4 bg-slate-100 rounded w-1/2" />
    <div className="h-8 bg-slate-100 rounded w-full" />
  </div>
)

export const PendingBalancesView = () => {
  const [records, setRecords] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showBatchConfirm, setShowBatchConfirm] = useState(false)
  const { setSelectedBooking } = useBookingStore()
  const businessName = useAuthStore((state) => state.businessName)

  const fetchRecords = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await api.getPendingBalances()
      setRecords(Array.isArray(data) ? data : [])
    } catch (err) {
      if (err.status === 401) {
        useAuthStore.setState({ isAuthenticated: false, isLoading: false })
        return
      }
      setError(err.message ?? 'Something went wrong. Please try again.')
      setRecords([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  const totalOutstanding = useMemo(
    () => records.reduce((sum, row) => sum + Number(row.pending_balance ?? 0), 0),
    [records],
  )

  const nextEventDays = records[0]?.days_until_event

  const handleSendReminder = (booking) => {
    const url = paymentReminderMessage(booking, businessName)
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  const handleViewBooking = (booking) => {
    setSelectedBooking(booking)
  }

  const handleBatchConfirm = () => {
    records.forEach((booking, index) => {
      const url = paymentReminderMessage(booking, businessName)
      if (!url) return
      setTimeout(() => {
        window.open(url, '_blank', 'noopener,noreferrer')
      }, index * 600)
    })
    setShowBatchConfirm(false)
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-6 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
          <IndianRupee className="w-6 h-6 text-teal-600 shrink-0" aria-hidden="true" />
          Pending Balances
        </h1>
        {!isLoading && !error && records.length > 0 && (
          <span className="inline-flex items-center self-start sm:self-auto bg-teal-100 text-teal-800 font-semibold rounded-full px-4 py-1.5 text-sm">
            {formatCurrency(totalOutstanding)} outstanding
          </span>
        )}
      </div>

      {!isLoading && !error && records.length > 0 && (
        <p className="text-sm text-slate-600">
          {records.length} booking{records.length === 1 ? '' : 's'} |{' '}
          {formatCurrency(totalOutstanding)} total pending | Next event in {nextEventDays} day
          {nextEventDays === 1 ? '' : 's'}
        </p>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={fetchRecords}
            className="px-3 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-all duration-200 shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : !error && records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-slate-500">
          <CheckCircle2 className="w-10 h-10 mb-3 text-emerald-500" aria-hidden="true" />
          <p className="text-sm">All clear — no pending balances.</p>
        </div>
      ) : (
        !error && (
          <div className="space-y-4">
            {records.length >= 2 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowBatchConfirm(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-white bg-amber-500 hover:bg-amber-600 transition-all duration-200"
                >
                  <Send className="w-4 h-4" />
                  Send All Reminders
                </button>
                <p className="mt-1.5 text-xs text-slate-400 text-center">
                  Opens one WhatsApp tab per client. Allow pop-ups if prompted.
                </p>
              </div>
            )}

            {records.map((record) => {
              const urgency = getUrgencyChip(Number(record.days_until_event ?? 0))
              return (
                <div
                  key={record.id}
                  className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-slate-900">{record.client_name}</p>
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                      {formatEventType(record.event_type)}
                    </span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${urgency.className}`}>
                      {urgency.label}
                    </span>
                  </div>

                  <p className="text-sm text-slate-600">
                    {formatDisplayDate(record.event_date)} | {truncateVenue(record.venue)} |{' '}
                    {record.guest_count} guests
                  </p>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <p className="text-sm text-slate-600">
                      Total: {formatCurrency(record.total)} | Paid: {formatCurrency(record.advance)} | Pending:{' '}
                      <span className="font-bold text-teal-700">{formatCurrency(record.pending_balance)}</span>
                    </p>
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => handleSendReminder(record)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 transition-all duration-200"
                      >
                        <MessageCircle className="w-4 h-4" />
                        Send Reminder
                      </button>
                      <button
                        type="button"
                        onClick={() => handleViewBooking(record)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 transition-all duration-200"
                      >
                        <ExternalLink className="w-4 h-4" />
                        View Booking
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      <ConfirmDialog
        isOpen={showBatchConfirm}
        title="Send All Reminders"
        message={`Send WhatsApp payment reminders to all ${records.length} clients? This will open ${records.length} WhatsApp tabs.`}
        confirmLabel="Send All"
        onConfirm={handleBatchConfirm}
        onCancel={() => setShowBatchConfirm(false)}
      />
    </div>
  )
}
