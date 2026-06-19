import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import { LoginScreen } from './components/LoginScreen'

export default function App() {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500">Loading…</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginScreen />
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">EventFlow</h1>
        <p className="mt-2 text-slate-500">Booking management dashboard</p>
      </div>
    </div>
  )
}
