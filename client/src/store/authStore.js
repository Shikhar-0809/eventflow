import { create } from 'zustand'
import { api } from '../utils/api'
import { useBookingStore } from './bookingStore'
import { useInventoryStore } from './inventoryStore'
import { useSettingsStore } from './settingsStore'

// Cached bookings, inventory and settings belong to one merchant. Drop them whenever the session
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
    postSaveConflictNotice: null,
  })
  useInventoryStore.setState({ items: [] })
  useSettingsStore.setState({ monthlyRevenueTarget: null })
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
    set({ isAuthenticated: true, businessName: me.merchant?.business_name ?? null, connectionError: false })
  },

  signup: async (data) => {
    await api.signup(data)
    clearMerchantData()
    const me = await api.getMe()
    set({ isAuthenticated: true, businessName: me.merchant?.business_name ?? null, connectionError: false })
  },

  logout: async () => {
    try {
      await api.logout()
    } finally {
      clearMerchantData()
      set({ isAuthenticated: false, businessName: null })
    }
  },
}))
