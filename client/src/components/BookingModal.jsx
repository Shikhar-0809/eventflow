import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X, Loader2, Check } from 'lucide-react'
import { useBookingStore } from '../store/bookingStore'
import { useInventoryStore } from '../store/inventoryStore'
import { useAuthStore } from '../store/authStore'
import { api } from '../utils/api'
import { bookingSchema } from '../schemas/booking.schema.js'
import { ConflictBanner } from './ConflictBanner'
import { InventoryWarningBanner } from './InventoryWarningBanner'
import { InventoryUnitPicker } from './InventoryUnitPicker'
import { ConfirmDialog } from './ConfirmDialog'

const EVENT_TYPES = [
  { value: 'wedding', label: 'Wedding' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'other', label: 'Other' },
]

const EMPTY_FORM = {
  client_name: '',
  phone: '',
  event_type: 'wedding',
  event_date: '',
  guest_count: '',
  venue: '',
  advance: '',
  total: '',
}

const inputClass = (hasError) =>
  `border rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all duration-200 ${
    hasError ? 'border-red-400' : 'border-slate-300'
  }`

const formatEventType = (type) => type.charAt(0).toUpperCase() + type.slice(1)

const buildPayload = (form, inventoryLines) => ({
  client_name: form.client_name.trim(),
  phone: form.phone.trim(),
  event_type: form.event_type,
  event_date: form.event_date,
  guest_count: Number(form.guest_count),
  venue: form.venue.trim() || undefined,
  advance: Number(form.advance) || 0,
  total: Number(form.total) || 0,
  inventory: inventoryLines,
})

const bookingToForm = (booking) => ({
  client_name: booking.client_name ?? '',
  phone: booking.phone ?? '',
  event_type: booking.event_type ?? 'wedding',
  event_date: booking.event_date ?? '',
  guest_count: booking.guest_count != null ? String(booking.guest_count) : '',
  venue: booking.venue ?? '',
  advance: booking.advance != null ? String(booking.advance) : '',
  total: booking.total != null ? String(booking.total) : '',
})

const baselineCreateForm = (prefillDate) => ({
  ...EMPTY_FORM,
  event_date: prefillDate ?? '',
})

const quantitiesFromInventoryLines = (lines = []) => {
  const quantities = {}
  for (const line of lines) {
    quantities[line.item_id] = line.quantity
  }
  return quantities
}

const buildInventoryLines = (inventoryItems, quantities) => {
  const lines = inventoryItems.map((item) => ({
    item_id: item.id,
    quantity: quantities[item.id] || 0,
  }))
  const nonZero = lines.filter((line) => line.quantity > 0)
  return nonZero.length ? nonZero : []
}

const inventoryLinesEqual = (a = [], b = []) => {
  const mapA = new Map(a.map((line) => [line.item_id, line.quantity]))
  const mapB = new Map(b.map((line) => [line.item_id, line.quantity]))
  if (mapA.size !== mapB.size) return false
  for (const [id, qty] of mapA) {
    if (mapB.get(id) !== qty) return false
  }
  return true
}

const isCreateFormDirty = (form, prefillDate, quantities, inventoryItems) => {
  const baseline = baselineCreateForm(prefillDate)
  const hasInventory = buildInventoryLines(inventoryItems, quantities).length > 0
  return (
    form.client_name.trim() !== ''
    || form.phone.trim() !== ''
    || form.event_type !== baseline.event_type
    || form.event_date !== baseline.event_date
    || form.guest_count !== ''
    || form.venue.trim() !== ''
    || form.advance !== ''
    || form.total !== ''
    || hasInventory
  )
}

const isEditFormDirty = (form, original, quantities, originalInventory, inventoryItems) => {
  if (!original) return false
  const baseline = bookingToForm(original)
  const currentInventory = buildInventoryLines(inventoryItems, quantities)
  const baselineInventory = buildInventoryLines(
    inventoryItems,
    quantitiesFromInventoryLines(originalInventory),
  )
  return (
    form.client_name.trim() !== baseline.client_name
    || form.phone.trim() !== baseline.phone
    || form.event_type !== baseline.event_type
    || form.event_date !== baseline.event_date
    || form.guest_count !== baseline.guest_count
    || form.venue.trim() !== baseline.venue.trim()
    || form.advance !== baseline.advance
    || form.total !== baseline.total
    || !inventoryLinesEqual(currentInventory, baselineInventory)
  )
}

const formatShortfallConfirmMessage = (shortfalls) => {
  if (shortfalls.length === 1) {
    const row = shortfalls[0]
    return `You don't have enough ${row.name} for this date — need ${row.requested}, only ${row.available} available. Confirm this booking anyway?`
  }
  const summary = shortfalls
    .map((row) => `${row.name} (need ${row.requested}, only ${row.available} available)`)
    .join('; ')
  return `Some items are short for this date: ${summary}. Confirm this booking anyway?`
}

export const BookingModal = () => {
  const {
    isModalOpen,
    prefillDate,
    modalMode,
    selectedBooking,
    closeModal,
    addBooking,
    updateBooking,
    setModalFormDirty,
    setPostSaveConflictNotice,
  } = useBookingStore()

  const { items: inventoryItems, setItems } = useInventoryStore()

  const isEditMode = modalMode === 'edit'
  const [form, setForm] = useState(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [conflictBooking, setConflictBooking] = useState(null)
  const [dateClear, setDateClear] = useState(false)
  const [conflictChecking, setConflictChecking] = useState(false)
  const [formError, setFormError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [inventoryQuantities, setInventoryQuantities] = useState({})
  const [inventorySeedQuantities, setInventorySeedQuantities] = useState({})
  const [originalInventoryLines, setOriginalInventoryLines] = useState([])
  const [shortfalls, setShortfalls] = useState([])
  const [availabilityByItem, setAvailabilityByItem] = useState({})
  const [inventoryChecking, setInventoryChecking] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const submittingRef = useRef(false)

  const resetCreateForm = () => {
    setForm(baselineCreateForm(prefillDate))
    setFieldErrors({})
    setTouched({})
    setConflictBooking(null)
    setDateClear(false)
    setFormError(null)
    setInventoryQuantities({})
    setInventorySeedQuantities({})
    setOriginalInventoryLines([])
    setShortfalls([])
    setAvailabilityByItem({})
  }

  useLayoutEffect(() => {
    if (!isModalOpen) return

    if (isEditMode && selectedBooking) {
      setForm(bookingToForm(selectedBooking))
      setFieldErrors({})
      setTouched({})
      setConflictBooking(null)
      setDateClear(false)
      setFormError(null)
      setInventoryQuantities({})
      setInventorySeedQuantities({})
      setOriginalInventoryLines([])
      setShortfalls([])
      setAvailabilityByItem({})
      setModalFormDirty(false)
      return
    }

    resetCreateForm()
    setModalFormDirty(false)
  }, [isModalOpen, prefillDate, isEditMode, selectedBooking?.id, setModalFormDirty])

  useEffect(() => {
    if (!isModalOpen || !isEditMode || !selectedBooking?.id) return

    let active = true
    const loadEditInventory = async () => {
      try {
        const data = await api.getBooking(selectedBooking.id)
        if (!active) return
        const lines = data.inventory ?? []
        const quantities = quantitiesFromInventoryLines(lines)
        setInventoryQuantities(quantities)
        setInventorySeedQuantities(quantities)
        setOriginalInventoryLines(lines)
      } catch {
        if (!active) return
        setInventoryQuantities({})
        setInventorySeedQuantities({})
        setOriginalInventoryLines([])
      }
    }

    loadEditInventory()
    return () => {
      active = false
    }
  }, [isModalOpen, isEditMode, selectedBooking?.id])

  useEffect(() => {
    if (!isModalOpen) return

    let active = true
    const loadInventory = async () => {
      if (inventoryItems.length > 0) return
      try {
        const data = await api.getInventory()
        if (active) setItems(data)
      } catch {
        // Inventory section stays empty; booking fields still work
      }
    }

    loadInventory()
    return () => {
      active = false
    }
  }, [isModalOpen, inventoryItems.length, setItems])

  const inventoryLines = buildInventoryLines(inventoryItems, inventoryQuantities)

  const formIsDirty = isEditMode
    ? isEditFormDirty(form, selectedBooking, inventoryQuantities, originalInventoryLines, inventoryItems)
    : isCreateFormDirty(form, prefillDate, inventoryQuantities, inventoryItems)

  useEffect(() => {
    if (!isModalOpen) return
    setModalFormDirty(formIsDirty)
  }, [formIsDirty, isModalOpen, setModalFormDirty])

  useEffect(() => {
    if (isModalOpen) return
    setModalFormDirty(false)
  }, [isModalOpen, setModalFormDirty])

  const validateField = (name) => {
    const result = bookingSchema.safeParse(buildPayload(form, inventoryLines))
    if (result.success) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
      return
    }

    const issue = result.error.issues.find((i) => i.path[0] === name)
    if (issue) {
      setFieldErrors((prev) => ({ ...prev, [name]: issue.message }))
    } else {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
  }

  const handleBlur = (name) => {
    setTouched((prev) => ({ ...prev, [name]: true }))
    validateField(name)
  }

  const handleChange = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }))
    if (name === 'event_date') {
      setConflictBooking(null)
      setDateClear(false)
    }
  }

  const handleInventoryQuantityChange = useCallback((itemId, quantity) => {
    setInventoryQuantities((prev) => ({
      ...prev,
      [itemId]: Math.max(0, quantity),
    }))
  }, [])

  useEffect(() => {
    if (!isModalOpen) return

    let active = true
    const excludeId = isEditMode && selectedBooking?.id ? selectedBooking.id : undefined

    const runCheck = async () => {
      const date = form.event_date
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        if (!active) return
        setConflictBooking(null)
        setDateClear(false)
        return
      }

      setConflictChecking(true)
      try {
        const result = await api.checkConflict(date, excludeId)
        if (!active) return
        if (result.conflict) {
          setConflictBooking(result.booking)
          setDateClear(false)
        } else {
          setConflictBooking(null)
          setDateClear(true)
        }
      } catch {
        if (!active) return
        setConflictBooking(null)
        setDateClear(false)
      } finally {
        if (active) setConflictChecking(false)
      }
    }

    runCheck()
    return () => {
      active = false
    }
  }, [form.event_date, isModalOpen, isEditMode, selectedBooking?.id])

  useEffect(() => {
    if (!isModalOpen || inventoryItems.length === 0) return

    let active = true
    const timer = setTimeout(async () => {
      const date = form.event_date
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        if (!active) return
        setShortfalls([])
        setAvailabilityByItem({})
        return
      }

      setInventoryChecking(true)
      try {
        const items = inventoryItems.map((item) => ({
          item_id: item.id,
          quantity: inventoryQuantities[item.id] || 0,
        }))
        const result = await api.checkInventoryAvailability({
          date,
          items,
          excludeBookingId: isEditMode && selectedBooking?.id ? selectedBooking.id : undefined,
        })
        if (!active) return
        setShortfalls(result.shortfalls ?? [])
        const nextAvailability = {}
        for (const row of result.availability ?? []) {
          nextAvailability[row.item_id] = row.available
        }
        setAvailabilityByItem(nextAvailability)
      } catch {
        if (!active) return
        setShortfalls([])
        setAvailabilityByItem({})
      } finally {
        if (active) setInventoryChecking(false)
      }
    }, 300)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [
    form.event_date,
    inventoryQuantities,
    inventoryItems,
    isModalOpen,
    isEditMode,
    selectedBooking?.id,
  ])

  const hasConflict = conflictBooking !== null
  const isFormValid = bookingSchema.safeParse(buildPayload(form, inventoryLines)).success
  const canSubmit = isFormValid && !isSubmitting && !conflictChecking

  const submitBooking = useCallback(async () => {
    if (submittingRef.current) return

    const payload = buildPayload(form, inventoryLines)
    const validation = bookingSchema.safeParse(payload)
    if (!validation.success) return

    submittingRef.current = true
    setIsSubmitting(true)
    const hadOptimisticConflict = conflictBooking !== null

    try {
      const result = isEditMode
        ? await api.updateBooking(selectedBooking.id, validation.data)
        : await api.createBooking(validation.data)

      const { conflict, ...booking } = result

      if (isEditMode) {
        updateBooking(booking)
      } else {
        addBooking(booking)
      }

      if (conflict?.detected && !hadOptimisticConflict) {
        setPostSaveConflictNotice(conflict.booking)
      }

      setShowConfirmDialog(false)
      closeModal()
    } catch (err) {
      if (err.status === 401) {
        useAuthStore.setState({ isAuthenticated: false, isLoading: false })
        closeModal()
        return
      }
      if (err.status === 400) {
        setFormError(err.message)
        return
      }
      setFormError(isEditMode ? "Couldn't save changes, please try again" : "Couldn't save booking, please try again")
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }, [
    addBooking,
    closeModal,
    conflictBooking,
    form,
    inventoryLines,
    isEditMode,
    selectedBooking?.id,
    setPostSaveConflictNotice,
    updateBooking,
  ])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submittingRef.current) return
    setFormError(null)

    const payload = buildPayload(form, inventoryLines)
    const validation = bookingSchema.safeParse(payload)
    if (!validation.success) {
      const errors = {}
      for (const issue of validation.error.issues) {
        const key = issue.path[0]
        if (!errors[key]) errors[key] = issue.message
      }
      setFieldErrors(errors)
      setTouched({
        client_name: true,
        phone: true,
        event_type: true,
        event_date: true,
        guest_count: true,
        venue: true,
        advance: true,
        total: true,
      })
      return
    }

    if (shortfalls.length > 0) {
      setShowConfirmDialog(true)
      return
    }

    await submitBooking()
  }

  if (!isModalOpen) return null
  if (isEditMode && !selectedBooking) return null

  return (
    <>
      <div className="absolute inset-0 z-[60] flex justify-end">
        <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
        <div className="relative w-full max-w-[480px] h-full bg-white shadow-xl p-6 flex flex-col animate-[slideIn_0.2s_ease-out]">
          <div className="flex items-center justify-between mb-6 shrink-0">
            <h2 className="text-xl font-semibold text-slate-900">
              {isEditMode ? 'Edit Booking' : 'New Booking'}
            </h2>
            <button
              type="button"
              onClick={closeModal}
              className="p-1 text-slate-500 hover:text-slate-900 transition-all duration-200"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {formError && (
                <p role="alert" className="text-sm text-red-700 bg-red-100 border border-red-400 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}

              <div>
                <label htmlFor="client_name" className="block text-sm font-medium text-slate-700 mb-1">
                  Client Name
                </label>
                <input
                  id="client_name"
                  type="text"
                  value={form.client_name}
                  onChange={(e) => handleChange('client_name', e.target.value)}
                  onBlur={() => handleBlur('client_name')}
                  className={inputClass(touched.client_name && fieldErrors.client_name)}
                />
                {touched.client_name && fieldErrors.client_name && (
                  <p role="alert" className="mt-1 text-sm text-red-700">{fieldErrors.client_name}</p>
                )}
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1">
                  Phone Number
                </label>
                <input
                  id="phone"
                  type="text"
                  inputMode="numeric"
                  value={form.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  onBlur={() => handleBlur('phone')}
                  className={inputClass(touched.phone && fieldErrors.phone)}
                />
                {touched.phone && fieldErrors.phone && (
                  <p role="alert" className="mt-1 text-sm text-red-700">{fieldErrors.phone}</p>
                )}
              </div>

              <div>
                <label htmlFor="event_type" className="block text-sm font-medium text-slate-700 mb-1">
                  Event Type
                </label>
                <select
                  id="event_type"
                  value={form.event_type}
                  onChange={(e) => handleChange('event_type', e.target.value)}
                  onBlur={() => handleBlur('event_type')}
                  className={inputClass(touched.event_type && fieldErrors.event_type)}
                >
                  {EVENT_TYPES.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                {touched.event_type && fieldErrors.event_type && (
                  <p className="mt-1 text-sm text-red-700">{fieldErrors.event_type}</p>
                )}
              </div>

              <div>
                <label htmlFor="event_date" className="block text-sm font-medium text-slate-700 mb-1">
                  Event Date
                </label>
                <div className="relative">
                  <input
                    id="event_date"
                    type="date"
                    value={form.event_date}
                    onChange={(e) => handleChange('event_date', e.target.value)}
                    onBlur={() => handleBlur('event_date')}
                    className={inputClass(
                      (touched.event_date && fieldErrors.event_date) || hasConflict,
                    )}
                  />
                  {dateClear && !hasConflict && !conflictChecking && form.event_date && (
                    <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-teal-600" />
                  )}
                  {conflictChecking && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
                  )}
                </div>
                {touched.event_date && fieldErrors.event_date && (
                  <p className="mt-1 text-sm text-red-700">{fieldErrors.event_date}</p>
                )}
                {hasConflict && (
                  <div className="mt-2">
                    <ConflictBanner
                      clientName={conflictBooking.client_name}
                      eventType={formatEventType(conflictBooking.event_type)}
                    />
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="guest_count" className="block text-sm font-medium text-slate-700 mb-1">
                  Guest Count
                </label>
                <input
                  id="guest_count"
                  type="number"
                  min="1"
                  value={form.guest_count}
                  onChange={(e) => handleChange('guest_count', e.target.value)}
                  onBlur={() => handleBlur('guest_count')}
                  className={inputClass(touched.guest_count && fieldErrors.guest_count)}
                />
                {touched.guest_count && fieldErrors.guest_count && (
                  <p role="alert" className="mt-1 text-sm text-red-700">{fieldErrors.guest_count}</p>
                )}
              </div>

              <div>
                <label htmlFor="venue" className="block text-sm font-medium text-slate-700 mb-1">
                  Venue
                </label>
                <input
                  id="venue"
                  type="text"
                  value={form.venue}
                  onChange={(e) => handleChange('venue', e.target.value)}
                  onBlur={() => handleBlur('venue')}
                  className={inputClass(touched.venue && fieldErrors.venue)}
                />
                {touched.venue && fieldErrors.venue && (
                  <p className="mt-1 text-sm text-red-700">{fieldErrors.venue}</p>
                )}
              </div>

              <div>
                <label htmlFor="advance" className="block text-sm font-medium text-slate-700 mb-1">
                  Advance Collected (₹)
                </label>
                <input
                  id="advance"
                  type="number"
                  min="0"
                  value={form.advance}
                  onChange={(e) => handleChange('advance', e.target.value)}
                  onBlur={() => handleBlur('advance')}
                  className={inputClass(touched.advance && fieldErrors.advance)}
                />
                {touched.advance && fieldErrors.advance && (
                  <p className="mt-1 text-sm text-red-700">{fieldErrors.advance}</p>
                )}
              </div>

              <div>
                <label htmlFor="total" className="block text-sm font-medium text-slate-700 mb-1">
                  Total Amount (₹)
                </label>
                <input
                  id="total"
                  type="number"
                  min="0"
                  value={form.total}
                  onChange={(e) => handleChange('total', e.target.value)}
                  onBlur={() => handleBlur('total')}
                  className={inputClass(touched.total && fieldErrors.total)}
                />
                {touched.total && fieldErrors.total && (
                  <p className="mt-1 text-sm text-red-700">{fieldErrors.total}</p>
                )}
              </div>

              <div className="space-y-4 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-800">Inventory Needed</h3>
                  {inventoryChecking && (
                    <Loader2 className="w-4 h-4 text-slate-400 animate-spin shrink-0" />
                  )}
                </div>

                {inventoryItems.length === 0 ? (
                  <p className="text-sm text-slate-500">No inventory items set up yet.</p>
                ) : (
                  <div className="space-y-4">
                    {inventoryItems.map((item) => {
                      const usable = item.total_quantity - item.damaged_quantity
                      const lastKnownAvailable = availabilityByItem[item.id] ?? usable
                      return (
                        <InventoryUnitPicker
                          key={item.id}
                          itemId={item.id}
                          itemName={item.name}
                          totalQuantity={item.total_quantity}
                          availableCount={lastKnownAvailable}
                          startingQuantity={inventorySeedQuantities[item.id] || 0}
                          onQuantityChange={handleInventoryQuantityChange}
                        />
                      )
                    })}
                  </div>
                )}

                <InventoryWarningBanner shortfalls={shortfalls} />
              </div>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className={`w-full mt-6 py-2.5 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 shrink-0 ${
                canSubmit
                  ? 'bg-teal-600 hover:bg-teal-700 text-white'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }`}
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEditMode ? 'Save Changes' : 'Confirm Booking'}
            </button>
          </form>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showConfirmDialog}
        title="Inventory shortfall"
        message={formatShortfallConfirmMessage(shortfalls)}
        confirmLabel="Confirm Anyway"
        cancelLabel="Cancel"
        isConfirming={isSubmitting}
        onConfirm={submitBooking}
        onCancel={() => setShowConfirmDialog(false)}
      />
    </>
  )
}
