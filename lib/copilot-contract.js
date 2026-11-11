// Phase 1 contract helpers. Not connected to the HTTP handler or provider loop.
import { readFileSync } from 'node:fs'

export const CONTRACT = JSON.parse(readFileSync(new URL('../shared/copilot/contract.schema.json', import.meta.url)))
export const POLICY = JSON.parse(readFileSync(new URL('../shared/copilot/policy.json', import.meta.url)))

// Deliberately limited to the JSON Schema keywords used by our bundled contract.
// The conformance gate also validates the schema with the reference validator.
function check(value, schema, path) {
  if (schema.$ref) return check(value, CONTRACT.$defs[schema.$ref.split('/').at(-1)], path)
  const fail = message => { throw new TypeError(`${path}: ${message}`) }
  if (schema.oneOf) {
    const matches = schema.oneOf.filter(branch => { try { check(value, branch, path); return true } catch { return false } })
    if (matches.length !== 1) fail('expected exactly one payload shape')
  }
  if ('const' in schema && value !== schema.const) fail('invalid constant')
  if (schema.enum && !schema.enum.includes(value)) fail('invalid enum')
  const types = { null: value === null, array: Array.isArray(value), object: value !== null && typeof value === 'object' && !Array.isArray(value),
    string: typeof value === 'string', integer: Number.isSafeInteger(value), number: typeof value === 'number' && Number.isFinite(value), boolean: typeof value === 'boolean' }
  if (schema.type && ![schema.type].flat().some(t => types[t])) fail('invalid type')
  if (types.string) {
    if (/[\uD800-\uDFFF]/u.test(value)) fail('unpaired Unicode surrogate')
    const size = Array.from(value).length
    if (size < (schema.minLength ?? 0) || size > (schema.maxLength ?? Infinity)) fail('invalid string length')
  }
  if (types.number && (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) fail('outside numeric bounds')
  if (types.array) {
    if (value.length > (schema.maxItems ?? Infinity)) fail('too many items')
    if (schema.items) value.forEach((item, i) => check(item, schema.items, `${path}[${i}]`))
  }
  if (types.object) {
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) fail(`missing ${key}`)
    for (const [key, item] of Object.entries(value)) {
      const child = Object.hasOwn(schema.properties || {}, key) ? schema.properties[key] : null
      if (child) check(item, child, `${path}.${key}`)
      else if (schema.additionalProperties === false) fail(`unknown field ${key}`)
      else if (typeof schema.additionalProperties === 'object') check(item, schema.additionalProperties, `${path}.${key}`)
    }
  }
}

export function validateContract(kind, value) {
  if (!Object.hasOwn(CONTRACT.$defs, kind)) throw new TypeError('unknown contract')
  check(value, CONTRACT.$defs[kind], kind)
  if (kind === 'request') {
    if (!value.question.trim()) throw new TypeError('empty question')
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > POLICY.limits.request_bytes) throw new TypeError('request too large')
    const ids = value.evidence.map(block => block.id)
    if (new Set(ids).size !== ids.length) throw new TypeError('duplicate evidence ID')
  }
  if (kind === 'result' && value.execution_mode === 'local_query' && (value.provider !== null || value.model !== null))
    throw new TypeError('local queries cannot claim a provider')
  if (kind === 'result' && value.execution_mode === 'llm_grounded' && (!value.provider || !value.model))
    throw new TypeError('grounded responses require the committed provider and model')
  if (kind === 'result' && value.execution_mode === 'rule_based_fallback' && (value.provider !== null || value.model !== null))
    throw new TypeError('fallback cannot claim a successful provider')
  return value
}

export function executionMode(env = {}) {
  const mode = env[POLICY.switch.environment] ?? POLICY.switch.default
  if (!POLICY.switch.values.includes(mode)) throw new TypeError('invalid Copilot execution mode')
  return mode
}

// Proposed handshake payload; phase 2 will expose this independently of probes.
export function capabilities(mode = 'legacy') {
  if (!POLICY.switch.values.includes(mode)) throw new TypeError('invalid Copilot execution mode')
  return { execution_mode: mode, request_versions: mode === 'hybrid' ? ['1.0'] : [], legacy_messages: true }
}

export function inputEstimate(messages, allocatedContext) {
  if (!Number.isSafeInteger(allocatedContext) || allocatedContext < 4096 || allocatedContext > 131072) throw new TypeError('explicit local context allocation required')
  const p = POLICY.token_accounting
  const contentBytes = messages.reduce((total, m) => total + Buffer.byteLength(m.content, 'utf8'), 0)
  const estimatedInputTokens = Math.ceil(contentBytes / p.bytes_per_estimated_token) + messages.length * p.per_message_reserve + p.template_reserve
  return { method: p.method, exact: false, content_bytes: contentBytes, estimated_input_tokens: estimatedInputTokens,
    generation_reserve: p.generation_reserve, safety_reserve: p.safety_reserve, allocated_context: allocatedContext,
    fits_estimate: estimatedInputTokens + p.generation_reserve + p.safety_reserve <= allocatedContext,
    requires_native_retention_check: true }
}
