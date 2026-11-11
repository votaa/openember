/** Replay an application prompt against installed local Ollama only.
 * Usage: node scripts/benchmark-ollama-local.js prompt.json results.json [--cold]
 * OLLAMA_LOCAL_THINK=default|true|false controls thinking. No cloud or model pulls.
 * Input/output can contain document text; keep private captures outside Git.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { configuration, probeLocal, routeChat } from '../lib/ollama.js'
import { nodeOllamaFetch } from '../lib/node-ollama-fetch.js'

const [input, output, cold] = process.argv.slice(2)
if (!input || !output || (cold && cold !== '--cold')) {
  throw new Error('Usage: node scripts/benchmark-ollama-local.js prompt.json results.json [--cold]')
}
const { messages } = JSON.parse(await readFile(input, 'utf8'))
if (!Array.isArray(messages) || !messages.length || messages.some(m => !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string')) {
  throw new Error('Input must contain nonempty messages with role and content.')
}
const cfg = configuration({ ...process.env, OLLAMA_MODE: 'local-only', OLLAMA_API_KEY: '' })
await probeLocal(cfg, nodeOllamaFetch)
if (cold) {
  // Evict only the selected local model, after verifying it is not cloud-backed.
  const response = await fetch(`${cfg.localHost}/api/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: cfg.localModel, keep_alive: 0, stream: false }),
    signal: AbortSignal.timeout(30000), redirect: 'error',
  })
  if (!response.ok) throw new Error(`Local unload failed (${response.status})`)
  await response.json()
}
const started = performance.now()
let first = null, thinking = null, answer = null
const result = { model: cfg.localModel, think: cfg.localThink, cold: !!cold,
  input_characters: messages.reduce((n, m) => n + m.content.length, 0),
  answer: '', complete: false }
try {
  for await (const frame of routeChat(messages, cfg, { fetcher: nodeOllamaFetch, signal: AbortSignal.timeout(1200000) })) {
    const now = performance.now() - started
    if (frame.provider) result.provider = frame.provider
    if (frame.error) result.error = frame.error
    if (frame.message?.thinking || frame.message?.content) first ??= now
    if (frame.message?.thinking) thinking ??= now
    if (frame.message?.content) { answer ??= now; result.answer += frame.message.content }
    if (frame.done && !frame.error) {
      result.complete = true
      for (const key of ['total_duration', 'load_duration', 'prompt_eval_duration', 'eval_duration', 'prompt_eval_count', 'eval_count']) {
        if (Number.isFinite(frame[key])) result[key] = frame[key]
      }
    }
  }
} catch (error) {
  result.error = { code: error.name, message: 'Local benchmark interrupted or exceeded its 20-minute total deadline.' }
}
const elapsed = performance.now() - started
Object.assign(result, { request_ms: elapsed, first_output_ms: first, first_answer_ms: answer,
  thinking_ms: thinking === null ? 0 : (answer ?? elapsed) - thinking,
  answer_ms: answer === null ? 0 : elapsed - answer })
await writeFile(output, JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ ...result, answer: `${result.answer.length} characters` }, null, 2))
if (!result.complete || !result.answer.trim() || result.provider?.provider !== 'local') process.exitCode = 1
