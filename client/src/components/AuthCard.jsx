import { CalendarDays } from 'lucide-react'

// The shared frame of the logged-out screens: logo, title, subtitle and the privacy link.
export const AuthCard = ({ subtitle, children }) => (
  <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg w-full max-w-md p-6 sm:p-8">
      <div className="flex flex-col items-center mb-8">
        <div className="bg-teal-600 rounded-xl p-3 mb-4">
          <CalendarDays className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">EventFlow</h1>
        <p className="mt-1 text-sm text-slate-500 text-center">{subtitle}</p>
      </div>

      {children}

      <p className="mt-6 text-center text-sm text-slate-500">
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-teal-600 hover:text-teal-700 transition-all duration-200"
        >
          Privacy Policy
        </a>
      </p>
    </div>
  </div>
)

export const authInputClass = (hasError) =>
  `w-full px-3 py-2 border rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all duration-200 ${
    hasError ? 'border-red-400' : 'border-slate-200'
  }`

export const ErrorMessage = ({ children }) =>
  children ? (
    <p role="alert" className="text-sm text-red-700 bg-red-100 border border-red-400 rounded-lg px-3 py-2">
      {children}
    </p>
  ) : null
