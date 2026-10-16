import { useCallback, useEffect, useState } from 'react'
import { api } from '../../utils/api'
import { formatRelativeTime } from '../../utils/formatRelativeTime'
import { errorText, expireIfSessionLost } from '../../utils/profileErrors'
import { ErrorMessage } from '../AuthCard'
import { TextLinkButton } from './profileUi'

const absoluteDateTime = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? undefined
    : date.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

// The last 10 sign-ins: a coarse device label and a time, nothing else. The newest row is marked "Most recent"
// (not "This device": the server cannot tell which row belongs to the browser looking at it).
export const SignInsList = () => {
  const [signIns, setSignIns] = useState(null)
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setSignIns(await api.getSignIns())
    } catch (err) {
      if (!expireIfSessionLost(err)) setError(errorText(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-800 mb-3">Recent sign-ins</h3>

      {isLoading && !signIns && (
        <div className="space-y-2 animate-pulse" aria-hidden="true">
          <div className="h-10 bg-slate-100 rounded-lg" />
          <div className="h-10 bg-slate-100 rounded-lg" />
          <div className="h-10 bg-slate-100 rounded-lg" />
        </div>
      )}

      {error && !signIns && (
        <div className="space-y-2">
          <ErrorMessage>{error}</ErrorMessage>
          <TextLinkButton onClick={load}>Retry</TextLinkButton>
        </div>
      )}

      {signIns && signIns.length === 0 && <p className="text-sm text-slate-500">No sign-ins recorded yet.</p>}

      {signIns && signIns.length > 0 && (
        <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg" data-testid="sign-in-list">
          {signIns.map((entry, index) => (
            <li key={`${entry.created_at}-${index}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
              <span className="flex items-center gap-2 text-slate-800">
                {entry.device_label}
                {index === 0 && (
                  <span className="rounded-full bg-teal-100 text-teal-800 px-2 py-0.5 text-xs font-medium">Most recent</span>
                )}
              </span>
              <span className="text-slate-500" title={absoluteDateTime(entry.created_at)}>
                {formatRelativeTime(entry.created_at) ?? absoluteDateTime(entry.created_at) ?? '—'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
