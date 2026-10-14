// Every script that deletes or rewrites tenant data must name the merchant it acts on:
//   --merchant-id=<n>   (required, positive integer, the merchant must exist)
// It is used in addition to the --confirm-host guard (see confirmDatabaseHost.mjs), never instead of it.
const PREFIX = '--merchant-id='

export const parseMerchantIdArg = (argv = process.argv) => {
  const arg = argv.find((a) => a.startsWith(PREFIX))
  if (!arg) return null
  const raw = arg.slice(PREFIX.length)
  const id = Number(raw)
  return /^\d+$/.test(raw) && Number.isInteger(id) && id > 0 && id <= 2147483647 ? id : null
}

// Returns the merchant id after confirming the merchant exists. Prints the id and public business name only.
export const requireMerchantId = async (pool) => {
  const id = parseMerchantIdArg()
  if (id === null) {
    console.error('Refusing to run: pass --merchant-id=<n> (the merchant whose data this script may change).')
    process.exit(1)
  }
  const { rows } = await pool.query('SELECT business_name FROM merchants WHERE id = $1', [id])
  if (rows.length === 0) {
    console.error(`Refusing to run: no merchant with id ${id}.`)
    process.exit(1)
  }
  console.log(`Merchant: ${id} (${rows[0].business_name ?? 'unnamed'})`)
  return id
}
