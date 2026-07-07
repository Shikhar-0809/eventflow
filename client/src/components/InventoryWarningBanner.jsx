import { AlertTriangle } from 'lucide-react'
import { useLangStore } from '../store/langStore'
import { t } from '../utils/i18n'

export const InventoryWarningBanner = ({ shortfalls }) => {
  const { lang } = useLangStore()

  if (!shortfalls?.length) return null

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-amber-800 text-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium">{t(lang, 'inventoryWarningTitle')}</p>
          <ul className="list-disc list-inside space-y-0.5">
            {shortfalls.map((row) => (
              <li key={row.item_id}>
                {row.name}: {t(lang, 'inventoryWarningNeed')} {row.requested},{' '}
                {t(lang, 'inventoryWarningOnly')} {row.available}{' '}
                {t(lang, 'inventoryWarningAvailable')}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
