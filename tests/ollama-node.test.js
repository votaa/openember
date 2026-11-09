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
