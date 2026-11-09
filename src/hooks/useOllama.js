// Compatibility helpers use the same server-side routing as the main UI.
import { streamChat, getProviderStatus } from '../ollama-client.js'
import { buildCopilotSystemPrompt } from '../data/copilotPrompt.js'
export async function pingOllama() {
  try { return (await getProviderStatus()).available } catch { return false }
}
export async function* streamOllama(messages, context, abortSignal, jurisdictionName = 'Long Island') {
  yield* streamChat([
    { role: 'system', content: buildCopilotSystemPrompt(jurisdictionName, context) },
    ...messages.slice(-10).map(({ role, content }) => ({ role, content })),
  ], { signal: abortSignal })
}
