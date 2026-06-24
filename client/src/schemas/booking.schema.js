import { z } from 'zod'

export const bookingInventoryLineSchema = z.object({
  item_id: z.number().int().positive(),
  quantity: z.number().int().positive().max(10000),
})

export const bookingSchema = z.object({
  client_name: z.string().trim().min(2, 'Name is too short').max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  event_type: z.enum(['wedding', 'birthday', 'corporate', 'other']),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  guest_count: z.number().int().positive().max(10000),
  venue: z.string().trim().max(200).optional(),
  advance: z.number().int().nonnegative().max(10000000),
  total: z.number().int().nonnegative().max(10000000),
  inventory: z.array(bookingInventoryLineSchema).max(50).optional(),
})
