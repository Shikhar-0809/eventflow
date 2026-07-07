import { useLangStore } from '../store/langStore'
import { t } from '../utils/i18n'

export const ConfirmDialog = ({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  isConfirming = false,
  onConfirm,
  onCancel,
}) => {
  const { lang } = useLangStore()

  if (!isOpen) return null

  const resolvedConfirmLabel = confirmLabel ?? t(lang, 'confirm')
  const resolvedCancelLabel = cancelLabel ?? t(lang, 'confirmDialogCancel')

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label={t(lang, 'close')}
        onClick={isConfirming ? undefined : onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="relative bg-white rounded-xl shadow-lg border border-slate-200 w-full max-w-md p-6"
      >
        <h2 id="confirm-dialog-title" className="text-lg font-bold text-slate-800 mb-2">
          {title}
        </h2>
        <p className="text-sm text-slate-600 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isConfirming}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition-all duration-200 disabled:opacity-50"
          >
            {resolvedCancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            className="px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-all duration-200 disabled:opacity-50"
          >
            {isConfirming ? t(lang, 'submitting') : resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
