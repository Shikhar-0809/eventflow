import { formatRelativeTime } from '../../utils/formatRelativeTime'
import { ActionButton, Card } from './profileUi'

const absoluteDate = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

const absoluteDateTime = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? undefined
    : date.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

const Row = ({ label, children }) => (
  <div className="py-2 sm:grid sm:grid-cols-3 sm:gap-4 border-b border-slate-100 last:border-0">
    <dt className="text-sm text-slate-500">{label}</dt>
    <dd className="mt-0.5 sm:mt-0 sm:col-span-2 text-sm font-medium text-slate-800 break-all">{children}</dd>
  </div>
)

export const AccountSection = ({ profile, onChangeEmail }) => {
  const changedAt = profile.password_changed_at
  const relative = changedAt ? formatRelativeTime(changedAt) : null

  return (
    <Card id="account" title="Account">
      <dl>
        <Row label="Email">{profile.email_masked || 'No email on file'}</Row>
        <Row label="Member since">{absoluteDate(profile.member_since) ?? '—'}</Row>
        <Row label="Password last changed">
          {changedAt ? (
            <span title={absoluteDateTime(changedAt)}>{relative ?? absoluteDate(changedAt) ?? '—'}</span>
          ) : (
            'Never changed'
          )}
        </Row>
      </dl>
      <div className="mt-4">
        <ActionButton variant="secondary" onClick={onChangeEmail}>
          Change email
        </ActionButton>
      </div>
    </Card>
  )
}
