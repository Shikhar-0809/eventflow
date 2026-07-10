import { create } from 'zustand'
import { api } from '../utils/api'

export const useSettingsStore = create((set) => ({
  monthlyRevenueTarget: null,

  loadSettings: async () => {
    try {
      const data = await api.getSettings()
      const parsed = Number.parseInt(data.monthly_revenue_target, 10)
      set({ monthlyRevenueTarget: Number.isFinite(parsed) ? parsed : 0 })
    } catch {
      set({ monthlyRevenueTarget: null })
    }
  },

  setMonthlyRevenueTarget: (monthlyRevenueTarget) => set({ monthlyRevenueTarget }),
}))
