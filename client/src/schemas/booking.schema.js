import { z } from 'zod'

export const bookingInventoryLineSchema = z.object({
  item_id: z.number().int().positive(),
  quantity: z.number().int().positive().max(10000),
  unit_price: z.number().int().nonnegative().optional(),
  line_total: z.number().int().nonnegative().optional(),
})

export const bookingSchema = z.object({
  client_name: z.string().trim().min(2, 'Name is too short').max(100),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  event_type: z.enum(['wedding', 'birthday', 'corporate', 'other']),
  event_type_custom: z.string().trim().max(50).optional(),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  guest_count: z.number().int().positive().max(10000),
  venue: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
  advance: z.number().int().nonnegative().max(10000000),
  total: z.number().int().nonnegative().max(10000000),
  subtotal: z.number().int().nonnegative().optional(),
  discount: z.number().int().nonnegative().max(10000000).optional(),
  grand_total: z.number().int().nonnegative().optional(),
  inventory: z.array(bookingInventoryLineSchema).max(50).optional(),
}).superRefine((data, ctx) => {
  const grandTotal = data.grand_total ?? data.total ?? 0
  if (data.advance > grandTotal) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Advance cannot exceed total.',
      path: ['advance'],
    })
  }
})
