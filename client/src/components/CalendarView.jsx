import { useEffect, useMemo, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import { AlertTriangle, Loader2, Plus, Search, Sparkles, X } from 'lucide-react'
import { useBookingStore } from '../store/bookingStore'
import { useAuthStore } from '../store/authStore'
import { api } from '../utils/api'
import { formatCurrency } from '../utils/formatCurrency'
import { getDaysUntilEvent } from '../utils/dateHelpers'

const STATUS_COLORS = {
  confirmed: '#0f766e',
  pending: '#d97706',
  cancelled: '#dc2626',
  completed: '#6366f1',
}

const EVENT_TYPE_LABELS = {
  wedding: 'Wedding',
  birthday: 'Birthday',
  corporate: 'Corporate',
  other: 'Other',
}

const formatEventType = (type) => EVENT_TYPE_LABELS[type] ?? 'Other'

const eventTypeLabel = (booking) =>
  booking.event_type === 'other' && booking.event_type_custom
    ? booking.event_type_custom
    : formatEventType(booking.event_type)

const pad = (n) => String(n).padStart(2, '0')

const getGreeting = (businessName) => {
  const hour = new Date().getHours()
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  return businessName ? `Good ${timeOfDay}, ${businessName}!` : `Good ${timeOfDay}!`
}

const getMondaySundayWeek = () => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dayOfWeek = today.getDay()
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const monday = new Date(today)
  monday.setDate(today.getDate() - daysFromMonday)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const format = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return { weekStart: format(monday), weekEnd: format(sunday) }
}

const buildBriefingLines = (bookings) => {
  if (!Array.isArray(bookings) || bookings.length === 0) return []

  const todayStr = new Date().toISOString().split('T')[0]
  const { weekStart, weekEnd } = getMondaySundayWeek()
  const active = bookings.filter((booking) => booking.status !== 'cancelled')
  const lines = []

  const weekCount = active.filter((booking) => {
    const eventDate = String(booking.event_date).slice(0, 10)
    return eventDate >= weekStart && eventDate <= weekEnd
  }).length
  if (weekCount > 0) {
    lines.push(`${weekCount} event${weekCount === 1 ? '' : 's'} this week`)
  }

  const pendingBalance = active
    .filter((booking) => String(booking.event_date).slice(0, 10) >= todayStr)
    .reduce((sum, booking) => {
      const total = Number(booking.total ?? 0)
      const advance = Number(booking.advance ?? 0)
      return sum + Math.max(0, total - advance)
    }, 0)
  if (pendingBalance > 0) {
    lines.push(`${formatCurrency(pendingBalance)} in pending balances`)
  }

  const nextEvent = active
    .filter((booking) => String(booking.event_date).slice(0, 10) >= todayStr)
    .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)))[0]

  if (nextEvent) {
    const daysUntil = getDaysUntilEvent(nextEvent.event_date)
    if (daysUntil != null && daysUntil >= 0 && daysUntil <= 14) {
      let whenLabel
      if (daysUntil === 0) whenLabel = 'today'
      else if (daysUntil === 1) whenLabel = 'tomorrow'
      else whenLabel = `in ${daysUntil} days`
      lines.push(`Next event ${whenLabel} — ${nextEvent.client_name}'s ${eventTypeLabel(nextEvent)}`)
    }
  }

  return lines.slice(0, 3)
}

const FADED_EVENT_COLOR = '#94a3b8'

const bookingMatchesSearch = (booking, query) => {
  const q = query.trim().toLowerCase()
  if (!q) return true

  const clientName = String(booking.client_name ?? '').toLowerCase()
  const eventType = String(booking.event_type ?? '').toLowerCase()
  const venue = String(booking.venue ?? '').toLowerCase()

  return clientName.includes(q) || eventType.includes(q) || venue.includes(q)
}

const toCalendarEvents = (bookings, { faded = false } = {}) =>
  bookings.map((booking) => {
    const color = faded
      ? FADED_EVENT_COLOR
      : (STATUS_COLORS[booking.status] ?? STATUS_COLORS.confirmed)
    return {
      title: `${booking.client_name} — ${eventTypeLabel(booking)}`,
      date: booking.event_date,
      backgroundColor: color,
      borderColor: color,
      extendedProps: { booking, status: booking.status, faded },
    }
  })

const buildCalendarEvents = (bookings, searchQuery) => {
  const trimmed = searchQuery.trim()
  if (!trimmed) {
    return toCalendarEvents(bookings)
  }

  const matching = bookings.filter((booking) => bookingMatchesSearch(booking, trimmed))
  const nonMatching = bookings.filter((booking) => !bookingMatchesSearch(booking, trimmed))

  return [
    ...toCalendarEvents(matching),
    ...toCalendarEvents(nonMatching, { faded: true }),
  ]
}

export const CalendarView = () => {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isBriefingDismissed, setIsBriefingDismissed] = useState(false)
  const [isBriefingExiting, setIsBriefingExiting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const { bookings, setBookings, setSelectedBooking, openModal, postSaveConflictNotice, clearPostSaveConflictNotice } = useBookingStore()
  const businessName = useAuthStore((state) => state.businessName)

  useEffect(() => {
    if (searchQuery === '') {
      setDebouncedSearchQuery('')
      return undefined
    }

    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  const calendarEvents = useMemo(
    () => buildCalendarEvents(bookings, debouncedSearchQuery),
    [bookings, debouncedSearchQuery],
  )

  const activeSearch = debouncedSearchQuery.trim()
  const matchingCount = useMemo(() => {
    if (!activeSearch) return 0
    return bookings.filter((booking) => bookingMatchesSearch(booking, activeSearch)).length
  }, [bookings, activeSearch])

  const briefingLines = useMemo(
    () => (isLoading ? [] : buildBriefingLines(bookings)),
    [bookings, isLoading],
  )
  const showBriefing = !isBriefingDismissed && briefingLines.length > 0

  const handleDismissBriefing = () => {
    setIsBriefingExiting(true)
    setTimeout(() => setIsBriefingDismissed(true), 150)
  }

  const fetchBookings = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await api.getBookings()
      setBookings(data)
    } catch (err) {
      console.error('[CalendarView] fetchBookings failed:', err)
      if (err.status === 401) {
        useAuthStore.setState({ isAuthenticated: false, isLoading: false })
        return
      }
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchBookings()
  }, [])

  useEffect(() => {
    if (!postSaveConflictNotice) return undefined
    const timer = setTimeout(() => clearPostSaveConflictNotice(), 6000)
    return () => clearTimeout(timer)
  }, [postSaveConflictNotice, clearPostSaveConflictNotice])

  const handleEventClick = (info) => {
    const booking = info.event.extendedProps.booking
    if (booking) {
      setSelectedBooking(booking)
    }
  }

  const handleDateClick = (info) => {
    openModal(info.dateStr)
  }

  const handleClearSearch = () => {
    setSearchQuery('')
    setDebouncedSearchQuery('')
  }

  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
        <p className="text-sm text-slate-500">Loading bookings...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8 text-center max-w-md">
          <p className="text-red-700 bg-red-100 border border-red-400 rounded-lg px-4 py-3 text-sm">
            Could not load bookings. Please try again.
          </p>
          <button
            type="button"
            onClick={fetchBookings}
            className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-all duration-200"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col p-4 md:p-6 min-w-0">
      {postSaveConflictNotice && (
        <div
          role="status"
          className="mb-4 shrink-0 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-800 text-sm flex items-start gap-2"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="flex-1">
            Conflict: {postSaveConflictNotice.client_name}&apos;s{' '}
            {formatEventType(postSaveConflictNotice.event_type)} is already booked on this date.
          </p>
          <button
            type="button"
            onClick={clearPostSaveConflictNotice}
            className="p-0.5 text-red-600 hover:text-red-900 shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 h-full fc-wrapper flex flex-col min-h-0">
          {showBriefing && (
            <div
              className={`relative bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-100 rounded-xl p-4 mb-4 shrink-0 transition-opacity duration-150 ${
                isBriefingExiting ? 'opacity-0' : 'opacity-100'
              }`}
            >
              <button
                type="button"
                onClick={handleDismissBriefing}
                className="absolute top-3 right-3 p-0.5 text-slate-400 hover:text-slate-600 transition-all duration-200"
                aria-label="Dismiss briefing"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 pr-6">
                <Sparkles className="w-5 h-5 text-teal-500 shrink-0" aria-hidden="true" />
                <p className="text-slate-800 font-semibold">{getGreeting(businessName)}</p>
              </div>
              <ul className="mt-2 space-y-1 pl-7">
                {briefingLines.map((line) => (
                  <li key={line} className="text-sm text-slate-600">
                    · {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4 shrink-0">
            <h1 className="text-xl md:text-2xl font-bold text-slate-800 shrink-0">Booking Calendar</h1>
            <div className="flex flex-col sm:flex-row sm:items-start gap-3 w-full sm:w-auto sm:justify-end">
              <div className="flex flex-col">
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search bookings..."
                    className="border border-slate-300 rounded-lg pl-9 pr-8 py-2 text-sm w-full sm:w-64 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all duration-200"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 transition-all duration-200"
                      aria-label="Clear search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {activeSearch && (
                  <p className={`mt-1 text-xs ${matchingCount === 0 ? 'text-red-500' : 'text-slate-500'}`}>
                    {matchingCount === 0
                      ? 'No bookings found'
                      : `${matchingCount} booking${matchingCount === 1 ? '' : 's'} found`}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => openModal()}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-all duration-200 shrink-0"
              >
                <Plus className="w-4 h-4" />
                New Booking
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0">
            <FullCalendar
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
              height="100%"
              events={calendarEvents}
              eventClick={handleEventClick}
              dateClick={handleDateClick}
              eventMouseEnter={(info) => {
                info.el.style.cursor = 'pointer'
              }}
              eventDidMount={(info) => {
                if (info.event.extendedProps.faded) {
                  info.el.style.opacity = '0.25'
                } else if (info.event.extendedProps.status === 'completed') {
                  info.el.style.opacity = '0.75'
                } else {
                  info.el.style.opacity = '1'
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
