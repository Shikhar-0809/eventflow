import { memo, useCallback, useEffect, useState } from 'react'
import { useLangStore } from '../store/langStore'
import { t } from '../utils/i18n'

const UnitButton = memo(({
  unit,
  itemName,
  isSelected,
  isOverAvailable,
  onSelect,
}) => {
  const [hovered, setHovered] = useState(false)

  let className = 'w-4 h-4 rounded-sm border transition-colors duration-75 cursor-pointer '
  if (isSelected) {
    className += isOverAvailable
      ? 'bg-amber-500 border-amber-600'
      : 'bg-teal-600 border-teal-700'
  } else if (isOverAvailable) {
    className += 'bg-slate-100 border-slate-200 opacity-60 hover:opacity-80'
  } else {
    className += 'bg-white border-slate-300 hover:border-teal-400'
  }

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label={`${itemName} unit ${unit}${isSelected ? ', selected' : ''}`}
        aria-pressed={isSelected}
        className={className}
        onClick={() => onSelect(unit)}
      />
      {hovered && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-0.5 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-xs text-white"
        >
          {unit}
        </span>
      )}
    </span>
  )
})

UnitButton.displayName = 'UnitButton'

export const InventoryUnitPicker = memo(({
  itemName,
  totalQuantity,
  availableCount,
  startingQuantity,
  onQuantityChange,
  itemId,
}) => {
  const { lang } = useLangStore()
  const [quantity, setQuantity] = useState(startingQuantity)
  const gridCount = Math.max(totalQuantity, quantity, 1)
  const available = availableCount ?? totalQuantity

  useEffect(() => {
    setQuantity(startingQuantity)
  }, [startingQuantity, itemId])

  const handleSelect = useCallback((unitIndex) => {
    setQuantity((prev) => {
      const next = prev === unitIndex ? unitIndex - 1 : unitIndex
      onQuantityChange(itemId, next)
      return next
    })
  }, [itemId, onQuantityChange])

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">{itemName}</p>
      <p className="text-xs text-slate-500" data-testid={`inventory-count-${itemId}`}>
        {quantity} / {available} {t(lang, 'availableHint')}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: gridCount }, (_, i) => {
          const unit = i + 1
          return (
            <UnitButton
              key={unit}
              unit={unit}
              itemName={itemName}
              isSelected={quantity >= unit}
              isOverAvailable={unit > available}
              onSelect={handleSelect}
            />
          )
        })}
      </div>
    </div>
  )
})

InventoryUnitPicker.displayName = 'InventoryUnitPicker'
