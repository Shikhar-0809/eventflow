import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { signupSchema } from '../schemas/merchant.schema'
import { PasswordInput } from './PasswordInput'

const CONFIRM_MISMATCH = 'Passwords do not match'

const inputClass = (hasError) =>
  `w-full px-3 py-2 border rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all duration-200 ${
    hasError ? 'border-red-400' : 'border-slate-200'
  }`

// Returns { field: message } for the whole form. The confirm field is checked here because the server never sees it.
const collectErrors = (values) => {
  const errors = {}
  const result = signupSchema.safeParse({
    business_name: values.business_name,
    email: values.email,
    password: values.password,
  })
  if (!result.success) {
    for (const issue of result.error.issues) {
      if (!errors[issue.path[0]]) errors[issue.path[0]] = issue.message
    }
  }
  if (values.confirm_password !== values.password) errors.confirm_password = CONFIRM_MISMATCH
  return errors
}

export const SignupScreen = ({ onShowLogin }) => {
  const [values, setValues] = useState({ business_name: '', email: '', password: '', confirm_password: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const { signup } = useAuthStore()

  const isSubmitDisabled = isLoading || Object.values(values).some((value) => !value)

  const validateField = (name, next) => {
    const errors = collectErrors(next)
    setFieldErrors((prev) => {
      const updated = { ...prev, [name]: errors[name] }
      // Changing the password can fix or break the confirm field that was already touched.
      if (name === 'password' && touched.confirm_password) updated.confirm_password = errors.confirm_password
      return updated
    })
  }

  const handleChange = (name, value) => {
    const next = { ...values, [name]: value }
    setValues(next)
    if (touched[name]) validateField(name, next)
  }

  const handleBlur = (name) => {
    setTouched((prev) => ({ ...prev, [name]: true }))
    validateField(name, values)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    const errors = collectErrors(values)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setTouched({ business_name: true, email: true, password: true, confirm_password: true })
      return
    }

    setIsLoading(true)
    try {
      await signup({
        business_name: values.business_name,
        email: values.email,
        password: values.password,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const renderField = ({ name, label, type = 'text', autoComplete }) => (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-slate-700 mb-1">
        {label}
      </label>
      {type === 'password' ? (
        <PasswordInput
          id={name}
          value={values[name]}
          onChange={(e) => handleChange(name, e.target.value)}
          onBlur={() => handleBlur(name)}
          className={inputClass(touched[name] && fieldErrors[name])}
          autoComplete={autoComplete}
        />
      ) : (
        <input
          id={name}
          type={type}
          value={values[name]}
          onChange={(e) => handleChange(name, e.target.value)}
          onBlur={() => handleBlur(name)}
          className={inputClass(touched[name] && fieldErrors[name])}
          autoComplete={autoComplete}
        />
      )}
      {touched[name] && fieldErrors[name] && (
        <p className="mt-1 text-sm text-red-700">{fieldErrors[name]}</p>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-teal-600 rounded-xl p-3 mb-4">
            <CalendarDays className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">EventFlow</h1>
          <p className="mt-1 text-sm text-slate-500">Create your business account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {renderField({ name: 'business_name', label: 'Business name', autoComplete: 'organization' })}
          {renderField({ name: 'email', label: 'Email', type: 'email', autoComplete: 'email' })}
          {renderField({ name: 'password', label: 'Password', type: 'password', autoComplete: 'new-password' })}
          {renderField({ name: 'confirm_password', label: 'Confirm password', type: 'password', autoComplete: 'new-password' })}

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
            {isLoading ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <button
            type="button"
            onClick={onShowLogin}
            className="font-medium text-teal-600 hover:text-teal-700 transition-all duration-200"
          >
            Log in
          </button>
        </p>
      </div>
    </div>
  )
}
