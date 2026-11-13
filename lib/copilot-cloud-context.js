import { randomUUID } from 'node:crypto'
import {validateContract} from './copilot-contract.js'
import {canonical} from './copilot-context.js'
// Request-owned rendezvous, used only when a cloud attempt actually needs UI-owned evidence.
export function createCloudContextBroker({deadlineMs=120000}={}) {
  const pending=new Map()
  const identity=request=>canonical(Object.fromEntries(['request_id','question','answer_method','history','jurisdiction','selection','requested_at','context_version'].map(k=>[k,request[k]??null])))
  function wait(request,signal) {
    if(pending.size>=32)throw Error('Too many pending cloud-context requests')
    const token=randomUUID();let resolve,reject
    const promise=new Promise((yes,no)=>{resolve=yes;reject=no});promise.catch(()=>{})
    const finish=(error,value)=>{const entry=pending.get(token);if(!entry)return;pending.delete(token);clearTimeout(entry.timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value)}
    const abort=()=>finish(signal.reason||new DOMException('Cancelled','AbortError'))
    const timer=setTimeout(()=>finish(Error('Full cloud context acquisition timed out')),deadlineMs);timer.unref?.()
    pending.set(token,{identity:identity(request),finish,timer,request_id:request.request_id})
    signal?.addEventListener('abort',abort,{once:true})
    if(signal?.aborted)abort()
    return {token,promise,cancel:()=>finish(Error('Request ended before cloud context was supplied'))}
  }
  function provide(token,request) {
    validateContract('request',request)
    const entry=pending.get(token)
    if(!entry)throw Error('Cloud context request is no longer active')
    if(identity(request)!==entry.identity)throw Error('Cloud context must preserve the original question, history and selection')
    if(!request.evidence.some(b=>b.id==='legacy_context'&&typeof b.values.content==='string'))throw Error('Full cloud legacy context is required')
    entry.finish(null,request)
  }
  return {wait,provide,size:()=>pending.size}
}
