import { useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { api } from '../utils/api'
import { AuthCard } from './AuthCard'
import { EmailStep } from './EmailStep'
import { OtpVerifyStep } from './OtpVerifyStep'
import { SetPasswordForm } from './SetPasswordForm'

const SUBTITLES = {
  email: 'Create your business account',
  code: 'Verify your email',
  details: 'Set up your account',
}

export const SignupScreen = ({ onShowLogin }) => {
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  // Held in memory only: it is never written to localStorage, so a page reload starts the verification again.
  const [verificationToken, setVerificationToken] = useState(null)
  const [notice, setNotice] = useState(null)
  const { signup } = useAuthStore()

  const handleSendCode = async (value) => {
    await api.signupSendOtp(value)
    setEmail(value)
    setNotice(null)
    setStep('code')
  }

  const handleVerify = async (code) => {
    const { verificationToken: token } = await api.signupVerifyOtp(email, code)
    setVerificationToken(token)
    setStep('details')
  }

  const handleSignup = async ({ business_name, password }) => {
    try {
      await signup({ verificationToken, business_name, password })
    } catch (err) {
      if (err.status === 401) {
        // The 15-minute verification ran out (or was never valid): start the email step again.
        setVerificationToken(null)
        setNotice('Your verification expired. Please verify your email again.')
        setStep('email')
        return
      }
      throw err
    }
  }

  return (
    <AuthCard subtitle={SUBTITLES[step]}>
      {step === 'email' && (
        <EmailStep
          // Remounts with the email the user typed, so "Change it" keeps what they had.
          key={`email-${email}-${notice ?? ''}`}
          initialEmail={email}
          notice={notice}
          submitLabel="Send code"
          loadingLabel="Sending code..."
          onSubmit={handleSendCode}
          errorExtra={(err) =>
            err.status === 409 && (
              <p className="text-sm text-slate-500">
                <button
                  type="button"
                  onClick={onShowLogin}
                  className="font-medium text-teal-600 hover:text-teal-700 transition-all duration-200"
                >
                  Log in instead
                </button>
              </p>
            )
          }
        />
      )}

      {step === 'code' && (
        <OtpVerifyStep
          email={email}
          intro="We sent a 6-digit code to"
          onVerify={handleVerify}
          onResend={() => api.signupResendOtp(email)}
          onChangeEmail={() => setStep('email')}
        />
      )}

      {step === 'details' && (
        <SetPasswordForm withBusinessName submitLabel="Sign Up" loadingLabel="Creating account..." onSubmit={handleSignup}>
          <p className="text-xs text-slate-500">
            By creating an account you agree to our{' '}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-teal-600 hover:text-teal-700 transition-all duration-200"
            >
              Privacy Policy
            </a>
            .
          </p>
        </SetPasswordForm>
      )}

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
    </AuthCard>
  )
}
