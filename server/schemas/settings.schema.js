import { z } from 'zod'

export const settingsPatchSchema = z.object({
  monthly_revenue_target: z.number().int().nonnegative().max(100000000),
})
