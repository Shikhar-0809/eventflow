import { useEffect, useState } from 'react'
import { X, Phone, MessageCircle, Bell, Loader2, Pencil, Clock, Receipt, Trash2, CheckCircle2, Send, XCircle } from 'lucide-react'
import { useBookingStore } from '../store/bookingStore'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'
import { api } from '../utils/api'
import { formatCurrency } from '../utils/formatCurrency'
import { getDaysUntilEvent } from '../utils/dateHelpers'
import { ConfirmDialog } from './ConfirmDialog'
import { ModalDialog } from './ModalDialog'
import {
  confirmationMessage,
  paymentReminderMessage,
  selfSummaryMessage,
  validatePhoneForWhatsApp,
} from '../utils/whatsapp'

const MAX_NOTE_LENGTH = 500

const STATUS_STYLES = {
  confirmed: 'bg-teal-100 text-teal-800',
  pending: 'bg-amber-100 text-amber-800',
  cancelled: 'bg-red-100 text-red-700',
  completed: 'bg-indigo-100 text-indigo-700',
}

const STATUS_LABELS = {
  confirmed: 'Confirmed',
  pending: 'Pending',
  cancelled: 'Cancelled',
  completed: 'Completed',
}

const EVENT_TYPE_LABELS = {
  wedding: 'Wedding',
  birthday: 'Birthday',
  corporate: 'Corporate',
  other: 'Other',
}

const formatStatus = (status) => STATUS_LABELS[status] ?? 'Confirmed'
const formatEventType = (type) => EVENT_TYPE_LABELS[type] ?? 'Other'

const displayEventType = (booking) =>
  booking?.event_type === 'other' && booking?.event_type_custom
    ? booking.event_type_custom
    : formatEventType(booking?.event_type)

const getEventCountdownDisplay = (eventDate, bookingStatus) => {
  if (bookingStatus === 'cancelled' || bookingStatus === 'completed') return null

  const daysUntil = getDaysUntilEvent(eventDate)
  if (daysUntil === null || daysUntil > 30 || daysUntil < -90) return null

  let label
  if (daysUntil === 0) label = 'Event today'
  else if (daysUntil === 1) label = 'Event tomorrow'
  else if (daysUntil > 1) label = `Event in ${daysUntil} days`
  else label = `Event was ${Math.abs(daysUntil)} days ago`

  if (daysUntil >= 0 && daysUntil <= 3) {
    return {
      label,
      className: 'inline-flex items-center gap-1.5 bg-teal-50 text-teal-700 font-semibold rounded-full px-3 py-1 text-sm',
      showClock: true,
    }
  }
  if (daysUntil >= 4) {
    return {
      label,
      className: 'inline-flex items-center bg-slate-100 text-slate-600 rounded-full px-3 py-1 text-sm',
      showClock: false,
    }
  }
  return {
    label,
    className: 'text-sm text-slate-500 bg-slate-50',
    showClock: false,
  }
}

const formatDisplayDate = (dateStr) => {
  if (dateStr == null || dateStr === '') return '—'
  const normalized = String(dateStr).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return '—'
  const d = new Date(`${normalized}T00:00:00`)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const formatLogTimestamp = (loggedAt) => {
  const d = new Date(String(loggedAt).replace(' ', 'T'))
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

const DetailField = ({ label, value }) => (
  <div>
    <p className="text-xs text-slate-500 mb-0.5">{label}</p>
    <p className="text-sm font-bold text-slate-800">{value}</p>
  </div>
)

const InventoryUsedSkeleton = () => (
  <div className="space-y-2 animate-pulse" aria-hidden="true">
    <div className="h-10 bg-slate-100 rounded-lg" />
    <div className="h-10 bg-slate-100 rounded-lg" />
  </div>
)

const bookingIdsMatch = (left, right) => Number(left) === Number(right)

const asArray = (value) => (Array.isArray(value) ? value : [])

const MAX_EXPENSE_LABEL_LENGTH = 100
const MAX_EXPENSE_AMOUNT = 10000000

const validateExpenseInput = (label, amountRaw) => {
  const trimmedLabel = label.trim()
  if (!trimmedLabel) return 'Enter an expense label.'
  if (trimmedLabel.length > MAX_EXPENSE_LABEL_LENGTH) return 'Label is too long (max 100 characters).'

  const amount = Number(amountRaw)
  if (amountRaw === '' || !Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
    return 'Enter a valid amount greater than 0.'
  }
  if (amount > MAX_EXPENSE_AMOUNT) return 'Amount is too large.'
  return null
}

const normalizeBookingDetail = (data) => ({
  ...data,
  inventory: asArray(data?.inventory),
  change_log: asArray(data?.change_log),
  expenses: asArray(data?.expenses),
})

export const BookingDetail = () => {
  const businessName = useAuthStore((state) => state.businessName)
  // The merchant's own number comes from their profile (Profile screen), never from an env var.
  const merchantWhatsapp = useProfileStore((state) => state.profile?.whatsapp_phone ?? null)
  const profileStatus = useProfileStore((state) => state.status)
  const { isDetailOpen, selectedBooking, forceCloseDetail, setActiveView, requestCloseDetail, notePromptOpen, keepNote, discardNote, setDetailNoteDirty, openModal, updateBooking, removeBooking } = useBookingStore()
  const [booking, setBooking] = useState(null)
  const [changeLog, setChangeLog] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [fetchError, setFetchError] = useState(null)
  const [changeNote, setChangeNote] = useState('')
  const [isLogging, setIsLogging] = useState(false)
  const [logError, setLogError] = useState(null)
  const [whatsappError, setWhatsappError] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [expenseLabel, setExpenseLabel] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseError, setExpenseError] = useState(null)
  const [isAddingExpense, setIsAddingExpense] = useState(false)
  const [expenseToDelete, setExpenseToDelete] = useState(null)
  const [isDeletingExpense, setIsDeletingExpense] = useState(false)
  const [expenseDeleteError, setExpenseDeleteError] = useState(null)
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const [completeError, setCompleteError] = useState(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelError, setCancelError] = useState(null)
  const [selfWhatsappError, setSelfWhatsappError] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  useEffect(() => {
    if (!isDetailOpen || !selectedBooking?.id) return

    setChangeNote('')
    setLogError(null)
    setWhatsappError(null)
    setFetchError(null)
    setDetailNoteDirty(false)
    setBooking(null)
    setChangeLog([])
    setExpenses([])
    setExpenseLabel('')
    setExpenseAmount('')
    setExpenseError(null)
    setExpenseToDelete(null)
    setExpenseDeleteError(null)
    setShowCompleteConfirm(false)
    setCompleteError(null)
    setShowCancelConfirm(false)
    setCancelError(null)
    setSelfWhatsappError(null)
    setShowDeleteConfirm(false)
    setDeleteError(null)
    setIsLoading(true)

    const loadDetail = async () => {
      try {
        const data = normalizeBookingDetail(await api.getBooking(selectedBooking.id))
        if (!data?.id) {
          throw new Error('Booking data was incomplete.')
        }
        setBooking(data)
        setChangeLog(asArray(data.change_log))
        setExpenses(asArray(data.expenses))
      } catch (err) {
        console.error('BookingDetail load failed:', err)
        if (err.status === 401) {
          useAuthStore.setState({ isAuthenticated: false, isLoading: false })
          forceCloseDetail()
          return
        }
        setFetchError(err.message ?? 'Something went wrong. Please try again.')
        setBooking(normalizeBookingDetail(selectedBooking))
        setChangeLog([])
        setExpenses([])
      } finally {
        setIsLoading(false)
      }
    }

    loadDetail()
  }, [isDetailOpen, selectedBooking?.id, forceCloseDetail, setDetailNoteDirty])

  useEffect(() => {
    if (!isDetailOpen || !selectedBooking?.id) return
    setBooking((prev) => {
      if (!prev || !bookingIdsMatch(prev.id, selectedBooking.id)) {
        return prev
      }
      return normalizeBookingDetail({
        ...prev,
        ...selectedBooking,
      })
    })
  }, [selectedBooking, isDetailOpen])

  const noteIsDirty = changeNote.trim().length > 0

  useEffect(() => {
    if (!isDetailOpen) return
    setDetailNoteDirty(noteIsDirty)
  }, [noteIsDirty, isDetailOpen, setDetailNoteDirty])

  useEffect(() => {
    if (isDetailOpen) return
    setDetailNoteDirty(false)
  }, [isDetailOpen, setDetailNoteDirty])

  const handleWhatsApp = (type) => {
    setWhatsappError(null)
    setSelfWhatsappError(null)
    const target = booking ?? selectedBooking
    if (!target) return

    if (!validatePhoneForWhatsApp(target.phone)) {
      setWhatsappError('Something went wrong. Please try again.')
      return
    }

    const url = type === 'confirmation'
      ? confirmationMessage(target, businessName)
      : paymentReminderMessage(target, businessName)

    if (!url) {
      setWhatsappError('Something went wrong. Please try again.')
      return
    }

    window.open(url, '_blank', 'noopener,noreferrer')

    const eventType = type === 'confirmation'
      ? 'whatsapp_confirmation_sent'
      : 'whatsapp_reminder_sent'
    void api.logClientAction(eventType, target.id).catch(() => {})
  }

  const handleSelfWhatsApp = () => {
    setSelfWhatsappError(null)
    setWhatsappError(null)
    const target = booking ?? selectedBooking
    if (!target) return

    const url = selfSummaryMessage(target, businessName, merchantWhatsapp)
    if (!url) {
      setSelfWhatsappError('Something went wrong. Please try again.')
      return
    }

    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleLogChange = async (e) => {
    e.preventDefault()
    const note = changeNote.trim()
    if (!note || !booking?.id || isLogging) return

    setLogError(null)
    const previousLog = asArray(changeLog)
    const optimisticEntry = {
      id: `temp-${Date.now()}`,
      booking_id: booking.id,
      change_note: note,
      logged_at: new Date().toISOString(),
    }

    setChangeLog((prev) => [...asArray(prev), optimisticEntry])
    setChangeNote('')
    setIsLogging(true)

    try {
      const updatedLog = await api.logChange(booking.id, note)
      setChangeLog(asArray(updatedLog))
    } catch (err) {
      setChangeLog(previousLog)
      setChangeNote(note)
      setLogError(err.message)
    } finally {
      setIsLogging(false)
    }
  }

  const handleAddExpense = async (e) => {
    e.preventDefault()
    const validationError = validateExpenseInput(expenseLabel, expenseAmount)
    if (validationError || !booking?.id || isAddingExpense) {
      setExpenseError(validationError)
      return
    }

    const label = expenseLabel.trim()
    const amount = Number(expenseAmount)
    setExpenseError(null)
    setIsAddingExpense(true)

    const previousExpenses = asArray(expenses)
    const optimisticExpense = {
      id: `temp-${Date.now()}`,
      booking_id: booking.id,
      label,
      amount,
      created_at: new Date().toISOString(),
    }

    setExpenses((prev) => [...asArray(prev), optimisticExpense])
    setExpenseLabel('')
    setExpenseAmount('')

    try {
      const created = await api.addExpense(booking.id, { label, amount })
      setExpenses((prev) => [
        ...asArray(prev).filter((entry) => entry.id !== optimisticExpense.id),
        created,
      ])
    } catch (err) {
      setExpenses(previousExpenses)
      setExpenseLabel(label)
      setExpenseAmount(String(amount))
      setExpenseError(err.message ?? 'Something went wrong. Please try again.')
    } finally {
      setIsAddingExpense(false)
    }
  }

  const handleDeleteExpenseConfirm = async () => {
    if (!expenseToDelete || !booking?.id || isDeletingExpense) return

    setExpenseDeleteError(null)
    setIsDeletingExpense(true)
    const previousExpenses = asArray(expenses)
    const targetId = expenseToDelete.id

    setExpenses((prev) => asArray(prev).filter((entry) => entry.id !== targetId))

    try {
      await api.deleteExpense(booking.id, targetId)
      setExpenseToDelete(null)
    } catch (err) {
      setExpenses(previousExpenses)
      setExpenseDeleteError(err.message ?? 'Something went wrong. Please try again.')
    } finally {
      setIsDeletingExpense(false)
    }
  }

  const handleMarkCompletedConfirm = async () => {
    if (!booking?.id || isCompleting) return

    setCompleteError(null)
    setIsCompleting(true)

    try {
      const updated = await api.updateBookingStatus(booking.id, 'completed')
      setBooking((prev) => normalizeBookingDetail({ ...prev, ...updated }))
      updateBooking(updated)
      setShowCompleteConfirm(false)
    } catch (err) {
      setCompleteError(err.message ?? 'Something went wrong. Please try again.')
    } finally {
      setIsCompleting(false)
    }
  }

  const handleCancelConfirm = async () => {
    if (!booking?.id || isCancelling) return

    setCancelError(null)
    setIsCancelling(true)

    try {
      const updated = await api.updateBookingStatus(booking.id, 'cancelled')
      setBooking((prev) => normalizeBookingDetail({ ...prev, ...updated }))
      updateBooking(updated)
      setShowCancelConfirm(false)
    } catch (err) {
      setCancelError(err.message ?? 'Something went wrong. Please try again.')
    } finally {
      setIsCancelling(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!selectedBooking?.id || isDeleting) return

    setDeleteError(null)
    setIsDeleting(true)

    try {
      await api.deleteBooking(selectedBooking.id)
      removeBooking(selectedBooking.id)
      setShowDeleteConfirm(false)
      setDetailNoteDirty(false)
      forceCloseDetail()
    } catch (err) {
      setDeleteError(err.message ?? 'Something went wrong. Please try again.')
    } finally {
      setIsDeleting(false)
    }
  }

  if (!isDetailOpen || !selectedBooking) return null

  const display = booking ?? selectedBooking
  const status = display.status ?? 'confirmed'
  const statusClass = STATUS_STYLES[status] ?? STATUS_STYLES.confirmed
  const charsRemaining = MAX_NOTE_LENGTH - changeNote.length
  const inventoryReady = !isLoading && booking != null && bookingIdsMatch(booking.id, selectedBooking.id)
  const inventoryLines = asArray(inventoryReady ? booking?.inventory : [])
  const safeChangeLog = asArray(changeLog)
  const safeExpenses = asArray(inventoryReady ? expenses : [])
  const totalExpenses = safeExpenses.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0)
  const bookingTotal = Number(display.total ?? 0)
  const estimatedProfit = bookingTotal - totalExpenses
  const eventCountdown = getEventCountdownDisplay(display.event_date, status)

  return (
    <>
      <ModalDialog
        onClose={requestCloseDetail}
        busy={isLogging || isAddingExpense || isDeletingExpense || isCompleting || isCancelling || isDeleting}
        aria-labelledby="booking-detail-title"
        className="open:flex justify-end bg-black/50"
      >
      <div className="h-full w-full max-w-[480px] bg-white shadow-xl overflow-y-auto flex flex-col animate-[slideIn_0.2s_ease-out]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <h2 id="booking-detail-title" className="text-xl font-semibold text-slate-900">Booking Details</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => openModal('edit')}
              className="p-1 text-slate-500 hover:text-slate-900 transition-all duration-200"
              aria-label="Edit"
            >
              <Pencil className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={requestCloseDetail}
              className="p-1 text-slate-500 hover:text-slate-900 transition-all duration-200"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {fetchError && (
            <p role="alert" className="text-sm text-red-700 bg-red-100 border border-red-400 rounded-lg px-3 py-2">
              {fetchError}
            </p>
          )}

          <div className="bg-slate-50 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xl font-bold text-slate-900">{display.client_name}</p>
              <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass}`}>
                {formatStatus(status)}
              </span>
            </div>
            {eventCountdown && (
              <div className="mt-2">
                <span className={eventCountdown.className}>
                  {eventCountdown.showClock && <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                  {eventCountdown.label}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 mt-2 text-slate-600">
              <Phone className="w-4 h-4 shrink-0" />
              <span className="text-sm">{display.phone}</span>
            </div>
            {completeError && (
              <p role="alert" className="mt-2 text-sm text-red-700 bg-red-100 border border-red-400 rounded-lg px-3 py-2">
                {completeError}
              </p>
            )}
            {cancelError && (
              <p role="alert" className="mt-2 text-sm text-red-700 bg-red-100 border border-red-400 rounded-lg px-3 py-2">
                {cancelError}
              </p>
            )}
            {(status === 'confirmed' || status === 'pending') && (
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setCompleteError(null)
                    setCancelError(null)
                    setShowCompleteConfirm(true)
                  }}
                  className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 hover:bg-indigo-100"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  Mark as Completed
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCompleteError(null)
                    setCancelError(null)
                    setShowCancelConfirm(true)
                  }}
                  className="inline-flex items-center gap-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 hover:bg-red-100"
                >
                  <XCircle className="w-4 h-4 shrink-0" />
                  Cancel Booking
                </button>
              </div>
            )}
            {status === 'completed' && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-slate-500">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Event completed
              </p>
            )}
            {status === 'cancelled' && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-slate-500">
                <XCircle className="w-4 h-4 shrink-0" />
                Booking cancelled
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <DetailField label="Event Type" value={displayEventType(display)} />
            <DetailField label="Date" value={formatDisplayDate(display.event_date)} />
            <DetailField label="Guests" value={display.guest_count} />
            <DetailField label="Venue" value={display.venue?.trim() || '—'} />
          </div>

          {(() => {
            const pricedLines = inventoryReady
              ? inventoryLines.filter((line) => Number(line?.quantity ?? 0) > 0)
              : []
            const hasPricingData = pricedLines.some(
              (line) => Number(line?.unit_price ?? 0) > 0 || Number(line?.line_total ?? 0) > 0,
            ) || (display.subtotal ?? 0) > 0 || (display.grand_total ?? 0) > 0

            if (!inventoryReady) {
              return null
            }

            if (!hasPricingData && pricedLines.length === 0) {
              return (
                <div className="grid grid-cols-2 gap-4">
                  <DetailField label="Advance Paid" value={formatCurrency(display.advance)} />
                  <DetailField label="Total Amount" value={formatCurrency(display.total)} />
                </div>
              )
            }

            const subtotal = display.subtotal ?? pricedLines.reduce(
              (sum, line) => sum + (line.line_total ?? line.quantity * (line.unit_price ?? 0)),
              0,
            )
            const discount = display.discount ?? 0
            const grandTotal = display.grand_total ?? display.total ?? 0
            const balanceDue = Math.max(0, grandTotal - (display.advance ?? 0))

            return (
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-slate-800">Bill Summary</h3>

                {pricedLines.length === 0 ? (
                  <p className="text-sm text-slate-500">No inventory attached to this booking.</p>
                ) : (
                  <ul className="space-y-2 border-b border-slate-100 pb-3">
                    {pricedLines.map((line) => (
                      <li
                        key={line.item_id}
                        className="flex items-start justify-between text-sm gap-3"
                      >
                        <div>
                          <p className="text-slate-700">{line.name}</p>
                          <p className="text-xs text-slate-500">× {line.quantity}</p>
                        </div>
                        <div className="text-right shrink-0">
                          {(line.unit_price ?? 0) > 0 && (
                            <p className="text-xs text-slate-500">
                              {formatCurrency(line.unit_price)}/event
                            </p>
                          )}
                          <p className="font-medium text-slate-800">
                            {formatCurrency(line.line_total ?? line.quantity * (line.unit_price ?? 0))}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-medium text-slate-800">{formatCurrency(subtotal)}</span>
                </div>

                {discount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Discount</span>
                    <span className="font-medium text-slate-800">{formatCurrency(discount)}</span>
                  </div>
                )}

                <div className="flex justify-between pt-2 border-t border-slate-200">
                  <span className="text-sm font-bold text-slate-800">Total</span>
                  <span className="text-base font-bold text-teal-700">{formatCurrency(grandTotal)}</span>
                </div>

                <div className="flex justify-between text-sm pt-2 border-t border-slate-100">
                  <span className="text-slate-600">Advance Paid</span>
                  <span className="font-medium text-slate-800">{formatCurrency(display.advance)}</span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Balance Due</span>
                  <span className={`font-medium ${balanceDue > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {formatCurrency(balanceDue)}
                  </span>
                </div>
              </div>
            )
          })()}

          <div aria-busy={!inventoryReady}>
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Inventory Used</h3>
            {!inventoryReady ? (
              <InventoryUsedSkeleton />
            ) : inventoryLines.length === 0 ? (
              <p className="text-sm text-slate-500">No inventory attached to this booking.</p>
            ) : (
              <ul className="space-y-2">
                {inventoryLines.map((line) => (
                  <li
                    key={line.item_id}
                    className="flex items-center justify-between text-sm bg-slate-50 rounded-lg px-3 py-2"
                  >
                    <span className="text-slate-700">{line.name}</span>
                    <span className="font-medium text-slate-800">{line.quantity}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div aria-busy={!inventoryReady}>
            <div className="flex items-center gap-2 mb-3">
              <Receipt className="w-4 h-4 text-teal-600 shrink-0" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-800">Expenses & Profit</h3>
            </div>
            {!inventoryReady ? (
              <InventoryUsedSkeleton />
            ) : (
              <>
                {safeExpenses.length === 0 ? (
                  <p className="text-sm text-slate-500 mb-3">No expenses logged.</p>
                ) : (
                  <ul className="space-y-2 mb-3">
                    {safeExpenses.map((entry) => (
                      <li
                        key={entry.id}
                        className="flex items-center justify-between gap-3 text-sm bg-slate-50 rounded-lg px-3 py-2"
                      >
                        <span className="text-slate-700">{entry.label}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-semibold text-slate-800">{formatCurrency(entry.amount)}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setExpenseDeleteError(null)
                              setExpenseToDelete(entry)
                            }}
                            className="p-0.5 text-slate-400 hover:text-red-500 transition-all duration-200"
                            aria-label={`Delete ${entry.label}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <form onSubmit={handleAddExpense} className="space-y-2 mb-3">
                  {expenseError && (
                    <p role="alert" className="text-sm text-red-700 bg-red-100 border border-red-400 rounded-lg px-3 py-2">
                      {expenseError}
                    </p>
                  )}
                  {expenseDeleteError && (
                    <p role="alert" className="text-sm text-red-700 bg-red-100 border border-red-400 rounded-lg px-3 py-2">
                      {expenseDeleteError}
                    </p>
                  )}
                  <div className="flex flex-wrap items-end gap-2">
                    <input
                      type="text"
                      value={expenseLabel}
                      onChange={(e) => {
                        setExpenseLabel(e.target.value.slice(0, MAX_EXPENSE_LABEL_LENGTH))
                        if (expenseError) setExpenseError(null)
                      }}
                      placeholder="e.g. Labour, Transport"
                      className="flex-1 min-w-[140px] border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all duration-200"
                    />
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={expenseAmount}
                      onChange={(e) => {
                        setExpenseAmount(e.target.value)
                        if (expenseError) setExpenseError(null)
                      }}
                      placeholder="Amount"
                      className="w-28 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all duration-200"
                    />
                    <button
                      type="submit"
                      disabled={isAddingExpense}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
                        !isAddingExpense
                          ? 'bg-teal-600 hover:bg-teal-700 text-white'
                          : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {isAddingExpense && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Add
                    </button>
                  </div>
                </form>

                <p className="text-sm text-slate-600">
                  Total Expenses: {formatCurrency(totalExpenses)} | Estimated Profit:{' '}
                  <span className={`font-bold ${estimatedProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {formatCurrency(estimatedProfit)}
                  </span>
                </p>
              </>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Send to Client</h3>
            {whatsappError && (
              <p role="alert" className="text-sm text-red-700 bg-red-100 border border-red-400 rounded-lg px-3 py-2 mb-3">
                {whatsappError}
              </p>
            )}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleWhatsApp('confirmation')}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-white bg-green-600 hover:bg-green-700 transition-all duration-200"
              >
                <MessageCircle className="w-4 h-4" />
                Send Confirmation
              </button>
              <button
                type="button"
                onClick={() => handleWhatsApp('reminder')}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-white bg-amber-500 hover:bg-amber-600 transition-all duration-200"
              >
                <Bell className="w-4 h-4" />
                Send Payment Reminder
              </button>
              <button
                type="button"
                onClick={handleSelfWhatsApp}
                disabled={!merchantWhatsapp}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <Send className="w-4 h-4" />
                Send to My WhatsApp
              </button>
              {!merchantWhatsapp && profileStatus !== 'loading' && profileStatus !== 'idle' && (
                <p className="text-xs text-slate-500">
                  <button
                    type="button"
                    onClick={() => setActiveView('profile')}
                    className="font-medium text-teal-600 hover:text-teal-700 underline transition-all duration-200"
                  >
                    {profileStatus === 'error' ? "Couldn't load your WhatsApp number. Open Profile" : 'Add your WhatsApp number in Profile'}
                  </button>
                </p>
              )}
              {selfWhatsappError && (
                <p className="text-red-500 text-xs">{selfWhatsappError}</p>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Change Log</h3>
            <div className="space-y-3 mb-4">
              {safeChangeLog.length === 0 ? (
                <p className="text-sm text-slate-500">No changes logged yet.</p>
              ) : (
                safeChangeLog.map((entry) => (
                  <div key={entry.id} className="text-sm text-slate-600">
                    <p className="text-xs text-slate-500 mb-0.5">{formatLogTimestamp(entry.logged_at)}</p>
                    <p>{entry.change_note}</p>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleLogChange} className="space-y-2">
              {logError && (
                <p role="alert" className="text-sm text-red-700 bg-red-100 border border-red-400 rounded-lg px-3 py-2">
                  {logError}
                </p>
              )}
              <textarea
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
                placeholder="Log a change or note..."
                rows={3}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all duration-200 resize-none"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {charsRemaining} characters left
                </span>
                <button
                  type="submit"
                  disabled={!changeNote.trim() || isLogging}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                    changeNote.trim() && !isLogging
                      ? 'bg-teal-600 hover:bg-teal-700 text-white'
                      : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  {isLogging && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Log Change
                </button>
              </div>
            </form>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setDeleteError(null)
                setShowDeleteConfirm(true)
              }}
              className="inline-flex items-center gap-1.5 text-red-500 text-sm underline bg-transparent border-0 p-0 cursor-pointer hover:text-red-600 transition-all duration-200"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              Delete Booking
            </button>
            {deleteError && (
              <p role="alert" className="mt-2 text-sm text-red-700 bg-red-100 border border-red-400 rounded-lg px-3 py-2">
                {deleteError}
              </p>
            )}
          </div>
        </div>
      </div>
      </ModalDialog>

      <ConfirmDialog
        isOpen={notePromptOpen}
        title="Discard change note?"
        message="You have an unsaved change note. If you leave now, it will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        confirmVariant="danger"
        focusCancel
        onConfirm={discardNote}
        onCancel={keepNote}
      />

      <ConfirmDialog
        isOpen={showCompleteConfirm}
        title="Mark as Completed"
        message="Mark this booking as completed? This means the event has taken place."
        confirmLabel="Mark Completed"
        confirmingLabel="Updating..."
        isConfirming={isCompleting}
        onConfirm={handleMarkCompletedConfirm}
        onCancel={() => {
          if (!isCompleting) setShowCompleteConfirm(false)
        }}
      />

      <ConfirmDialog
        isOpen={showCancelConfirm}
        title="Cancel Booking"
        message="Cancel this booking? This cannot be undone. The booking will remain in your records as cancelled."
        confirmLabel="Yes, Cancel Booking"
        confirmVariant="danger"
        confirmingLabel="Cancelling..."
        isConfirming={isCancelling}
        onConfirm={handleCancelConfirm}
        onCancel={() => {
          if (!isCancelling) setShowCancelConfirm(false)
        }}
      />

      <ConfirmDialog
        isOpen={expenseToDelete != null}
        title="Delete Expense"
        message="Delete this expense?"
        confirmLabel="Delete"
        confirmVariant="danger"
        confirmingLabel="Deleting..."
        isConfirming={isDeletingExpense}
        onConfirm={handleDeleteExpenseConfirm}
        onCancel={() => {
          if (!isDeletingExpense) setExpenseToDelete(null)
        }}
      />

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Booking"
        message="Permanently delete this booking? This cannot be undone. All expenses, inventory, and change log entries for this booking will also be deleted."
        confirmLabel="Delete Permanently"
        confirmVariant="danger"
        confirmingLabel="Deleting..."
        isConfirming={isDeleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          if (!isDeleting) setShowDeleteConfirm(false)
        }}
      />
    </>
  )
}
