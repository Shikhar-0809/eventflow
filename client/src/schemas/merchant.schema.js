import { z } from 'zod'

export const emailField = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(255, 'Email is too long')

// bcrypt only uses the first 72 bytes, so a longer password would be silently truncated.
export const passwordField = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .refine((value) => new TextEncoder().encode(value).length <= 72, 'Password is too long')

export const businessNameField = z.string({ required_error: 'Business name is required' }).trim().min(2, 'Business name is too short').max(100, 'Business name is too long')

const tokenField = (label) => z.string({ required_error: `${label} is required` }).min(1, `${label} is required`).max(2000, `${label} is invalid`)

// The email comes from the verified token on the server, so it is not part of the sign-up body.
export const signupSchema = z.object({
  verificationToken: tokenField('Verification token'),
  business_name: businessNameField,
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

// Same rule as the server's profileBusinessSchema (server/schemas/merchant.schema.js). An empty phone is allowed
// and means "no number"; the form sends null for it.
export const whatsappPhoneField = z
  .string()
  .trim()
  .refine((value) => value === '' || /^[6-9]\d{9}$/.test(value), 'Enter a valid 10-digit Indian mobile number')

export const profileBusinessSchema = z.object({
  business_name: businessNameField,
  whatsapp_phone: whatsappPhoneField,
})

// Login does not re-check password strength: it only needs something to compare.
export const loginSchema = z.object({
  email: emailField,
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required').max(200),
})
