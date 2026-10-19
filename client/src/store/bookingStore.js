import { create } from 'zustand'
import { api } from '../utils/api'

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
  notePromptOpen: false,
  notePendingView: null,
}

const closeDetailState = {
  isDetailOpen: false,
  selectedBooking: null,
  detailNoteDirty: false,
  notePromptOpen: false,
  notePendingView: null,
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
  notePromptOpen: false,
  notePendingView: null,

  postSaveConflictNotice: null,

  // Bumped after every booking create, edit, status change or delete has succeeded. Views that show server-computed
  // numbers (Sidebar revenue bar and badge, Analytics) refetch when it changes; see BUGS #097.
  analyticsVersion: 0,

  setBookings: (bookings) => set({ bookings }),
  addBooking: (booking) =>
    set((state) => ({ bookings: [...state.bookings, booking], analyticsVersion: state.analyticsVersion + 1 })),
  updateBooking: (booking) =>
    set((state) => ({
      bookings: state.bookings.map((row) => (row.id === booking.id ? booking : row)),
      selectedBooking:
        state.selectedBooking?.id === booking.id ? booking : state.selectedBooking,
      analyticsVersion: state.analyticsVersion + 1,
    })),
  removeBooking: (id) =>
    set((state) => ({
      bookings: state.bookings.filter((row) => Number(row.id) !== Number(id)),
      analyticsVersion: state.analyticsVersion + 1,
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
    if (state.isDetailOpen && state.detailNoteDirty) {
      set({ notePromptOpen: true, notePendingView: activeView })
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
  // Unconditional close: use after a delete or when the session ended.
  forceCloseDetail: () => set(closeDetailState),
  // Guarded close (X, backdrop): asks first only when a change note is half-typed.
  requestCloseDetail: () => {
    if (!get().detailNoteDirty) {
      set(closeDetailState)
      return
    }
    set({ notePromptOpen: true, notePendingView: null })
  },
  keepNote: () => set({ notePromptOpen: false, notePendingView: null }),
  discardNote: () => {
    const { notePendingView } = get()
    set(closeDetailState)
    if (notePendingView) get().setActiveView(notePendingView)
  },

  loadBookings: async () => {
    const bookings = await api.getBookings()
    set({ bookings })
    return bookings
  },
}))
