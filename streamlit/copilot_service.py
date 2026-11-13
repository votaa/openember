"""Application stream with provider-owned context callbacks in the existing routing loop."""
from copilot_contract import validate_contract, POLICY
from copilot_intent import plan_request
from copilot_local_queries import local_answer
from copilot_prompt import build_copilot_system_prompt
from copilot_context import build_local_context, conversation, scope_key
from ollama_provider import stream_chat
from copilot_fallback import fallback_answer


def synthesis_messages(request):
    block=next((b for b in request['evidence'] if b['id']=='legacy_context' and b['kind']=='live'),None)
    if not block or not isinstance(block['values'].get('content'),str): raise ValueError('Full synthesis context is required')
    return [dict(role='system',content=build_copilot_system_prompt(request['jurisdiction']['name'],block['values']['content']))]+[dict(role=m['role'],content=m['content']) for m in (request['history']+[dict(role='user',content=request['question'])])[-10:]]


def exact_results(request,plan):
    operations=[op for op in plan['operations'] if op['status']=='ready' and op['intent']!='synthesis']
    return local_answer(request,dict(plan,operations=operations))['answer'] if operations else ''


def cloud_context(request,plan):
    messages=synthesis_messages(request);convo=conversation(request)
    if request.get('context_version') and any(b['kind']=='document' for b in request['evidence']):convo['warnings'].append('Cloud uploads retain the existing opening-excerpt policy; full-upload local passage retrieval is not applied to cloud context.')
    if request.get('context_version'):
        import json
        messages[0]['content']+=f"\n\nCURRENT SOURCE SCOPE: {POLICY['context']['rules']}\nEnabled KB modules: {json.dumps(request['jurisdiction']['enabled_kb_modules'],separators=(',',':'),ensure_ascii=False)}\nDETERMINISTIC RESULTS:\n{exact_results(request,plan)}"
        states=[{k:b[k] for k in ('id','kind','source','state','scope','fetched_at')} for b in request['evidence'] if b['id']!='legacy_context']
        messages[0]['content']+='\nCURRENT SOURCE STATES (retained cloud text is unchanged):\n'+json.dumps(states,separators=(',',':'),ensure_ascii=False)
        features=[b for b in request['evidence'] if b['kind']=='selected_feature' and b['state']['availability']=='available']
        if features:messages[0]['content']+='\nCURRENT SELECTED FEATURES:\n'+json.dumps(features,separators=(',',':'),ensure_ascii=False)
        messages[1:]=convo['history']+[dict(role='user',content=request['question'])]
    included=[b for b in request['evidence'] if b['state']['availability']=='available' and (b['kind']!='kb' or b['values']['module_id'] in request['jurisdiction']['enabled_kb_modules'])]
    return dict(messages=messages,context=dict(policy='cloud_full',prompt_version='legacy-full-with-scope-v1',scope_key=convo['key'],included_ids=[b['id'] for b in included],omitted=[],warnings=convo['warnings'],processing_limit=None,enabled_kb_modules=list(request['jurisdiction']['enabled_kb_modules'])))


def application_stream(request,config,provider_stream=stream_chat,cloud_context_factory=None):
    plan=plan_request(request)
    if plan['outcome']!='synthesis':
        response=validate_contract('result',local_answer(request,plan))
        if request.get('context_version'):response['context']=dict(policy='direct',scope_key=scope_key(request),included_ids=response['evidence_ids'],omitted=[],warnings=[])
        yield dict(response=response);yield dict(message=dict(content=response['answer']),done=True);return
    typed=bool(request.get('context_version'));contexts={}
    local=build_local_context(request,config.get('local_num_ctx') or 4096,plan,exact_results(request,plan)) if typed and config['mode']!='cloud-only' else None
    if local and local['context']['processing_limit']:
        response=fallback_answer(request,plan,context=local['context'],reason=local['context']['processing_limit']+' '+POLICY['fallback']['processing_limit'])
        yield dict(response=validate_contract('result',response));yield dict(message=dict(content=response['answer']),done=True);return
    def prepare_messages(provider):
        if provider=='local':contexts['local']=local;return local['messages']
        full=request
        if not any(b['id']=='legacy_context' for b in full['evidence']):
            if not cloud_context_factory:raise ValueError('Full cloud context acquisition is required')
            full=cloud_context_factory()
            validate_contract('request',full)
            for key in ('request_id','question','answer_method','history','jurisdiction','selection','requested_at','context_version'):
                if full.get(key)!=request.get(key):raise ValueError('Cloud context must preserve original scope')
        contexts['cloud']=cloud_context(full,plan_request(full));return contexts['cloud']['messages']
    stream=provider_stream([] if typed else synthesis_messages(request),config,**(dict(prepare_messages=prepare_messages) if typed else {}))
    metadata,answer=None,''
    try:
        for frame in stream:
            if frame.get('error') and metadata is None:
                response=fallback_answer(request,plan,error=frame['error'],context=local['context'] if local else None)
                yield dict(response=response);yield dict(message=dict(content=response['answer']),done=True);return
            if frame.get('provider'):
                p=frame['provider'];context=contexts.get(p['provider'],{}).get('context')
                metadata=dict(local_answer(request,plan),execution_mode='llm_grounded',answer_status='answered',answer='',provider=p['provider'],model=p['model'],attempts=[dict(provider=a['provider'],code=a['code']) for a in p.get('attempts',[])],warnings=context['warnings'] if context else [],evidence_ids=context['included_ids'] if context else [b['id'] for b in request['evidence']],freshness=[dict(evidence_id=b['id'],state=b['state']) for b in request['evidence']],**(dict(context=context) if context else {}))
                yield dict(response=validate_contract('result',metadata))
            answer+=frame.get('message',{}).get('content','')
            if frame.get('error') and metadata:yield dict(response=dict(metadata,answer=answer,answer_status='partial' if answer else 'failed'))
            if frame.get('done') and metadata and not frame.get('error'):yield dict(response=dict(metadata,answer=answer))
            yield frame
    finally:
        if hasattr(stream, 'close'):stream.close()
