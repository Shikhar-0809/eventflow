import { Component, Suspense } from 'react'
import { Loader2 } from 'lucide-react'

export const ScreenLoading = () => (
  <div
    role="status"
    className="flex items-center justify-center gap-2 min-h-[50vh] h-full text-slate-500"
  >
    <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
    <span>Loading...</span>
  </div>
)

const ReloadButton = () => (
  <button
    type="button"
    onClick={() => window.location.reload()}
    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-all duration-200"
  >
    Reload
  </button>
)

// Catches a lazy chunk that fails to load (for example after a new deploy replaced the old files) and any
// render crash inside the screen. Give it a `key` that changes with the screen so it resets on navigation.
// variant "overlay" is for the booking panels that sit above the page: it shows a bottom banner instead.
class ScreenErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    if (this.props.variant === 'overlay') {
      return (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-3 bg-white border border-red-400 text-red-700 rounded-lg shadow-lg px-4 py-3 text-sm"
        >
          <span>Couldn&apos;t load this screen.</span>
          <ReloadButton />
        </div>
      )
    }

    return (
      <div role="alert" className="flex flex-col items-center justify-center gap-4 min-h-[50vh] p-6 text-center text-slate-700">
        <p>Couldn&apos;t load this screen.</p>
        <ReloadButton />
      </div>
    )
  }
}

export const ScreenBoundary = ({ variant = 'screen', fallback, children }) => (
  <ScreenErrorBoundary variant={variant}>
    <Suspense fallback={fallback === undefined ? <ScreenLoading /> : fallback}>{children}</Suspense>
  </ScreenErrorBoundary>
)
