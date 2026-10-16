import { create } from 'zustand'
import { api } from '../utils/api'
import { useBookingStore } from './bookingStore'
import { useInventoryStore } from './inventoryStore'
import { useProfileStore } from './profileStore'
import { useSettingsStore } from './settingsStore'

const ACCOUNT_DELETED_NOTICE = 'Your account has been deleted.'

// Cached bookings, inventory, settings and profile belong to one merchant. Drop them whenever the session
// changes so the next merchant on this browser never sees the previous merchant's data.
const clearMerchantData = () => {
  useBookingStore.setState({
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
  })
  useInventoryStore.setState({ items: [] })
  useSettingsStore.setState({ monthlyRevenueTarget: null })
  useProfileStore.getState().reset()
}

const isConnectionFailure = (err) =>
  !err?.status ||
  err.status === 0 ||
  err.status >= 500 ||
  (typeof err?.message === 'string' && err.message.includes('Failed to fetch'))

export const useAuthStore = create((set) => ({
  isAuthenticated: false,
  businessName: null,
  isLoading: true,
  connectionError: false,
  // One-off green message for the login screen (set after an account is deleted).
  loginNotice: null,

  checkAuth: async () => {
    set({ isLoading: true })
    try {
      const me = await api.getMe()
      set({
        isAuthenticated: true,
        businessName: me.merchant?.business_name ?? null,
        isLoading: false,
        connectionError: false,
      })
    } catch (err) {
      if (isConnectionFailure(err)) {
        set({ connectionError: true, isLoading: false })
      } else {
        clearMerchantData()
        set({ isAuthenticated: false, businessName: null, isLoading: false, connectionError: false })
      }
    }
  },

  login: async (email, password) => {
    await api.login(email, password)
    clearMerchantData()
    const me = await api.getMe()
    set({ isAuthenticated: true, businessName: me.merchant?.business_name ?? null, connectionError: false, loginNotice: null })
  },

  signup: async (data) => {
    await api.signup(data)
    clearMerchantData()
    const me = await api.getMe()
    set({ isAuthenticated: true, businessName: me.merchant?.business_name ?? null, connectionError: false, loginNotice: null })
  },

  logout: async () => {
    try {
      await api.logout()
    } finally {
      clearMerchantData()
      set({ isAuthenticated: false, businessName: null })
    }
  },

  // A call found the session dead (another device signed this one out, or it expired): back to login.
  expireSession: () => {
    clearMerchantData()
    set({ isAuthenticated: false, businessName: null, isLoading: false })
  },

  // The account was just deleted (the server already cleared the cookie): drop every cached store, show the notice.
  accountDeleted: () => {
    clearMerchantData()
    set({ isAuthenticated: false, businessName: null, isLoading: false, loginNotice: ACCOUNT_DELETED_NOTICE })
  },

  setBusinessName: (businessName) => set({ businessName }),

  clearLoginNotice: () => set({ loginNotice: null }),
}))
