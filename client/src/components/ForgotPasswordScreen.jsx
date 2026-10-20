import { useState } from 'react'
import { api } from '../utils/api'
import { maskEmail } from '../utils/maskEmail'
import { AuthCard } from './AuthCard'
import { EmailStep } from './EmailStep'
import { OtpVerifyStep } from './OtpVerifyStep'
import { SetPasswordForm } from './SetPasswordForm'

const SUBTITLES = {
  email: 'Reset your password',
  code: 'Enter your code',
  password: 'Choose a new password',
}

// Shown whether or not an account exists, so this screen never reveals which emails are registered.
const SENT_MESSAGE = "If an account exists for this email, we've sent a code."

export const ForgotPasswordScreen = ({ onShowLogin, onDone }) => {
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  // Held in memory only, never in localStorage.
  const [resetToken, setResetToken] = useState(null)
  const [notice, setNotice] = useState(null)

  const handleSendCode = async (value) => {
    await api.forgotSendOtp(value)
    setEmail(value)
    setNotice(SENT_MESSAGE)
    setStep('code')
  }

  // Going back to change the email drops the token and the code step, so nothing carries over to another address.
  const handleChangeEmail = () => {
    setResetToken(null)
    setNotice(null)
    setStep('email')
  }

  const handleVerify = async (code) => {
    const { resetToken: token } = await api.forgotVerifyOtp(email, code)
    setResetToken(token)
    setStep('password')
  }

  const handleReset = async ({ password }) => {
    try {
      await api.forgotReset(resetToken, password)
    } catch (err) {
      if (err.status === 400) {
        // The token expired or was already used: a fresh code is needed.
        setResetToken(null)
        setNotice(err.message)
        setStep('email')
        return
      }
      throw err
    }
    onDone(email)
  }

  return (
    <AuthCard subtitle={SUBTITLES[step]}>
      {step === 'email' && (
        <EmailStep
          key={`email-${email}-${notice ?? ''}`}
          initialEmail={email}
          notice={notice}
          submitLabel="Send code"
          loadingLabel="Sending code..."
          onSubmit={handleSendCode}
        />
      )}

      {step !== 'email' && (
        <p className="mb-4 text-sm font-medium text-slate-900 text-center">
          Resetting password for <span className="break-all">{maskEmail(email)}</span>
        </p>
      )}

      {step === 'code' && (
        <>
          <p role="status" className="mb-4 text-sm text-slate-700 text-center">
            {notice}
          </p>
          <OtpVerifyStep
            email={email}
            intro="Code sent to"
            onVerify={handleVerify}
            onResend={() => api.forgotResendOtp(email)}
            onChangeEmail={handleChangeEmail}
          />
        </>
      )}

      {step === 'password' && (
        <SetPasswordForm submitLabel="Update password" loadingLabel="Updating password..." onSubmit={handleReset} />
      )}

      <p className="mt-6 text-center text-sm text-slate-500">
        Remembered it?{' '}
        <a
          href="/login"
          onClick={onShowLogin}
          className="font-medium text-teal-600 hover:text-teal-700 transition-all duration-200"
        >
          Back to log in
        </a>
      </p>
    </AuthCard>
  )
}
