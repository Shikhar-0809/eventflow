import { useState } from 'react'
import { api } from '../../utils/api'
import { handleProfileError } from '../../utils/profileErrors'
import { ErrorMessage } from '../AuthCard'
import { ConfirmDialog } from '../ConfirmDialog'
import { ChangePasswordPanel } from './ChangePasswordPanel'
import { ForgotInProfilePanel } from './ForgotInProfilePanel'
import { SignInsList } from './SignInsList'
import { ActionButton, Card } from './profileUi'

const LOGGED_OUT_OTHERS_NOTICE = 'Signed out on your other devices. This device stays signed in.'

export const SecuritySection = ({ profile, onNotice }) => {
  const [mode, setMode] = useState('change')
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState(null)

  const handleLogoutOthers = async () => {
    if (isLoggingOut) return
    setLogoutError(null)
    setIsLoggingOut(true)
    try {
      await api.logoutOtherDevices()
      setShowLogoutConfirm(false)
      onNotice(LOGGED_OUT_OTHERS_NOTICE)
    } catch (err) {
      setShowLogoutConfirm(false)
      handleProfileError(err, setLogoutError)
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <Card id="security" title="Security">
      <div className="space-y-6 divide-y divide-slate-100 [&>*:not(:first-child)]:pt-6">
        {mode === 'change' ? (
          <ChangePasswordPanel onChanged={onNotice} onForgot={() => setMode('forgot')} />
        ) : (
          <ForgotInProfilePanel
            emailMasked={profile.email_masked}
            onDone={(message) => {
              setMode('change')
              onNotice(message)
            }}
            onCancel={() => setMode('change')}
          />
        )}

        <div>
          <h3 className="text-sm font-semibold text-slate-800 mb-1">Log out other devices</h3>
          <p className="text-sm text-slate-500 mb-3">Ends every other session on your account. This device stays signed in.</p>
          <ErrorMessage>{logoutError}</ErrorMessage>
          <div className={logoutError ? 'mt-3' : ''}>
            <ActionButton
              variant="secondary"
              onClick={() => {
                setLogoutError(null)
                setShowLogoutConfirm(true)
              }}
            >
              Log out other devices
            </ActionButton>
          </div>
        </div>

        <SignInsList />
      </div>

      <ConfirmDialog
        isOpen={showLogoutConfirm}
        title="Log out other devices?"
        message="Every other device or browser signed in to your account will be logged out. This device stays signed in."
        confirmLabel="Log out other devices"
        confirmingLabel="Logging out..."
        isConfirming={isLoggingOut}
        onConfirm={handleLogoutOthers}
        onCancel={() => {
          if (!isLoggingOut) setShowLogoutConfirm(false)
        }}
      />
    </Card>
  )
}
