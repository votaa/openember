import { configuration, providerStatus, routeChat, ProviderError } from './ollama.js'

export function createChatHandler({ env = {}, hosted = false, fetcher = fetch } = {}) {
  return async function handle(req) {
    const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
    try {
      const cfg = configuration(env, hosted)
      if (req.method === 'GET') return json(await providerStatus(cfg, fetcher, req.signal))
      if (req.method !== 'POST') return json({ error: { code: 'method', message: 'Use GET or POST.' } }, 405)
      let body
      try { body = await req.json() } catch { return json({ error: { code: 'invalid_request', message: 'Invalid JSON.' } }, 400) }
      if (!body || !Array.isArray(body.messages) || !body.messages.length || body.messages.some(m => !m || !['system','user','assistant'].includes(m.role) || typeof m.content !== 'string'))
        return json({ error: { code: 'invalid_request', message: 'A nonempty messages array with valid roles and string content is required.' } }, 400)
      const upstream = new AbortController()
      const abort = () => upstream.abort(req.signal.reason)
      if (req.signal.aborted) abort()
      else req.signal.addEventListener('abort', abort, { once: true })
      const cleanup = () => req.signal.removeEventListener('abort', abort)
      const iterator = routeChat(body.messages, cfg, { fetcher, signal: upstream.signal })
      const encoder = new TextEncoder()
      return new Response(new ReadableStream({
        async pull(controller) {
          try {
            const { value, done } = await iterator.next()
            if (done) { cleanup(); controller.close() }
            else controller.enqueue(encoder.encode(JSON.stringify(value) + '\n'))
          } catch (e) { cleanup(); controller.error(e) }
        },
        async cancel() { upstream.abort(); cleanup(); await iterator.return() },
      }), { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } })
    } catch (e) {
      const error = e instanceof ProviderError ? e : new ProviderError('invalid_config', 'Invalid Ollama server configuration.', null, 500)
      return json({ error: error.toJSON() }, error.status)
    }
  }
}
