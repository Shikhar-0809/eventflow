import { create } from 'zustand'
import { api } from '../utils/api'

const isConnectionFailure = (err) =>
  !err?.status ||
  err.status === 0 ||
  err.status >= 500 ||
  (typeof err?.message === 'string' && err.message.includes('Failed to fetch'))

export const useAuthStore = create((set) => ({
  isAuthenticated: false,
  isLoading: true,
  connectionError: false,

  checkAuth: async () => {
    set({ isLoading: true })
    try {
      await api.getMe()
      set({ isAuthenticated: true, isLoading: false, connectionError: false })
    } catch (err) {
      if (isConnectionFailure(err)) {
        set({ connectionError: true, isLoading: false })
      } else {
        set({ isAuthenticated: false, isLoading: false, connectionError: false })
      }
    }
  },

  login: async (password) => {
    await api.login(password)
    await api.getMe()
    set({ isAuthenticated: true, connectionError: false })
  },

  logout: async () => {
    try {
      await api.logout()
    } finally {
      set({ isAuthenticated: false })
    }
  },
}))
