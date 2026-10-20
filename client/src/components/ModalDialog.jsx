import { useEffect, useRef } from 'react'

// The shared frame of every overlay (confirm dialogs, forms, the booking drawer and sheet): a native <dialog> opened
// with showModal(). The browser supplies the top layer (later dialogs stack on earlier ones), the inert page behind,
// the Tab loop and Escape. This adds what it does not: focus returns to the element that opened it, Escape and a click
// on the backdrop call `onClose` unless `busy` (a save or delete is running), and the page behind stops scrolling.
//
// Mount it to open, unmount it to close (every caller already renders nothing while closed). The <dialog> itself is
// the full-screen backdrop: give it the backdrop colour, layout and padding through `className` (see .modal-dialog in
// index.css for the reset) and put the visible panel inside. An element with `data-autofocus` gets the focus first.

const FOCUSABLE =
  'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])'

// The controls Tab can reach inside a dialog, in order.
const tabbableIn = (dialog) =>
  [...dialog.querySelectorAll(FOCUSABLE)].filter(
    (el) => !el.disabled && el.tabIndex >= 0 && !el.closest('[inert]') && el.getClientRects().length > 0,
  )

let scrollLocks = 0
const lockScroll = () => {
  if (scrollLocks++ === 0) document.body.classList.add('overflow-hidden')
}
const unlockScroll = () => {
  if (--scrollLocks === 0) document.body.classList.remove('overflow-hidden')
}

// The control that was just clicked. A mouse click does not always move focus to it (Safari never focuses buttons on
// click; a FullCalendar event does not take focus either), so activeElement can be <body> or something stale such as
// the sidebar item clicked earlier. A click in the last second is the better guess for what opened the dialog.
let lastClick = { el: null, at: 0 }
if (typeof document !== 'undefined') {
  document.addEventListener(
    'click',
    (event) => {
      const el = event.target instanceof Element ? event.target.closest('button, a[href], [tabindex]') : null
      lastClick = { el, at: Date.now() }
    },
    true,
  )
}
const CLICK_WINDOW_MS = 1000

// stopPropagation: clicks inside never reach React ancestors (a dialog portalled out of a drawer must not trigger the drawer's own click handlers).
export const ModalDialog = ({ onClose, busy = false, closeOnBackdrop = true, stopPropagation = false, className = '', children, ...rest }) => {
  const dialogRef = useRef(null)
  const pressStartedOnBackdrop = useRef(false)

  useEffect(() => {
    const dialog = dialogRef.current
    const active = document.activeElement
    const clicked = Date.now() - lastClick.at < CLICK_WINDOW_MS ? lastClick.el : null
    const opener = clicked ?? (active && active !== document.body ? active : null)
    if (!dialog.open) dialog.showModal()
    lockScroll()
    dialog.querySelector('[data-autofocus]')?.focus()
    return () => {
      unlockScroll()
      if (dialog.open) dialog.close()
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      // Implicit on <dialog>, written out so [role=dialog] selectors in the verify scripts and older tools still match.
      role="dialog"
      className={`modal-dialog ${className}`}
      // Escape: never let the browser close it by itself, the owner decides (it unmounts this component).
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      // Tab and Shift+Tab wrap inside the dialog. The browser alone would let focus leave to its own toolbar first.
      onKeyDown={(event) => {
        if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return
        const items = tabbableIn(event.currentTarget)
        if (items.length === 0) {
          event.preventDefault()
          return
        }
        const first = items[0]
        const last = items[items.length - 1]
        if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }}
      // A click whose target is the <dialog> itself landed on the backdrop. Both the press and the release must be
      // there, so selecting text inside the panel and letting go outside does not close it.
      onMouseDown={(event) => {
        pressStartedOnBackdrop.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        if (closeOnBackdrop && !busy && pressStartedOnBackdrop.current && event.target === event.currentTarget) onClose()
        pressStartedOnBackdrop.current = false
        if (stopPropagation) event.stopPropagation()
      }}
      {...rest}
    >
      {children}
    </dialog>
  )
}
