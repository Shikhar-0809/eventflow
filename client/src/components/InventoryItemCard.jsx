import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { api } from '../utils/api'
import { formatCurrency } from '../utils/formatCurrency'
import { useInventoryStore } from '../store/inventoryStore'
import { inventoryQuantityUpdateSchema } from '../schemas/inventory.schema.js'
import { ConfirmDialog } from './ConfirmDialog'

export const InventoryItemCard = ({ item, onUpdated }) => {
  const removeItem = useInventoryStore((state) => state.removeItem)

  const [isEditingQuantity, setIsEditingQuantity] = useState(false)
  const [quantityEditValue, setQuantityEditValue] = useState('')
  const [quantityEditError, setQuantityEditError] = useState(null)
  const [isSavingQuantity, setIsSavingQuantity] = useState(false)

  const [isEditingPrice, setIsEditingPrice] = useState(false)
  const [priceEditValue, setPriceEditValue] = useState('')
  const [priceEditError, setPriceEditError] = useState(null)
  const [isSavingPrice, setIsSavingPrice] = useState(false)

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const unitPrice = item.unit_price ?? 0

  const startQuantityEdit = () => {
    setQuantityEditValue(String(item.total_quantity))
    setQuantityEditError(null)
    setDeleteError(null)
    setIsEditingQuantity(true)
  }

  const cancelQuantityEdit = () => {
    setIsEditingQuantity(false)
    setQuantityEditError(null)
  }

  const saveQuantity = async () => {
    const parsed = inventoryQuantityUpdateSchema.safeParse({
      total_quantity: Number(quantityEditValue),
    })
    if (!parsed.success) {
      setQuantityEditError(parsed.error.issues[0]?.message ?? 'Something went wrong. Please try again.')
      return
    }

    setIsSavingQuantity(true)
    setQuantityEditError(null)
    try {
      const updated = await api.updateInventoryQuantity(item.id, parsed.data)
      onUpdated(updated)
      setIsEditingQuantity(false)
    } catch (err) {
      setQuantityEditError(err.message)
    } finally {
      setIsSavingQuantity(false)
    }
  }

  const startPriceEdit = () => {
    setPriceEditValue(String(unitPrice))
    setPriceEditError(null)
    setDeleteError(null)
    setIsEditingPrice(true)
  }

  const cancelPriceEdit = () => {
    setIsEditingPrice(false)
    setPriceEditError(null)
  }

  const savePrice = async () => {
    const price = Number(priceEditValue)
    if (!Number.isInteger(price) || price < 0) {
      setPriceEditError('Enter a valid whole number.')
      return
    }

    setIsSavingPrice(true)
    setPriceEditError(null)
    try {
      const updated = await api.updateInventoryPrice(item.id, price)
      onUpdated(updated)
      setIsEditingPrice(false)
    } catch (err) {
      setPriceEditError(err.message)
    } finally {
      setIsSavingPrice(false)
    }
  }

  const openDeleteDialog = () => {
    setDeleteError(null)
    setShowDeleteDialog(true)
  }

  const handleDeleteConfirm = async () => {
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await api.deleteInventoryItem(item.id)
      removeItem(item.id)
      setShowDeleteDialog(false)
    } catch {
      setShowDeleteDialog(false)
      setDeleteError("Couldn't remove this item. Please try again.")
    } finally {
      setIsDeleting(false)
    }
  }

  const inUseToday = item.in_use_today ?? 0
  const deleteInUseWarning = inUseToday > 0

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-800 truncate">{item.name}</h3>
            {unitPrice > 0 && (
              <p className="text-xs text-slate-400 mt-0.5">{formatCurrency(unitPrice)} per unit</p>
            )}
          </div>
          <button
            type="button"
            onClick={openDeleteDialog}
            className="p-1 text-slate-400 hover:text-red-600 transition-all duration-200 shrink-0"
            aria-label={`Remove ${item.name}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-slate-500">Total Owned</span>
            {isEditingQuantity ? (
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    value={quantityEditValue}
                    onChange={(e) => setQuantityEditValue(e.target.value)}
                    className="w-20 px-2 py-1 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    disabled={isSavingQuantity}
                  />
                  <button
                    type="button"
                    onClick={saveQuantity}
                    disabled={isSavingQuantity}
                    className="text-xs px-2 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-all duration-200 disabled:opacity-50"
                  >
                    {isSavingQuantity ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelQuantityEdit}
                    disabled={isSavingQuantity}
                    className="text-xs px-2 py-1 text-slate-600 hover:text-slate-800 transition-all duration-200"
                  >
                    Cancel
                  </button>
                </div>
                {quantityEditError && <p className="text-xs text-red-600">{quantityEditError}</p>}
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-slate-800">{item.total_quantity}</span>
                <button
                  type="button"
                  onClick={startQuantityEdit}
                  className="p-1 text-slate-400 hover:text-teal-600 transition-all duration-200"
                  aria-label="Edit Quantity"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
              In Use Today: {item.in_use_today ?? 0}
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
              Available: {item.available ?? 0}
            </span>
          </div>

          {item.damaged_quantity > 0 && (
            <p className="text-xs text-red-600">
              {item.damaged_quantity} Damaged
            </p>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-sm text-slate-500">Standard Rate</span>
            {isEditingPrice ? (
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={priceEditValue}
                    onChange={(e) => setPriceEditValue(e.target.value)}
                    className="w-24 px-2 py-1 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    disabled={isSavingPrice}
                  />
                  <button
                    type="button"
                    onClick={savePrice}
                    disabled={isSavingPrice}
                    className="text-xs px-2 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-all duration-200 disabled:opacity-50"
                  >
                    {isSavingPrice ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelPriceEdit}
                    disabled={isSavingPrice}
                    className="text-xs px-2 py-1 text-slate-600 hover:text-slate-800 transition-all duration-200"
                  >
                    Cancel
                  </button>
                </div>
                {priceEditError && <p className="text-xs text-red-600">{priceEditError}</p>}
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                {unitPrice > 0 ? (
                  <span className="text-sm font-medium text-slate-800">
                    {formatCurrency(unitPrice)} per event
                  </span>
                ) : (
                  <span className="text-sm text-slate-400">No rate set</span>
                )}
                <button
                  type="button"
                  onClick={startPriceEdit}
                  className="p-1 text-slate-400 hover:text-teal-600 transition-all duration-200"
                  aria-label="Edit Standard Rate"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {deleteError && (
            <p role="alert" className="text-xs text-red-600 pt-1">
              {deleteError}
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteDialog}
        title={deleteInUseWarning ? 'Remove Item — Currently In Use' : 'Remove Item'}
        message={
          deleteInUseWarning
            ? `⚠️ ${item.name} is currently assigned to ${inUseToday} booking(s) today. Removing it will detach it from those bookings. This cannot be undone.`
            : `Are you sure you want to remove ${item.name}? This cannot be undone.`
        }
        confirmLabel={deleteInUseWarning ? 'Remove Anyway' : 'Remove'}
        confirmVariant="danger"
        confirmingLabel="Removing..."
        isConfirming={isDeleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </>
  )
}
