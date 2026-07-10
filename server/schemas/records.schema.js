import { z } from 'zod'

export const recordsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid from date format').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid to date format').optional(),
  event_type: z.enum(['wedding', 'birthday', 'corporate', 'other']).optional(),
  status: z.enum(['confirmed', 'pending', 'cancelled']).optional(),
  search: z.string().trim().max(100).optional(),
  sort_by: z.enum(['revenue', 'profit', 'expenses']).optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
})
