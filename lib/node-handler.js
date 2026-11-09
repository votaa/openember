import { once } from 'node:events'
/** Adapt the Web Request handler to Node without buffering responses. */
export async function serveChat(req, res, handle) {
  const controller = new AbortController()
  res.on('close', () => controller.abort())
  try {
    const chunks = []; let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > 2 * 1024 * 1024) { res.writeHead(413); res.end('Request too large'); return }
      chunks.push(chunk)
    }
    const response = await handle(new Request('http://localhost/api/chat', {
      method: req.method, headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Buffer.concat(chunks) }),
    }))
    res.writeHead(response.status, Object.fromEntries(response.headers))
    if (response.body) {
      for await (const chunk of response.body) {
        if (!res.write(chunk)) await once(res, 'drain', { signal: controller.signal })
      }
    }
    res.end()
  } catch {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' })
    if (!res.destroyed) res.end(JSON.stringify({ error: { code: 'transport', message: 'Chat transport interrupted.' } }))
  }
}
