import { useCallback, useEffect, useState } from 'react'
import { useProfileStore } from '../store/profileStore'
import { handleProfileError } from '../utils/profileErrors'
import { AccountSection } from './profile/AccountSection'
import { BusinessSection } from './profile/BusinessSection'
import { ChangeEmailModal } from './profile/ChangeEmailModal'
import { DangerZone } from './profile/DangerZone'
import { SecuritySection } from './profile/SecuritySection'
import { SummarySection } from './profile/SummarySection'
import { Toast } from './profile/profileUi'

const SectionSkeleton = ({ rows = 3 }) => (
  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 animate-pulse">
    <div className="h-5 bg-slate-200 rounded w-32 mb-4" />
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-4 bg-slate-100 rounded w-full max-w-md" />
      ))}
    </div>
  </div>
)

export const ProfileView = () => {
  const profile = useProfileStore((state) => state.profile)
  const status = useProfileStore((state) => state.status)
  const error = useProfileStore((state) => state.error)
  const loadProfile = useProfileStore((state) => state.loadProfile)
  const [toast, setToast] = useState(null)
  const [showEmailModal, setShowEmailModal] = useState(false)

  const load = useCallback(() => {
    // A failure is already in the store (shown below); a dead session sends the merchant to login.
    loadProfile().catch((err) => handleProfileError(err))
  }, [loadProfile])

  // Counts and the password date change elsewhere, so the screen refreshes every time it opens.
  useEffect(() => {
    load()
  }, [load])

  const dismissToast = useCallback(() => setToast(null), [])

  if (!profile && status === 'error') {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8 text-center max-w-md">
          <p role="alert" className="text-red-700 bg-red-100 border border-red-400 rounded-lg px-4 py-3 text-sm">
            {error}
          </p>
          <button
            type="button"
            onClick={load}
            className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-all duration-200"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="h-full overflow-y-auto p-4 sm:p-6" aria-busy="true">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="h-8 bg-slate-200 rounded w-32 animate-pulse" />
          <SectionSkeleton />
          <SectionSkeleton rows={4} />
          <SectionSkeleton rows={2} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-slate-800">Profile</h1>

        <AccountSection profile={profile} onChangeEmail={() => setShowEmailModal(true)} />
        <BusinessSection profile={profile} onNotice={setToast} />
        <SummarySection summary={profile.summary} />
        <SecuritySection profile={profile} onNotice={setToast} />
        <DangerZone businessName={profile.business_name} />
      </div>

      {showEmailModal && (
        <ChangeEmailModal
          onClose={() => setShowEmailModal(false)}
          onChanged={(message) => {
            setShowEmailModal(false)
            setToast(message)
          }}
        />
      )}

      <Toast message={toast} onDismiss={dismissToast} />
    </div>
  )
}
