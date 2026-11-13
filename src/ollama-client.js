/** Same-origin transport only. Credentials and selection stay on the server. */
export async function getProviderStatus({ fetcher = fetch, signal } = {}) {
  const response = await fetcher('/api/chat', { signal })
  if (!response.ok) throw new Error('Provider status unavailable. Check server configuration.')
  return response.json()
}
export async function* streamChat(messages, { signal, onProvider = () => {}, onResponse = () => {}, structuredRequest = null, onContextRequest = null, onProgress = () => {}, onTiming = () => {}, fetcher = fetch } = {}) {
  const started = performance.now(); let thinkingAt = null; let answerAt = null; let executionMode = null; let contextAcquisitionMs = 0
  onProgress('Connecting / processing prompt…')
  const response = await fetcher('/api/chat', { method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(structuredRequest ? {request:structuredRequest} : { messages }) })
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
        if (frame.context_request) {
          if (!onContextRequest) throw new Error('This client cannot supply full cloud context. Refresh the app.')
          const acquisitionStarted=performance.now()
          onProgress('Refreshing full cloud context…')
          const request=await onContextRequest(frame.context_request)
          const supplied=await fetcher('/api/chat?context='+encodeURIComponent(frame.context_request.token),{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({request})})
          if(!supplied.ok) {const error=await supplied.json().catch(()=>({}));throw new Error(error.error?.message||'Cloud context could not be supplied')}
          contextAcquisitionMs+=performance.now()-acquisitionStarted
          onProgress('Connecting / processing prompt…')
        }
        if (frame.response) { executionMode=frame.response.execution_mode; onResponse(frame.response) }
        if (frame.provider) onProvider(frame.provider)
        if (frame.error) {
          const error = new Error(frame.error.message); error.code = frame.error.code; error.details = frame.error
          throw error
        }
        const now = performance.now()
        if (frame.message?.thinking && thinkingAt === null) { thinkingAt = now; onProgress('Thinking…') }
        if (frame.message?.content) {
          if (answerAt === null) { answerAt = now; onProgress('Answering…') }
          yield frame.message.content
        }
        if (frame.done) onTiming({ request_ms: now - started, context_acquisition_ms: contextAcquisitionMs,
          first_output_ms: (thinkingAt ?? answerAt ?? now) - started,
          ...(executionMode==='local_query' ? {} : {thinking_ms: thinkingAt === null ? 0 : (answerAt ?? now) - thinkingAt}),
          answer_ms: answerAt === null ? 0 : now - answerAt,
          ...Object.fromEntries(['total_duration', 'load_duration', 'prompt_eval_duration', 'eval_duration', 'prompt_eval_count', 'eval_count']
            .filter(key => Number.isFinite(frame[key])).map(key => [key, frame[key]])) })
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

export function timingLabel(timing) {
  if (!timing) return ''
  const seconds = ms => `${(ms / 1000).toFixed(1)}s`
  return `Evidence ${seconds(timing.evidence_ms || 0)} · first output ${seconds(timing.first_output_ms)} · thinking ${seconds(timing.thinking_ms)} · answer ${seconds(timing.answer_ms)}`
    + (timing.context_acquisition_ms ? ` · cloud evidence ${seconds(timing.context_acquisition_ms)}` : '')
    + (Number.isFinite(timing.prompt_eval_duration) ? ` · prompt ${seconds(timing.prompt_eval_duration / 1e6)}` : '')
    + (Number.isFinite(timing.load_duration) ? ` · load ${seconds(timing.load_duration / 1e6)}` : '')
}

export async function getCopilotCapabilities({fetcher=fetch,signal}={}) {
  const response = await fetcher('/api/chat?capabilities', {signal})
  if (!response.ok) throw new Error('Copilot capabilities unavailable')
  return response.json()
}
export function responseLabel(response) {
  return response.execution_mode === 'local_query' ? 'Local data query · '+response.answer_status
    : response.execution_mode === 'llm_grounded' ? `Grounded AI · ${response.provider === 'local' ? 'Local' : 'Cloud'} · ${response.model}` : 'Rule-based fallback'
}
