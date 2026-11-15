// Integrity/provenance checks only. A separate whole-answer semantic review is required.
import {readFileSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {scopedCloudMessages} from '../src/data/cloudRequestScope.js'
import {renderOperationalAnswer} from '../src/data/operationalEvidence.js'
const session=resolve(process.argv[2]),matrix=JSON.parse(readFileSync(join(session,'matrix.json'))),summaries=[],referenceCatalogue=new Map()
const hash=s=>createHash('sha256').update(s).digest('hex')
for(const row of matrix){
 const dir=row.directory,read=name=>JSON.parse(readFileSync(join(dir,name))),answer=readFileSync(join(dir,'answer.md'),'utf8').replace(/\n$/,'')
 const body=read('client-request.json'),observed=read('provider-request-OBSERVED.json'),response=read('provider-response-OBSERVED.json'),scope=read('scope-OBSERVED.json').scope
 const replay=scopedCloudMessages(body,observed.received_at),rendered=renderOperationalAnswer(response.content,replay.evidence,replay.scope,response.done_reason==='stop')
 const sections=answer.split(/\n## /).map((s,i)=>({section:i?s.slice(0,s.indexOf('\n')):'Lead/scope',bytes:Buffer.byteLength(s),sha256:hash(s)}))
 const chosen=JSON.parse(response.content)
 const selected=(chosen.records||chosen.references||[]).map(id=>(replay.evidence.records||replay.evidence.references).find(r=>r.id===id)).filter(Boolean)
 for(const ref of selected)referenceCatalogue.set(hash(ref.text),ref)
 const result={case:row.id,observed_egress:true,request_matches_deployed_code:JSON.stringify(replay.messages)===JSON.stringify(observed.payload.messages),answer_matches_controlled_renderer:rendered.answer===answer,envelope_disposition:rendered.disposition,actual_scope:scope,selected_references:selected.map(r=>({id:r.id,source:r.source,bytes:Buffer.byteLength(r.text),sha256:hash(r.text)})),sections,limitation:'Checks integrity and code provenance, not semantic source applicability or answer utility.'}
 writeFileSync(join(dir,'integrity-review.json'),JSON.stringify(result,null,2)+'\n');summaries.push({case:row.id,request_match:result.request_matches_deployed_code,answer_match:result.answer_matches_controlled_renderer,scope:scope.status,method:scope.method,answer_bytes:Buffer.byteLength(answer),references:result.selected_references})
}
writeFileSync(join(session,'integrity-summary.json'),JSON.stringify(summaries,null,2)+'\n')
writeFileSync(join(session,'selected-reference-catalogue.json'),JSON.stringify([...referenceCatalogue.values()],null,2)+'\n')
console.log(JSON.stringify(summaries.map(({references,...r})=>r),null,2))
