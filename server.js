import { createCopilot } from './lib/copilot-service.js'
/** Local/Docker production server. Vercel continues to use api/chat.js. */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createChatHandler } from './lib/chat-handler.js'
import { serveChat } from './lib/node-handler.js'
import { nodeOllamaFetch } from './lib/node-ollama-fetch.js'
const root = fileURLToPath(new URL('./dist/', import.meta.url))
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }
const handle = createChatHandler({ env: process.env, copilot:createCopilot(process.env), fetcher: nodeOllamaFetch })
export const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname
  if (path === '/api/chat') return serveChat(req, res, handle)
  if (path === '/healthz') { res.end('ok'); return }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return }
  try {
    const file = resolve(root, '.' + decodeURIComponent(path === '/' ? '/index.html' : path))
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return }
    const data = await readFile(file)
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' })
    res.end(req.method === 'HEAD' ? undefined : data)
  } catch { res.writeHead(404); res.end('Not found') }
})
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000)
  server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`OpenEmber listening on port ${port}`))
}
