import {lookupJurisdiction} from './jurisdictionLookup.js'
import {validateSelectedLocation} from './selectedLocation.js'
import {selectCoops} from './coopsEvidence.js'
import {buildLiveAnswer,liveAnswerInstruction} from './liveAnswer.js'
import {evidenceSummary,stripWeatherContext} from './evidenceSummary.js'
import policy from '../../shared/request-scope-policy.json' assert {type:'json'}
import configuration from '../../config/jurisdiction.generated.json' assert {type:'json'}
import {JURISDICTION} from '../config/jurisdiction.js'
import {resolveRequestScope,renderRequestScope,SCOPE_VERSION,instant} from './requestScope.js'
import {COPILOT_RULES} from './copilotPrompt.js'
import {UploadError,validateCloudMessages} from './cloudUploads.js'

// Runs inside the Edge proxy. No request value controls time zone, center or providers.
export function scopedCloudMessages(body,receivedAt,localJurisdiction) {
  const input=body.scope_input
  if(input!==undefined&&(!input||input.version!==SCOPE_VERSION||!Array.isArray(input.weather)||input.weather.length>32))throw new UploadError('Invalid request scope metadata. Refresh the app and retry.','scope_invalid',400)
  let selectedLocation
  if(input?.selected_location!==undefined) {
    try {selectedLocation=validateSelectedLocation(input.selected_location)}
    catch {throw new UploadError("Invalid selected location. Refresh the map.","location_invalid",400)}
    if(selectedLocation.station_id&&!configuration.nws.obs_stations.some(s=>s.id===selectedLocation.station_id))throw new UploadError("Invalid selected location station.","location_invalid",400)
    if(input.selection&&input.selection.station_id!==selectedLocation.station_id)throw new UploadError("Selected station conflicts with location.","location_invalid",400)
  }
  const selection=input?.selection
  if(selection!==undefined) {
    // Validate against the server-owned station catalog below, never an arbitrary client place.
    if(!selection||selection.kind!=='nws_observation'||!configuration.nws.obs_stations.some(s=>s.id===selection.station_id)||Object.keys(selection).some(k=>!['kind','station_id'].includes(k)))throw new UploadError('Invalid selected observation station. Refresh the map.','selection_invalid',400)
  }
  const coops=structuredClone(input?.coops||[])
  if(!Array.isArray(coops)||coops.length>32||coops.some(s=>!s||typeof s.id!=='string'||typeof s.url!=='string'||!s.data||typeof s.data!=='object'))throw new UploadError('Invalid CO-OPS snapshots. Refresh the evidence.','scope_invalid',400)
  const weather=structuredClone(input?.weather||[])
  for(const source of weather) {
    if(!source||typeof source.id!=='string'||typeof source.url!=='string'||typeof source.geography!=='string'||!source.data||typeof source.data.properties!=='object'||source.data.properties===null)throw new UploadError('Invalid weather snapshot. Refresh the evidence.','scope_invalid',400)
    // Data URLs are never fetched here; retain client-snapshot provenance.
    source.state=source.state==='unavailable'?'unavailable':!Number.isFinite(instant(source.fetched_at))||Date.parse(receivedAt)-instant(source.fetched_at)>3600000||instant(source.fetched_at)>Date.parse(receivedAt)+300000?'stale':'available'
    const props=source.data.properties
    if(/\/stations\/[^/]+\/observations\/latest$/.test(source.url)&&typeof props.timestamp!=='string'){source.state='unavailable';source.failure_type=source.failure_type==='retrieval_failed'?'retrieval_failed':'invalid_payload';continue}
    if(props.periods!==undefined&&(!Array.isArray(props.periods)||props.periods.some(p=>!p||typeof p!=='object')))throw new UploadError('Invalid forecast periods.','scope_invalid',400)
    for(const k of policy.weather.grid_fields)if(typeof props.timestamp!=='string'&&props[k]!==undefined&&(!props[k]||!Array.isArray(props[k].values)||props[k].values.some(v=>!v||typeof v!=='object')))throw new UploadError('Invalid grid intervals.','scope_invalid',400)
  }
  const user=body.messages.filter(m=>m.role==='user').at(-1)
  if(!user||body.messages[0].role!=='system')throw new UploadError('A system context and user question are required.','scope_invalid',400)
  const scope=resolveRequestScope({question:user.content,requestedAt:receivedAt,jurisdiction:JURISDICTION,weather,files:body.uploads||[],policy,selection,selectedLocation,localJurisdiction})
  // Both routes render validated application-owned claims; no provider prose is trusted.
  const messages=body.messages.map(m=>({...m}))
  const cleanContext=stripWeatherContext(messages[0].content,body.uploads||[])
  const evidence=buildLiveAnswer({scope,weather,coops,files:body.uploads||[],context:cleanContext,question:user.content})
  scope.enforcement={version:evidence.version,route:evidence.route,status:'awaiting_provider_envelope'}
  scope.coops=selectCoops(coops,scope,user.content)

  messages[0].content=renderRequestScope(scope,weather)+'\n'+evidenceSummary(scope,weather,body.uploads||[])+'\nCO-OPS WINDOW EVIDENCE:\n'+JSON.stringify(scope.coops)+'\n'+cleanContext+'\n\nAUTHORITATIVE GROUNDING RULES: '+COPILOT_RULES+liveAnswerInstruction(evidence)
  validateCloudMessages(messages)
  return {messages,scope,evidence}
}

// Validate the complete request before any boundary-service egress. This argument
// is server-produced; scope_input cannot supply administrative matches.
export async function scopedCloudMessagesWithJurisdiction(body,receivedAt,options) {
  const initial=scopedCloudMessages(body,receivedAt)
  const selected=initial.scope.selected_location
  if(!selected||selected.status!=='selected')return initial
  const local=await lookupJurisdiction(selected.location,body.messages.filter(m=>m.role==='user').at(-1).content,options)
  return scopedCloudMessages(body,receivedAt,local)
}
