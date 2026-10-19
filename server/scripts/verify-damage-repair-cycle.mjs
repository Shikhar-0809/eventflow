// Dev databases only (BUGS #103): --confirm-host=<dev db host> is required and the production host is refused.
import './lib/guardFirst.mjs'
import './lib/refuseProductionDatabase.mjs'
import { authFetch, loginVerifySession, readJson } from './lib/verifyScriptAuth.mjs'

const ITEM_NAME = 'Plastic Chairs'
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
  console.log('=== verify-damage-repair-cycle.mjs ===\n')
  const { cookieHeader } = await loginVerifySession()

  const listRes = await readJson(await authFetch(cookieHeader, '/inventory'))
  const item = listRes.body?.find((row) => row.name === ITEM_NAME)
  if (!item) {
    fail('find Plastic Chairs', 'item not found')
    process.exit(1)
  }

  const baseline = {
    damaged: item.damaged_quantity,
    available: item.available,
    usable: item.usable,
  }
  pass('baseline', `damaged=${baseline.damaged} available=${baseline.available}`)

  try {
    const dmgRes = await readJson(
      await authFetch(cookieHeader, `/inventory/${item.id}/damage`, {
        method: 'POST',
        body: JSON.stringify({ change: 5, note: 'ZZZ_TEST damage verification' }),
      }),
    )
    if (dmgRes.status === 200 && dmgRes.body.damaged_quantity === baseline.damaged + 5) {
      pass('mark damaged +5', `damaged=${dmgRes.body.damaged_quantity}`)
    } else {
      fail('mark damaged +5', JSON.stringify(dmgRes.body))
    }

    const afterDmgList = await readJson(await authFetch(cookieHeader, '/inventory'))
    const afterDmg = afterDmgList.body.find((row) => row.id === item.id)
    if (
      afterDmg.damaged_quantity === baseline.damaged + 5 &&
      afterDmg.available === baseline.available - 5
    ) {
      pass('counts after damage', `damaged=${afterDmg.damaged_quantity} available=${afterDmg.available}`)
    } else {
      fail(
        'counts after damage',
        `expected damaged=${baseline.damaged + 5} available=${baseline.available - 5}; got damaged=${afterDmg.damaged_quantity} available=${afterDmg.available}`,
      )
    }

    const repRes = await readJson(
      await authFetch(cookieHeader, `/inventory/${item.id}/damage`, {
        method: 'POST',
        body: JSON.stringify({ change: -5, note: 'ZZZ_TEST repair verification' }),
      }),
    )
    if (repRes.status === 200 && repRes.body.damaged_quantity === baseline.damaged) {
      pass('mark repaired -5', `damaged=${repRes.body.damaged_quantity}`)
    } else {
      fail('mark repaired -5', JSON.stringify(repRes.body))
    }

    const afterRepList = await readJson(await authFetch(cookieHeader, '/inventory'))
    const afterRep = afterRepList.body.find((row) => row.id === item.id)
    if (
      afterRep.damaged_quantity === baseline.damaged &&
      afterRep.available === baseline.available
    ) {
      pass('counts restored', `damaged=${afterRep.damaged_quantity} available=${afterRep.available}`)
    } else {
      fail(
        'counts restored',
        `expected damaged=${baseline.damaged} available=${baseline.available}; got damaged=${afterRep.damaged_quantity} available=${afterRep.available}`,
      )
    }

    const clampRes = await readJson(
      await authFetch(cookieHeader, `/inventory/${item.id}/damage`, {
        method: 'POST',
        body: JSON.stringify({ change: -(baseline.damaged + 10) }),
      }),
    )
    const clampBody = clampRes.body
    if (
      clampRes.status === 200 &&
      clampBody.damaged_quantity === 0 &&
      clampBody.damage_adjustment?.clamped === true
    ) {
      pass('clamp underflow', `damaged=${clampBody.damaged_quantity} clamped=true`)
    } else if (clampRes.status === 400 && baseline.damaged === 0) {
      pass('clamp underflow', '400 when already at floor')
    } else {
      fail('clamp underflow', `${clampRes.status} ${JSON.stringify(clampBody)}`)
    }
  } finally {
    const currentList = await readJson(await authFetch(cookieHeader, '/inventory'))
    const current = currentList.body.find((row) => row.id === item.id)
    const restoreChange = baseline.damaged - current.damaged_quantity
    if (restoreChange !== 0) {
      await readJson(
        await authFetch(cookieHeader, `/inventory/${item.id}/damage`, {
          method: 'POST',
          body: JSON.stringify({ change: restoreChange, note: 'ZZZ_TEST restore baseline' }),
        }),
      )
    }

    const verifyList = await readJson(await authFetch(cookieHeader, '/inventory'))
    const verifyItem = verifyList.body.find((row) => row.id === item.id)
    if (verifyItem.damaged_quantity === baseline.damaged && verifyItem.available === baseline.available) {
      pass('cleanup', `Plastic Chairs restored to damaged=${baseline.damaged} available=${baseline.available}`)
    } else {
      fail(
        'cleanup',
        `Plastic Chairs not restored: damaged=${verifyItem.damaged_quantity} available=${verifyItem.available} (expected damaged=${baseline.damaged} available=${baseline.available})`,
      )
    }
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\nScript result: ${failed.length ? 'FAIL' : 'PASS'} (${results.length - failed.length}/${results.length} checks)\n`)
  process.exit(failed.length ? 1 : 0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
