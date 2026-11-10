/** Server-side routing. Never import into a browser bundle. */
export class ProviderError extends Error {
  constructor(code, message, provider = null, status = 503) {
    super(message); this.code = code; this.provider = provider; this.status = status
  }
  toJSON() { return { code: this.code, message: this.message, provider: this.provider } }
}
export function configuration(env = {}, hosted = false) {
  const mode = hosted ? 'cloud-only' : env.OLLAMA_MODE || 'local-first'
  if (!['local-first', 'local-only', 'cloud-only'].includes(mode))
    throw new ProviderError('invalid_config', 'OLLAMA_MODE must be local-first, local-only or cloud-only.', null, 500)
  const positive = (name, fallback) => {
    const n = Number(env[name] || fallback)
    if (!Number.isFinite(n) || n <= 0) throw new ProviderError('invalid_config', `Invalid ${name}.`, null, 500)
    return n
  }
  const localThink = env.OLLAMA_LOCAL_THINK || 'default'
  if (!['default', 'true', 'false'].includes(localThink))
    throw new ProviderError('invalid_config', 'OLLAMA_LOCAL_THINK must be default, true or false.', null, 500)
  const localHost = (env.OLLAMA_LOCAL_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '')
  const url = new URL(mode === 'cloud-only' ? 'http://127.0.0.1:11434' : localHost)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new ProviderError('invalid_config', 'Invalid OLLAMA_LOCAL_HOST.', null, 500)
  return { mode, localHost, localThink, localModel: env.OLLAMA_LOCAL_MODEL || 'qwen3:8b',
    cloudModel: env.OLLAMA_CLOUD_MODEL || env.OLLAMA_MODEL || 'gpt-oss:120b-cloud',
    apiKey: env.OLLAMA_API_KEY || '', probeMs: positive('OLLAMA_PROBE_TIMEOUT_MS', 3000),
    streamMs: positive('OLLAMA_STREAM_TIMEOUT_MS', 90000) }
}
const localError = (code, message) => new ProviderError(code, message, 'local')
function normalize(error, provider) {
  if (error instanceof ProviderError) return error
  return new ProviderError(error.name === 'TimeoutError' ? 'timeout' : 'unreachable',
    `${provider} Ollama connection failed or timed out.`, provider)
}
function httpError(status, provider) {
  const code = status === 401 || status === 403 ? 'authentication' : status === 404 ? 'model_missing' : status === 429 ? 'rate_limit' : 'upstream_error'
  return new ProviderError(code, `${provider} Ollama request failed (HTTP ${status}).`, provider, 502)
}
export async function probeLocal(cfg, fetcher = fetch, signal) {
  if (/(?:-|:)cloud(?::|$)/i.test(cfg.localModel)) throw localError('model_not_local', 'Local model must be an installed, non-cloud model.')
  const controller = new AbortController()
  const abort = () => controller.abort(signal.reason)
  signal?.throwIfAborted()
  signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), cfg.probeMs)
  let response, body
  try {
    response = await fetcher(`${cfg.localHost}/api/tags`, { signal: controller.signal, redirect: 'error' })
    if (!response.ok) throw httpError(response.status, 'local')
    body = await response.json()
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
  const model = body.models?.find(m => (m.name || m.model) === cfg.localModel || (m.name || m.model) === `${cfg.localModel}:latest`)
  if (!model) throw localError('model_missing', `Install the local model with: ollama pull ${cfg.localModel}`)
  if (model.remote_host || model.remote_model || model.details?.remote_host) throw localError('model_not_local', 'Configured local model is cloud-backed.')
  return { provider: 'local', model: cfg.localModel }
}
export async function providerStatus(cfg, fetcher = fetch, signal) {
  let local = null
  if (cfg.mode !== 'cloud-only') {
    try { local = { available: true, ...await probeLocal(cfg, fetcher, signal) } }
    catch (e) { local = { available: false, error: normalize(e, 'local').toJSON() } }
  }
  const provider = local?.available ? 'local' : cfg.mode !== 'local-only' && cfg.apiKey ? 'cloud' : null
  return { mode: cfg.mode, provider, model: provider === 'local' ? cfg.localModel : provider ? cfg.cloudModel : null,
    available: !!provider, local, cloud: { configured: !!cfg.apiKey, verified: false },
    message: provider === 'local' ? 'Local model installed' : provider ? 'Cloud configured; connectivity checked on send' : 'No provider available. Start Ollama and install the configured model, or configure OLLAMA_API_KEY when cloud routing is allowed.' }
}
/** Parse strict NDJSON, including a final line without newline. Require done. */
export async function* frames(response, signal, timeoutMs = 90000) {
  const reader = response.body?.getReader()
  if (!reader) throw new ProviderError('invalid_stream', 'Ollama returned no response stream.')
  const decoder = new TextDecoder(); let buffer = ''; let complete = false
  try {
    while (true) {
      signal?.throwIfAborted()
      let timer, abort
      const stop = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new ProviderError('timeout', 'Ollama stream timed out.')), timeoutMs)
        abort = () => reject(signal.reason || new DOMException('Aborted', 'AbortError'))
        signal?.addEventListener('abort', abort, { once: true })
      })
      let chunk
      try { chunk = await Promise.race([reader.read(), stop]) }
      finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
      buffer += decoder.decode(chunk.value, { stream: !chunk.done })
      const lines = buffer.split('\n'); buffer = lines.pop()
      if (chunk.done && buffer.trim()) { lines.push(buffer); buffer = '' }
      for (const line of lines) {
        if (!line.trim()) continue
        let frame
        try { frame = JSON.parse(line) } catch { throw new ProviderError('invalid_stream', 'Ollama returned malformed NDJSON.') }
        if (!frame || typeof frame !== 'object' || Array.isArray(frame)) throw new ProviderError('invalid_stream', 'Ollama returned an invalid frame.')
        if (frame.error) throw new ProviderError('upstream_error', 'Ollama reported a streaming error.')
        if (!frame.message && frame.done !== true) throw new ProviderError('invalid_stream', 'Ollama returned an invalid frame.')
        yield frame
        if (frame.done) { complete = true; return }
      }
      if (chunk.done) break
    }
    if (!complete) throw new ProviderError('interrupted', 'Ollama stream ended before completion.')
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
export async function* routeChat(messages, cfg, { fetcher = fetch, signal } = {}) {
  const attempts = []; const providers = cfg.mode === 'local-first' ? ['local', 'cloud'] : [cfg.mode === 'local-only' ? 'local' : 'cloud']
  for (const provider of providers) {
    let started = false
    const model = provider === 'local' ? cfg.localModel : cfg.cloudModel
    const controller = new AbortController()
    const abort = () => controller.abort(signal.reason)
    signal?.addEventListener('abort', abort, { once: true })
    let timer
    try {
      signal?.throwIfAborted()
      if (provider === 'local') await probeLocal(cfg, fetcher, signal)
      else if (!cfg.apiKey) throw new ProviderError('missing_key', 'Cloud requires server-side OLLAMA_API_KEY.', provider)
      timer = setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), cfg.streamMs)
      const response = await fetcher(`${provider === 'local' ? cfg.localHost : 'https://ollama.com'}/api/chat`, {
        method: 'POST', signal: controller.signal, redirect: 'error',
        headers: { 'Content-Type': 'application/json', ...(provider === 'cloud' ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
        body: JSON.stringify({ model, messages, stream: true, ...(provider === 'local' && cfg.localThink && cfg.localThink !== 'default' ? { think: cfg.localThink === 'true' } : {}) }),
      })
      clearTimeout(timer)
      if (!response.ok) { await response.body?.cancel(); throw httpError(response.status, provider) }
      for await (const frame of frames(response, controller.signal, cfg.streamMs)) {
        if (!started) {
          started = true
          yield { provider: { mode: cfg.mode, provider, model, fallback: attempts.length > 0, attempts } }
        }
        yield frame
      }
      return
    } catch (e) {
      if (signal?.aborted || e.name === 'AbortError' && !controller.signal.aborted) throw e
      const error = normalize(e, provider); error.provider ||= provider
      attempts.push(error.toJSON())
      if (started) { yield { error: { ...error.toJSON(), partial: true }, done: true }; return }
    } finally { clearTimeout(timer); controller.abort(); signal?.removeEventListener('abort', abort) }
  }
  yield { error: { code: 'no_provider', message: 'No provider available. Check local Ollama/model or server-side cloud credentials.', attempts }, done: true }
}
