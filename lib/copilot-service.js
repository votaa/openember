import { planRequest } from './copilot-intent.js'
import { localAnswer } from './copilot-local-queries.js'
import { capabilities, executionMode, validateContract } from './copilot-contract.js'
import { buildCopilotSystemPrompt } from '../src/data/copilotPrompt.js'
import { routeChat } from './ollama.js'

export function synthesisMessages(request) {
  const context = request.evidence.find(b => b.id === 'legacy_context' && b.kind === 'live')?.values.content
  if (typeof context !== 'string') throw new TypeError('Full synthesis context is required')
  return [{role:'system',content:buildCopilotSystemPrompt(request.jurisdiction.name,context)},
    ...[...request.history,{role:'user',content:request.question}].slice(-10)]
}
export function createCopilot(env = {}, {clock=Date.now} = {}) {
  const mode = executionMode(env)
  const checked = request => {
    validateContract('request',request)
    return {...request,evidence:request.evidence.map(block=>{
      const ttl={forecast:3600000,map_layer:300000,reports_311:300000}[block.kind]
      const dated=typeof block.fetched_at==='string' && /^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)$/.test(block.fetched_at)
      const age=clock()-Date.parse(block.fetched_at)
      return ttl && (!dated||!Number.isFinite(age)||age < -60000||age>ttl) ? {...block,state:{...block.state,freshness:'stale'}} : block
    })}
  }
  return { capabilities: () => capabilities(mode),
    plan(request) { if (mode !== 'hybrid') throw new TypeError('Hybrid mode is disabled'); return planRequest(checked(request)) },
    validateStream(request) { const plan=this.plan(request);if(plan.outcome==='synthesis') synthesisMessages(request);return plan },
    async *stream(request, {config, fetcher, signal}) {
      signal?.throwIfAborted()
      request = checked(request)
      const plan = this.plan(request)
      if (plan.outcome !== 'synthesis') {
        const response = validateContract('result',localAnswer(request,plan))
        yield {response}
        signal?.throwIfAborted()
        yield {message:{content:response.answer},done:true}
        return
      }
      const messages = synthesisMessages(request)
      let metadata = null, answer = ''
      for await (const frame of routeChat(messages,config(),{fetcher,signal})) {
        if (frame.provider) {
          metadata = {...localAnswer(request,plan),execution_mode:'llm_grounded',answer_status:'answered',answer:'',
            provider:frame.provider.provider,model:frame.provider.model,attempts:(frame.provider.attempts || []).map(({provider,code})=>({provider,code})),warnings:[],evidence_ids:request.evidence.map(b=>b.id),freshness:request.evidence.map(b=>({evidence_id:b.id,state:b.state}))}
          yield {response:validateContract('result',metadata)}
        }
        answer += frame.message?.content || ''
        if (frame.error && metadata) yield {response:{...metadata,answer,answer_status:answer ? 'partial' : 'failed'}}
        if (frame.done && metadata && !frame.error) yield {response:{...metadata,answer,generated_at:new Date().toISOString()}}
        yield frame
      }
    } }
}
