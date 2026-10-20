import { createPortal } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { ModalDialog } from './ModalDialog'

export const ConfirmDialog = ({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  confirmVariant = 'default',
  focusCancel = false,
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

  return createPortal(
    // Opened later than the drawer or sheet it was triggered from, so the top layer stacks it above them; when it
    // closes, focus returns to the button that opened it (inside that drawer or sheet).
    <ModalDialog
      onClose={onCancel}
      busy={isConfirming}
      aria-labelledby="confirm-dialog-title"
      className="open:flex items-center justify-center p-4 bg-black/40"
      stopPropagation
    >
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 w-full max-w-md p-6">
        <h2 id="confirm-dialog-title" className="text-lg font-bold text-slate-800 mb-2">
          {title}
        </h2>
        <p className="text-sm text-slate-600 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onCancel()
            }}
            disabled={isConfirming}
            data-autofocus={focusCancel ? '' : undefined}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition-all duration-200 disabled:opacity-50"
          >
            {resolvedCancelLabel}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onConfirm()
            }}
            disabled={isConfirming}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 disabled:opacity-50 flex items-center gap-2 ${confirmButtonClass}`}
          >
            {isConfirming && <Loader2 className="w-4 h-4 animate-spin" />}
            {isConfirming ? confirmingLabel : resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </ModalDialog>,
    document.body,
  )
}
