import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Loader2, X } from 'lucide-react'

// Small building blocks shared by the Profile screen's sections and modals.

export const Card = ({ id, title, description, variant = 'default', children }) => (
  <section
    aria-labelledby={`${id}-title`}
    data-section={id}
    className={`rounded-xl shadow-sm border p-4 ${
      variant === 'danger' ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'
    }`}
  >
    <h2 id={`${id}-title`} className={`text-base font-semibold ${variant === 'danger' ? 'text-red-700' : 'text-slate-800'}`}>
      {title}
    </h2>
    {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
    <div className="mt-4">{children}</div>
  </section>
)

const BUTTON_BASE = 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200'
const DISABLED = 'bg-slate-300 text-slate-500 cursor-not-allowed'

// Every async action in the Profile screen uses this: it shows a spinner and the loading label while `loading`,
// and is disabled then, so a second click can never send a second request.
export const ActionButton = ({ children, loading = false, loadingLabel, disabled = false, variant = 'primary', type = 'button', onClick }) => {
  const isDisabled = disabled || loading
  const variants = {
    primary: 'bg-teal-600 hover:bg-teal-700 text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    secondary: 'border border-slate-300 text-slate-700 hover:bg-slate-50',
  }
  let className = variants[variant] ?? variants.primary
  if (isDisabled) className = variant === 'secondary' ? `${variants.secondary} opacity-50 cursor-not-allowed` : DISABLED
  return (
    <button type={type} onClick={onClick} disabled={isDisabled} aria-busy={loading || undefined} className={`${BUTTON_BASE} ${className}`}>
      {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  )
}

export const TextLinkButton = ({ children, onClick, disabled = false }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="text-sm font-medium text-teal-600 hover:text-teal-700 disabled:opacity-50 transition-all duration-200"
  >
    {children}
  </button>
)

export const FieldLabel = ({ htmlFor, children }) => (
  <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700 mb-1">
    {children}
  </label>
)

export const FieldError = ({ children }) => (children ? <p className="mt-1 text-sm text-red-700">{children}</p> : null)

const TOAST_MS = 6000

// A green message that fades out by itself. One at a time; the parent owns the message.
export const Toast = ({ message, onDismiss }) => {
  useEffect(() => {
    if (!message) return undefined
    const timer = setTimeout(onDismiss, TOAST_MS)
    return () => clearTimeout(timer)
  }, [message, onDismiss])

  if (!message) return null
  return createPortal(
    <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:w-96 z-[90]">
      <div
        role="status"
        className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 shadow-lg"
      >
        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
        <p className="flex-1">{message}</p>
        <button type="button" onClick={onDismiss} aria-label="Dismiss message" className="shrink-0 text-emerald-700 hover:text-emerald-800">
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>,
    document.body,
  )
}

// A modal for forms (ConfirmDialog is only for yes/no questions). Content is mounted only while the modal is open, so
// closing it drops everything typed into it, passwords included. `busy` blocks every way of closing it mid-request.
export const ProfileModal = ({ title, titleId, onClose, busy = false, children }) => {
  useEffect(() => {
    document.body.classList.add('overflow-hidden')
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.classList.remove('overflow-hidden')
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [busy, onClose])

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={() => {
          if (!busy) onClose()
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative bg-white rounded-xl shadow-lg border border-slate-200 w-full max-w-md max-h-[90vh] overflow-y-auto p-5 sm:p-6"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 id={titleId} className="text-lg font-bold text-slate-800">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
            className="shrink-0 p-1 text-slate-500 hover:text-slate-900 disabled:opacity-50 transition-all duration-200"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
