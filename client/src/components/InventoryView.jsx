import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Plus } from 'lucide-react'
import { api } from '../utils/api'
import { useAuthStore } from '../store/authStore'
import { useInventoryStore } from '../store/inventoryStore'
import { InventoryItemCard } from './InventoryItemCard'
import { DamagedItemsPanel } from './DamagedItemsPanel'
import { AddInventoryItemModal } from './AddInventoryItemModal'

const REORDER_THRESHOLD = 0.2

const CardSkeleton = () => (
  <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200 animate-pulse">
    <div className="h-5 bg-slate-200 rounded w-32 mb-3" />
    <div className="h-4 bg-slate-100 rounded w-24 mb-2" />
    <div className="flex gap-2 mt-3">
      <div className="h-6 bg-slate-100 rounded-full w-28" />
      <div className="h-6 bg-slate-100 rounded-full w-24" />
    </div>
  </div>
)

export const InventoryView = () => {
  const { items, setItems, upsertItem } = useInventoryStore()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)

  const fetchInventory = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await api.getInventory()
      setItems(data)
    } catch (err) {
      if (err.status === 401) {
        useAuthStore.setState({ isAuthenticated: false, isLoading: false })
        return
      }
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [setItems])

  useEffect(() => {
    fetchInventory()
  }, [fetchInventory])

  const handleItemUpdated = (item) => {
    upsertItem(item)
  }

  const lowStockItems = useMemo(
    () => items.filter(
      (item) => (item.usable ?? 0) > 0 && (item.availability_ratio ?? 1) < REORDER_THRESHOLD,
    ),
    [items],
  )

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto p-4 md:p-6 space-y-6 min-w-0">
        <div className="flex items-center justify-between gap-4">
          <div className="h-8 bg-slate-200 rounded w-32 animate-pulse" />
          <div className="h-10 bg-slate-200 rounded-lg w-28 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8 text-center max-w-md">
          <p className="text-red-700 bg-red-100 border border-red-400 rounded-lg px-4 py-3 text-sm">
            {error}
          </p>
          <button
            type="button"
            onClick={fetchInventory}
            className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-all duration-200"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-8 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Inventory</h1>
        <button
          type="button"
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-all duration-200"
        >
          <Plus className="w-4 h-4" />
          Add Item
        </button>
      </div>

      {lowStockItems.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
            <p className="text-amber-800 font-semibold text-sm">
              Heads up — some items are running low this month
            </p>
          </div>
          <ul className="mt-2 space-y-1 pl-6">
            {lowStockItems.map((item) => {
              const usable = item.usable ?? 0
              const bookedThisMonth = item.booked_this_month ?? 0
              const unbooked = usable - bookedThisMonth
              const percentAvailable = Math.round((item.availability_ratio ?? 0) * 100)

              return (
                <li key={item.id} className="text-sm text-amber-700">
                  {item.name} — only {percentAvailable}% available ({unbooked} of {usable} unbooked this month)
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-8 text-center">
          No data yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((item) => (
            <InventoryItemCard
              key={item.id}
              item={item}
              onUpdated={handleItemUpdated}
            />
          ))}
        </div>
      )}

      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
          Damaged / Repair Needed
        </h2>
        <DamagedItemsPanel items={items} onUpdated={handleItemUpdated} />
      </section>

      <AddInventoryItemModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdded={handleItemUpdated}
      />
    </div>
  )
}
