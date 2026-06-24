import { AlertTriangle } from 'lucide-react'

export const InventoryWarningBanner = ({ shortfalls }) => {
  if (!shortfalls?.length) return null

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-amber-800 text-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium">Not enough inventory for this date</p>
          <ul className="list-disc list-inside space-y-0.5">
            {shortfalls.map((row) => (
              <li key={row.item_id}>
                {row.name}: need {row.requested}, only {row.available} available
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
