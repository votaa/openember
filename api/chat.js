import {deterministicObservationAnswer} from '../src/data/answerRecords.js'
import {renderOperationalAnswer} from '../src/data/operationalEvidence.js'
import {scopedCloudMessages} from '../src/data/cloudRequestScope.js'
import { UPLOAD_LIMITS, UploadError, validateCloudMessages, validateUploads, uploadedDocumentContext } from '../src/data/cloudUploads.js'

/**
 * api/chat.js — Vercel serverless proxy for Ollama Cloud
 *
 * Runs server-side (no CORS) — proxies POST /api/chat to Ollama Cloud
 * and streams the response back to the browser.
 *
 * Browser calls:  POST /api/chat  { messages, model?, uploads? }
 * This calls:     POST https://ollama.com/api/chat  with Bearer auth
 */

export const config = { runtime: "edge" }   // Edge runtime for streaming support

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    })
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders() })
  }

  // API key — from Vercel env var (set in dashboard) or from request header
  const apiKey = process.env.OLLAMA_API_KEY
    || req.headers.get("x-ollama-key")
    || ""

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "No Ollama API key configured. Set OLLAMA_API_KEY in Vercel environment variables." }),
      { status: 401, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    )
  }

  const receivedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
  let body, scoped
  try {
    body = await readChatBody(req)
    validateCloudMessages(body?.messages)
    if (body.uploads !== undefined) {
      validateUploads(body.uploads)
      const documents = uploadedDocumentContext(body.uploads)
      if (documents && !body.messages[0].content.includes(documents)) throw new UploadError("The attached documents are not present in full in this request. Refresh the app and upload them again.", "upload_incomplete", 400)
    }
    scoped = scopedCloudMessages(body, receivedAt)
  } catch (error) {
    const known = error instanceof UploadError
    return new Response(JSON.stringify({ error: known ? error.message : "Invalid JSON", code: known ? error.code : "request_invalid" }), {
      status: known ? error.status : 400,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    })
  }

  const direct=deterministicObservationAnswer(scoped.evidence,scoped.scope)
  if(direct) {
    scoped.scope.enforcement={...scoped.scope.enforcement,route:'observation_summary',status:direct.disposition,provider_called:false}
    const frames=[{ember_scope:scoped.scope},{message:{role:'assistant',content:direct.answer},ember_enforcement:{status:direct.disposition,provider_called:false},done:true}]
    return new Response(frames.map(f=>JSON.stringify(f)+'\n').join(''),{headers:{...corsHeaders(),'Content-Type':'text/event-stream','Cache-Control':'no-cache'}})
  }

  const ollamaHost  = process.env.OLLAMA_HOST  || "https://ollama.com"
  const ollamaModel = process.env.OLLAMA_MODEL || body.model || "gpt-oss:120b-cloud"

  const payload = {
    model:    ollamaModel,
    stream:   true,
    messages: scoped.messages,
    options: { num_predict: UPLOAD_LIMITS.outputReserveTokens },
  }

  try {
    const upstream = await fetch(`${ollamaHost}/api/chat`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!upstream.ok) {
      const errText = await upstream.text()
      return new Response(
        JSON.stringify({ error: `Ollama Cloud ${upstream.status}: ${errText}` }),
        { status: upstream.status, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      )
    }

    // Preview-only request-scoped capture reflects this actual payload; never log keys or thinking.
    const auditing = process.env.VERCEL_ENV === 'preview' && !!process.env.EMBER_PREVIEW_AUDIT_TOKEN
      && req.headers.get('x-ember-audit-token') === process.env.EMBER_PREVIEW_AUDIT_TOKEN
    const reader = upstream.body.getReader(), encoder = new TextEncoder(), decoder = new TextDecoder()
    let buffer='', content='', terminal=null, finished=false, bytes=0
    const emit=(controller,value)=>controller.enqueue(encoder.encode(JSON.stringify(value)+'\n'))
    const stream = new ReadableStream({
      start(controller) {
        emit(controller,{ember_scope:scoped.scope})
        if(auditing)emit(controller,{ember_audit:{received_at:receivedAt,provider_url:ollamaHost+'/api/chat',payload}})
      },
      async pull(controller) {
        if(finished)return
        const started=Date.now()
        try {
          while(!terminal) {
            const {done,value}=await reader.read()
            if(done)break
            bytes+=value.byteLength
            if(bytes>2*1024*1024)throw new Error('Provider output exceeds capture limit')
            buffer+=decoder.decode(value,{stream:true})
            const lines=buffer.split('\n');buffer=lines.pop()
            for(const line of lines)if(line.trim()) {
              const frame=JSON.parse(line)
              content+=frame.message?.content||''
              if(frame.done)terminal=frame
            }
          }
          if(!terminal&&buffer.trim()) {const frame=JSON.parse(buffer);content+=frame.message?.content||'';if(frame.done)terminal=frame}
          const rendered=renderOperationalAnswer(content,scoped.evidence,scoped.scope,!!terminal&&(!terminal.done_reason||terminal.done_reason==='stop'))
          scoped.scope.enforcement={...scoped.scope.enforcement,status:rendered.disposition,completion_reason:terminal?.done_reason||(!terminal?'missing_terminal':'stop'),output_characters:content.length,provider_called:true}
          emit(controller,{ember_scope:scoped.scope,ember_enforcement:{status:rendered.disposition,buffered:true,buffer_ms:Date.now()-started,completion_reason:terminal?.done_reason||(!terminal?'missing_terminal':'stop'),output_characters:content.length,provider_called:true},message:{role:'assistant',content:rendered.answer}})
          if(auditing)emit(controller,{ember_audit_response:{model:terminal?.model||ollamaModel,content,done_reason:terminal?.done_reason||'interrupted'}})
          const metrics=Object.fromEntries(['model','total_duration','load_duration','prompt_eval_count','prompt_eval_duration','eval_count','eval_duration','done_reason'].filter(k=>terminal?.[k]!==undefined).map(k=>[k,terminal[k]]))
          emit(controller,{...metrics,done:true});finished=true;controller.close()
        } catch(error) {
          if(auditing)emit(controller,{ember_audit_response:{content,completed:false,error_kind:'invalid_or_interrupted_provider_stream'}})
          const rendered=renderOperationalAnswer('',scoped.evidence,scoped.scope,false)
          emit(controller,{message:{role:'assistant',content:rendered.answer},ember_enforcement:{status:'incomplete'},done:true})
          finished=true;controller.close()
        } finally { if(!terminal)await reader.cancel().catch(()=>{}) }
      },
      cancel(reason) { finished=true;return reader.cancel(reason) },
    })
    return new Response(stream, {
      status:  200,
      headers: {
        ...corsHeaders(),
        "Content-Type":      "text/event-stream",
        "Cache-Control":     "no-cache",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (e) {
    return new Response(
      JSON.stringify({ error: `Proxy error: ${e.message}` }),
      { status: 502, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    )
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-ollama-key, x-ember-audit-token",
  }
}

// Bound the wire payload before JSON parsing as well as the decoded prompt.
async function readChatBody(req) {
  if (!req.body) throw new Error("Missing body")
  if (Number(req.headers.get("content-length")) > UPLOAD_LIMITS.maxRequestBytes) throw new UploadError("Request exceeds 1 MiB. Remove documents or sources and try again.", "request_limit")
  const reader = req.body.getReader(), chunks = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > UPLOAD_LIMITS.maxRequestBytes) {
        await reader.cancel()
        throw new UploadError("Request exceeds 1 MiB. Remove documents or sources and try again.", "request_limit")
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const combined = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(combined))
}
