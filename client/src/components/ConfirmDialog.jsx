import { Loader2 } from 'lucide-react'

export const ConfirmDialog = ({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  confirmVariant = 'default',
  confirmingLabel = 'Saving...',
  isConfirming = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null

  const resolvedConfirmLabel = confirmLabel ?? 'Confirm'
  const resolvedCancelLabel = cancelLabel ?? 'Cancel'
  const confirmButtonClass = confirmVariant === 'danger'
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : 'bg-teal-600 hover:bg-teal-700 text-white'

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
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
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 disabled:opacity-50 flex items-center gap-2 ${confirmButtonClass}`}
          >
            {isConfirming && <Loader2 className="w-4 h-4 animate-spin" />}
            {isConfirming ? confirmingLabel : resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
