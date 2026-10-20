// A UI hint, not a token: "this browser had a session recently". The session cookie is httpOnly, so pages that must not
// call the API (the landing page, later) read this instead. It holds no personal data. Set on a successful login or
// /api/auth/me, cleared on logout, on any 401 and after account deletion. A stale hint costs one step (DIRECTIONS.md 3.3).
const KEY = 'ef:signedIn'

export const setSignedInHint = () => {
  try {
    window.localStorage.setItem(KEY, '1')
  } catch {
    // Private browsing or blocked storage: the hint is optional.
  }
}

export const clearSignedInHint = () => {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // Same as above.
  }
}
