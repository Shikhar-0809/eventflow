import { z } from 'zod'

const emailField = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(255, 'Email is too long')

export const signupSchema = z.object({
  business_name: z.string({ required_error: 'Business name is required' }).trim().min(2, 'Business name is too short').max(100, 'Business name is too long'),
  email: emailField,
  // bcrypt only uses the first 72 bytes, so a longer password would be silently truncated.
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .refine((value) => new TextEncoder().encode(value).length <= 72, 'Password is too long'),
})

// Login does not re-check password strength: it only needs something to compare.
export const loginSchema = z.object({
  email: emailField,
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required').max(200),
})
