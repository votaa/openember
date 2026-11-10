/** Opt-in LOCAL ONLY inference. No key, no cloud route, no model downloads. */
import { configuration, routeChat } from '../lib/ollama.js'
if (process.env.RUN_OLLAMA_LOCAL_TEST !== '1') {
  console.log('Skipped. Set RUN_OLLAMA_LOCAL_TEST=1 to run local-only inference.')
} else {
  const cfg = configuration({ ...process.env, OLLAMA_MODE: 'local-only', OLLAMA_API_KEY: '' })
  let text = ''; let provider
  for await (const frame of routeChat([{ role: 'user', content: 'Reply with the single word OK.' }], cfg)) {
    if (frame.error) throw new Error(JSON.stringify(frame.error))
    if (frame.provider) provider = frame.provider
    if (frame.done) console.log(JSON.stringify({ think: cfg.localThink, total_ms: frame.total_duration / 1e6, load_ms: frame.load_duration / 1e6, prompt_ms: frame.prompt_eval_duration / 1e6, generation_ms: frame.eval_duration / 1e6, input_tokens: frame.prompt_eval_count, generated_tokens: frame.eval_count }))
    text += frame.message?.content || ''
  }
  if (provider?.provider !== 'local' || !text.trim()) throw new Error('Expected local provider and nonempty response')
  console.log(`Local-only integration passed: ${provider.model}`)
}
