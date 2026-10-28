import { useEffect } from 'react'
import { BrandMark } from './BrandMark'

export const NotFoundPage = () => {
  useEffect(() => {
    document.title = 'Page not found — EventFlow'
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <main className="bg-white border border-slate-200 rounded-xl shadow-lg w-full max-w-md p-8 text-center">
        <div className="bg-teal-600 rounded-xl p-3 mb-4 inline-flex">
          <BrandMark className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">This page doesn&apos;t exist</h1>
        <p className="mt-2 text-sm text-slate-500">
          The link may be mistyped or out of date. You can go back to EventFlow from here.
        </p>
        <a
          href="/"
          className="mt-6 inline-block w-full py-2.5 rounded-lg font-medium bg-teal-600 hover:bg-teal-700 text-white transition-all duration-200"
        >
          Back to EventFlow
        </a>
      </main>
    </div>
  )
}
