import { useEffect, useState } from 'react'
import { X, Phone, MessageCircle, Bell, Loader2, Pencil } from 'lucide-react'
import { useBookingStore } from '../store/bookingStore'
import { useAuthStore } from '../store/authStore'
import { useLangStore } from '../store/langStore'
import { api } from '../utils/api'
import { formatCurrency } from '../utils/formatCurrency'
import { eventTypeLabel, statusLabel, t } from '../utils/i18n'
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

const formatDisplayDate = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00`)
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

export const BookingDetail = () => {
  const { isDetailOpen, selectedBooking, closeDetail, setDetailNoteDirty, openModal } = useBookingStore()
  const { lang } = useLangStore()
  const [booking, setBooking] = useState(null)
  const [changeLog, setChangeLog] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [fetchError, setFetchError] = useState(null)
  const [changeNote, setChangeNote] = useState('')
  const [isLogging, setIsLogging] = useState(false)
  const [logError, setLogError] = useState(null)
  const [whatsappError, setWhatsappError] = useState(null)

  useEffect(() => {
    if (!isDetailOpen || !selectedBooking?.id) return

    setChangeNote('')
    setLogError(null)
    setWhatsappError(null)
    setFetchError(null)
    setDetailNoteDirty(false)
    setBooking(null)
    setChangeLog([])
    setIsLoading(true)

    const loadDetail = async () => {
      try {
        const data = await api.getBooking(selectedBooking.id)
        setBooking(data)
        setChangeLog(data.change_log ?? [])
      } catch (err) {
        if (err.status === 401) {
          useAuthStore.setState({ isAuthenticated: false, isLoading: false })
          closeDetail()
          return
        }
        setFetchError(err.message)
        setBooking(selectedBooking)
        setChangeLog([])
      } finally {
        setIsLoading(false)
      }
    }

    loadDetail()
  }, [isDetailOpen, selectedBooking?.id, closeDetail, setDetailNoteDirty])

  useEffect(() => {
    if (!isDetailOpen || !selectedBooking?.id) return
    setBooking((prev) => {
      if (prev?.id !== selectedBooking.id) return null
      return { ...prev, ...selectedBooking, change_log: prev.change_log ?? [] }
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
      setWhatsappError(t(lang, 'errorGeneric'))
      return
    }

    const url = type === 'confirmation'
      ? confirmationMessage(target)
      : paymentReminderMessage(target)

    if (!url) {
      setWhatsappError(t(lang, 'errorGeneric'))
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
    const previousLog = changeLog
    const optimisticEntry = {
      id: `temp-${Date.now()}`,
      booking_id: booking.id,
      change_note: note,
      logged_at: new Date().toISOString(),
    }

    setChangeLog((prev) => [...prev, optimisticEntry])
    setChangeNote('')
    setIsLogging(true)

    try {
      const updatedLog = await api.logChange(booking.id, note)
      setChangeLog(updatedLog)
    } catch (err) {
      setChangeLog(previousLog)
      setChangeNote(note)
      setLogError(err.message)
    } finally {
      setIsLogging(false)
    }
  }

  if (!isDetailOpen || !selectedBooking) return null

  const display = booking ?? selectedBooking
  const status = display.status ?? 'confirmed'
  const statusClass = STATUS_STYLES[status] ?? STATUS_STYLES.confirmed
  const charsRemaining = MAX_NOTE_LENGTH - changeNote.length
  const inventoryReady = !isLoading && booking?.id === selectedBooking.id
  const inventoryLines = booking?.inventory ?? []

  return (
    <div className="absolute inset-0 z-50 flex justify-end pointer-events-none">
      <div className="absolute inset-0 bg-black/40 pointer-events-none" aria-hidden="true" />
      <div className="relative w-full max-w-[420px] h-full bg-white shadow-xl border-l border-slate-200 flex flex-col animate-[slideIn_0.2s_ease-out] pointer-events-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-xl font-semibold text-slate-900">{t(lang, 'detailTitle')}</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => openModal('edit')}
              className="p-1 text-slate-500 hover:text-slate-900 transition-all duration-200"
              aria-label={t(lang, 'editBookingButton')}
            >
              <Pencil className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={closeDetail}
              className="p-1 text-slate-500 hover:text-slate-900 transition-all duration-200"
              aria-label={t(lang, 'close')}
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
                {statusLabel(lang, status)}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2 text-slate-600">
              <Phone className="w-4 h-4 shrink-0" />
              <span className="text-sm">{display.phone}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <DetailField label={t(lang, 'detailEventType')} value={eventTypeLabel(lang, display.event_type)} />
            <DetailField label={t(lang, 'detailDate')} value={formatDisplayDate(display.event_date)} />
            <DetailField label={t(lang, 'detailGuests')} value={display.guest_count} />
            <DetailField label={t(lang, 'detailVenue')} value={display.venue?.trim() || '—'} />
            <DetailField label={t(lang, 'detailAdvance')} value={formatCurrency(display.advance)} />
            <DetailField label={t(lang, 'detailTotal')} value={formatCurrency(display.total)} />
          </div>

          <div aria-busy={!inventoryReady}>
            <h3 className="text-sm font-semibold text-slate-800 mb-3">{t(lang, 'detailSectionInventory')}</h3>
            {!inventoryReady ? (
              <InventoryUsedSkeleton />
            ) : inventoryLines.length === 0 ? (
              <p className="text-sm text-slate-400">{t(lang, 'noInventoryAttached')}</p>
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

          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-3">{t(lang, 'detailSectionWhatsApp')}</h3>
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
                {t(lang, 'whatsappConfirm')}
              </button>
              <button
                type="button"
                onClick={() => handleWhatsApp('reminder')}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-white bg-amber-500 hover:bg-amber-600 transition-all duration-200"
              >
                <Bell className="w-4 h-4" />
                {t(lang, 'whatsappReminder')}
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-3">{t(lang, 'detailSectionChangeLog')}</h3>
            <div className="space-y-3 mb-4">
              {changeLog.length === 0 ? (
                <p className="text-sm text-slate-400">{t(lang, 'changeLogEmpty')}</p>
              ) : (
                changeLog.map((entry) => (
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
                placeholder={t(lang, 'changeLogPlaceholder')}
                rows={3}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all duration-200 resize-none"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {charsRemaining} {t(lang, 'changeLogCharsLeft')}
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
                  {t(lang, 'changeLogButton')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
