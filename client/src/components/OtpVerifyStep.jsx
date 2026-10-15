import { useState } from 'react'
import { ErrorMessage } from './AuthCard'
import { OtpInput } from './OtpInput'
import { ResendOtpButton } from './ResendOtpButton'

// Step 2 of sign-up and password reset: enter the emailed code. onVerify(code) must throw on a wrong code.
export const OtpVerifyStep = ({ email, intro, onVerify, onResend, onChangeEmail }) => {
  const [error, setError] = useState(null)
  const [isVerifying, setIsVerifying] = useState(false)
  // A new key clears the boxes (and refocuses the first) after a wrong code.
  const [boxesKey, setBoxesKey] = useState(0)

  const handleComplete = async (code) => {
    if (isVerifying) return
    setError(null)
    setIsVerifying(true)
    try {
      await onVerify(code)
    } catch (err) {
      setError(err.message)
      setBoxesKey((key) => key + 1)
      setIsVerifying(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700 text-center">
        {intro} <span className="font-medium break-all">{email}</span>
      </p>
      <p className="text-center text-sm">
        <button
          type="button"
          onClick={onChangeEmail}
          disabled={isVerifying}
          className="font-medium text-teal-600 hover:text-teal-700 transition-all duration-200"
        >
          Wrong email? Change it
        </button>
      </p>

      <OtpInput key={boxesKey} onComplete={handleComplete} disabled={isVerifying} hasError={Boolean(error)} />

      <p role="status" className="text-center text-sm text-slate-500 min-h-5">
        {isVerifying ? 'Checking your code...' : ''}
      </p>
      <ErrorMessage>{error}</ErrorMessage>

      <ResendOtpButton onResend={onResend} />
      <p className="text-center text-xs text-slate-500">Check your spam folder if it doesn&apos;t arrive in a minute.</p>
    </div>
  )
}
