/** Node transport for local Ollama without fetch's shorter header-wait limit.
 * Routing owns the abort deadline and idle-read timer. Cloud keeps native fetch.
 */
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { Readable } from 'node:stream'

export function nodeOllamaFetch(url, options = {}) {
  if (new URL(url).origin === 'https://ollama.com') return fetch(url, options)
  return new Promise((resolve, reject) => {
    const request = (new URL(url).protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      method: options.method || 'GET', headers: options.headers, signal: options.signal,
    }, response => {
      const headers = new Headers()
      for (const [name, value] of Object.entries(response.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
      }
      const empty = [204, 205, 304].includes(response.statusCode)
      if (empty) response.resume()
      resolve(new Response(empty ? null : Readable.toWeb(response), {
        status: response.statusCode, headers,
      }))
    })
    request.on('error', error => reject(options.signal?.aborted ? options.signal.reason : error))
    request.end(options.body)
  })
}
