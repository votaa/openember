"""Application stream injected into the existing session-owned worker."""
from copilot_contract import validate_contract
from copilot_intent import plan_request
from copilot_local_queries import local_answer
from copilot_prompt import build_copilot_system_prompt
from ollama_provider import stream_chat


def synthesis_messages(request):
    block = next((b for b in request['evidence'] if b['id']=='legacy_context' and b['kind']=='live'), None)
    if not block or not isinstance(block['values'].get('content'), str):
        raise ValueError('Full synthesis context is required')
    return [dict(role='system',content=build_copilot_system_prompt(request['jurisdiction']['name'],block['values']['content']))] + (request['history']+[dict(role='user',content=request['question'])])[-10:]


def application_stream(request, config, provider_stream=stream_chat):
    plan = plan_request(request)
    if plan['outcome'] != 'synthesis':
        response = validate_contract('result',local_answer(request,plan))
        yield dict(response=response)
        yield dict(message=dict(content=response['answer']),done=True)
        return
    metadata, answer = None, ''
    for frame in provider_stream(synthesis_messages(request),config):
        if frame.get('provider'):
            p=frame['provider']
            metadata = dict(local_answer(request,plan),execution_mode='llm_grounded',answer_status='answered',answer='',provider=p['provider'],model=p['model'],attempts=[dict(provider=a['provider'],code=a['code']) for a in p.get('attempts',[])],warnings=[],evidence_ids=[b['id'] for b in request['evidence']],freshness=[dict(evidence_id=b['id'],state=b['state']) for b in request['evidence']])
            yield dict(response=validate_contract('result',metadata))
        answer += frame.get('message',{}).get('content','')
        if frame.get('error') and metadata:
            yield dict(response=dict(metadata,answer=answer,answer_status='partial' if answer else 'failed'))
        if frame.get('done') and metadata and not frame.get('error'):
            yield dict(response=dict(metadata,answer=answer))
        yield frame
