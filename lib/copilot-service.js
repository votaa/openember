import { planRequest } from './copilot-intent.js'
import { localAnswer } from './copilot-local-queries.js'
import { capabilities, executionMode, validateContract, POLICY } from './copilot-contract.js'
import { buildCopilotSystemPrompt } from '../src/data/copilotPrompt.js'
import { routeChat } from './ollama.js'
import {buildLocalContext,conversation,scopeKey} from './copilot-context.js'
import {createCloudContextBroker} from './copilot-cloud-context.js'

export function synthesisMessages(request) {
  const context = request.evidence.find(b => b.id === 'legacy_context' && b.kind === 'live')?.values.content
  if (typeof context !== 'string') throw new TypeError('Full synthesis context is required')
  return [{role:'system',content:buildCopilotSystemPrompt(request.jurisdiction.name,context)},
    ...[...request.history,{role:'user',content:request.question}].slice(-10).map(({role,content})=>({role,content}))]
}
function exactResults(request,plan) {
  const operations=plan.operations.filter(op=>op.status==='ready'&&op.intent!=='synthesis')
  return operations.length?localAnswer(request,{...plan,operations}).answer:''
}
export function cloudContext(request,plan) {
  const messages=synthesisMessages(request), convo=conversation(request)
  if(request.context_version&&request.evidence.some(b=>b.kind==='document'))convo.warnings.push('Cloud uploads retain the existing opening-excerpt policy; full-upload local passage retrieval is not applied to cloud context.')
  if(request.context_version) {
    messages[0].content+=`\n\nCURRENT SOURCE SCOPE: ${POLICY.context.rules}\nEnabled KB modules: ${JSON.stringify(request.jurisdiction.enabled_kb_modules)}\nDETERMINISTIC RESULTS:\n${exactResults(request,plan)}`
    const states=request.evidence.filter(b=>b.id!=='legacy_context').map(({id,kind,source,state,scope,fetched_at})=>({id,kind,source,state,scope,fetched_at}))
    messages[0].content+='\nCURRENT SOURCE STATES (retained cloud text is unchanged):\n'+JSON.stringify(states)
    const features=request.evidence.filter(b=>b.kind==='selected_feature'&&b.state.availability==='available')
    if(features.length)messages[0].content+='\nCURRENT SELECTED FEATURES:\n'+JSON.stringify(features)
    messages.splice(1,messages.length-1,...convo.history,{role:'user',content:request.question})
  }
  const included=request.evidence.filter(b=>b.state.availability==='available'&&(b.kind!=='kb'||request.jurisdiction.enabled_kb_modules.includes(b.values.module_id)))
  return {messages,context:{policy:'cloud_full',prompt_version:'legacy-full-with-scope-v1',scope_key:convo.key,included_ids:included.map(b=>b.id),omitted:[],warnings:convo.warnings,processing_limit:null,enabled_kb_modules:[...request.jurisdiction.enabled_kb_modules]}}
}
export function createCopilot(env = {}, {clock=Date.now,contextDeadlineMs} = {}) {
  const mode = executionMode(env), broker=createCloudContextBroker({deadlineMs:contextDeadlineMs})
  const checked = request => {
    validateContract('request',request)
    return {...request,evidence:request.evidence.map(block=>{
      const ttl={forecast:3600000,map_layer:300000,reports_311:300000}[block.kind]
      const dated=typeof block.fetched_at==='string' && /^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)$/.test(block.fetched_at)
      const age=clock()-Date.parse(block.fetched_at)
      return ttl && (!dated||!Number.isFinite(age)||age < -60000||age>ttl) ? {...block,state:{...block.state,freshness:'stale'}} : block
    })}
  }
  return { capabilities: () => ({...capabilities(mode),...(mode==='hybrid'?{context_versions:['1.0'],provider_policy:['local-only','local-first','cloud-only'].includes(env.OLLAMA_MODE)?env.OLLAMA_MODE:'local-first'}:{})}),
    provideContext:broker.provide,
    plan(request) { if (mode !== 'hybrid') throw new TypeError('Hybrid mode is disabled'); return planRequest(checked(request)) },
    validateStream(request) { const plan=this.plan(request);if(plan.outcome==='synthesis'&&!request.context_version) synthesisMessages(request);return plan },
    async *stream(request, {config, fetcher, signal}) {
      signal?.throwIfAborted(); request = checked(request)
      const plan = this.plan(request)
      if (plan.outcome !== 'synthesis') {
        const response = validateContract('result',localAnswer(request,plan))
        if(request.context_version)response.context={policy:'direct',scope_key:scopeKey(request),included_ids:response.evidence_ids,omitted:[],warnings:[]}
        yield {response};signal?.throwIfAborted();yield {message:{content:response.answer},done:true};return
      }
      const cfg=config(), contexts={};let pendingCloud=null
      const typed=!!request.context_version
      const local=typed&&cfg.mode!=='cloud-only'?buildLocalContext(request,cfg.localNumCtx||4096,plan,exactResults(request,plan)):null
      if(local?.context.processing_limit) {
        const response={...localAnswer(request,plan),execution_mode:'rule_based_fallback',answer_status:'failed',answer:local.context.processing_limit+' Narrow the scope, increase the explicitly validated local context allocation, or deliberately choose an already configured cloud/legacy route. This is a processing limit, not missing source data.',warnings:local.context.warnings,context:local.context}
        yield {response:validateContract('result',response)};yield {message:{content:response.answer},done:true};return
      }
      const prepareMessages=typed?(provider)=>{
        if(provider==='local'){contexts.local=local;return {messages:local.messages}}
        if(request.evidence.some(b=>b.id==='legacy_context')){contexts.cloud=cloudContext(request,plan);return {messages:contexts.cloud.messages}}
        pendingCloud=broker.wait(request,signal)
        return {progress:{context_request:{token:pendingCloud.token,request_id:request.request_id}},messages:async()=>{
          const full=checked(await pendingCloud.promise);contexts.cloud=cloudContext(full,this.plan(full));return contexts.cloud.messages
        }}
      }:undefined
      const messages=typed?[]:synthesisMessages(request)
      let metadata=null,answer=''
      try {
        for await (const frame of routeChat(messages,cfg,{fetcher,signal,prepareMessages})) {
          if (frame.provider) {
            const context=contexts[frame.provider.provider]?.context
            metadata={...localAnswer(request,plan),execution_mode:'llm_grounded',answer_status:'answered',answer:'',provider:frame.provider.provider,model:frame.provider.model,attempts:(frame.provider.attempts||[]).map(({provider,code})=>({provider,code})),warnings:context?.warnings||[],evidence_ids:context?.included_ids||request.evidence.map(b=>b.id),freshness:request.evidence.map(b=>({evidence_id:b.id,state:b.state})),...(context?{context}:{})}
            yield {response:validateContract('result',metadata)}
          }
          answer+=frame.message?.content||''
          if(frame.error&&metadata)yield {response:{...metadata,answer,answer_status:answer?'partial':'failed'}}
          if(frame.done&&metadata&&!frame.error)yield {response:{...metadata,answer,generated_at:new Date().toISOString()}}
          yield frame
        }
      } finally {pendingCloud?.cancel()}
    } }
}
