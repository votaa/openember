// Shared provider routing: synthesis is limited to an actively selected map assessment.
import {buildOperationalEvidence,operationalInstruction,renderOperationalAnswer} from './operationalEvidence.js'
import {buildSynthesisCheckpoint,synthesisInstruction,renderSynthesisProposal,SYNTHESIS_VERSION} from './locationSynthesis.js'
export function buildLiveAnswer(input) {
 const bounded=buildOperationalEvidence(input)
 if(input.scope.selected_location?.status!=='selected'||!bounded.topics.emergency)return bounded
 const synthesis=buildSynthesisCheckpoint(input,bounded)
 input.scope.synthesis={version:SYNTHESIS_VERSION,claims:synthesis.claims,candidates:synthesis.candidates,coverage:synthesis.coverage,validation:null}
 return {...bounded,version:SYNTHESIS_VERSION,route:'location_synthesis',synthesis}
}
export function liveAnswerInstruction(evidence) {
 if(!evidence.synthesis)return operationalInstruction(evidence)
 // Facts are independently retained; do not spend the output budget echoing them.
 return synthesisInstruction({...evidence.synthesis,candidates:evidence.synthesis.candidates.filter(c=>c.proposal.category==='conditional_consideration')})+' All supported facts and material gaps render independently. Propose only useful conditional considerations from this registry; an empty selection retains the supported fallback.'
}
export function renderLiveAnswer(raw,evidence,scope,complete=true) {
 if(!evidence.synthesis)return renderOperationalAnswer(raw,evidence,scope,complete)
 const result=renderSynthesisProposal(raw,evidence.synthesis,complete)
 return {...result,disposition:result.validation.response_completeness}
}
export function recordAnswerResult(scope,result,details={}) {
 scope.enforcement={...scope.enforcement,...details,status:result.disposition,...(result.validation?{validation:result.validation}:{})}
 if(scope.synthesis&&result.validation)scope.synthesis.validation=result.validation
 return scope.enforcement
}
