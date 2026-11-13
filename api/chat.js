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

  let body
  try {
    body = await readChatBody(req)
    validateCloudMessages(body?.messages)
    if (body.uploads !== undefined) {
      validateUploads(body.uploads)
      const documents = uploadedDocumentContext(body.uploads)
      if (documents && !body.messages[0].content.includes(documents)) throw new UploadError("The attached documents are not present in full in this request. Refresh the app and upload them again.", "upload_incomplete", 400)
    }
  } catch (error) {
    const known = error instanceof UploadError
    return new Response(JSON.stringify({ error: known ? error.message : "Invalid JSON", code: known ? error.code : "request_invalid" }), {
      status: known ? error.status : 400,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    })
  }

  const ollamaHost  = process.env.OLLAMA_HOST  || "https://ollama.com"
  const ollamaModel = process.env.OLLAMA_MODEL || body.model || "gpt-oss:120b-cloud"

  const payload = {
    model:    ollamaModel,
    stream:   true,
    messages: body.messages,
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

    // Stream the response straight through to the browser
    return new Response(upstream.body, {
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
    "Access-Control-Allow-Headers": "Content-Type, x-ollama-key",
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
