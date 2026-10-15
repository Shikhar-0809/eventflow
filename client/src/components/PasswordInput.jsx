import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

// Password field with a show/hide toggle. The value stays in the parent's state; this component only
// flips the input type. It goes back to hidden whenever the surrounding form is submitted.
export const PasswordInput = ({ className = '', ...inputProps }) => {
  const inputRef = useRef(null)
  const selectionRef = useRef(null)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const form = inputRef.current?.form
    if (!form) return undefined
    const hide = () => setRevealed(false)
    form.addEventListener('submit', hide)
    return () => form.removeEventListener('submit', hide)
  }, [])

  // Changing the input type resets the caret in Chrome (after the layout effect), so restore it twice.
  useLayoutEffect(() => {
    const input = inputRef.current
    const selection = selectionRef.current
    selectionRef.current = null
    if (!input || !selection) return undefined
    const restore = () => {
      if (document.activeElement === input) input.setSelectionRange(selection.start, selection.end)
    }
    restore()
    const frame = requestAnimationFrame(restore)
    return () => cancelAnimationFrame(frame)
  }, [revealed])

  const toggle = () => {
    const input = inputRef.current
    if (input) selectionRef.current = { start: input.selectionStart, end: input.selectionEnd }
    setRevealed((prev) => !prev)
  }

  return (
    <div className="relative">
      <input
        {...inputProps}
        ref={inputRef}
        type={revealed ? 'text' : 'password'}
        className={`${className} pr-10`}
      />
      <button
        type="button"
        onClick={toggle}
        // Keep focus (and the caret) in the field when the button is clicked with a mouse.
        onMouseDown={(e) => e.preventDefault()}
        aria-label={revealed ? 'Hide password' : 'Show password'}
        aria-pressed={revealed}
        className="absolute inset-y-0 right-0 px-3 flex items-center rounded-r-lg text-slate-500 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 transition-all duration-200"
      >
        {revealed ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
      </button>
    </div>
  )
}
