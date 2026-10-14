import 'dotenv/config'
import './lib/refuseProductionDatabase.mjs'
import { pool } from '../db/database.js'
import { deleteInventoryItemById } from './lib/verifyDbCleanup.mjs'
import { authFetch, loginVerifySession, readJson } from './lib/verifyScriptAuth.mjs'

const ITEM_NAME = 'ZZZ_TEST_Verification Item'
const results = []
let createdItemId = null

const pass = (name, detail) => {
  results.push({ ok: true, name, detail })
  console.log(`PASS  ${name}: ${detail}`)
}
const fail = (name, detail) => {
  results.push({ ok: false, name, detail })
  console.log(`FAIL  ${name}: ${detail}`)
}

const run = async () => {
  console.log('=== verify-add-inventory-item.mjs ===\n')
  const { cookieHeader } = await loginVerifySession()

  try {
    const existing = await pool.query(
      'SELECT id FROM inventory_items WHERE name = $1',
      [ITEM_NAME],
    )
    for (const row of existing.rows) {
      await deleteInventoryItemById(row.id)
    }

    const createRes = await readJson(
      await authFetch(cookieHeader, '/inventory', {
        method: 'POST',
        body: JSON.stringify({ name: ITEM_NAME, total_quantity: 50 }),
      }),
    )
    createdItemId = createRes.body?.id ?? null
    const body = createRes.body
    if (
      createRes.status === 201 &&
      createdItemId &&
      body.total_quantity === 50 &&
      body.damaged_quantity === 0 &&
      body.usable === 50 &&
      body.available === 50 &&
      body.in_use_today === 0
    ) {
      pass('POST /inventory', `201 id=${createdItemId} usable=50 available=50 in_use_today=0`)
    } else {
      fail('POST /inventory', `expected 201 with computed fields; got ${createRes.status} ${JSON.stringify(body)}`)
    }

    const listRes = await readJson(await authFetch(cookieHeader, '/inventory'))
    const listed = listRes.body?.find((row) => row.id === createdItemId)
    if (
      listRes.status === 200 &&
      listed &&
      listed.usable === 50 &&
      listed.available === 50 &&
      listed.in_use_today === 0 &&
      listed.damaged_quantity === 0
    ) {
      pass('GET /inventory list', 'item present with correct computed fields')
    } else {
      fail('GET /inventory list', `listed item: ${JSON.stringify(listed)}`)
    }
  } finally {
    if (createdItemId) {
      const patchRes = await readJson(
        await authFetch(cookieHeader, `/inventory/${createdItemId}`, {
          method: 'PATCH',
          body: JSON.stringify({ total_quantity: 0 }),
        }),
      )
      if (patchRes.status === 200 && patchRes.body.total_quantity === 0) {
        pass('cleanup PATCH qty 0', 'API has no DELETE route; total_quantity set to 0')
      } else {
        fail('cleanup PATCH qty 0', `PATCH status ${patchRes.status}`)
      }
      await deleteInventoryItemById(createdItemId)
    }
    const leftover = (await pool.query(
      'SELECT id FROM inventory_items WHERE name = $1',
      [ITEM_NAME],
    )).rows
    if (leftover.length === 0) pass('cleanup DB', 'ZZZ_TEST item removed from database')
    else fail('cleanup DB', `leftover ids: ${leftover.map((r) => r.id).join(', ')}`)
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\nScript result: ${failed.length ? 'FAIL' : 'PASS'} (${results.length - failed.length}/${results.length} checks)\n`)
  process.exit(failed.length ? 1 : 0)
}

run().catch(async (err) => {
  if (createdItemId) await deleteInventoryItemById(createdItemId)
  console.error(err.message)
  process.exit(1)
})
