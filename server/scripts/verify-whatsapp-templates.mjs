// Static + behavioural check of client/src/utils/whatsapp.js (no database, no server).
// The real module is bundled with esbuild (it uses extensionless imports and import.meta.env, which plain Node
// cannot load) and called with different business names: the sign-off must be the merchant's own name, never a
// hardcoded one (BUGS #071). Sample client data is fictional.
import { readFileSync } from 'fs'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const CLIENT_WA = join(ROOT, 'client/src/utils/whatsapp.js')
const { buildSync } = createRequire(join(ROOT, 'client/package.json'))('esbuild')

const SAMPLE = {
  client_name: 'Ramesh Sharma',
  phone: '9876543210',
  event_date: '2026-07-15',
  event_type: 'wedding',
  guest_count: 250,
  advance: 20000,
  total: 60000,
  venue: 'Sample Lawn',
}

const results = []
const check = (ok, name, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`)
}

const source = readFileSync(CLIENT_WA, 'utf8')
check(source.includes('export const confirmationMessage') && source.includes('export const paymentReminderMessage') && source.includes('export const selfSummaryMessage'), 'all three message functions exported')
check(source.includes('encodeURIComponent(message)'), 'message is wrapped with encodeURIComponent')
check(!/Bala Ji/.test(source), 'no hardcoded Bala Ji sign-off in source')
check(!source.includes('Sharma Tent House') && !/Thank you! - EventFlow/.test(source), 'no stale sign-offs in source')

const bundle = buildSync({
  entryPoints: [CLIENT_WA],
  bundle: true,
  write: false,
  format: 'esm',
})
// The merchant's own number is passed in from their profile (whatsapp_phone); there is no env var any more.
const MERCHANT_PHONE = '9876543299'
const mod = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)

const textOf = (url) => decodeURIComponent(new URL(url).searchParams.get('text') ?? '')

for (const name of ['Alpha Tents', 'Beta Caterers']) {
  const other = name === 'Alpha Tents' ? 'Beta Caterers' : 'Alpha Tents'
  const confirmation = textOf(mod.confirmationMessage(SAMPLE, name))
  const reminder = textOf(mod.paymentReminderMessage(SAMPLE, name))
  const summary = textOf(mod.selfSummaryMessage(SAMPLE, name, MERCHANT_PHONE))
  check(confirmation.endsWith(`Thank you! - ${name}`) && !confirmation.includes(other), `confirmation signed "${name}"`)
  check(reminder.endsWith(`Thank you! - ${name}`) && !reminder.includes(other), `payment reminder signed "${name}"`)
  check(summary.endsWith(`Pending: ₹40,000. - ${name}`) && !summary.includes(other), `self summary signed "${name}"`)
}

const unsigned = textOf(mod.confirmationMessage(SAMPLE, undefined))
check(unsigned.endsWith('Thank you!') && !unsigned.includes('Bala Ji'), 'no business name: no sign-off, and no fallback to another business')
check(textOf(mod.confirmationMessage(SAMPLE, '  ')).endsWith('Thank you!'), 'blank business name: no sign-off')
check(mod.confirmationMessage({ ...SAMPLE, phone: '123' }, 'Alpha Tents') === null, 'invalid phone still returns null')
check(source.includes('VITE_MERCHANT_PHONE') === false, 'whatsapp.js no longer reads VITE_MERCHANT_PHONE')
check(mod.selfSummaryMessage(SAMPLE, 'Alpha Tents', null) === null && mod.selfSummaryMessage(SAMPLE, 'Alpha Tents', '') === null && mod.selfSummaryMessage(SAMPLE, 'Alpha Tents', '123') === null, 'self summary needs a valid merchant number (null / empty / invalid -> null)')
check(new URL(mod.selfSummaryMessage(SAMPLE, 'Alpha Tents', MERCHANT_PHONE)).pathname === `/91${MERCHANT_PHONE}`, 'self summary goes to the number it is given')
check(mod.confirmationPreview(SAMPLE, 'Alpha Tents').endsWith('Thank you! - Alpha Tents'), 'confirmationPreview is the same text the confirmation link carries')
check(textOf(mod.confirmationMessage(SAMPLE, 'Alpha Tents')) === mod.confirmationPreview(SAMPLE, 'Alpha Tents'), 'preview text equals the link text')

console.log('\n--- Sample confirmation message ---')
console.log(textOf(mod.confirmationMessage(SAMPLE, 'Alpha Tents')))

const failed = results.filter((ok) => !ok).length
console.log(`\nScript result: ${failed ? 'FAIL' : 'PASS'} (${results.length - failed}/${results.length} checks)`)
process.exit(failed ? 1 : 0)
