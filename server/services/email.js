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

// Sent to the NEW address, to prove the merchant controls it.
export const changeEmailCodeEmail = (code) =>
  codeEmail('Confirm your new EventFlow email', 'Use this code to confirm this address as your new EventFlow login email.', code)

// Sent to the OLD address after the change, so a hijack is noticed.
export const emailChangedNoticeEmail = () => {
  const app = appLine()
  const line = 'The login email for your EventFlow account was just changed.'
  const warn = "If you didn't make this change, contact support right away."
  return {
    subject: 'Your EventFlow email was changed',
    text: [line, warn, app].filter(Boolean).join('\n\n'),
    html: `<p>${line}</p><p>${warn}</p>${app ? `<p><a href="${app}">${app}</a></p>` : ''}`,
  }
}
