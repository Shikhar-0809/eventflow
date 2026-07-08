import { useState } from 'react'
import { X } from 'lucide-react'
import { api } from '../utils/api'
import { inventoryItemSchema } from '../schemas/inventory.schema.js'

export const AddInventoryItemModal = ({ isOpen, onClose, onAdded }) => {
  const [name, setName] = useState('')
  const [totalQuantity, setTotalQuantity] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitError, setSubmitError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const resetForm = () => {
    setName('')
    setTotalQuantity('')
    setFieldErrors({})
    setSubmitError(null)
  }

  const handleClose = () => {
    if (isSubmitting) return
    resetForm()
    onClose()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError(null)

    const payload = {
      name,
      total_quantity: totalQuantity === '' ? NaN : Number(totalQuantity),
    }
    const result = inventoryItemSchema.safeParse(payload)
    if (!result.success) {
      const next = {}
      for (const issue of result.error.issues) {
        const key = issue.path[0]
        if (!next[key]) next[key] = issue.message
      }
      setFieldErrors(next)
      return
    }

    setFieldErrors({})
    setIsSubmitting(true)
    try {
      const item = await api.addInventoryItem(result.data)
      onAdded(item)
      resetForm()
      onClose()
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={handleClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-inventory-title"
        className="relative bg-white rounded-xl shadow-lg border border-slate-200 w-full max-w-md p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="add-inventory-title" className="text-lg font-bold text-slate-800">
            Add Inventory Item
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 text-slate-400 hover:text-slate-600 transition-all duration-200"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="item-name" className="block text-sm font-medium text-slate-700 mb-1">
              Item Name
            </label>
            <input
              id="item-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              disabled={isSubmitting}
            />
            {fieldErrors.name && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>
            )}
          </div>

          <div>
            <label htmlFor="item-quantity" className="block text-sm font-medium text-slate-700 mb-1">
              Total Quantity Owned
            </label>
            <input
              id="item-quantity"
              type="number"
              min="0"
              value={totalQuantity}
              onChange={(e) => setTotalQuantity(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              disabled={isSubmitting}
            />
            {fieldErrors.total_quantity && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.total_quantity}</p>
            )}
          </div>

          {submitError && (
            <p className="text-sm text-red-700 bg-red-100 border border-red-400 rounded-lg px-3 py-2">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-all duration-200 disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : 'Add Item'}
          </button>
        </form>
      </div>
    </div>
  )
}
