import { z } from 'zod'

export const inventoryItemSchema = z.object({
  name: z.string().trim().min(2, 'Item name is too short').max(100),
  total_quantity: z.number().int().nonnegative().max(100000),
  unit_price: z.number().int().nonnegative().max(10000000).optional().default(0),
})

export const inventoryQuantityUpdateSchema = z.object({
  total_quantity: z.number().int().nonnegative().max(100000),
})

export const inventoryPriceUpdateSchema = z.object({
  unit_price: z.number().int().nonnegative().max(10000000),
})

export const inventoryDamageAdjustSchema = z.object({
  change: z.number().int().refine((n) => n !== 0, 'Change cannot be zero'),
  note: z.string().trim().max(300).optional(),
})

export const availabilityCheckSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  items: z.array(z.object({
    item_id: z.number().int().positive(),
    quantity: z.number().int().nonnegative().max(10000),
  })),
  excludeBookingId: z.number().int().positive().optional(),
})
