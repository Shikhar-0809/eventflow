import { create } from 'zustand'
import { api } from '../utils/api'
import {
  confirmDiscard,
  DISCARD_BOOKING_MESSAGE,
  DISCARD_CHANGE_NOTE_MESSAGE,
} from '../utils/discardConfirm.js'

const closePanelsState = {
  isDetailOpen: false,
  selectedBooking: null,
  isModalOpen: false,
  prefillDate: null,
  modalMode: 'create',
  modalFormDirty: false,
  detailNoteDirty: false,
}

export const useBookingStore = create((set, get) => ({
  bookings: [],
  selectedBooking: null,
  isModalOpen: false,
  isDetailOpen: false,
  prefillDate: null,
  modalMode: 'create',
  activeView: 'calendar',
  modalFormDirty: false,
  detailNoteDirty: false,

  postSaveConflictNotice: null,

  setBookings: (bookings) => set({ bookings }),
  addBooking: (booking) => set((state) => ({ bookings: [...state.bookings, booking] })),
  updateBooking: (booking) =>
    set((state) => ({
      bookings: state.bookings.map((row) => (row.id === booking.id ? booking : row)),
      selectedBooking:
        state.selectedBooking?.id === booking.id ? booking : state.selectedBooking,
    })),
  removeBooking: (id) =>
    set((state) => ({
      bookings: state.bookings.filter((row) => Number(row.id) !== Number(id)),
    })),
  setPostSaveConflictNotice: (postSaveConflictNotice) => set({ postSaveConflictNotice }),
  clearPostSaveConflictNotice: () => set({ postSaveConflictNotice: null }),
  setModalFormDirty: (modalFormDirty) => set({ modalFormDirty }),
  setDetailNoteDirty: (detailNoteDirty) => set({ detailNoteDirty }),
  setSelectedBooking: (booking) => set({ selectedBooking: booking, isDetailOpen: true }),
  setActiveView: (activeView) => {
    const state = get()
    if (state.isModalOpen && state.modalFormDirty && !confirmDiscard(DISCARD_BOOKING_MESSAGE)) {
      return
    }
    if (state.isDetailOpen && state.detailNoteDirty && !confirmDiscard(DISCARD_CHANGE_NOTE_MESSAGE)) {
      return
    }
    set({ activeView, ...closePanelsState })
  },
  openModal: (arg) => {
    if (arg === 'edit') {
      set({ isModalOpen: true, modalMode: 'edit', modalFormDirty: false })
      return
    }
    set({
      isModalOpen: true,
      modalMode: 'create',
      prefillDate: typeof arg === 'string' ? arg : null,
      modalFormDirty: false,
    })
  },
  closeModal: () => {
    const state = get()
    if (state.modalFormDirty && !confirmDiscard(DISCARD_BOOKING_MESSAGE)) {
      return
    }
    set({ isModalOpen: false, prefillDate: null, modalMode: 'create', modalFormDirty: false })
  },
  closeDetail: () => {
    const state = get()
    if (state.detailNoteDirty && !confirmDiscard(DISCARD_CHANGE_NOTE_MESSAGE)) {
      return
    }
    set({ isDetailOpen: false, selectedBooking: null, detailNoteDirty: false })
  },

  loadBookings: async () => {
    const bookings = await api.getBookings()
    set({ bookings })
    return bookings
  },
}))
