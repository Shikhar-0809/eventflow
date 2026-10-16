import { useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../utils/api'
import { handleProfileError } from '../../utils/profileErrors'
import { ErrorMessage, authInputClass } from '../AuthCard'
import { PasswordInput } from '../PasswordInput'
import { ActionButton, Card, FieldLabel, ProfileModal } from './profileUi'

const DeleteAccountModal = ({ businessName, onClose }) => {
  const [password, setPassword] = useState('')
  const [typedName, setTypedName] = useState('')
  const [error, setError] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // The server compares the trimmed text exactly (case matters), so the button does the same.
  const nameMatches = Boolean(businessName) && typedName.trim() === businessName.trim()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isDeleting || !nameMatches) return
    if (!password) {
      setError('Enter your current password.')
      return
    }
    setError(null)
    setIsDeleting(true)
    try {
      await api.deleteAccount(password, typedName.trim())
      // Every store is cleared and the login screen shows "Your account has been deleted."
      useAuthStore.getState().accountDeleted()
    } catch (err) {
      handleProfileError(err, setError)
      setIsDeleting(false)
    }
  }

  return (
    <ProfileModal title="Delete your account" titleId="delete-account-title" onClose={onClose} busy={isDeleting}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <p className="text-sm text-slate-600">
          This permanently deletes all your bookings, inventory, expenses and settings, along with your account. It can&apos;t
          be undone, and we can&apos;t recover anything afterwards.
        </p>
        <div>
          <FieldLabel htmlFor="delete-password">Current password</FieldLabel>
          <PasswordInput
            id="delete-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (error) setError(null)
            }}
            className={authInputClass(false)}
            autoComplete="current-password"
            autoFocus
            disabled={isDeleting}
          />
        </div>
        <div>
          <FieldLabel htmlFor="delete-business-name">
            Type <span className="font-semibold break-all">{businessName}</span> to confirm
          </FieldLabel>
          <input
            id="delete-business-name"
            type="text"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            className={authInputClass(false)}
            autoComplete="off"
            disabled={isDeleting}
          />
        </div>
        <ErrorMessage>{error}</ErrorMessage>
        <div className="flex justify-end gap-3">
          <ActionButton variant="secondary" onClick={onClose} disabled={isDeleting}>
            Cancel
          </ActionButton>
          <ActionButton type="submit" variant="danger" loading={isDeleting} loadingLabel="Deleting..." disabled={!nameMatches}>
            Delete my account
          </ActionButton>
        </div>
      </form>
    </ProfileModal>
  )
}

export const DangerZone = ({ businessName }) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Card
      id="danger"
      variant="danger"
      title="Danger zone"
      description="Deleting your account removes everything in EventFlow. This is immediate and permanent."
    >
      <ActionButton variant="danger" onClick={() => setIsOpen(true)}>
        Delete account
      </ActionButton>
      {isOpen && <DeleteAccountModal businessName={businessName} onClose={() => setIsOpen(false)} />}
    </Card>
  )
}
