import { useState } from 'react'
import { api } from '../../utils/api'
import { errorText, expireIfSessionLost } from '../../utils/profileErrors'
import { ErrorMessage } from '../AuthCard'
import { OtpVerifyStep } from '../OtpVerifyStep'
import { SetPasswordForm } from '../SetPasswordForm'
import { ActionButton, TextLinkButton } from './profileUi'
import { PASSWORD_CHANGED_NOTICE } from './ChangePasswordPanel'

// "Forgot your current password?" from inside the Profile screen. The code always goes to the address on the account
// (the request carries no email), is entered first, and is checked by the server together with the new password.
export const ForgotInProfilePanel = ({ emailMasked, onDone, onCancel }) => {
  const [step, setStep] = useState('send')
  const [sent, setSent] = useState(null)
  const [code, setCode] = useState(null)
  const [error, setError] = useState(null)
  const [isSending, setIsSending] = useState(false)
  // Bumped each time the code step is (re)entered, so its boxes and resend cooldown start fresh.
  const [codeStepKey, setCodeStepKey] = useState(0)

  const handleSend = async () => {
    if (isSending) return
    setError(null)
    setIsSending(true)
    try {
      const result = await api.profileResetSend()
      setSent({ masked: result.email_masked || emailMasked, cooldown: result.cooldownSeconds })
      setCodeStepKey((key) => key + 1)
      setStep('code')
    } catch (err) {
      // A 429 carries the server's own sentence ("Please wait before requesting another code."), shown as-is.
      if (!expireIfSessionLost(err)) setError(errorText(err))
    } finally {
      setIsSending(false)
    }
  }

  const handleResend = async () => {
    try {
      await api.profileResetSend()
    } catch (err) {
      expireIfSessionLost(err)
      throw err
    }
  }

  // The boxes only collect the code; the server checks it with the new password in the next step.
  const handleCodeEntered = async (entered) => {
    setCode(entered)
    setError(null)
    setStep('password')
  }

  const handleReset = async ({ password }) => {
    try {
      await api.profileResetVerify(code, password)
    } catch (err) {
      if (expireIfSessionLost(err)) return
      if (err.status === 400 && /code/i.test(err.message)) {
        // Wrong or expired code: back to the code step. The password the merchant typed is not kept.
        setCode(null)
        setError(err.message)
        setCodeStepKey((key) => key + 1)
        setStep('code')
        return
      }
      throw err
    }
    setCode(null)
    onDone(PASSWORD_CHANGED_NOTICE)
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-800 mb-3">Reset password with a code</h3>

      {step === 'send' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            We&apos;ll send a code to <span className="font-medium break-all">{emailMasked || 'the email on your account'}</span>
          </p>
          <ErrorMessage>{error}</ErrorMessage>
          <ActionButton onClick={handleSend} loading={isSending} loadingLabel="Sending code...">
            Send code
          </ActionButton>
        </div>
      )}

      {step === 'code' && sent && (
        <div className="space-y-4">
          <p role="status" className="text-sm text-slate-700 text-center">
            Code sent to <span className="font-medium break-all">{sent.masked}</span>
          </p>
          <ErrorMessage>{error}</ErrorMessage>
          <OtpVerifyStep
            key={codeStepKey}
            intro={null}
            onVerify={handleCodeEntered}
            onResend={handleResend}
            initialCooldown={sent.cooldown}
          />
        </div>
      )}

      {step === 'password' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-700">Choose a new password for {emailMasked}.</p>
          <SetPasswordForm submitLabel="Update password" loadingLabel="Updating password..." onSubmit={handleReset} />
        </div>
      )}

      <p className="mt-4 text-sm">
        <TextLinkButton
          onClick={() => {
            setCode(null)
            onCancel()
          }}
        >
          Back to change password
        </TextLinkButton>
      </p>
    </div>
  )
}
