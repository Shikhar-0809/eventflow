import { useState } from 'react'
import { emailField } from '../../schemas/merchant.schema'
import { useProfileStore } from '../../store/profileStore'
import { api } from '../../utils/api'
import { expireIfSessionLost, handleProfileError } from '../../utils/profileErrors'
import { maskEmail } from '../../utils/maskEmail'
import { ErrorMessage, authInputClass } from '../AuthCard'
import { OtpVerifyStep } from '../OtpVerifyStep'
import { PasswordInput } from '../PasswordInput'
import { ActionButton, FieldError, FieldLabel, ProfileModal } from './profileUi'

export const EMAIL_CHANGED_NOTICE = "Email updated. You've been signed out on other devices."

// Step 1: new address + current password. The server's answer is the same whether or not the address is taken, so the
// next step always says only that a code is on its way (never that the address is in use).
// Step 2: the code. Everything typed here, passwords included, lives in this component and is gone when it closes.
export const ChangeEmailModal = ({ onClose, onChanged }) => {
  const [step, setStep] = useState('details')
  const [newEmail, setNewEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState(null)
  const [error, setError] = useState(null)
  const [isSending, setIsSending] = useState(false)
  const [sent, setSent] = useState(null)
  // Changes with every send, so step 2 always starts clean (empty boxes, fresh resend cooldown) for the address just sent to.
  const [sentKey, setSentKey] = useState(0)

  const handleSend = async (e) => {
    e.preventDefault()
    if (isSending) return
    setError(null)

    const parsed = emailField.safeParse(newEmail)
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0].message)
      return
    }
    setEmailError(null)
    if (!password) {
      setError('Enter your current password.')
      return
    }

    setIsSending(true)
    try {
      const result = await api.profileEmailSend(password, parsed.data)
      setSent({ email: parsed.data, cooldown: result.cooldownSeconds })
      setSentKey((key) => key + 1)
      setStep('code')
    } catch (err) {
      handleProfileError(err, setError)
    } finally {
      setIsSending(false)
    }
  }

  const handleVerify = async (code) => {
    try {
      await api.profileEmailVerify(code)
    } catch (err) {
      if (expireIfSessionLost(err)) return
      throw err
    }
    // The session was re-issued for this device; reload the profile so the masked email shows the new address.
    await useProfileStore.getState().loadProfile().catch(() => {})
    setPassword('')
    onChanged(EMAIL_CHANGED_NOTICE)
  }

  const handleResend = async () => {
    try {
      await api.profileEmailSend(password, sent.email)
    } catch (err) {
      expireIfSessionLost(err)
      throw err
    }
  }

  const backToDetails = () => {
    setError(null)
    setStep('details')
  }

  return (
    <ProfileModal title="Change email" titleId="change-email-title" onClose={onClose} busy={isSending}>
      {step === 'details' && (
        <form onSubmit={handleSend} noValidate className="space-y-4">
          <div>
            <FieldLabel htmlFor="new-email">New email address</FieldLabel>
            <input
              id="new-email"
              type="email"
              value={newEmail}
              onChange={(e) => {
                setNewEmail(e.target.value)
                if (emailError) setEmailError(null)
              }}
              className={authInputClass(emailError)}
              autoComplete="email"
              autoFocus
              aria-invalid={Boolean(emailError)}
            />
            <FieldError>{emailError}</FieldError>
          </div>
          <div>
            <FieldLabel htmlFor="change-email-password">Current password</FieldLabel>
            <PasswordInput
              id="change-email-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (error) setError(null)
              }}
              className={authInputClass(false)}
              autoComplete="current-password"
            />
          </div>
          <ErrorMessage>{error}</ErrorMessage>
          <div className="flex justify-end gap-3">
            <ActionButton variant="secondary" onClick={onClose} disabled={isSending}>
              Cancel
            </ActionButton>
            <ActionButton type="submit" loading={isSending} loadingLabel="Sending code..." disabled={!newEmail || !password}>
              Send code
            </ActionButton>
          </div>
        </form>
      )}

      {step === 'code' && sent && (
        <div className="space-y-4">
          <p role="status" className="text-sm text-slate-700 text-center">
            If that address can receive mail, a code is on its way to{' '}
            <span className="font-medium break-all">{maskEmail(sent.email)}</span>.
          </p>
          <OtpVerifyStep
            key={sentKey}
            email={sent.email}
            intro={null}
            onVerify={handleVerify}
            onResend={handleResend}
            onChangeEmail={backToDetails}
            initialCooldown={sent.cooldown}
          />
        </div>
      )}
    </ProfileModal>
  )
}
