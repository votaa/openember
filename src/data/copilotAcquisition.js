// Cancel request-owned evidence work without changing source-specific deadlines.
export function fetchWithCancellation(signal, fetcher=fetch) {
  return (url,options={})=>{
    signal.throwIfAborted()
    const controller=new AbortController()
    const sources=[signal,options.signal].filter(Boolean)
    const listeners=[]
    for(const source of sources) {
      const abort=()=>{controller.abort(source.reason);for(const [s,f] of listeners)s.removeEventListener('abort',f)}
      listeners.push([source,abort])
      if(source.aborted) abort()
      else source.addEventListener('abort',abort,{once:true})
    }
    return fetcher(url,{...options,signal:controller.signal})
  }
}
export async function waitForEvidence(promise,signal) {
  signal.throwIfAborted()
  let abort
  try {
    return await Promise.race([promise,new Promise((_,reject)=>{
      abort=()=>reject(signal.reason || new DOMException('Cancelled','AbortError'))
      signal.addEventListener('abort',abort,{once:true})
    })])
  } finally {signal.removeEventListener('abort',abort)}
}
