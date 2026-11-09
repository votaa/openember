/** Same-origin transport only. Credentials and selection stay on the server. */
export async function getProviderStatus({ fetcher = fetch, signal } = {}) {
  const response = await fetcher('/api/chat', { signal })
  if (!response.ok) throw new Error('Provider status unavailable. Check server configuration.')
  return response.json()
}
export async function* streamChat(messages, { signal, onProvider = () => {}, fetcher = fetch } = {}) {
  const response = await fetcher('/api/chat', { method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }) })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error?.message || `Chat request failed (${response.status}).`)
  }
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let doneFrame = false
  try {
    while (true) {
      const chunk = await reader.read()
      buffer += decoder.decode(chunk.value, { stream: !chunk.done })
      const lines = buffer.split('\n'); buffer = lines.pop()
      if (chunk.done && buffer.trim()) lines.push(buffer)
      for (const line of lines) {
        if (!line.trim()) continue
        const frame = JSON.parse(line)
        if (frame.provider) onProvider(frame.provider)
        if (frame.error) {
          const error = new Error(frame.error.message); error.code = frame.error.code; error.details = frame.error
          throw error
        }
        if (frame.message?.content) yield frame.message.content
        if (frame.done) { doneFrame = true; return }
      }
      if (chunk.done) break
    }
    if (!doneFrame) throw new Error('Response interrupted before completion.')
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
export function providerLabel(status) {
  if (!status) return 'Checking Ollama providers…'
  if (!status.provider) return status.message || 'No provider available'
  return `${status.provider === 'local' ? 'Local' : 'Cloud'} · ${status.model} · ${status.mode}${status.fallback ? ' · fallback' : ''}`
}
