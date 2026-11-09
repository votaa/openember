import test from 'node:test'
import assert from 'node:assert/strict'
import { configuration, routeChat, providerStatus } from '../lib/ollama.js'
import { createChatHandler } from '../lib/chat-handler.js'
import { streamChat } from '../src/ollama-client.js'
const messages = [{ role: 'user', content: 'Evidence?' }]
const cfg = (env = {}) => configuration({ OLLAMA_API_KEY: 'test-secret', ...env })
const tags = (models = [{ name: 'qwen3:8b' }]) => Response.json({ models })
const stream = (...frames) => new Response(frames.map(f => typeof f === 'string' ? f : JSON.stringify(f)).join('\n'))
const answer = { message: { content: 'Answer' }, done: true }
const collect = async iterator => { const result = []; for await (const item of iterator) result.push(item); return result }
function mock({ models, local = () => stream(answer), cloud = () => stream(answer) } = {}) {
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ url, options })
    return url.endsWith('/api/tags') ? tags(models) : url.startsWith('https://ollama.com') ? cloud(options) : local(options)
  }
  return { fetcher, calls }
}
test('defaults, invalid mode, timeouts and hosted force-cloud', () => {
  assert.equal(cfg().mode, 'local-first'); assert.equal(cfg().localModel, 'qwen3:8b')
  assert.equal(configuration({ OLLAMA_MODE: 'local-only' }, true).mode, 'cloud-only')
  assert.throws(() => cfg({ OLLAMA_MODE: 'oops' }))
  assert.throws(() => cfg({ OLLAMA_PROBE_TIMEOUT_MS: '-1' }))
  assert.equal(cfg({ OLLAMA_MODEL: 'legacy' }).cloudModel, 'legacy')
  assert.equal(cfg({ OLLAMA_MODEL: 'legacy', OLLAMA_CLOUD_MODEL: 'new' }).cloudModel, 'new')
})
test('local-first streams local with model metadata, no auth and no cloud calls', async () => {
  const m = mock(); const result = await collect(routeChat(messages, cfg(), m))
  assert.equal(result[0].provider.provider, 'local'); assert.equal(result[1].message.content, 'Answer')
  assert.equal(m.calls.length, 2); assert.equal(m.calls[1].options.headers.Authorization, undefined)
  assert.deepEqual(JSON.parse(m.calls[1].options.body).messages, messages)
})
for (const [name, setup] of [
  ['missing model', { models: [] }], ['remote alias', { models: [{ name: 'qwen3:8b', remote_host: 'ollama.com' }] }],
  ['connection', { local: () => { throw new TypeError('secret-url') } }],
  ['auth', { local: () => new Response('secret', { status: 401 }) }],
  ['model HTTP', { local: () => new Response('', { status: 404 }) }],
  ['rate limit', { local: () => new Response('', { status: 429 }) }],
  ['malformed', { local: () => stream('invalid') }],
  ['in-band error', { local: () => stream({ error: 'private upstream data' }) }],
  ['empty', { local: () => stream() }],
]) test(`pre-stream ${name} falls back with reason`, async () => {
  const m = mock(setup); const result = await collect(routeChat(messages, cfg(), m))
  assert.equal(result[0].provider.provider, 'cloud'); assert.equal(result[0].provider.fallback, true)
  assert.ok(result[0].provider.attempts[0].code)
  assert.equal(m.calls.at(-1).options.headers.Authorization, 'Bearer test-secret')
  assert.ok(!JSON.stringify(result).includes('private upstream data'))
})
test('local-only never cloud, including cloud-tagged model', async () => {
  for (const env of [{}, { OLLAMA_LOCAL_MODEL: 'gpt-oss:120b-cloud' }]) {
    const m = mock({ models: [] }); const result = await collect(routeChat(messages, cfg({ OLLAMA_MODE: 'local-only', ...env }), m))
    assert.equal(result.at(-1).error.code, 'no_provider'); assert.ok(m.calls.every(c => !c.url.startsWith('https://ollama.com')))
  }
})
test('cloud-only never probes local; no key never calls cloud', async () => {
  const m = mock(); const result = await collect(routeChat(messages, cfg({ OLLAMA_MODE: 'cloud-only' }), m))
  assert.equal(result[0].provider.provider, 'cloud'); assert.equal(m.calls.length, 1)
  const empty = mock(); const none = await collect(routeChat(messages, cfg({ OLLAMA_MODE: 'cloud-only', OLLAMA_API_KEY: '' }), empty))
  assert.equal(none[0].error.code, 'no_provider'); assert.equal(empty.calls.length, 0)
})
for (const frame of [{ message: { content: 'partial' } }, { message: { thinking: 'thought' } }])
  test('no fallback after first content or thinking frame', async () => {
    const m = mock({ local: () => stream(frame, 'bad') }); const result = await collect(routeChat(messages, cfg(), m))
    assert.equal(result.at(-1).error.partial, true); assert.equal(result.at(-1).error.code, 'invalid_stream')
    assert.equal(m.calls.length, 2)
  })
test('early EOF preserves partial and never falls back', async () => {
  const m = mock({ local: () => stream({ message: { content: 'partial' } }) })
  const result = await collect(routeChat(messages, cfg(), m))
  assert.equal(result.at(-1).error.code, 'interrupted'); assert.equal(m.calls.length, 2)
})
test('UTF-8 and fragmented NDJSON decoded, final unterminated line consumed', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ message: { content: '温度🌧' }, done: true }))
  const m = mock({ local: () => new Response(new ReadableStream({ start(c) { for (const byte of bytes) c.enqueue(Uint8Array.of(byte)); c.close() } })) })
  const result = await collect(routeChat(messages, cfg(), m)); assert.equal(result[1].message.content, '温度🌧')
})
test('cancel before request never triggers fallback', async () => {
  const controller = new AbortController(); controller.abort(); const m = mock()
  await assert.rejects(collect(routeChat(messages, cfg(), { ...m, signal: controller.signal })), { name: 'AbortError' })
  assert.equal(m.calls.length, 0)
})
test('read timeout after frame returns normalized partial error, no cloud', async () => {
  const m = mock({ local: () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(JSON.stringify({ message: { content: 'p' } }) + '\n')) } })) })
  const result = await collect(routeChat(messages, cfg({ OLLAMA_STREAM_TIMEOUT_MS: '10' }), m))
  assert.equal(result.at(-1).error.code, 'timeout'); assert.equal(m.calls.length, 2)
})
test('status probes only local and does not expose keys or infer cloud readiness', async () => {
  const m = mock(); const result = await providerStatus(cfg(), m.fetcher)
  assert.equal(result.provider, 'local'); assert.equal(m.calls.length, 1)
  assert.equal(result.cloud.verified, false); assert.ok(!JSON.stringify(result).includes('test-secret'))
})
test('handler validates input and forces hosted cloud despite request overrides', async () => {
  const m = mock(); const handler = createChatHandler({ env: { OLLAMA_API_KEY: 'test-secret', OLLAMA_MODE: 'local-only' }, hosted: true, fetcher: m.fetcher })
  assert.equal((await handler(new Request('http://test', { method: 'POST', body: '{}' }))).status, 400)
  const response = await handler(new Request('http://test', { method: 'POST', body: JSON.stringify({ messages, mode: 'local-only', host: 'http://evil', model: 'evil' }) }))
  assert.match(response.headers.get('Content-Type'), /ndjson/)
  const result = (await response.text()).trim().split('\n').map(JSON.parse)
  assert.equal(result[0].provider.mode, 'cloud-only'); assert.equal(m.calls.length, 1)
  assert.equal(JSON.parse(m.calls[0].options.body).model, 'gpt-oss:120b-cloud')
})
test('browser transport surfaces metadata and final content, preserves partial on error', async () => {
  let metadata
  const fetcher = async () => stream({ provider: { provider: 'local' } }, { message: { content: 'part' } }, { error: { code: 'interrupted', message: 'Interrupted' } })
  const output = []
  await assert.rejects(async () => { for await (const token of streamChat(messages, { fetcher, onProvider: p => { metadata = p } })) output.push(token) }, /Interrupted/)
  assert.equal(metadata.provider, 'local'); assert.deepEqual(output, ['part'])
})

test('hosted config ignores irrelevant invalid local host', () => {
  assert.equal(configuration({ OLLAMA_LOCAL_HOST: 'invalid' }, true).mode, 'cloud-only')
})
test('cloud-only failures are normalized and redact upstream response bodies', async () => {
  for (const status of [401, 429, 503]) {
    const m = mock({ cloud: () => new Response('test-secret private upstream', { status }) })
    const result = await collect(routeChat(messages, cfg({ OLLAMA_MODE: 'cloud-only' }), m))
    assert.equal(result[0].error.code, 'no_provider'); assert.equal(m.calls.length, 1)
    assert.ok(!JSON.stringify(result).includes('test-secret'))
  }
})
test('connection timeout before first frame permits fallback', async () => {
  const m = mock({ local: () => { throw new DOMException('private', 'TimeoutError') } })
  const result = await collect(routeChat(messages, cfg(), m))
  assert.equal(result[0].provider.provider, 'cloud')
  assert.equal(result[0].provider.attempts[0].code, 'timeout')
})
test('cancellation after first token closes upstream with no fallback', async () => {
  let canceled = false
  const controller = new AbortController()
  const m = mock({ local: () => new Response(new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode('{"message":{"content":"partial"}}\n')) },
    cancel() { canceled = true },
  })) })
  const iterator = routeChat(messages, cfg(), { ...m, signal: controller.signal })
  await iterator.next(); assert.equal((await iterator.next()).value.message.content, 'partial')
  controller.abort()
  await assert.rejects(iterator.next(), { name: 'AbortError' })
  assert.equal(canceled, true); assert.equal(m.calls.length, 2)
})
test('unused compatibility hook cannot retain a browser key path', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../src/hooks/useOllama.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /VITE_OLLAMA|Authorization|https:\/\/ollama.com/)
})
test('Vercel entry point forces cloud and ignores supplied browser credentials', async () => {
  const { default: handler, config: runtime } = await import('../api/chat.js')
  assert.equal(runtime.runtime, 'edge')
  const previousKey = process.env.OLLAMA_API_KEY, previousMode = process.env.OLLAMA_MODE
  process.env.OLLAMA_API_KEY = ''; process.env.OLLAMA_MODE = 'local-only'
  try {
    const response = await handler(new Request('http://test/api/chat', { method: 'POST', headers: { 'x-ollama-key': 'test-secret' }, body: JSON.stringify({ messages }) }))
    const result = (await response.text()).trim().split('\n').map(JSON.parse)
    assert.equal(result[0].error.attempts.length, 1)
    assert.equal(result[0].error.attempts[0].provider, 'cloud')
    assert.equal(result[0].error.attempts[0].code, 'missing_key')
  } finally {
    if (previousKey === undefined) delete process.env.OLLAMA_API_KEY; else process.env.OLLAMA_API_KEY = previousKey
    if (previousMode === undefined) delete process.env.OLLAMA_MODE; else process.env.OLLAMA_MODE = previousMode
  }
})

test('canceling the response aborts upstream even when request signal stays active', async () => {
  let canceled = false
  const m = mock({ local: () => new Response(new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode('{"message":{"content":"partial"}}\n')) },
    cancel() { canceled = true },
  })) })
  const handler = createChatHandler({ env: { OLLAMA_MODE: 'local-only' }, fetcher: m.fetcher })
  const response = await handler(new Request('http://test', { method: 'POST', body: JSON.stringify({ messages }) }))
  const reader = response.body.getReader()
  await reader.read(); await reader.read()
  await reader.cancel()
  assert.equal(canceled, true); assert.equal(m.calls.length, 2)
})

test('null bodies and null messages are normalized invalid requests', async () => {
  const handler = createChatHandler({ env: { OLLAMA_MODE: 'local-only' } })
  for (const body of [null, { messages: [null] }, { messages: [42] }]) {
    const response = await handler(new Request('http://test', { method: 'POST', body: JSON.stringify(body) }))
    assert.equal(response.status, 400)
    assert.equal((await response.json()).error.code, 'invalid_request')
  }
})
