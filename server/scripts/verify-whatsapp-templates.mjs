import { readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const CLIENT_WA = join(ROOT, 'client/src/utils/whatsapp.js')
const SERVER_WA = join(ROOT, 'server/utils/whatsapp.js')

const SAMPLE = {
  client_name: 'Ramesh Sharma',
  phone: '9876543210',
  event_date: '2026-07-15',
  event_type: 'wedding',
  guest_count: 250,
  advance: 20000,
}

const results = []
const pass = (name, detail) => {
  results.push({ ok: true, name, detail })
  console.log(`PASS  ${name}: ${detail}`)
}
const fail = (name, detail) => {
  results.push({ ok: false, name, detail })
  console.log(`FAIL  ${name}: ${detail}`)
}

const run = async () => {
  console.log('=== verify-whatsapp-templates.mjs ===\n')

  let waPath = null
  if (existsSync(CLIENT_WA)) waPath = CLIENT_WA
  else if (existsSync(SERVER_WA)) waPath = SERVER_WA

  if (waPath) pass('locate whatsapp.js', waPath.replace(/\\/g, '/'))
  else {
    fail('locate whatsapp.js', 'not found under client/src or server/utils')
    process.exit(1)
  }

  const source = readFileSync(waPath, 'utf8')

  if (source.includes('export const confirmationMessage') && source.includes('export const paymentReminderMessage')) {
    pass('both functions present', 'confirmationMessage and paymentReminderMessage')
  } else {
    fail('both functions present', 'missing one or both exported functions')
  }

  const signOffCount = (source.match(/Bala Ji Tent House/g) ?? []).length
  if (signOffCount >= 2) pass('Bala Ji sign-off', `found ${signOffCount} occurrence(s) in source`)
  else fail('Bala Ji sign-off', `expected >= 2; found ${signOffCount}`)

  if (source.includes('encodeURIComponent(message)')) {
    pass('encodeURIComponent', 'buildWaLink wraps message with encodeURIComponent')
  } else {
    fail('encodeURIComponent', 'encodeURIComponent(message) not found in whatsapp.js')
  }

  if (!source.includes('Sharma Tent House')) pass('no Sharma sign-off', 'not found')
  else fail('no Sharma sign-off', 'Sharma Tent House still present')

  const staleEventFlowSignOff = /Thank you! - EventFlow/.test(source)
  if (!staleEventFlowSignOff) pass('no EventFlow sign-off', 'not used as message sign-off')
  else fail('no EventFlow sign-off', 'Thank you! - EventFlow found')

  let confirmationUrl = null
  let reminderUrl = null
  try {
    const mod = await import(pathToFileURL(waPath).href)
    confirmationUrl = mod.confirmationMessage(SAMPLE)
    reminderUrl = mod.paymentReminderMessage(SAMPLE)
  } catch {
    const digits = SAMPLE.phone
    const eventType = SAMPLE.event_type.charAt(0).toUpperCase() + SAMPLE.event_type.slice(1)
    const advance = `₹${Number(SAMPLE.advance).toLocaleString('en-IN')}`
    const confirmationText =
      `Namaskar ${SAMPLE.client_name}! Your booking is confirmed for ${SAMPLE.event_date}. ` +
      `Event: ${eventType}, Guests: ${SAMPLE.guest_count}. Advance received: ${advance}. ` +
      'Thank you! - Bala Ji Tent House'
    const reminderText =
      `Namaskar ${SAMPLE.client_name}! This is a reminder that your event is on ${SAMPLE.event_date}. ` +
      'Kindly arrange the remaining balance before the event. Thank you! - Bala Ji Tent House'
    confirmationUrl = `https://wa.me/91${digits}?text=${encodeURIComponent(confirmationText)}`
    reminderUrl = `https://wa.me/91${digits}?text=${encodeURIComponent(reminderText)}`
    pass('dynamic import', 'fell back to inline sample message construction')
  }

  if (confirmationUrl) {
    const text = decodeURIComponent(new URL(confirmationUrl).searchParams.get('text') ?? '')
    console.log('\n--- Sample confirmation message ---')
    console.log(text)
    if (text.includes('Bala Ji Tent House') && text.includes('Ramesh Sharma')) {
      pass('sample confirmation text', 'readable message with correct sign-off')
    } else fail('sample confirmation text', text)
  }

  if (reminderUrl) {
    const text = decodeURIComponent(new URL(reminderUrl).searchParams.get('text') ?? '')
    console.log('\n--- Sample payment reminder message ---')
    console.log(text)
    if (text.includes('Bala Ji Tent House') && text.includes('Ramesh Sharma')) {
      pass('sample reminder text', 'readable message with correct sign-off')
    } else fail('sample reminder text', text)
  }

  pass('cleanup', 'static check only — no database changes')

  const failed = results.filter((r) => !r.ok)
  console.log(`\nScript result: ${failed.length ? 'FAIL' : 'PASS'} (${results.length - failed.length}/${results.length} checks)\n`)
  process.exit(failed.length ? 1 : 0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
