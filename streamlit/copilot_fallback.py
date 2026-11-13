"""Planner-approved deterministic facts after synthesis fails, never AI prose."""
from copilot_contract import POLICY, validate_contract
from copilot_local_queries import local_answer


def fallback_answer(request, plan, error=None, context=None, reason=None):
    error = error or {}
    operations = [op for op in plan['operations'] if op['status'] == 'ready' and op['intent'] != 'synthesis']
    facts = local_answer(request, dict(plan, operations=operations))
    text = POLICY['fallback']
    response = dict(facts, execution_mode='rule_based_fallback',
                    answer_status='partial' if operations else 'failed',
                    intents=[op['intent'] for op in plan['operations']],
                    response_scope=[op['scope'] for op in plan['operations']],
                    answer='\n\n'.join([reason or text['provider_failure'], text['facts_heading']+'\n'+facts['answer'] if operations else text['no_facts'], text['analysis_limit']]),
                    attempts=[dict(provider=a['provider'], code=a['code']) for a in error.get('attempts', [])],
                    warnings=list(dict.fromkeys([error.get('code') or 'processing_limit']+(context or {}).get('warnings', []))))
    if context is not None:
        response['context'] = dict(context, policy='rule_based_fallback', included_ids=facts['evidence_ids'])
    return validate_contract('result', response)
