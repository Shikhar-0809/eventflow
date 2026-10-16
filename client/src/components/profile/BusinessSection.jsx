import { useState } from 'react'
import { profileBusinessSchema } from '../../schemas/merchant.schema'
import { useAuthStore } from '../../store/authStore'
import { useProfileStore } from '../../store/profileStore'
import { api } from '../../utils/api'
import { handleProfileError } from '../../utils/profileErrors'
import { confirmationPreview } from '../../utils/whatsapp'
import { ErrorMessage, authInputClass } from '../AuthCard'
import { ActionButton, Card, FieldError, FieldLabel } from './profileUi'

// A made-up booking, only used to show how a message is signed. No real client data is ever used here.
const SAMPLE_BOOKING = {
  client_name: 'Sample Client',
  phone: '9876543210',
  event_date: '2026-12-01',
  event_type: 'wedding',
  guest_count: 150,
  advance: 10000,
}

const fieldErrorsOf = (result) => {
  const errors = {}
  for (const issue of result.error.issues) {
    if (!errors[issue.path[0]]) errors[issue.path[0]] = issue.message
  }
  return errors
}

export const BusinessSection = ({ profile, onNotice }) => {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(profile.business_name ?? '')
  const [phone, setPhone] = useState(profile.whatsapp_phone ?? '')
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  const startEditing = () => {
    setName(profile.business_name ?? '')
    setPhone(profile.whatsapp_phone ?? '')
    setFieldErrors({})
    setError(null)
    setEditing(true)
  }

  const cancel = () => {
    if (isSaving) return
    setEditing(false)
    setFieldErrors({})
    setError(null)
  }

  const validate = (nextName, nextPhone) => {
    const result = profileBusinessSchema.safeParse({ business_name: nextName, whatsapp_phone: nextPhone })
    return result.success ? { data: result.data, errors: {} } : { data: null, errors: fieldErrorsOf(result) }
  }

  const handleBlur = () => setFieldErrors(validate(name, phone).errors)

  const handleChange = (setter, field) => (e) => {
    setter(e.target.value)
    // A field already marked wrong is re-checked as the merchant types, so the error clears the moment it is fixed.
    if (fieldErrors[field]) {
      const next = field === 'business_name' ? validate(e.target.value, phone) : validate(name, e.target.value)
      setFieldErrors((prev) => ({ ...prev, [field]: next.errors[field] }))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isSaving) return
    setError(null)

    const { data, errors } = validate(name, phone)
    setFieldErrors(errors)
    if (!data) return

    setIsSaving(true)
    try {
      const updated = await api.updateProfileBusiness({
        business_name: data.business_name,
        whatsapp_phone: data.whatsapp_phone === '' ? null : data.whatsapp_phone,
      })
      useProfileStore.getState().setProfile(updated)
      useAuthStore.getState().setBusinessName(updated.business_name)
      setEditing(false)
      onNotice('Business details saved.')
    } catch (err) {
      handleProfileError(err, setError)
    } finally {
      setIsSaving(false)
    }
  }

  // Live while typing: the draft name, otherwise the saved one.
  const previewName = editing ? name : profile.business_name
  const preview = confirmationPreview(SAMPLE_BOOKING, previewName)

  return (
    <Card id="business" title="Business details">
      {editing ? (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <FieldLabel htmlFor="profile-business-name">Business name</FieldLabel>
            <input
              id="profile-business-name"
              type="text"
              value={name}
              onChange={handleChange(setName, 'business_name')}
              onBlur={handleBlur}
              className={authInputClass(fieldErrors.business_name)}
              autoComplete="organization"
              aria-invalid={Boolean(fieldErrors.business_name)}
            />
            <FieldError>{fieldErrors.business_name}</FieldError>
          </div>
          <div>
            <FieldLabel htmlFor="profile-whatsapp">WhatsApp number (optional)</FieldLabel>
            <input
              id="profile-whatsapp"
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={handleChange(setPhone, 'whatsapp_phone')}
              onBlur={handleBlur}
              placeholder="10-digit mobile number"
              className={authInputClass(fieldErrors.whatsapp_phone)}
              autoComplete="tel-national"
              aria-invalid={Boolean(fieldErrors.whatsapp_phone)}
            />
            <FieldError>{fieldErrors.whatsapp_phone}</FieldError>
            <p className="mt-1 text-xs text-slate-500">Used for &ldquo;Send to My WhatsApp&rdquo; on a booking. Leave empty to remove it.</p>
          </div>
          <ErrorMessage>{error}</ErrorMessage>
          <div className="flex flex-wrap gap-2">
            <ActionButton type="submit" loading={isSaving} loadingLabel="Saving...">
              Save
            </ActionButton>
            <ActionButton variant="secondary" onClick={cancel} disabled={isSaving}>
              Cancel
            </ActionButton>
          </div>
        </form>
      ) : (
        <div>
          <dl>
            <div className="py-2 sm:grid sm:grid-cols-3 sm:gap-4 border-b border-slate-100">
              <dt className="text-sm text-slate-500">Business name</dt>
              <dd className="mt-0.5 sm:mt-0 sm:col-span-2 text-sm font-medium text-slate-800 break-words">{profile.business_name}</dd>
            </div>
            <div className="py-2 sm:grid sm:grid-cols-3 sm:gap-4">
              <dt className="text-sm text-slate-500">WhatsApp number</dt>
              <dd className="mt-0.5 sm:mt-0 sm:col-span-2 text-sm font-medium text-slate-800">
                {profile.whatsapp_phone ?? <span className="font-normal text-slate-500">Not set</span>}
              </dd>
            </div>
          </dl>
          <div className="mt-3">
            <ActionButton variant="secondary" onClick={startEditing}>
              Edit
            </ActionButton>
          </div>
        </div>
      )}

      {preview && (
        <div className="mt-5">
          <p className="text-sm font-medium text-slate-700 mb-1">WhatsApp sign-off preview</p>
          <p data-testid="signoff-preview" className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 break-words">
            {preview}
          </p>
          <p className="mt-1 text-xs text-slate-500">A sample message. Your clients see their own booking details with this sign-off.</p>
        </div>
      )}
    </Card>
  )
}
