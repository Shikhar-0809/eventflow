import { z } from 'zod'

const emailField = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(255, 'Email is too long')

// bcrypt only uses the first 72 bytes, so a longer password would be silently truncated.
const passwordField = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password is too long')

const tokenField = (label) => z.string({ required_error: `${label} is required` }).min(1, `${label} is required`).max(2000, `${label} is invalid`)

// The email comes from the verification token, never from the body.
export const signupSchema = z.object({
  verificationToken: tokenField('Verification token'),
  business_name: z.string({ required_error: 'Business name is required' }).trim().min(2, 'Business name is too short').max(100, 'Business name is too long'),
  password: passwordField,
})

export const sendOtpSchema = z.object({ email: emailField })

export const verifyOtpSchema = z.object({
  email: emailField,
  code: z.string({ required_error: 'Code is required' }).trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

export const resetPasswordSchema = z.object({
  resetToken: tokenField('Reset token'),
  newPassword: passwordField,
})

// Login does not re-check password strength: it only needs something to compare.
export const loginSchema = z.object({
  email: emailField,
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required').max(200),
})
