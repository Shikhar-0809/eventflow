import { useState } from 'react'
import { sendOtpSchema } from '../schemas/merchant.schema'
import { ErrorMessage, authInputClass } from './AuthCard'

// Asks for an email and calls onSubmit(email). onSubmit must throw on failure; the message is shown under the
// field. errorExtra(err) can add something next to that message (for example a link to the login screen).
export const EmailStep = ({ initialEmail = '', notice = null, submitLabel, loadingLabel, onSubmit, errorExtra }) => {
  const [email, setEmail] = useState(initialEmail)
  const [fieldError, setFieldError] = useState(null)
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isLoading) return
    setError(null)

    const result = sendOtpSchema.safeParse({ email })
    if (!result.success) {
      setFieldError(result.error.issues[0].message)
      return
    }
    setFieldError(null)

    setIsLoading(true)
    try {
      await onSubmit(result.data.email)
    } catch (err) {
      setError(err)
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {notice && (
        <p role="status" className="text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2">
          {notice}
        </p>
      )}

      <div>
        <label htmlFor="otp-email" className="block text-sm font-medium text-slate-700 mb-1">
          Email
        </label>
        <input
          id="otp-email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (fieldError) setFieldError(null)
          }}
          className={authInputClass(fieldError)}
          autoComplete="email"
          autoFocus
        />
        {fieldError && <p className="mt-1 text-sm text-red-700">{fieldError}</p>}
      </div>

      <ErrorMessage>{error?.message}</ErrorMessage>
      {error && errorExtra?.(error)}

      <button
        type="submit"
        disabled={isLoading || !email}
        className={`w-full py-2.5 rounded-lg font-medium transition-all duration-200 ${
          isLoading || !email
            ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
            : 'bg-teal-600 hover:bg-teal-700 text-white'
        }`}
      >
        {isLoading ? loadingLabel : submitLabel}
      </button>
    </form>
  )
}
