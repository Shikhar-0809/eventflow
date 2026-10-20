import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { X, Loader2, Check, Pencil } from 'lucide-react'
import { useBookingStore } from '../store/bookingStore'
import { useInventoryStore } from '../store/inventoryStore'
import { useAuthStore } from '../store/authStore'
import { api } from '../utils/api'
import { formatCurrency } from '../utils/formatCurrency'
import { bookingSchema } from '../schemas/booking.schema.js'
import { ConflictBanner } from './ConflictBanner'
import { InventoryWarningBanner } from './InventoryWarningBanner'
import { ConfirmDialog } from './ConfirmDialog'
import { ModalDialog } from './ModalDialog'

const EVENT_TYPES = [
  { value: 'wedding', label: 'Wedding' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'other', label: 'Other' },
]

const EVENT_TYPE_LABELS = {
  wedding: 'Wedding',
  birthday: 'Birthday',
  corporate: 'Corporate',
  other: 'Other',
}

const formatEventType = (type) => EVENT_TYPE_LABELS[type] ?? 'Other'

const MAX_EVENT_TYPE_CUSTOM_LENGTH = 50
const EVENT_TYPE_CUSTOM_ERROR = 'Please specify the event type.'

const validateEventTypeCustom = (eventType, value) => {
  if (eventType !== 'other') return null
  return value?.trim() ? null : EVENT_TYPE_CUSTOM_ERROR
}

const EMPTY_FORM = {
  client_name: '',
  phone: '',
  event_type: 'wedding',
  event_type_custom: '',
  event_date: '',
  guest_count: '',
  venue: '',
  notes: '',
  advance: '',
}

const inputClass = (hasError) =>
  `border rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all duration-200 ${
    hasError ? 'border-red-400' : 'border-slate-300'
  }`

const normalizeEventDate = (value) => {
  if (value == null || value === '') return ''
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
    return match ? match[1] : ''
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return ''
}

const quantitiesFromInventoryLines = (lines) => {
  const quantities = {}
  for (const line of asArray(lines)) {
    if (line?.item_id == null) continue
    quantities[line.item_id] = line.quantity ?? 0
  }
  return quantities
}

const unitPricesFromInventoryLines = (lines) => {
  const prices = {}
  for (const line of asArray(lines)) {
    if (line?.item_id == null || line.unit_price == null) continue
    prices[line.item_id] = line.unit_price
  }
  return prices
}

const baselineCreateForm = (prefillDate) => ({
  ...EMPTY_FORM,
  event_date: prefillDate ?? '',
})

const asArray = (value) => (Array.isArray(value) ? value : [])

const inventoryLinesEqual = (a = [], b = []) => {
  const mapA = new Map(asArray(a).map((line) => [line.item_id, line.quantity]))
  const mapB = new Map(asArray(b).map((line) => [line.item_id, line.quantity]))
  if (mapA.size !== mapB.size) return false
  for (const [id, qty] of mapA) {
    if (mapB.get(id) !== qty) return false
  }
  return true
}

const unitPricesEqual = (a = {}, b = {}) => {
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  return keysA.every((key) => a[key] === b[key])
}

const quantitiesEqual = (a = {}, b = {}) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if ((a[key] ?? 0) !== (b[key] ?? 0)) return false
  }
  return true
}

const buildPayload = (form, billing) => ({
  client_name: form.client_name.trim(),
  phone: form.phone.trim(),
  event_type: form.event_type,
  ...(form.event_type === 'other'
    ? { event_type_custom: form.event_type_custom.trim() }
    : {}),
  event_date: form.event_date,
  guest_count: Number(form.guest_count),
  venue: form.venue.trim() || undefined,
  notes: form.notes.trim() || undefined,
  advance: Number(form.advance) || 0,
  total: billing.grandTotal,
  subtotal: billing.subtotal,
  discount: billing.discount,
  grand_total: billing.grandTotal,
  inventory: asArray(billing.inventoryLines).map((line) => ({
    item_id: line.item_id,
    quantity: line.quantity,
    unit_price: line.unit_price != null ? Math.round(line.unit_price) : undefined,
    line_total: line.line_total != null ? Math.round(line.line_total) : undefined,
  })),
})

const bookingToForm = (booking) => ({
  client_name: booking?.client_name ?? '',
  phone: booking?.phone != null ? String(booking.phone).replace(/\D/g, '') : '',
  event_type: booking?.event_type ?? 'wedding',
  event_type_custom: booking?.event_type_custom == null ? '' : String(booking.event_type_custom),
  event_date: normalizeEventDate(booking?.event_date),
  guest_count: booking?.guest_count != null ? String(booking.guest_count) : '',
  venue: booking?.venue ?? '',
  notes: booking?.notes ?? '',
  advance: booking?.advance != null ? String(booking.advance) : '',
})

const formatShortfallConfirmMessage = (shortfalls) => {
  const rows = asArray(shortfalls)
  if (rows.length === 1) {
    const row = rows[0]
    return `Not enough ${row.name} for this date. Confirm anyway?`
  }
  const summary = rows.map((row) => row.name).join(', ')
  return `Not enough inventory for this date (${summary}). Confirm anyway?`
}

export const BookingPageContent = () => {
  const {
    isModalOpen,
    prefillDate,
    modalMode,
    selectedBooking,
    forceCloseModal,
    requestCloseModal,
    discardPromptOpen,
    keepEditing,
    discardChanges,
    addBooking,
    updateBooking,
    setModalFormDirty,
    setPostSaveConflictNotice,
  } = useBookingStore()

  const { items: inventoryItems, setItems } = useInventoryStore()
  const safeInventoryItems = asArray(inventoryItems)

  const isEditMode = modalMode === 'edit'
  const [visible, setVisible] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [conflictBooking, setConflictBooking] = useState(null)
  const [dateClear, setDateClear] = useState(false)
  const [conflictChecking, setConflictChecking] = useState(false)
  const [formError, setFormError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [inventoryQuantities, setInventoryQuantities] = useState({})
  const [unitPriceOverrides, setUnitPriceOverrides] = useState({})
  const [baselineUnitPrices, setBaselineUnitPrices] = useState({})
  const [originalInventoryLines, setOriginalInventoryLines] = useState([])
  const [discount, setDiscount] = useState(0)
  const [baselineDiscount, setBaselineDiscount] = useState(0)
  const [showDiscountInput, setShowDiscountInput] = useState(false)
  const [discountDraft, setDiscountDraft] = useState('')
  const [editingPriceItemId, setEditingPriceItemId] = useState(null)
  const [priceEditDraft, setPriceEditDraft] = useState('')
  const [shortfalls, setShortfalls] = useState([])
  const [availabilityByItem, setAvailabilityByItem] = useState({})
  const [inventoryChecking, setInventoryChecking] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [editLoadError, setEditLoadError] = useState(null)
  const submittingRef = useRef(false)

  const resetCreateForm = () => {
    setForm(baselineCreateForm(prefillDate))
    setFieldErrors({})
    setTouched({})
    setConflictBooking(null)
    setDateClear(false)
    setFormError(null)
    setInventoryQuantities({})
    setUnitPriceOverrides({})
    setBaselineUnitPrices({})
    setOriginalInventoryLines([])
    setDiscount(0)
    setBaselineDiscount(0)
    setShowDiscountInput(false)
    setDiscountDraft('')
    setEditingPriceItemId(null)
    setPriceEditDraft('')
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
      setEditLoadError(null)
      setInventoryQuantities({})
      setUnitPriceOverrides({})
      setBaselineUnitPrices({})
      setOriginalInventoryLines([])
      setDiscount(selectedBooking.discount ?? 0)
      setBaselineDiscount(selectedBooking.discount ?? 0)
      setShowDiscountInput(false)
      setDiscountDraft('')
      setEditingPriceItemId(null)
      setPriceEditDraft('')
      setShortfalls([])
      setAvailabilityByItem({})
      setModalFormDirty(false)
      return
    }

    resetCreateForm()
    setModalFormDirty(false)
  }, [isModalOpen, prefillDate, isEditMode, selectedBooking?.id, setModalFormDirty])

  useEffect(() => {
    if (!isModalOpen) {
      setVisible(false)
      return undefined
    }
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [isModalOpen])

  useEffect(() => {
    if (!isModalOpen || !isEditMode || !selectedBooking?.id) return

    let active = true
    const loadEditData = async () => {
      setEditLoadError(null)
      try {
        const data = await api.getBooking(selectedBooking.id)
        if (!active) return
        const lines = asArray(data?.inventory)
        setForm(bookingToForm(data))
        setInventoryQuantities(quantitiesFromInventoryLines(lines))
        const savedPrices = unitPricesFromInventoryLines(lines)
        setUnitPriceOverrides(savedPrices)
        setBaselineUnitPrices(savedPrices)
        setOriginalInventoryLines(lines)
        setDiscount(data?.discount ?? 0)
        setBaselineDiscount(data?.discount ?? 0)
      } catch (err) {
        if (!active) return
        setInventoryQuantities({})
        setUnitPriceOverrides({})
        setBaselineUnitPrices({})
        setOriginalInventoryLines([])
        setEditLoadError(err?.message ?? "Couldn't load this booking. Please close and try again.")
      }
    }

    loadEditData()
    return () => {
      active = false
    }
  }, [isModalOpen, isEditMode, selectedBooking?.id])

  useEffect(() => {
    if (!isModalOpen) return

    let active = true
    const loadInventory = async () => {
      if (safeInventoryItems.length > 0) return
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
  }, [isModalOpen, safeInventoryItems.length, setItems])

  const billLines = useMemo(() => {
    return safeInventoryItems
      .map((item) => {
        const quantity = inventoryQuantities[item.id] || 0
        if (quantity <= 0) return null
        const standardPrice = item.unit_price ?? 0
        const unitPrice = unitPriceOverrides[item.id] ?? standardPrice
        return {
          item_id: item.id,
          name: item.name,
          quantity,
          unit_price: unitPrice,
          standard_price: standardPrice,
          line_total: quantity * unitPrice,
          isOverridden: unitPrice !== standardPrice,
        }
      })
      .filter(Boolean)
  }, [safeInventoryItems, inventoryQuantities, unitPriceOverrides])

  const subtotal = useMemo(
    () => billLines.reduce((sum, line) => sum + line.line_total, 0),
    [billLines],
  )

  const grandTotal = useMemo(
    () => Math.max(0, subtotal - discount),
    [subtotal, discount],
  )

  const balanceDue = useMemo(
    () => Math.max(0, grandTotal - (Number(form.advance) || 0)),
    [grandTotal, form.advance],
  )

  const inventoryLines = useMemo(
    () => billLines.map((line) => ({
      item_id: line.item_id,
      quantity: line.quantity,
      unit_price: line.unit_price,
      line_total: line.line_total,
    })),
    [billLines],
  )

  const billing = useMemo(
    () => ({ subtotal, discount, grandTotal, inventoryLines }),
    [subtotal, discount, grandTotal, inventoryLines],
  )

  const resolvedBilling = useMemo(() => {
    if (!isEditMode || !selectedBooking) {
      return billing
    }
    if (billing.inventoryLines.length > 0) {
      return billing
    }
    const storedGrand = Number(selectedBooking.grand_total ?? 0) > 0
      ? Number(selectedBooking.grand_total)
      : Number(selectedBooking.total ?? 0)
    const storedSubtotal = Number(selectedBooking.subtotal ?? 0) > 0
      ? Number(selectedBooking.subtotal)
      : storedGrand
    const resolvedDiscount = Number(selectedBooking.discount ?? discount ?? 0)
    return {
      subtotal: storedSubtotal,
      discount: resolvedDiscount,
      grandTotal: Math.max(0, storedGrand),
      inventoryLines: billing.inventoryLines,
    }
  }, [billing, discount, isEditMode, selectedBooking])

  const formIsDirty = useMemo(() => {
    if (isEditMode) {
      if (!selectedBooking) return false
      const baseline = bookingToForm(selectedBooking)
      const baselineQty = quantitiesFromInventoryLines(originalInventoryLines)
      return (
        form.client_name.trim() !== baseline.client_name
        || form.phone.trim() !== baseline.phone
        || form.event_type !== baseline.event_type
        || form.event_type_custom.trim() !== (baseline.event_type_custom ?? '').trim()
        || form.event_date !== baseline.event_date
        || form.guest_count !== baseline.guest_count
        || form.venue.trim() !== (baseline.venue ?? '').trim()
        || form.notes.trim() !== (baseline.notes ?? '').trim()
        || form.advance !== baseline.advance
        || discount !== baselineDiscount
        || !quantitiesEqual(inventoryQuantities, baselineQty)
        || !unitPricesEqual(unitPriceOverrides, baselineUnitPrices)
      )
    }

    const baseline = baselineCreateForm(prefillDate)
    const hasInventory = inventoryLines.length > 0
    return (
      form.client_name.trim() !== ''
      || form.phone.trim() !== ''
      || form.event_type !== baseline.event_type
      || form.event_type_custom.trim() !== ''
      || form.event_date !== baseline.event_date
      || form.guest_count !== ''
      || form.venue.trim() !== ''
      || form.notes.trim() !== ''
      || form.advance !== ''
      || discount > 0
      || hasInventory
    )
  }, [
    discount,
    baselineDiscount,
    form,
    inventoryLines.length,
    inventoryQuantities,
    isEditMode,
    originalInventoryLines,
    prefillDate,
    selectedBooking,
    unitPriceOverrides,
    baselineUnitPrices,
  ])

  useEffect(() => {
    if (!isModalOpen) return
    setModalFormDirty(formIsDirty)
  }, [formIsDirty, isModalOpen, setModalFormDirty])

  useEffect(() => {
    if (isModalOpen) return
    setModalFormDirty(false)
  }, [isModalOpen, setModalFormDirty])

  const validateField = (name, fieldValue) => {
    const formSnapshot =
      fieldValue !== undefined ? { ...form, [name]: fieldValue } : form
    const payload = buildPayload(formSnapshot, resolvedBilling)
    const result = bookingSchema.safeParse(payload)

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

  const handleBlur = (name, value) => {
    setTouched((prev) => ({ ...prev, [name]: true }))
    if (name === 'event_type_custom') {
      const error = validateEventTypeCustom(form.event_type, value)
      setFieldErrors((prev) => {
        const next = { ...prev }
        if (error) next.event_type_custom = error
        else delete next.event_type_custom
        return next
      })
      return
    }
    validateField(name, value)
  }

  const handleChange = (name, value) => {
    const nextValue = name === 'phone' ? value.trim() : value
    if (name === 'event_type') {
      setForm((prev) => ({
        ...prev,
        event_type: nextValue,
        event_type_custom: nextValue === 'other' ? prev.event_type_custom : '',
      }))
      if (touched.event_type) {
        validateField('event_type', nextValue)
      }
      if (nextValue !== 'other') {
        setFieldErrors((prev) => {
          const next = { ...prev }
          delete next.event_type_custom
          return next
        })
      }
      return
    }
    setForm((prev) => ({ ...prev, [name]: nextValue }))
    if (touched[name]) {
      validateField(name, nextValue)
    }
    if (name === 'event_date') {
      setConflictBooking(null)
      setDateClear(false)
    }
  }

  const handleQuantityChange = (itemId, rawValue) => {
    if (rawValue === '') {
      setInventoryQuantities((prev) => ({ ...prev, [itemId]: 0 }))
      return
    }

    const parsed = parseInt(rawValue, 10)
    if (Number.isNaN(parsed)) return

    const quantity = Math.max(0, parsed)
    setInventoryQuantities((prev) => ({ ...prev, [itemId]: quantity }))
    if (quantity > 0) {
      setUnitPriceOverrides((prev) => {
        if (prev[itemId] != null) return prev
        const item = safeInventoryItems.find((row) => row.id === itemId)
        return { ...prev, [itemId]: item?.unit_price ?? 0 }
      })
    }
  }

  const handleQuantityBlur = (itemId) => {
    setInventoryQuantities((prev) => {
      const qty = prev[itemId]
      if (qty === undefined || qty === '' || Number.isNaN(qty)) {
        return { ...prev, [itemId]: 0 }
      }
      return prev
    })
  }

  const startPriceEdit = (itemId, currentPrice) => {
    setEditingPriceItemId(itemId)
    setPriceEditDraft(String(currentPrice))
  }

  const cancelPriceEdit = () => {
    setEditingPriceItemId(null)
    setPriceEditDraft('')
  }

  const savePriceEdit = (itemId) => {
    const price = Number(priceEditDraft)
    if (!Number.isInteger(price) || price < 0) return
    setUnitPriceOverrides((prev) => ({ ...prev, [itemId]: price }))
    cancelPriceEdit()
  }

  const confirmDiscount = () => {
    const amount = Number(discountDraft)
    if (!Number.isInteger(amount) || amount < 0) return
    setDiscount(amount)
    setShowDiscountInput(false)
    setDiscountDraft('')
  }

  const removeDiscount = () => {
    setDiscount(0)
    setShowDiscountInput(false)
    setDiscountDraft('')
  }

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
      setConflictChecking(false)
    }
  }, [form.event_date, isModalOpen, isEditMode, selectedBooking?.id])

  useEffect(() => {
    if (!isModalOpen || safeInventoryItems.length === 0) return

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
        const items = safeInventoryItems.map((item) => ({
          item_id: item.id,
          quantity: inventoryQuantities[item.id] || 0,
        }))
        const result = await api.checkInventoryAvailability({
          date,
          items,
          excludeBookingId: isEditMode && selectedBooking?.id ? selectedBooking.id : undefined,
        })
        if (!active) return
        setShortfalls(asArray(result.shortfalls))
        const nextAvailability = {}
        for (const row of asArray(result.availability)) {
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
    safeInventoryItems,
    isModalOpen,
    isEditMode,
    selectedBooking?.id,
  ])

  const hasConflict = conflictBooking !== null

  const handleRequestClose = () => {
    if (isSubmitting || showConfirmDialog) return
    requestCloseModal()
  }

  const submitBooking = useCallback(async () => {
    if (submittingRef.current) return

    const submitPayload = buildPayload(form, resolvedBilling)
    const validation = bookingSchema.safeParse(submitPayload)
    if (!validation.success) return

    submittingRef.current = true
    setIsSubmitting(true)
    const hadOptimisticConflict = conflictBooking !== null

    try {
      const result = isEditMode
        ? await api.updateBooking(selectedBooking?.id, validation.data)
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
      forceCloseModal()
    } catch (err) {
      if (err.status === 401) {
        useAuthStore.setState({ isAuthenticated: false, isLoading: false })
        forceCloseModal()
        return
      }
      // 400: the server's validation sentence. 429: either our limiter's own text or "The server is waking up" (BUGS #104);
      // both are written for the merchant, so show them instead of the generic line.
      if (err.status === 400 || err.status === 429) {
        setFormError(err.message)
        return
      }
      setFormError('Something went wrong. Please try again.')
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }, [
    addBooking,
    resolvedBilling,
    forceCloseModal,
    conflictBooking,
    form,
    isEditMode,
    selectedBooking?.id,
    setPostSaveConflictNotice,
    updateBooking,
  ])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submittingRef.current) return
    setFormError(null)

    if (form.event_type === 'other' && !form.event_type_custom.trim()) {
      setFieldErrors((prev) => ({ ...prev, event_type_custom: EVENT_TYPE_CUSTOM_ERROR }))
      setTouched((prev) => ({
        ...prev,
        event_type_custom: true,
      }))
      return
    }

    const submitPayload = buildPayload(form, resolvedBilling)
    const validation = bookingSchema.safeParse(submitPayload)
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
        event_type_custom: true,
        event_date: true,
        guest_count: true,
        venue: true,
        notes: true,
        advance: true,
      })
      return
    }

    if (shortfalls.length > 0) {
      setShowConfirmDialog(true)
      return
    }

    await submitBooking()
  }

  const renderBillSummary = () => (
    <div className="sticky top-0 bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <h3 className="text-slate-800 font-bold text-base mb-4">Quote Summary</h3>

      {billLines.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-4">
          Add inventory items above to generate a quote
        </p>
      ) : (
        <div className="space-y-0 mb-2">
          {billLines.map((line) => (
            <div
              key={line.item_id}
              className="flex justify-between items-start py-2 border-b border-slate-100 gap-3"
            >
              <div>
                <p className="text-sm text-slate-700">{line.name}</p>
                <p className="text-xs text-slate-400">× {line.quantity}</p>
              </div>
              <div className="text-right shrink-0">
                {editingPriceItemId === line.item_id ? (
                  <div className="flex items-center gap-1 justify-end mb-1">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={priceEditDraft}
                      onChange={(e) => setPriceEditDraft(e.target.value)}
                      className="w-16 px-1 py-0.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                    <button
                      type="button"
                      onClick={() => savePriceEdit(line.item_id)}
                      className="text-teal-600 hover:text-teal-700"
                      aria-label="Save price"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={cancelPriceEdit}
                      className="text-slate-400 hover:text-slate-600"
                      aria-label="Cancel price edit"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 justify-end mb-1">
                    <span className={`text-xs ${line.isOverridden ? 'text-teal-600' : 'text-slate-500'}`}>
                      {formatCurrency(line.unit_price)}/event
                    </span>
                    <button
                      type="button"
                      onClick={() => startPriceEdit(line.item_id, line.unit_price)}
                      className="text-slate-400 hover:text-teal-600"
                      aria-label={`Edit price for ${line.name}`}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <p className="text-sm font-medium text-slate-800">
                  {formatCurrency(line.line_total)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between pt-3 mt-1">
        <span className="text-sm text-slate-600">Subtotal</span>
        <span className="text-sm font-medium text-slate-800">{formatCurrency(subtotal)}</span>
      </div>

      <div className="flex justify-between items-center pt-2">
        <span className="text-sm text-slate-600">Discount</span>
        {showDiscountInput ? (
          <div className="flex items-center gap-1">
            <input
              type="number"
              min="0"
              step="1"
              value={discountDraft}
              onChange={(e) => setDiscountDraft(e.target.value)}
              className="w-20 px-2 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500"
              placeholder="₹"
            />
            <button
              type="button"
              onClick={confirmDiscount}
              className="text-teal-600 hover:text-teal-700"
              aria-label="Apply discount"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : discount > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-800">{formatCurrency(discount)}</span>
            <button
              type="button"
              onClick={removeDiscount}
              className="text-slate-400 hover:text-slate-600"
              aria-label="Remove discount"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setShowDiscountInput(true)
              setDiscountDraft('')
            }}
            className="text-teal-600 text-xs cursor-pointer hover:text-teal-700"
          >
            + Add discount
          </button>
        )}
      </div>

      <div className="flex justify-between pt-3 mt-1 border-t border-slate-200">
        <span className="text-base font-bold text-slate-800">Total</span>
        <span className="text-lg font-bold text-teal-700">{formatCurrency(grandTotal)}</span>
      </div>

      <div className="pt-4 border-t border-slate-100 mt-3 space-y-3">
        <div>
          <label htmlFor="advance" className="block text-sm text-slate-600 mb-1">
            Advance Collected (₹)
          </label>
          <input
            id="advance"
            type="number"
            min="0"
            step="1"
            value={form.advance}
            onChange={(e) => handleChange('advance', e.target.value)}
            onBlur={(e) => handleBlur('advance', e.target.value)}
            className={inputClass(touched.advance && fieldErrors.advance)}
          />
          {touched.advance && fieldErrors.advance && (
            <p role="alert" className="mt-1 text-xs text-red-700">{fieldErrors.advance}</p>
          )}
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-slate-600">Balance Due</span>
          <span className={`text-sm font-medium ${balanceDue > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {formatCurrency(balanceDue)}
          </span>
        </div>
      </div>

      <button
        type="submit"
        form="booking-page-form"
        disabled={isSubmitting}
        className={`w-full mt-6 py-3 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
          !isSubmitting
            ? 'bg-teal-600 hover:bg-teal-700 text-white cursor-pointer'
            : 'bg-slate-300 text-slate-500 cursor-not-allowed'
        }`}
      >
        {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
        {isSubmitting
          ? 'Saving...'
          : isEditMode
            ? 'Save Changes'
            : 'Confirm Booking'}
      </button>
    </div>
  )

  if (!isModalOpen) return null

  if (isEditMode && !selectedBooking) {
    return (
      <div className="fixed inset-0 z-[70] bg-slate-50 flex flex-col items-center justify-center p-6">
        <p className="text-red-700 bg-red-100 border border-red-400 rounded-lg px-4 py-3 text-sm max-w-md text-center">
          Couldn&apos;t open this booking. Please close and try again.
        </p>
        <button
          type="button"
          onClick={requestCloseModal}
          className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-all duration-200"
        >
          Close
        </button>
      </div>
    )
  }

  return (
    <>
      <ModalDialog
        onClose={handleRequestClose}
        closeOnBackdrop={false}
        aria-labelledby="booking-page-title"
        className={`open:flex bg-slate-50 flex-col transition-all duration-200 ease-out ${
          visible
            ? 'opacity-100 translate-y-0 md:scale-100'
            : 'opacity-0 translate-y-full md:translate-y-0 md:scale-[0.98]'
        }`}
      >
        <div className="shrink-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h1 id="booking-page-title" className="text-slate-800 font-bold text-xl">
            {isEditMode ? 'Edit Booking' : 'New Booking'}
          </h1>
          <button
            type="button"
            onClick={handleRequestClose}
            className="p-1 text-slate-500 hover:text-slate-800 transition-all duration-200"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden">
          <div className="p-4 md:p-6 md:h-full md:flex md:flex-row md:gap-6 md:overflow-hidden">
            <form
              id="booking-page-form"
              onSubmit={handleSubmit}
              className="md:flex-1 md:overflow-y-auto md:min-h-0 space-y-4"
            >
              {editLoadError && (
                <p role="alert" className="text-sm text-red-700 bg-red-100 border border-red-400 rounded-lg px-3 py-2">
                  {editLoadError}
                </p>
              )}

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
                  onBlur={(e) => handleBlur('client_name', e.target.value)}
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
                  onBlur={(e) => handleBlur('phone', e.target.value)}
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
                  onBlur={(e) => handleBlur('event_type', e.target.value)}
                  className={inputClass(touched.event_type && fieldErrors.event_type)}
                >
                  {EVENT_TYPES.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                {touched.event_type && fieldErrors.event_type && (
                  <p className="mt-1 text-sm text-red-700">{fieldErrors.event_type}</p>
                )}
                {form.event_type === 'other' && (
                  <div className="mt-3 space-y-1 transition-all duration-200 ease-out">
                    <label htmlFor="event_type_custom" className="block text-sm font-medium text-slate-700">
                      Specify Event Type
                    </label>
                    <input
                      id="event_type_custom"
                      type="text"
                      value={form.event_type_custom}
                      onChange={(e) => handleChange('event_type_custom', e.target.value.slice(0, MAX_EVENT_TYPE_CUSTOM_LENGTH))}
                      onBlur={(e) => handleBlur('event_type_custom', e.target.value)}
                      placeholder="e.g. Jagran, Puja, Anniversary..."
                      className={inputClass(touched.event_type_custom && fieldErrors.event_type_custom)}
                    />
                    <div className="flex items-center justify-between gap-2">
                      {touched.event_type_custom && fieldErrors.event_type_custom ? (
                        <p role="alert" className="text-sm text-red-700">{fieldErrors.event_type_custom}</p>
                      ) : (
                        <span />
                      )}
                      <span className="text-xs text-slate-400 shrink-0">
                        {MAX_EVENT_TYPE_CUSTOM_LENGTH - form.event_type_custom.length} characters left
                      </span>
                    </div>
                  </div>
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
                    onBlur={(e) => handleBlur('event_date', e.target.value)}
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
                {hasConflict && conflictBooking && (
                  <div className="mt-2">
                    <ConflictBanner
                      clientName={conflictBooking?.client_name ?? 'Another client'}
                      eventType={formatEventType(conflictBooking?.event_type)}
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
                  onBlur={(e) => handleBlur('guest_count', e.target.value)}
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
                  onBlur={(e) => handleBlur('venue', e.target.value)}
                  placeholder="Optional"
                  className={inputClass(touched.venue && fieldErrors.venue)}
                />
                {touched.venue && fieldErrors.venue && (
                  <p className="mt-1 text-sm text-red-700">{fieldErrors.venue}</p>
                )}
              </div>

              <div>
                <label htmlFor="notes" className="block text-sm font-medium text-slate-700 mb-1">
                  Notes
                </label>
                <textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  onBlur={(e) => handleBlur('notes', e.target.value)}
                  placeholder="Optional"
                  rows={3}
                  className={`${inputClass(touched.notes && fieldErrors.notes)} resize-none`}
                />
                {touched.notes && fieldErrors.notes && (
                  <p className="mt-1 text-sm text-red-700">{fieldErrors.notes}</p>
                )}
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-700">Inventory Needed</h3>
                  {inventoryChecking && (
                    <Loader2 className="w-4 h-4 text-slate-400 animate-spin shrink-0" />
                  )}
                </div>

                {safeInventoryItems.length === 0 ? (
                  <p className="text-sm text-slate-500">No data yet.</p>
                ) : (
                  <div className="space-y-2">
                    {safeInventoryItems.map((item) => {
                      const usable = item.total_quantity - item.damaged_quantity
                      const available = availabilityByItem[item.id] ?? usable
                      const qty = inventoryQuantities[item.id] ?? 0
                      return (
                        <div key={item.id} className="flex items-center gap-3">
                          <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">{item.name}</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={qty === 0 ? '' : qty}
                            placeholder="0"
                            onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                            onBlur={() => handleQuantityBlur(item.id)}
                            className="w-20 px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                          <span className="text-xs text-slate-400 shrink-0 w-20 text-right">
                            {available} available
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                <InventoryWarningBanner shortfalls={shortfalls} />
              </div>

              <div className="md:hidden mt-6">
                {renderBillSummary()}
              </div>
            </form>

            <div className="hidden md:block w-96 shrink-0 overflow-y-auto min-h-0">
              {renderBillSummary()}
            </div>
          </div>
        </div>
      </ModalDialog>

      <ConfirmDialog
        isOpen={showConfirmDialog}
        title="Inventory Shortfall"
        message={formatShortfallConfirmMessage(shortfalls)}
        confirmLabel="Confirm"
        isConfirming={isSubmitting}
        onConfirm={submitBooking}
        onCancel={() => setShowConfirmDialog(false)}
      />

      <ConfirmDialog
        isOpen={discardPromptOpen && !showConfirmDialog && !isSubmitting}
        title="Discard changes?"
        message="You have unsaved changes to this booking. If you leave now, they'll be lost."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        confirmVariant="danger"
        focusCancel
        onConfirm={discardChanges}
        onCancel={keepEditing}
      />
    </>
  )
}

class BookingPageErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidUpdate(prevProps) {
    if (!this.props.isOpen && prevProps.isOpen) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[70] bg-slate-50 flex flex-col items-center justify-center p-6">
          <p className="text-red-700 bg-red-100 border border-red-400 rounded-lg px-4 py-3 text-sm max-w-md text-center">
            Something went wrong opening this booking. Please close and try again.
          </p>
          <button
            type="button"
            onClick={this.props.onClose}
            className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-all duration-200"
          >
            Close
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export const BookingPage = () => {
  const { isModalOpen, forceCloseModal } = useBookingStore()

  return (
    <BookingPageErrorBoundary isOpen={isModalOpen} onClose={forceCloseModal}>
      <BookingPageContent />
    </BookingPageErrorBoundary>
  )
}
