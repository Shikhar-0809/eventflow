import { useState } from 'react'
import { api } from '../utils/api'

export const DamagedItemsPanel = ({ items, onUpdated }) => {
  const damagedItems = items.filter((item) => item.damaged_quantity > 0)
  const undamagedItems = items.filter((item) => item.damaged_quantity === 0)
  const [forms, setForms] = useState({})
  const [errors, setErrors] = useState({})
  const [submittingId, setSubmittingId] = useState(null)
  const [newDamageItemId, setNewDamageItemId] = useState('')
  const [newDamageQty, setNewDamageQty] = useState('')
  const [newDamageNote, setNewDamageNote] = useState('')
  const [newDamageError, setNewDamageError] = useState(null)
  const [isNewDamageSubmitting, setIsNewDamageSubmitting] = useState(false)

  const getForm = (id) => forms[id] ?? { quantity: '', note: '' }

  const setFormField = (id, field, value) => {
    setForms((prev) => ({
      ...prev,
      [id]: { ...getForm(id), [field]: value },
    }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const submitAdjustment = async (item, positive) => {
    const form = getForm(item.id)
    const qty = Number(form.quantity)
    if (!Number.isInteger(qty) || qty <= 0) {
      setErrors((prev) => ({ ...prev, [item.id]: 'Something went wrong. Please try again.' }))
      return
    }

    const change = positive ? qty : -qty
    setSubmittingId(item.id)
    setErrors((prev) => {
      const next = { ...prev }
      delete next[item.id]
      return next
    })

    try {
      const updated = await api.adjustInventoryDamage(item.id, {
        change,
        note: form.note.trim() || undefined,
      })
      onUpdated(updated)
      setForms((prev) => ({
        ...prev,
        [item.id]: { quantity: '', note: '' },
      }))
    } catch (err) {
      setErrors((prev) => ({ ...prev, [item.id]: err.message }))
    } finally {
      setSubmittingId(null)
    }
  }

  const submitNewDamage = async () => {
    const item = items.find((row) => String(row.id) === newDamageItemId)
    if (!item) {
      setNewDamageError('Something went wrong. Please try again.')
      return
    }
    const qty = Number(newDamageQty)
    if (!Number.isInteger(qty) || qty <= 0) {
      setNewDamageError('Something went wrong. Please try again.')
      return
    }

    setIsNewDamageSubmitting(true)
    setNewDamageError(null)
    try {
      const updated = await api.adjustInventoryDamage(item.id, {
        change: qty,
        note: newDamageNote.trim() || undefined,
      })
      onUpdated(updated)
      setNewDamageQty('')
      setNewDamageNote('')
      setNewDamageItemId('')
    } catch (err) {
      setNewDamageError(err.message)
    } finally {
      setIsNewDamageSubmitting(false)
    }
  }

  const renderDamageRow = (item) => {
    const form = getForm(item.id)
    const isSubmitting = submittingId === item.id

    return (
      <div
        key={item.id}
        className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium text-slate-800">{item.name}</span>
          <span className="text-sm text-red-600 font-medium">
            {item.damaged_quantity} Damaged
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
          <input
            type="number"
            min="1"
            value={form.quantity}
            onChange={(e) => setFormField(item.id, 'quantity', e.target.value)}
            className="w-full sm:w-24 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            disabled={isSubmitting}
          />
          <input
            type="text"
            placeholder="Optional"
            value={form.note}
            onChange={(e) => setFormField(item.id, 'note', e.target.value)}
            className="flex-1 min-w-[160px] px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            disabled={isSubmitting}
          />
          <button
            type="button"
            onClick={() => submitAdjustment(item, true)}
            disabled={isSubmitting}
            className="px-3 py-2 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-all duration-200 disabled:opacity-50"
          >
            Mark Damaged
          </button>
          <button
            type="button"
            onClick={() => submitAdjustment(item, false)}
            disabled={isSubmitting}
            className="px-3 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-all duration-200 disabled:opacity-50"
          >
            Mark Repaired
          </button>
        </div>

        {errors[item.id] && (
          <p className="text-xs text-red-600">{errors[item.id]}</p>
        )}
      </div>
    )
  }

  if (damagedItems.length === 0 && items.length === 0) {
    return (
      <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-6 text-center">
        Nothing flagged as damaged right now.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {damagedItems.length === 0 ? (
        <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-6 text-center">
          Nothing flagged as damaged right now.
        </p>
      ) : (
        damagedItems.map(renderDamageRow)
      )}

      {undamagedItems.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
            <select
              value={newDamageItemId}
              onChange={(e) => setNewDamageItemId(e.target.value)}
              className="w-full sm:w-48 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              disabled={isNewDamageSubmitting}
            >
              <option value="">—</option>
              {undamagedItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              value={newDamageQty}
              onChange={(e) => setNewDamageQty(e.target.value)}
              className="w-full sm:w-24 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              disabled={isNewDamageSubmitting}
            />
            <input
              type="text"
              placeholder="Optional"
              value={newDamageNote}
              onChange={(e) => setNewDamageNote(e.target.value)}
              className="flex-1 min-w-[160px] px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              disabled={isNewDamageSubmitting}
            />
            <button
              type="button"
              onClick={submitNewDamage}
              disabled={isNewDamageSubmitting}
              className="px-3 py-2 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-all duration-200 disabled:opacity-50"
            >
              Mark Damaged
            </button>
          </div>
          {newDamageError && (
            <p className="text-xs text-red-600">{newDamageError}</p>
          )}
        </div>
      )}
    </div>
  )
}
