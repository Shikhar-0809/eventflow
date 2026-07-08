import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

export const LoginScreen = () => {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const { login } = useAuthStore()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      await login(password)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-teal-600 rounded-xl p-3 mb-4">
            <CalendarDays className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">EventFlow</h1>
          <p className="mt-1 text-sm text-slate-500">Bala Ji Tent House</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all duration-200"
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-700 bg-red-100 border border-red-400 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading || !password}
            className={`w-full py-2.5 rounded-lg font-medium transition-all duration-200 ${
              isLoading || !password
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                : 'bg-teal-600 hover:bg-teal-700 text-white'
            }`}
          >
            {isLoading ? 'Loading...' : 'Log In'}
          </button>
        </form>
      </div>
    </div>
  )
}
