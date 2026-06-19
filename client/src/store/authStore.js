import { create } from 'zustand'
import { api } from '../utils/api'

export const useAuthStore = create((set) => ({
  isAuthenticated: false,
  isLoading: true,

  checkAuth: async () => {
    set({ isLoading: true })
    try {
      await api.getMe()
      set({ isAuthenticated: true, isLoading: false })
    } catch {
      set({ isAuthenticated: false, isLoading: false })
    }
  },

  login: async (password) => {
    await api.login(password)
    await api.getMe()
    set({ isAuthenticated: true })
  },

  logout: async () => {
    await api.logout()
    set({ isAuthenticated: false })
  },
}))
