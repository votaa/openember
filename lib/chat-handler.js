import { configuration, providerStatus, routeChat, ProviderError } from './ollama.js'

export function createChatHandler({ env = {}, hosted = false, fetcher = fetch, copilot = null } = {}) {
  return async function handle(req) {
    const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
    try {
      const url = new URL(req.url)
      if (req.method === 'GET' && url.searchParams.has('capabilities')) return json(copilot?.capabilities() || {execution_mode:'legacy',request_versions:[],legacy_messages:true})
      if (req.method === 'GET') return json(await providerStatus(configuration(env, hosted), fetcher, req.signal))
      if (req.method !== 'POST') return json({ error: { code: 'method', message: 'Use GET or POST.' } }, 405)
      let body
      try {
        const reader = req.body?.getReader(); const chunks = []; let size = 0
        if (reader) try {
          while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length
            if (size > 8 * 1024 * 1024) { await reader.cancel(); return json({error:{code:'request_too_large',message:'Request exceeds 8 MiB. Narrow the supplied evidence explicitly.'}},413) }
            chunks.push(part.value)
          }
        } finally { reader.releaseLock() }
        const bytes = new Uint8Array(size); let offset = 0
        for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length }
        body = JSON.parse(new TextDecoder().decode(bytes))
      } catch { return json({ error: { code: 'invalid_request', message: 'Invalid JSON.' } }, 400) }
      if (url.searchParams.has('context')) {
        try { copilot?.provideContext(url.searchParams.get('context'),body?.request);if(!copilot)throw Error('Hybrid context is disabled');return json({accepted:true}) }
        catch(e) {return json({error:{code:'invalid_context',message:e.message}},409)}
      }
      if (body?.request) {
        if (!copilot || copilot.capabilities().execution_mode !== 'hybrid') return json({error:{code:'unsupported_contract',message:'Hybrid requests are disabled.'}},400)
        try { copilot.plan(body.request) } catch (e) { return json({error:{code:'invalid_request',message:e.message}},400) }
        if (url.searchParams.has('plan')) return json(copilot.plan(body.request))
        try { copilot.validateStream(body.request) } catch (e) { return json({error:{code:'invalid_request',message:e.message}},400) }
      }
      if (!body?.request && (!body || !Array.isArray(body.messages) || !body.messages.length || body.messages.some(m => !m || !['system','user','assistant'].includes(m.role) || typeof m.content !== 'string')))
        return json({ error: { code: 'invalid_request', message: 'A nonempty messages array with valid roles and string content is required.' } }, 400)
      const upstream = new AbortController()
      const abort = () => upstream.abort(req.signal.reason)
      if (req.signal.aborted) abort()
      else req.signal.addEventListener('abort', abort, { once: true })
      const cleanup = () => req.signal.removeEventListener('abort', abort)
      const iterator = body.request ? copilot.stream(body.request,{config:()=>configuration(env,hosted),fetcher,signal:upstream.signal})
        : routeChat(body.messages, configuration(env,hosted), { fetcher, signal: upstream.signal })
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
