// Mimics how production serves the app (vercel.json): the built client/dist as static files with the SPA
// fallback (HTTP 200 index.html), the vercel.json response headers (including the CSP), and /api/* proxied to
// the API with an x-proxy-secret header. Used by verify scripts that need the real production bundle.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.txt': 'text/plain' }

/**
 * @param {string} distDir built client directory
 * @param {{ apiPort?: number, onApiRequest?: (info: {method: string, path: string, bodyText: string, status: number}) => void }} options
 * Returns { port, close }. A request header x-test-ip becomes x-forwarded-for, so a script can give each login its
 * own rate-limit key without touching the limiter.
 */
export const startProdLikeProxy = async (distDir, { apiPort = 3001, onApiRequest } = {}) => {
  const dist = path.resolve(distDir)
  const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'))
  const responseHeaders = Object.fromEntries(config.headers[0].headers.map((h) => [h.key, h.value]))

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    if (url.pathname.startsWith('/api/')) {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        const body = Buffer.concat(chunks)
        const upstream = http.request(
          {
            host: 'localhost',
            port: apiPort,
            path: req.url,
            method: req.method,
            agent: false,
            headers: {
              ...req.headers,
              connection: 'close',
              host: `localhost:${apiPort}`,
              'x-proxy-secret': 'local-test',
              'x-forwarded-for': req.headers['x-test-ip'] || '203.0.113.9',
            },
          },
          (upRes) => {
            onApiRequest?.({ method: req.method, path: url.pathname, bodyText: body.toString('utf8'), status: upRes.statusCode })
            res.writeHead(upRes.statusCode, { ...upRes.headers, ...responseHeaders })
            upRes.pipe(res)
          },
        )
        upstream.on('error', () => {
          res.writeHead(502)
          res.end()
        })
        upstream.end(body)
      })
      return
    }
    let file = path.join(dist, url.pathname)
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html')
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', ...responseHeaders })
    fs.createReadStream(file).pipe(res)
  })

  await new Promise((resolve) => server.listen(0, resolve))
  return { port: server.address().port, close: () => new Promise((resolve) => server.close(resolve)) }
}
