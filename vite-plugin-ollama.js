import { createChatHandler } from './lib/chat-handler.js'
import { serveChat } from './lib/node-handler.js'

/** Development-only same-origin API; production keeps api/chat.js on Vercel. */
export default function ollamaPlugin(env) {
  return { name: 'openember-local-ollama', configureServer(server) {
    const handle = createChatHandler({ env })
    server.middlewares.use('/api/chat', (req, res) => serveChat(req, res, handle))
  } }
}
