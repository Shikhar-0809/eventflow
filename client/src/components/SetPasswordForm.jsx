import { useState } from 'react'
import { businessNameField, passwordField } from '../schemas/merchant.schema'
import { ErrorMessage, authInputClass } from './AuthCard'
import { PasswordInput } from './PasswordInput'

const CONFIRM_MISMATCH = 'Passwords do not match'

// Returns { field: message } for the whole form. The confirm field is checked here because the server never sees it.
const collectErrors = (values, withBusinessName) => {
  const errors = {}
  if (withBusinessName) {
    const name = businessNameField.safeParse(values.business_name)
    if (!name.success) errors.business_name = name.error.issues[0].message
  }
  const password = passwordField.safeParse(values.password)
  if (!password.success) errors.password = password.error.issues[0].message
  if (values.confirm_password !== values.password) errors.confirm_password = CONFIRM_MISMATCH
  return errors
}

// The last step of sign-up (business name + password) and of password reset (password only).
// onSubmit({ business_name, password }) must throw on failure; the message is shown above the button.
// By default a successful submit leaves the button busy, because the screen moves on. The Profile screen keeps the
// form on screen, so it passes `stayMounted` to get the button back (and remounts the form, with a new key, to clear it).
export const SetPasswordForm = ({ withBusinessName = false, submitLabel, loadingLabel, onSubmit, children, stayMounted = false }) => {
  const [values, setValues] = useState({ business_name: '', password: '', confirm_password: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

  const isSubmitDisabled = isLoading || !values.password || !values.confirm_password || (withBusinessName && !values.business_name)

  const validateField = (name, next) => {
    const errors = collectErrors(next, withBusinessName)
    setFieldErrors((prev) => {
      const updated = { ...prev, [name]: errors[name] }
      // Changing the password can fix or break the confirm field that was already touched.
      if (name === 'password' && touched.confirm_password) updated.confirm_password = errors.confirm_password
      return updated
    })
  }

  const handleChange = (name, value) => {
    const next = { ...values, [name]: value }
    setValues(next)
    if (touched[name]) validateField(name, next)
  }

  const handleBlur = (name) => {
    setTouched((prev) => ({ ...prev, [name]: true }))
    validateField(name, values)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isLoading) return
    setError(null)

    const errors = collectErrors(values, withBusinessName)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setTouched({ business_name: true, password: true, confirm_password: true })
      return
    }

    setIsLoading(true)
    try {
      await onSubmit({ business_name: values.business_name, password: values.password })
      if (stayMounted) setIsLoading(false)
    } catch (err) {
      setError(err.message)
      setIsLoading(false)
    }
  }

  const renderPassword = ({ name, label, toggleLabels }) => (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-slate-700 mb-1">
        {label}
      </label>
      <PasswordInput
        id={name}
        value={values[name]}
        onChange={(e) => handleChange(name, e.target.value)}
        onBlur={() => handleBlur(name)}
        className={authInputClass(touched[name] && fieldErrors[name])}
        autoComplete="new-password"
        {...toggleLabels}
      />
      {touched[name] && fieldErrors[name] && <p className="mt-1 text-sm text-red-700">{fieldErrors[name]}</p>}
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {withBusinessName && (
        <div>
          <label htmlFor="business_name" className="block text-sm font-medium text-slate-700 mb-1">
            Business name
          </label>
          <input
            id="business_name"
            type="text"
            value={values.business_name}
            onChange={(e) => handleChange('business_name', e.target.value)}
            onBlur={() => handleBlur('business_name')}
            className={authInputClass(touched.business_name && fieldErrors.business_name)}
            autoComplete="organization"
            autoFocus
          />
          {touched.business_name && fieldErrors.business_name && (
            <p className="mt-1 text-sm text-red-700">{fieldErrors.business_name}</p>
          )}
        </div>
      )}
      {renderPassword({ name: 'password', label: withBusinessName ? 'Password' : 'New password' })}
      {renderPassword({
        name: 'confirm_password',
        label: 'Confirm password',
        toggleLabels: { showLabel: 'Show confirm password', hideLabel: 'Hide confirm password' },
      })}

      <ErrorMessage>{error}</ErrorMessage>

      {children}

      <button
        type="submit"
        disabled={isSubmitDisabled}
        className={`w-full py-2.5 rounded-lg font-medium transition-all duration-200 ${
          isSubmitDisabled
            ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
            : 'bg-teal-600 hover:bg-teal-700 text-white'
        }`}
      >
        {isLoading ? loadingLabel : submitLabel}
      </button>
    </form>
  )
}
