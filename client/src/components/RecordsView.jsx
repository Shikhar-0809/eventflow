import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, Search, SearchX } from 'lucide-react'
import { api } from '../utils/api'
import { formatCurrency } from '../utils/formatCurrency'
import { useAuthStore } from '../store/authStore'

const STATUS_STYLES = {
  confirmed: 'bg-teal-100 text-teal-800',
  pending: 'bg-amber-100 text-amber-800',
  cancelled: 'bg-red-100 text-red-700',
  completed: 'bg-indigo-100 text-indigo-700',
}

const STATUS_LABELS = {
  confirmed: 'Confirmed',
  pending: 'Pending',
  cancelled: 'Cancelled',
  completed: 'Completed',
}

const EVENT_TYPE_LABELS = {
  wedding: 'Wedding',
  birthday: 'Birthday',
  corporate: 'Corporate',
  other: 'Other',
}

const DEFAULT_FILTERS = {
  search: '',
  from: '',
  to: '',
  eventType: '',
  status: '',
  sortBy: 'date',
  sortOrder: 'asc',
}

const formatDisplayDate = (dateStr) => {
  const normalized = String(dateStr).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return '—'
  const date = new Date(`${normalized}T00:00:00`)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const formatEventType = (type) => EVENT_TYPE_LABELS[type] ?? 'Other'

const truncateVenue = (venue, max = 20) => {
  const text = venue?.trim() || '—'
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

const buildApiParams = (filters) => {
  const params = {}
  if (filters.from) params.from = filters.from
  if (filters.to) params.to = filters.to
  if (filters.eventType) params.event_type = filters.eventType
  if (filters.status) params.status = filters.status
  if (filters.search.trim()) params.search = filters.search.trim()
  if (filters.sortBy === 'revenue') params.sort_by = 'revenue'
  if (filters.sortBy === 'expenses') params.sort_by = 'expenses'
  if (filters.sortBy === 'profit') params.sort_by = 'profit'
  if (filters.sortOrder) params.sort_order = filters.sortOrder
  return params
}

const TableSkeleton = () => (
  <tbody>
    {Array.from({ length: 5 }, (_, i) => (
      <tr key={i} className="animate-pulse">
        {Array.from({ length: 12 }, (__, col) => (
          <td key={col} className="px-3 py-3">
            <div className="h-4 bg-slate-100 rounded" />
          </td>
        ))}
      </tr>
    ))}
  </tbody>
)

export const RecordsView = () => {
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [records, setRecords] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState(null)
  const searchDebounceRef = useRef(null)
  const businessName = useAuthStore((state) => state.businessName)

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(filters.search)
    }, 300)
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [filters.search])

  const fetchRecords = useCallback(async (activeFilters, searchValue) => {
    setIsLoading(true)
    setError(null)
    try {
      const params = buildApiParams({ ...activeFilters, search: searchValue })
      const data = await api.getRecords(params)
      setRecords(Array.isArray(data) ? data : [])
    } catch (err) {
      if (err.status === 401) {
        useAuthStore.setState({ isAuthenticated: false, isLoading: false })
        return
      }
      setError(err.message ?? 'Something went wrong. Please try again.')
      setRecords([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRecords(filters, debouncedSearch)
  }, [
    filters.from,
    filters.to,
    filters.eventType,
    filters.status,
    filters.sortBy,
    filters.sortOrder,
    debouncedSearch,
    fetchRecords,
  ])

  const summary = useMemo(() => {
    const totalRevenue = records.reduce((sum, record) => sum + Number(record.total ?? 0), 0)
    const totalExpenses = records.reduce((sum, record) => sum + Number(record.total_expenses ?? 0), 0)
    return {
      count: records.length,
      totalRevenue,
      totalExpenses,
      netProfit: totalRevenue - totalExpenses,
    }
  }, [records])

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS)
    setDebouncedSearch('')
  }

  const toggleSortOrder = () => {
    setFilters((prev) => ({
      ...prev,
      sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc',
    }))
  }

  // The spreadsheet library is large, so it is only fetched when someone actually exports.
  const handleExport = async () => {
    if (records.length === 0 || isExporting) return
    setExportError(null)
    setIsExporting(true)
    try {
      const { exportToExcel } = await import('../utils/excelExporter')
      exportToExcel(records, { from: filters.from || undefined, to: filters.to || undefined, businessName })
    } catch {
      setExportError("Couldn't prepare the Excel file. Please check your connection and try again.")
    } finally {
      setIsExporting(false)
    }
  }

  const canExport = !isLoading && !isExporting && records.length > 0

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-6 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Records</h1>
        <button
          type="button"
          onClick={handleExport}
          disabled={!canExport}
          className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
            canExport
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-slate-300 text-slate-500 cursor-not-allowed'
          }`}
        >
          <Download className="w-4 h-4" />
          Export to Excel
        </button>
      </div>

      {exportError && (
        <p role="alert" className="text-sm text-red-700 bg-red-100 border border-red-400 rounded-lg px-3 py-2">
          {exportError}
        </p>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            placeholder="Search by name, venue, phone..."
            className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all duration-200"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          <div>
            <label htmlFor="records_from" className="block text-xs text-slate-500 mb-1">From</label>
            <input
              id="records_from"
              type="date"
              value={filters.from}
              onChange={(e) => updateFilter('from', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label htmlFor="records_to" className="block text-xs text-slate-500 mb-1">To</label>
            <input
              id="records_to"
              type="date"
              value={filters.to}
              onChange={(e) => updateFilter('to', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label htmlFor="records_event_type" className="block text-xs text-slate-500 mb-1">Event Type</label>
            <select
              id="records_event_type"
              value={filters.eventType}
              onChange={(e) => updateFilter('eventType', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
            >
              <option value="">All</option>
              <option value="wedding">Wedding</option>
              <option value="birthday">Birthday</option>
              <option value="corporate">Corporate</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label htmlFor="records_status" className="block text-xs text-slate-500 mb-1">Status</label>
            <select
              id="records_status"
              value={filters.status}
              onChange={(e) => updateFilter('status', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
            >
              <option value="">All</option>
              <option value="confirmed">Confirmed</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div>
            <label htmlFor="records_sort_by" className="block text-xs text-slate-500 mb-1">Sort By</label>
            <select
              id="records_sort_by"
              value={filters.sortBy}
              onChange={(e) => updateFilter('sortBy', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
            >
              <option value="date">Date</option>
              <option value="revenue">Revenue</option>
              <option value="expenses">Expenses</option>
              <option value="profit">Profit</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={toggleSortOrder}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-all duration-200"
            >
              {filters.sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={clearFilters}
          className="text-sm text-slate-500 hover:text-slate-800 transition-all duration-200"
        >
          Clear Filters
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {error && (
          <div className="m-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-red-700">{error}</p>
            <button
              type="button"
              onClick={() => fetchRecords(filters, debouncedSearch)}
              className="px-3 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-all duration-200 shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && records.length === 0 && !error ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-slate-500">
            <SearchX className="w-10 h-10 mb-3 text-slate-400" aria-hidden="true" />
            <p className="text-sm">No bookings match your filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="bg-slate-100 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  <th className="px-3 py-3">#</th>
                  <th className="px-3 py-3">Client</th>
                  <th className="px-3 py-3">Event Type</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Venue</th>
                  <th className="px-3 py-3">Guests</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Total</th>
                  <th className="px-3 py-3">Advance</th>
                  <th className="px-3 py-3">Pending</th>
                  <th className="px-3 py-3">Expenses</th>
                  <th className="px-3 py-3">Profit</th>
                </tr>
              </thead>
              {isLoading ? (
                <TableSkeleton />
              ) : (
                <tbody>
                  {records.map((record, index) => {
                    const status = record.status ?? 'confirmed'
                    const statusClass = STATUS_STYLES[status] ?? STATUS_STYLES.confirmed
                    const profit = Number(record.profit ?? 0)
                    const rowBg = index % 2 === 0 ? 'bg-white' : 'bg-slate-50'

                    return (
                      <tr key={record.id} className={rowBg}>
                        <td className="px-3 py-3 text-slate-600">{index + 1}</td>
                        <td className="px-3 py-3 font-medium text-slate-800">{record.client_name}</td>
                        <td className="px-3 py-3 text-slate-700">{formatEventType(record.event_type)}</td>
                        <td className="px-3 py-3 text-slate-700 whitespace-nowrap">{formatDisplayDate(record.event_date)}</td>
                        <td className="px-3 py-3 text-slate-700" title={record.venue ?? ''}>
                          {truncateVenue(record.venue)}
                        </td>
                        <td className="px-3 py-3 text-slate-700">{record.guest_count}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusClass}`}>
                            {STATUS_LABELS[status] ?? status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-800">{formatCurrency(record.total)}</td>
                        <td className="px-3 py-3 text-slate-800">{formatCurrency(record.advance)}</td>
                        <td className="px-3 py-3 text-slate-800">{formatCurrency(record.pending_balance)}</td>
                        <td className="px-3 py-3 text-slate-800">{formatCurrency(record.total_expenses)}</td>
                        <td className={`px-3 py-3 font-semibold ${profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {formatCurrency(profit)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              )}
            </table>
          </div>
        )}

        {!isLoading && records.length > 0 && (
          <div className="border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            Showing {summary.count} bookings | Total Revenue:{' '}
            <span className="text-slate-800 font-semibold">{formatCurrency(summary.totalRevenue)}</span>
            {' '}| Total Expenses:{' '}
            <span className="text-slate-800 font-semibold">{formatCurrency(summary.totalExpenses)}</span>
            {' '}| Net Profit:{' '}
            <span className="text-slate-800 font-semibold">{formatCurrency(summary.netProfit)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
