import { Card } from './profileUi'

const TILES = [
  ['bookings', 'Bookings'],
  ['upcoming', 'Upcoming'],
  ['inventory_items', 'Inventory items'],
  ['clients', 'Clients'],
]

export const SummarySection = ({ summary }) => (
  <Card id="summary" title="Account summary">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {TILES.map(([key, label]) => (
        <div key={key} data-stat={key} className="bg-slate-50 rounded-lg border border-slate-200 p-3">
          <p className="text-xl font-bold text-slate-800">{Number(summary?.[key] ?? 0).toLocaleString('en-IN')}</p>
          <p className="text-xs text-slate-500 mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  </Card>
)
