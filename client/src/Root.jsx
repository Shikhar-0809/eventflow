import { lazy, Suspense, useEffect, useState } from 'react'
import { useAuthStore } from './store/authStore'
import { LoginScreen } from './components/LoginScreen'
import { SignupScreen } from './components/SignupScreen'
import { PrivacyPolicyPage } from './components/PrivacyPolicyPage'
import { NotFoundPage } from './components/NotFoundPage'
import { ScreenBoundary } from './components/ScreenBoundary'
import { maskEmail } from './utils/maskEmail'
import { matchRoute, navigate, safeNext, useLocation } from './utils/router'

// The logged-in app (FullCalendar, recharts, jsPDF, html2canvas, xlsx) is its own bundle: the public screens below
// never download it.
const App = lazy(() => import('./App.jsx'))
const ForgotPasswordScreen = lazy(() =>
  import('./components/ForgotPasswordScreen').then((module) => ({ default: module.ForgotPasswordScreen })),
)

const AUTH_TITLES = {
  login: 'Sign in — EventFlow',
  signup: 'Create account — EventFlow',
  forgot: 'Reset password — EventFlow',
}

const Loading = () => (
  <div className="h-screen bg-slate-50 flex items-center justify-center">
    <p className="text-slate-500">Loading...</p>
  </div>
)

// Decides which screen a path shows, above App. Only /app calls the API (checkAuth, inside App); the public screens
// make no request until the visitor submits something.
export default function Root() {
  const location = useLocation()
  const route = matchRoute(window.location.pathname)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const storeNotice = useAuthStore((state) => state.loginNotice)
  const clearLoginNotice = useAuthStore((state) => state.clearLoginNotice)
  // One-off green message and email prefill on the login screen (after a password reset). Lives here, above the
  // routes, so it survives the navigation from /forgot-password to /login.
  const [loginNotice, setLoginNotice] = useState(null)
  const [loginEmail, setLoginEmail] = useState('')

  const isAuthRoute = route === 'login' || route === 'signup' || route === 'forgot'

  // The landing page is not built yet: "/" goes to the app so existing bookmarks keep working.
  useEffect(() => {
    if (route === 'landing') navigate('/app', { replace: true })
  }, [route, location])

  // A session that exists (just logged in or signed up) leaves the auth screens for ?next= (same-origin paths only).
  useEffect(() => {
    if (!isAuthRoute || !isAuthenticated) return
    navigate(safeNext(new URLSearchParams(window.location.search).get('next')), { replace: true })
  }, [isAuthRoute, isAuthenticated, location])

  useEffect(() => {
    if (AUTH_TITLES[route]) document.title = AUTH_TITLES[route]
  }, [route])

  const clearLoginHint = () => {
    setLoginNotice(null)
    setLoginEmail('')
    clearLoginNotice()
  }

  switch (route) {
    case 'app':
      return (
        <Suspense fallback={<Loading />}>
          <App />
        </Suspense>
      )
    case 'login':
      // Keyed by the prefill: navigating here updates React before the setLoginEmail above has landed, so the screen
      // can mount empty first and must remount when the email arrives.
      return <LoginScreen key={loginEmail} notice={storeNotice ?? loginNotice} initialEmail={loginEmail} onLeave={clearLoginHint} />
    case 'signup':
      return <SignupScreen onShowLogin={clearLoginHint} />
    case 'forgot':
      return (
        <ScreenBoundary>
          <ForgotPasswordScreen
            onShowLogin={clearLoginHint}
            onDone={(email) => {
              setLoginNotice(`Password updated for ${maskEmail(email)}. Log in with that email.`)
              setLoginEmail(email)
              navigate('/login')
            }}
          />
        </ScreenBoundary>
      )
    case 'privacy':
      return <PrivacyPolicyPage />
    case 'landing':
      return null
    default:
      return <NotFoundPage />
  }
}
