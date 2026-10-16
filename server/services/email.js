import { maskEmail } from '../utils/maskEmail.js'

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email'
const TIMEOUT_MS = 10_000

const EXPIRY_LINE = 'This code expires in 10 minutes.'
const IGNORE_LINE = "If you didn't request this, ignore this email."

// Local development only. NODE_ENV is checked explicitly so this path can never run in production,
// whatever EMAIL_DEV_LOG says. The body is logged because it holds the code a developer needs to type in.
const isDevLog = () => process.env.NODE_ENV !== 'production' && process.env.EMAIL_DEV_LOG === 'true'

export const sendEmail = async ({ to, subject, text, html }) => {
  if (isDevLog()) {
    console.log(`[dev email] to=${to} subject=${subject}\n${text}`)
    return
  }

  const { BREVO_API_KEY, EMAIL_FROM, EMAIL_FROM_NAME } = process.env
  if (!BREVO_API_KEY || !EMAIL_FROM || !EMAIL_FROM_NAME) {
    throw new Error('Email is not configured.')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: EMAIL_FROM_NAME, email: EMAIL_FROM },
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html,
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      // Status only: the response body and the key never go into an error message.
      throw new Error(`Email provider returned ${response.status}.`)
    }
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Email provider timed out.')
    // Network errors can carry request details; keep only a generic message.
    throw new Error(err.message?.startsWith('Email provider returned') ? err.message : 'Could not send email.')
  } finally {
    clearTimeout(timer)
  }
}

const appLine = () => (process.env.APP_URL ? process.env.APP_URL : '')

const codeEmail = (subject, intro, code) => {
  const app = appLine()
  const text = [intro, '', `Your code: ${code}`, '', `${EXPIRY_LINE} ${IGNORE_LINE}`, ...(app ? ['', app] : [])].join('\n')
  const html = [
    `<p>${intro}</p>`,
    `<p style="font-size:24px;letter-spacing:4px;font-weight:bold">${code}</p>`,
    `<p>${EXPIRY_LINE} ${IGNORE_LINE}</p>`,
    app ? `<p><a href="${app}">${app}</a></p>` : '',
  ].join('')
  return { subject, text, html }
}

export const signupCodeEmail = (code) =>
  codeEmail('Your EventFlow sign-up code', 'Use this code to verify your email and finish creating your EventFlow account.', code)

export const resetCodeEmail = (code) =>
  codeEmail('Your EventFlow password reset code', 'Use this code to reset your EventFlow password.', code)

// Sent to the stored address when a logged-in merchant resets their password with a code.
export const resetPasswordCodeEmail = (code) =>
  codeEmail('Your EventFlow password reset code', 'Use this code to set a new password for your EventFlow account.', code)

// Sent to the NEW address, to prove the merchant controls it.
export const changeEmailCodeEmail = (code) =>
  codeEmail('Confirm your new EventFlow email', 'Use this code to confirm this address as your new EventFlow login email.', code)

const NOTICES = {
  password_changed: {
    subject: 'Your EventFlow password was changed',
    line: () => 'The password for your EventFlow account was just changed, and every other device was signed out.',
    warn: "If you didn't make this change, reset your password and contact support.",
  },
  email_changed: {
    subject: 'Your EventFlow email was changed',
    line: ({ newEmail }) => `The login email for your EventFlow account was just changed to ${maskEmail(newEmail)}.`,
    warn: "If this wasn't you, reset your password and contact support.",
  },
  account_deleted: {
    subject: 'Your EventFlow account was deleted',
    line: () => 'Your EventFlow account and all of its data were just deleted.',
    warn: "If you didn't do this, contact support right away.",
  },
}

// Plain-text security notice, sent to the address on file. No links that perform an action (the app address, if set,
// is text only). Any other address in the body is masked. details for email_changed: { newEmail }.
export const securityNoticeEmail = (kind, details = {}) => {
  const notice = NOTICES[kind]
  if (!notice) throw new Error(`Unknown security notice: ${kind}`)
  const text = [notice.line(details), notice.warn, appLine()].filter(Boolean).join('\n\n')
  return { subject: notice.subject, text }
}

export const sendSecurityNotice = (email, kind, details) => sendEmail({ to: email, ...securityNoticeEmail(kind, details) })
