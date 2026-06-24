import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { api } from '../utils/api'
import { inventoryQuantityUpdateSchema } from '../schemas/inventory.schema.js'

export const InventoryItemCard = ({ item, onUpdated }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [editError, setEditError] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  const startEdit = () => {
    setEditValue(String(item.total_quantity))
    setEditError(null)
    setIsEditing(true)
  }

  const cancelEdit = () => {
    setIsEditing(false)
    setEditError(null)
  }

  const saveQuantity = async () => {
    const parsed = inventoryQuantityUpdateSchema.safeParse({
      total_quantity: Number(editValue),
    })
    if (!parsed.success) {
      setEditError(parsed.error.issues[0]?.message ?? 'Invalid quantity')
      return
    }

    setIsSaving(true)
    setEditError(null)
    try {
      const updated = await api.updateInventoryQuantity(item.id, parsed.data)
      onUpdated(updated)
      setIsEditing(false)
    } catch (err) {
      setEditError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 min-w-0">
      <h3 className="font-semibold text-slate-800 truncate">{item.name}</h3>

      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-slate-500">Total Owned</span>
          {isEditing ? (
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-20 px-2 py-1 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  disabled={isSaving}
                />
                <button
                  type="button"
                  onClick={saveQuantity}
                  disabled={isSaving}
                  className="text-xs px-2 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-all duration-200 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={isSaving}
                  className="text-xs px-2 py-1 text-slate-600 hover:text-slate-800 transition-all duration-200"
                >
                  Cancel
                </button>
              </div>
              {editError && <p className="text-xs text-red-600">{editError}</p>}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-slate-800">{item.total_quantity}</span>
              <button
                type="button"
                onClick={startEdit}
                className="p-1 text-slate-400 hover:text-teal-600 transition-all duration-200"
                aria-label={`Edit quantity for ${item.name}`}
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
            {item.damaged_quantity} damaged
          </p>
        )}
      </div>
    </div>
  )
}
