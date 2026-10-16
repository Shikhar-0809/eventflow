import { create } from 'zustand'
import { api } from '../utils/api'

const EMPTY = { profile: null, status: 'idle', error: null }

let inFlight = null

// The logged-in merchant's profile (masked email, business name, WhatsApp number, counts). Fetched once after login and
// again whenever the Profile screen opens; replaced wholesale after a save. Never holds a password or a full email.
// loadProfile rethrows so the caller can handle a 401 (this store must not import authStore: authStore resets it).
export const useProfileStore = create((set) => ({
  ...EMPTY,

  loadProfile: () => {
    if (inFlight) return inFlight
    set((state) => ({ status: state.profile ? state.status : 'loading', error: null }))
    inFlight = api
      .getProfile()
      .then((profile) => set({ profile, status: 'ready', error: null }))
      .catch((err) => {
        set((state) => ({ status: state.profile ? 'ready' : 'error', error: err.message }))
        throw err
      })
      .finally(() => {
        inFlight = null
      })
    return inFlight
  },

  setProfile: (profile) => set({ profile, status: 'ready', error: null }),

  reset: () => {
    inFlight = null
    set(EMPTY)
  },
}))
