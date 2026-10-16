import { useState } from 'react'
import { api } from '../../utils/api'
import { handleProfileError } from '../../utils/profileErrors'
import { ConfirmDialog } from '../ConfirmDialog'
import { ErrorMessage, authInputClass } from '../AuthCard'
import { PasswordInput } from '../PasswordInput'
import { SetPasswordForm } from '../SetPasswordForm'
import { FieldLabel, TextLinkButton } from './profileUi'

export const PASSWORD_CHANGED_NOTICE = "Password changed. You've been signed out on other devices."

// Current password, then a new one (SetPasswordForm's rules), then a yes/no step. The backend re-issues this
// device's cookie on success, so nothing here logs this tab out. Passwords live only in this component's state.
export const ChangePasswordPanel = ({ onChanged, onForgot }) => {
  const [currentPassword, setCurrentPassword] = useState('')
  // A new key remounts the form, which empties its password fields after a successful change.
  const [formKey, setFormKey] = useState(0)
  const [pendingPassword, setPendingPassword] = useState(null)
  const [isChanging, setIsChanging] = useState(false)
  const [error, setError] = useState(null)

  // Called by SetPasswordForm once its own checks pass: ask before changing anything.
  const handleFormSubmit = async ({ password }) => {
    setError(null)
    if (!currentPassword) throw new Error('Enter your current password.')
    setPendingPassword(password)
  }

  const handleConfirm = async () => {
    if (isChanging || pendingPassword == null) return
    setIsChanging(true)
    try {
      await api.changePassword(currentPassword, pendingPassword)
      setCurrentPassword('')
      setPendingPassword(null)
      setFormKey((key) => key + 1)
      onChanged(PASSWORD_CHANGED_NOTICE)
    } catch (err) {
      // The typed passwords stay in the form so a wrong current password can be corrected without retyping.
      setPendingPassword(null)
      handleProfileError(err, setError)
    } finally {
      setIsChanging(false)
    }
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-800 mb-3">Change password</h3>
      <div className="space-y-4">
        <div>
          <FieldLabel htmlFor="current_password">Current password</FieldLabel>
          <PasswordInput
            id="current_password"
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value)
              if (error) setError(null)
            }}
            className={authInputClass(false)}
            autoComplete="current-password"
            showLabel="Show current password"
            hideLabel="Hide current password"
          />
          <p className="mt-1.5 text-right text-sm">
            <TextLinkButton onClick={onForgot}>Forgot your current password?</TextLinkButton>
          </p>
        </div>

        <ErrorMessage>{error}</ErrorMessage>

        <SetPasswordForm
          key={formKey}
          submitLabel="Change password"
          loadingLabel="Changing password..."
          onSubmit={handleFormSubmit}
          stayMounted
        />
      </div>

      <ConfirmDialog
        isOpen={pendingPassword != null}
        title="Change your password?"
        message="You will be signed out on all your other devices. This device stays signed in."
        confirmLabel="Change password"
        confirmingLabel="Changing..."
        isConfirming={isChanging}
        onConfirm={handleConfirm}
        onCancel={() => {
          if (!isChanging) setPendingPassword(null)
        }}
      />
    </div>
  )
}
