import { create } from 'zustand'
import { api } from '../utils/api'
import {
  confirmDiscard,
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
  discardPromptOpen: false,
  pendingView: null,
}

const closeModalState = {
  isModalOpen: false,
  prefillDate: null,
  modalMode: 'create',
  modalFormDirty: false,
  discardPromptOpen: false,
  pendingView: null,
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
  discardPromptOpen: false,
  pendingView: null,

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
    if (state.isModalOpen && state.modalFormDirty) {
      set({ discardPromptOpen: true, pendingView: activeView })
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
  // Unconditional close: use after a successful save or when the form cannot render its own dialog.
  forceCloseModal: () => set(closeModalState),
  // Guarded close (X button, Escape): asks first only when the form has unsaved changes.
  requestCloseModal: () => {
    if (!get().modalFormDirty) {
      set(closeModalState)
      return
    }
    set({ discardPromptOpen: true, pendingView: null })
  },
  keepEditing: () => set({ discardPromptOpen: false, pendingView: null }),
  discardChanges: () => {
    const { pendingView } = get()
    set(closeModalState)
    if (pendingView) get().setActiveView(pendingView)
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
