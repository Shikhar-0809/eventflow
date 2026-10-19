// Dev databases only (BUGS #103): --confirm-host=<dev db host> is required and the production host is refused.
import './lib/guardFirst.mjs'
import './lib/refuseProductionDatabase.mjs'
import { authFetch, loginVerifySession, readJson } from './lib/verifyScriptAuth.mjs'

const NOTE = 'ZZZ_TEST change log verification note'
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
  console.log('=== verify-change-log.mjs ===\n')
  const { cookieHeader } = await loginVerifySession()

  try {
    const listRes = await readJson(await authFetch(cookieHeader, '/bookings'))
    const booking = listRes.body?.find((row) => row.status === 'confirmed')
    if (!booking) {
      fail('find confirmed booking', 'none found')
      process.exit(1)
    }
    pass('find confirmed booking', `id=${booking.id} ${booking.client_name}`)

    const logRes = await readJson(
      await authFetch(cookieHeader, `/bookings/${booking.id}/log`, {
        method: 'PATCH',
        body: JSON.stringify({ note: NOTE }),
      }),
    )
    if (logRes.status === 200 && Array.isArray(logRes.body)) {
      pass('PATCH /bookings/:id/log', `200 returned ${logRes.body.length} entries`)
    } else {
      fail('PATCH /bookings/:id/log', `${logRes.status} ${JSON.stringify(logRes.body)}`)
      return
    }

    const entry = logRes.body.find((row) => row.change_note === NOTE)
    if (entry) pass('log note text', entry.change_note)
    else fail('log note text', `note not found in ${JSON.stringify(logRes.body.map((r) => r.change_note))}`)

    // Postgres prints offsets as +00 or +05:30; Date.parse needs +00:00, so a bare hour offset is padded.
    const parsed = entry?.logged_at ? Date.parse(String(entry.logged_at).replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')) : NaN
    if (entry && Number.isFinite(parsed)) {
      pass('log timestamp', entry.logged_at)
    } else {
      fail('log timestamp', `invalid logged_at: ${entry?.logged_at}`)
    }

    const detailRes = await readJson(await authFetch(cookieHeader, `/bookings/${booking.id}`))
    const detailEntry = detailRes.body?.change_log?.find((row) => row.change_note === NOTE)
    if (detailRes.status === 200 && detailEntry) {
      pass('GET /bookings/:id change_log', 'entry present on booking detail')
    } else {
      fail('GET /bookings/:id change_log', JSON.stringify(detailRes.body?.change_log))
    }
  } finally {
    pass('cleanup', 'append-only change log — no cleanup required')
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\nScript result: ${failed.length ? 'FAIL' : 'PASS'} (${results.length - failed.length}/${results.length} checks)\n`)
  process.exit(failed.length ? 1 : 0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
