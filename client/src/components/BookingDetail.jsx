import { useEffect, useState } from 'react'
import { X, Phone, MessageCircle, Bell, Loader2, Pencil, Clock, Receipt, Trash2 } from 'lucide-react'
import { useBookingStore } from '../store/bookingStore'
import { useAuthStore } from '../store/authStore'
import { api } from '../utils/api'
import { formatCurrency } from '../utils/formatCurrency'
import { getDaysUntilEvent } from '../utils/dateHelpers'
import { ConfirmDialog } from './ConfirmDialog'
import {
  confirmationMessage,
  paymentReminderMessage,
  validatePhoneForWhatsApp,
} from '../utils/whatsapp'

const MAX_NOTE_LENGTH = 500

const STATUS_STYLES = {
  confirmed: 'bg-teal-100 text-teal-800',
  pending: 'bg-amber-100 text-amber-800',
  cancelled: 'bg-red-100 text-red-700',
}

const STATUS_LABELS = {
  confirmed: 'Confirmed',
  pending: 'Pending',
  cancelled: 'Cancelled',
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
  if (bookingStatus === 'cancelled') return null

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
    className: 'text-sm text-slate-400 bg-slate-50',
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
    <p className="text-xs text-slate-400 mb-0.5">{label}</p>
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
  const { isDetailOpen, selectedBooking, closeDetail, setDetailNoteDirty, openModal } = useBookingStore()
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
          closeDetail()
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
  }, [isDetailOpen, selectedBooking?.id, closeDetail, setDetailNoteDirty])

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
    const target = booking ?? selectedBooking
    if (!target) return

    if (!validatePhoneForWhatsApp(target.phone)) {
      setWhatsappError('Something went wrong. Please try again.')
      return
    }

    const url = type === 'confirmation'
      ? confirmationMessage(target)
      : paymentReminderMessage(target)

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
    <div className="absolute inset-0 z-50 flex justify-end pointer-events-none">
      <div className="absolute inset-0 bg-black/40 pointer-events-none" aria-hidden="true" />
      <div className="relative w-full max-w-[420px] h-full bg-white shadow-xl border-l border-slate-200 flex flex-col animate-[slideIn_0.2s_ease-out] pointer-events-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-xl font-semibold text-slate-900">Booking Details</h2>
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
              onClick={closeDetail}
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
                  <p className="text-sm text-slate-400">No inventory attached to this booking.</p>
                ) : (
                  <ul className="space-y-2 border-b border-slate-100 pb-3">
                    {pricedLines.map((line) => (
                      <li
                        key={line.item_id}
                        className="flex items-start justify-between text-sm gap-3"
                      >
                        <div>
                          <p className="text-slate-700">{line.name}</p>
                          <p className="text-xs text-slate-400">× {line.quantity}</p>
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
              <p className="text-sm text-slate-400">No inventory attached to this booking.</p>
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
                  <p className="text-sm text-slate-400 mb-3">No expenses logged.</p>
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
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Change Log</h3>
            <div className="space-y-3 mb-4">
              {safeChangeLog.length === 0 ? (
                <p className="text-sm text-slate-400">No changes logged yet.</p>
              ) : (
                safeChangeLog.map((entry) => (
                  <div key={entry.id} className="text-sm text-slate-600">
                    <p className="text-xs text-slate-400 mb-0.5">{formatLogTimestamp(entry.logged_at)}</p>
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
                <span className="text-xs text-slate-400">
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
        </div>
      </div>

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
    </div>
  )
}
