import { useAuthStore } from '../store/authStore'

const FALLBACK = 'Something went wrong. Please try again.'

// A profile call that failed with a dead session sends the merchant to the login screen. Returns true when it did.
export const expireIfSessionLost = (err) => {
  if (!err?.sessionExpired) return false
  useAuthStore.getState().expireSession()
  return true
}

// What to show for a failed call: the server's sentence (ApiError always carries one), else the generic fallback.
// A raw error object or a stack is never shown.
export const errorText = (err) => (typeof err?.status === 'number' && err.message ? err.message : FALLBACK)

// The usual catch block of a profile action: a lost session goes to login, anything else is shown through setError.
export const handleProfileError = (err, setError) => {
  if (expireIfSessionLost(err)) return
  setError?.(errorText(err))
}
