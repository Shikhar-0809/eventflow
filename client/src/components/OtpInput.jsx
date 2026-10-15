import { useRef, useState } from 'react'

const LENGTH = 6

// Six single-digit boxes for an emailed code. Typing advances, Backspace goes back, and pasting (or a phone's
// one-time-code autofill) fills every box. onComplete(code) fires once all six are filled. To clear the boxes
// after a wrong code, give the component a new `key`.
export const OtpInput = ({ onComplete, disabled = false, hasError = false }) => {
  const [digits, setDigits] = useState(() => Array(LENGTH).fill(''))
  const inputRefs = useRef([])

  const focusBox = (index) => {
    const box = inputRefs.current[Math.max(0, Math.min(LENGTH - 1, index))]
    if (box) {
      box.focus()
      box.select()
    }
  }

  const commit = (next, focusIndex) => {
    setDigits(next)
    focusBox(focusIndex)
    if (next.every((digit) => digit !== '')) onComplete(next.join(''))
  }

  // Fills from `start` with whatever digits are in `text` (a paste, or autofill that put several characters in one box).
  const fillFrom = (start, text) => {
    const pasted = text.replace(/\D/g, '').slice(0, LENGTH - start)
    if (pasted === '') return
    const next = [...digits]
    pasted.split('').forEach((digit, offset) => {
      next[start + offset] = digit
    })
    commit(next, start + pasted.length)
  }

  const handleChange = (index, value) => {
    const cleaned = value.replace(/\D/g, '')
    if (cleaned === '') {
      const next = [...digits]
      next[index] = ''
      setDigits(next)
      return
    }
    if (cleaned.length > 1) {
      fillFrom(index, cleaned)
      return
    }
    const next = [...digits]
    next[index] = cleaned
    commit(next, index + 1)
  }

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && digits[index] === '') {
      e.preventDefault()
      const next = [...digits]
      if (index > 0) next[index - 1] = ''
      setDigits(next)
      focusBox(index - 1)
    } else if (e.key === 'ArrowLeft') {
      focusBox(index - 1)
    } else if (e.key === 'ArrowRight') {
      focusBox(index + 1)
    }
  }

  const handlePaste = (index, e) => {
    e.preventDefault()
    // A full code always replaces all six boxes, wherever the cursor was.
    const text = e.clipboardData.getData('text')
    fillFrom(text.replace(/\D/g, '').length >= LENGTH ? 0 : index, text)
  }

  return (
    <div className="flex justify-center gap-2" role="group" aria-label="6-digit code">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => {
            inputRefs.current[index] = node
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={index === LENGTH - 1 ? 1 : LENGTH}
          value={digit}
          disabled={disabled}
          autoFocus={index === 0}
          aria-label={`Digit ${index + 1} of ${LENGTH}`}
          aria-invalid={hasError}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={(e) => handlePaste(index, e)}
          onFocus={(e) => e.target.select()}
          className={`w-11 h-12 sm:w-12 text-center text-xl font-semibold border rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all duration-200 disabled:bg-slate-100 disabled:text-slate-400 ${
            hasError ? 'border-red-400' : 'border-slate-200'
          }`}
        />
      ))}
    </div>
  )
}
