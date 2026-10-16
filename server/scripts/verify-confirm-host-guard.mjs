/**
 * Regression test for BUGS #084: nothing may connect to, or migrate, any database before --confirm-host passes.
 * Needs NO real database. Each guarded script is run with a WRONG --confirm-host and a DATABASE_URL pointing at a
 * local TCP listener that counts connection attempts. Assertions: the script exits non-zero, prints the refusal,
 * and the listener saw 0 connections. A control run (right host, migrate.mjs) must be seen connecting, which proves
 * the listener would have noticed. The server's own boot (index.js) is not covered: it runs migrations by design.
 *
 * Run from server/: node scripts/verify-confirm-host-guard.mjs
 */
import net from 'node:net'
import { spawn } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const serverDir = join(scriptsDir, '..')
const results = []
const check = (name, ok) => {
  results.push(ok)
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}`)
}

let connections = 0
const listener = net.createServer((socket) => {
  connections += 1
  socket.destroy()
})
await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve))
const { port } = listener.address()

const runScript = (file, args) =>
  new Promise((resolve) => {
    const before = connections
    const child = spawn(process.execPath, [join(scriptsDir, file), ...args], {
      cwd: serverDir,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        DATABASE_URL: `postgresql://nobody:nopass@127.0.0.1:${port}/guard_test`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (d) => (output += d))
    child.stderr.on('data', (d) => (output += d))
    const timer = setTimeout(() => child.kill(), 20000)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, output, connected: connections - before })
    })
  })

const guarded = readdirSync(scriptsDir)
  .filter((f) => /\.(mjs|js)$/.test(f) && f !== 'verify-confirm-host-guard.mjs')
  .filter((f) => /assertConfirmedDatabaseHost\(|lib\/guardFirst\.mjs/.test(readFileSync(join(scriptsDir, f), 'utf8')))

for (const file of guarded) {
  const r = await runScript(file, ['--confirm-host=not-the-host'])
  check(`${file}: wrong --confirm-host -> refused (exit != 0, "Refusing to run")`, r.code !== 0 && r.output.includes('Refusing to run'))
  check(`${file}: wrong --confirm-host -> 0 connection attempts`, r.connected === 0)
}

// The schema_migrations assertion in its strongest form: migrate.mjs, wrong host, nothing connects at all.
const migrateWrong = await runScript('migrate.mjs', ['--confirm-host=not-the-host'])
check('migrate.mjs: wrong host -> no connection, so no schema_migrations write is possible', migrateWrong.connected === 0 && migrateWrong.code !== 0)

// Control: the right host gets past the guard and DOES try to connect.
const control = await runScript('migrate.mjs', ['--confirm-host=127.0.0.1'])
check('control: migrate.mjs with the right host attempts a connection (the listener can see one)', control.connected > 0)

listener.close()
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed (${guarded.length} guarded scripts)`)
process.exit(passed === results.length ? 0 : 1)
