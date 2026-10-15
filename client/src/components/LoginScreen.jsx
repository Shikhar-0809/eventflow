import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { loginSchema } from '../schemas/merchant.schema'
import { PasswordInput } from './PasswordInput'

const inputClass = (hasError) =>
  `w-full px-3 py-2 border rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all duration-200 ${
    hasError ? 'border-red-400' : 'border-slate-200'
  }`

export const LoginScreen = ({ onShowSignup, onShowForgot, notice = null }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const { login } = useAuthStore()

  const isSubmitDisabled = isLoading || !email || !password

  const validateField = (name, value) => {
    const result = loginSchema.safeParse({ email, password, [name]: value })
    const issue = result.success ? null : result.error.issues.find((i) => i.path[0] === name)
    setFieldErrors((prev) => ({ ...prev, [name]: issue?.message }))
  }

  const handleBlur = (name, value) => {
    setTouched((prev) => ({ ...prev, [name]: true }))
    validateField(name, value)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    const result = loginSchema.safeParse({ email, password })
    if (!result.success) {
      const errors = {}
      for (const issue of result.error.issues) {
        if (!errors[issue.path[0]]) errors[issue.path[0]] = issue.message
      }
      setFieldErrors(errors)
      setTouched({ email: true, password: true })
      return
    }

    setIsLoading(true)
    try {
      await login(result.data.email, result.data.password)
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
          <p className="mt-1 text-sm text-slate-500">Log in to your business</p>
        </div>

        {notice && (
          <p role="status" className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            {notice}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (touched.email) validateField('email', e.target.value)
              }}
              onBlur={(e) => handleBlur('email', e.target.value)}
              className={inputClass(touched.email && fieldErrors.email)}
              autoComplete="email"
            />
            {touched.email && fieldErrors.email && (
              <p className="mt-1 text-sm text-red-700">{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
              Password
            </label>
            <PasswordInput
              id="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (touched.password) validateField('password', e.target.value)
              }}
              onBlur={(e) => handleBlur('password', e.target.value)}
              className={inputClass(touched.password && fieldErrors.password)}
              autoComplete="current-password"
            />
            {touched.password && fieldErrors.password && (
              <p className="mt-1 text-sm text-red-700">{fieldErrors.password}</p>
            )}
          </div>

          <p className="text-right text-sm">
            <button
              type="button"
              onClick={onShowForgot}
              className="font-medium text-teal-600 hover:text-teal-700 transition-all duration-200"
            >
              Forgot password?
            </button>
          </p>

          {error && (
            <p className="text-sm text-red-700 bg-red-100 border border-red-400 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitDisabled}
            className={`w-full py-2.5 rounded-lg font-medium transition-all duration-200 ${
              isSubmitDisabled
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                : 'bg-teal-600 hover:bg-teal-700 text-white'
            }`}
          >
            {isLoading ? 'Logging in...' : 'Log In'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Don&apos;t have an account?{' '}
          <button
            type="button"
            onClick={onShowSignup}
            className="font-medium text-teal-600 hover:text-teal-700 transition-all duration-200"
          >
            Sign up
          </button>
        </p>

        <p className="mt-6 text-center text-sm text-slate-500">
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-teal-600 hover:text-teal-700 transition-all duration-200"
          >
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  )
}
