/** Vercel cannot reach the user's native Ollama. Always cloud-only. */
import { createChatHandler } from '../lib/chat-handler.js'
export const config = { runtime: 'edge' }
export default function handler(req) {
  return createChatHandler({ env: process.env, hosted: true })(req)
}
