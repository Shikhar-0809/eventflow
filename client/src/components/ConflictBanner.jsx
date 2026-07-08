import { AlertTriangle } from 'lucide-react'

export const ConflictBanner = ({ clientName, eventType }) => {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <p>
        Conflict: {clientName}&apos;s {eventType} is already booked on this date.
      </p>
    </div>
  )
}
