// Reviewed contextual summaries tied to a complete KB module revision.
// No arbitrary source paragraph or model-authored prose becomes an answer record.
import catalog from '../../shared/kb-context-records.json' assert {type:'json'}
const normalize=s=>String(s).replace(/\s+/g,' ').trim()
export function kbAnswerRecords(context,question,scope,files=[]) {
 const emergency=/\bemergency\s+(?:considerations?|conditions?|assessment|planning)\b/i.test(question)
 const wanted={flood:emergency||/flood\s+(?:zone|risk|hazard)|flooding/i.test(question),evacuation:emergency||/evacuat|shelter/i.test(question),infrastructure:emergency||/critical\s+(?:facilit|infrastructure)|hospital|trauma/i.test(question),contacts:emergency||/contact|phone|telephone/i.test(question)}
 if(scope.jurisdiction!==catalog.jurisdiction||!Object.values(wanted).some(Boolean))return []
 // Uploaded source headings cannot masquerade as enabled KB modules.
 for(const file of files)if(file.content)context=context.split(file.content).join('UPLOADED_SOURCE_PROTECTED')
 const sections=context.split(/(?=^--- |^RULES:)/m),records=[]
 for(const row of catalog.modules)if(wanted[row.topic]) {
  const prefix=`--- ${row.header} ---\n`,section=sections.find(s=>s.startsWith(prefix))
  if(!section) {if(emergency)records.push({section:'Gaps',text:`${row.header}: no enabled module was supplied for the regional assessment.`,source:row.module,kind:'kb_gap'});continue}
  if(normalize(section.slice(prefix.length))!==normalize(row.source_text)) {
   records.push({section:'Gaps',text:`${row.header}: this source revision has no reviewed contextual records; its text remains available under Request sources.`,source:row.module,kind:'kb_gap'});continue
  }
  records.push({section:'Regional KB context',text:row.text,source:row.module,kind:'kb_context'})
 }
 if(emergency)records.push({section:'Gaps',text:'The regional KB listings do not establish the selected location’s flood or evacuation zone, an active evacuation order, open shelters or available medical capacity. Site mapping and current local-source status are needed for those determinations.',source:'application',kind:'kb_applicability'})
 return records
}
