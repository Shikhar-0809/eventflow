import { AlertTriangle } from 'lucide-react'
import { useLangStore } from '../store/langStore'
import { t } from '../utils/i18n'

export const ConflictBanner = ({ clientName, eventType }) => {
  const { lang } = useLangStore()

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <p>
        {t(lang, 'conflictPrefix')} {clientName}&apos;s {eventType} {t(lang, 'conflictSuffix')}
      </p>
    </div>
  )
}
