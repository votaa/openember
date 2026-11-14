import policy from '../../shared/request-scope-policy.json' assert {type:'json'}
import {JURISDICTION} from '../config/jurisdiction.js'
import {resolveRequestScope,renderRequestScope,SCOPE_VERSION,instant} from './requestScope.js'
import {COPILOT_RULES} from './copilotPrompt.js'
import {UploadError,validateCloudMessages} from './cloudUploads.js'

// Runs inside the Edge proxy. No request value controls time zone, center or providers.
export function scopedCloudMessages(body,receivedAt) {
  const input=body.scope_input
  if(input!==undefined&&(!input||input.version!==SCOPE_VERSION||!Array.isArray(input.weather)||input.weather.length>32))throw new UploadError('Invalid request scope metadata. Refresh the app and retry.','scope_invalid',400)
  const weather=structuredClone(input?.weather||[])
  for(const source of weather) {
    if(!source||typeof source.id!=='string'||typeof source.url!=='string'||typeof source.geography!=='string'||!source.data||typeof source.data.properties!=='object'||source.data.properties===null)throw new UploadError('Invalid weather snapshot. Refresh the evidence.','scope_invalid',400)
    // Data URLs are never fetched here; retain client-snapshot provenance.
    source.state=source.state==='unavailable'?'unavailable':!Number.isFinite(instant(source.fetched_at))||Date.parse(receivedAt)-instant(source.fetched_at)>3600000||instant(source.fetched_at)>Date.parse(receivedAt)+300000?'stale':'available'
    const props=source.data.properties
    if(props.periods!==undefined&&(!Array.isArray(props.periods)||props.periods.some(p=>!p||typeof p!=='object')))throw new UploadError('Invalid forecast periods.','scope_invalid',400)
    for(const k of ['windSpeed','windGust','quantitativePrecipitation','probabilityOfPrecipitation'])if(props[k]!==undefined&&(!props[k]||!Array.isArray(props[k].values)||props[k].values.some(v=>!v||typeof v!=='object')))throw new UploadError('Invalid grid intervals.','scope_invalid',400)
  }
  const user=body.messages.filter(m=>m.role==='user').at(-1)
  if(!user||body.messages[0].role!=='system')throw new UploadError('A system context and user question are required.','scope_invalid',400)
  const scope=resolveRequestScope({question:user.content,requestedAt:receivedAt,jurisdiction:JURISDICTION,weather,files:body.uploads||[],policy})
  const messages=body.messages.map(m=>({...m}))
  messages[0].content=renderRequestScope(scope,weather)+'\n'+messages[0].content+'\n\nAUTHORITATIVE GROUNDING RULES: '+COPILOT_RULES
  validateCloudMessages(messages)
  return {messages,scope}
}
