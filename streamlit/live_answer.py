"""Shared provider routing for active selected map assessments and bounded queries."""
from operational_evidence import build_operational_evidence,operational_instruction,render_operational_answer
from location_synthesis import build_synthesis_checkpoint,synthesis_instruction,render_synthesis_proposal,SYNTHESIS_VERSION

def build_live_answer(scope,files=None,weather=None,coops=None,context='',question=''):
    bounded=build_operational_evidence(scope,files,weather,coops,context,question)
    if scope.get('selected_location',{}).get('status')!='selected' or not bounded['topics']['emergency']:return bounded
    synthesis=build_synthesis_checkpoint(scope,files,weather,coops,context,question,prepared_evidence=bounded)
    scope['synthesis']=dict(version=SYNTHESIS_VERSION,claims=synthesis['claims'],candidates=synthesis['candidates'],coverage=synthesis['coverage'],validation=None)
    return dict(bounded,version=SYNTHESIS_VERSION,route='location_synthesis',synthesis=synthesis)
def live_answer_instruction(evidence):
    if not evidence.get('synthesis'):return operational_instruction(evidence)
    cp=evidence['synthesis']
    return synthesis_instruction(dict(cp,candidates=[c for c in cp['candidates'] if c['proposal']['category']=='conditional_consideration']))+' All supported facts and material gaps render independently. Propose only useful conditional considerations from this registry; an empty selection retains the supported fallback.'
def render_live_answer(raw,evidence,scope,complete=True):
    if not evidence.get('synthesis'):return render_operational_answer(raw,evidence,scope,complete)
    result=render_synthesis_proposal(raw,evidence['synthesis'],complete)
    return dict(result,disposition=result['validation']['response_completeness'])
def record_answer_result(scope,result,**details):
    scope['enforcement']=dict(scope.get('enforcement',{}),**details,status=result['disposition'])
    if result.get('validation'):
        scope['enforcement']['validation']=result['validation']
        if scope.get('synthesis'):scope['synthesis']['validation']=result['validation']
    return scope['enforcement']
