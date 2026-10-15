import { useEffect, useRef, useState } from 'react'

const formatCountdown = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

// "Resend code in 0:42" until the cooldown ends, then an active "Resend code". onResend() must throw on failure;
// a 429 from the server carries retryAfter (seconds) and the countdown restarts from that.
export const ResendOtpButton = ({ onResend, initialCooldown = 60 }) => {
  const [remaining, setRemaining] = useState(initialCooldown)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState(null)
  const endsAtRef = useRef(Date.now() + initialCooldown * 1000)

  const startCooldown = (seconds) => {
    endsAtRef.current = Date.now() + seconds * 1000
    setRemaining(seconds)
  }

  useEffect(() => {
    if (remaining <= 0) return undefined
    // Measured against a deadline, not by counting ticks, so a throttled background tab still ends on time.
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000))
      setRemaining(left)
    }, 1000)
    return () => clearInterval(timer)
  }, [remaining > 0])

  const handleClick = async () => {
    if (isSending || remaining > 0) return
    setError(null)
    setIsSending(true)
    try {
      await onResend()
      startCooldown(initialCooldown)
    } catch (err) {
      if (err.status === 429 && err.retryAfter) {
        startCooldown(err.retryAfter)
      } else {
        setError(err.message || 'We could not send a new code. Please try again.')
      }
    } finally {
      setIsSending(false)
    }
  }

  const isDisabled = isSending || remaining > 0

  return (
    <div className="text-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        className={`text-sm font-medium transition-all duration-200 ${
          isDisabled ? 'text-slate-500 cursor-not-allowed' : 'text-teal-600 hover:text-teal-700'
        }`}
      >
        {isSending ? 'Sending...' : remaining > 0 ? `Resend code in ${formatCountdown(remaining)}` : 'Resend code'}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
