import { useEffect, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import { AlertTriangle, Loader2, Plus, X } from 'lucide-react'
import { useBookingStore } from '../store/bookingStore'
import { useAuthStore } from '../store/authStore'
import { api } from '../utils/api'

const STATUS_COLORS = {
  confirmed: '#0f766e',
  pending: '#d97706',
  cancelled: '#dc2626',
}

const EVENT_TYPE_LABELS = {
  wedding: 'Wedding',
  birthday: 'Birthday',
  corporate: 'Corporate',
  other: 'Other',
}

const formatEventType = (type) => EVENT_TYPE_LABELS[type] ?? 'Other'

const toCalendarEvents = (bookings) =>
  bookings.map((booking) => {
    const color = STATUS_COLORS[booking.status] ?? STATUS_COLORS.confirmed
    return {
      title: `${booking.client_name} — ${booking.event_type}`,
      date: booking.event_date,
      backgroundColor: color,
      borderColor: color,
      extendedProps: { booking },
    }
  })

export const CalendarView = () => {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const { bookings, setBookings, setSelectedBooking, openModal, postSaveConflictNotice, clearPostSaveConflictNotice } = useBookingStore()

  const fetchBookings = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await api.getBookings()
      setBookings(data)
    } catch (err) {
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 shrink-0">
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Booking Calendar</h1>
        <button
          type="button"
          onClick={() => openModal()}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-all duration-200"
        >
          <Plus className="w-4 h-4" />
          New Booking
        </button>
      </div>

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
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 h-full fc-wrapper">
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
            height="100%"
            events={toCalendarEvents(bookings)}
            eventClick={handleEventClick}
            dateClick={handleDateClick}
            eventMouseEnter={(info) => {
              info.el.style.cursor = 'pointer'
            }}
          />
        </div>
      </div>
    </div>
  )
}
