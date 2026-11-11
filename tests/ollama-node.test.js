import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createChatHandler } from '../lib/chat-handler.js'
import { serveChat } from '../lib/node-handler.js'
import { streamChat, getProviderStatus } from '../src/ollama-client.js'

test('real HTTP browser → Node adapter → mocked Ollama → browser streaming', async () => {
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ url, options })
    if (url.endsWith('/api/tags')) return Response.json({ models: [{ name: 'qwen3:8b' }] })
    return new Response('{"message":{"content":"Evidence preserved 🌧"}}\n{"done":true}')
  }
  const handler = createChatHandler({ env: { OLLAMA_MODE: 'local-only' }, fetcher })
  const server = createServer((req, res) => serveChat(req, res, handler))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    const browserFetch = (path, options) => fetch(base + path, options)
    const status = await getProviderStatus({ fetcher: browserFetch })
    assert.equal(status.provider, 'local')
    const messages = [{ role: 'system', content: 'Ground every answer in supplied evidence.' }, { role: 'user', content: 'Analyze document and map evidence.' }]
    let provider, text = ''
    for await (const token of streamChat(messages, { fetcher: browserFetch, onProvider: p => { provider = p } })) text += token
    assert.equal(text, 'Evidence preserved 🌧'); assert.equal(provider.provider, 'local')
    assert.deepEqual(JSON.parse(calls.at(-1).options.body).messages, messages)
    assert.ok(calls.every(c => !c.url.startsWith('https://ollama.com')))
    assert.equal((await fetch(base + '/api/chat', { method: 'POST', body: 'bad' })).status, 400)
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
})

test('Node local transport streams, enforces routed timeout and cancels before headers', async () => {
  const { nodeOllamaFetch } = await import('../lib/node-ollama-fetch.js')
  const { configuration, routeChat } = await import('../lib/ollama.js')
  const upstream = createServer((req, res) => {
    if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [{ name: 'qwen3:8b' }] })); return }
    // Intentionally leave the local model processing before sending any headers.
    const timer = setTimeout(() => res.end('{"message":{"content":"late"},"done":true}\n'), 80)
    res.on('close', () => clearTimeout(timer))
  })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const env = { OLLAMA_MODE: 'local-only', OLLAMA_LOCAL_HOST: `http://127.0.0.1:${upstream.address().port}`,
    OLLAMA_STREAM_TIMEOUT_MS: '10', OLLAMA_LOCAL_STREAM_TIMEOUT_MS: '300' }
  try {
    const output = []
    for await (const frame of routeChat([{ role: 'user', content: 'hello' }], configuration(env), { fetcher: nodeOllamaFetch })) output.push(frame)
    assert.equal(output.at(-1).message.content, 'late')
    const errors = []
    for await (const frame of routeChat([{ role: 'user', content: 'hello' }], configuration({ ...env, OLLAMA_LOCAL_STREAM_TIMEOUT_MS: '15' }), { fetcher: nodeOllamaFetch })) errors.push(frame)
    assert.equal(errors.at(-1).error.code, 'timeout')
    const signal = AbortSignal.timeout(20)
    await assert.rejects(async () => {
      for await (const frame of routeChat([{ role: 'user', content: 'hello' }], configuration(env), { fetcher: nodeOllamaFetch, signal })) {}
    }, { name: 'TimeoutError' })
  } finally { upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)) }
})
