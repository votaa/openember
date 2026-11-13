import { POLICY, validateContract } from './copilot-contract.js'
import { localAnswer } from './copilot-local-queries.js'

// Only planner-approved facts may survive a failed synthesis. Never extract
// recommendations or arbitrary document prose as a substitute for analysis.
export function fallbackAnswer(request, plan, {error = {}, context = null, reason = null} = {}) {
  const operations = plan.operations.filter(op => op.status === 'ready' && op.intent !== 'synthesis')
  const facts = localAnswer(request, {...plan, operations})
  const text = POLICY.fallback
  return validateContract('result', {...facts, execution_mode:'rule_based_fallback',
    answer_status:operations.length ? 'partial' : 'failed',
    intents:plan.operations.map(op => op.intent), response_scope:plan.operations.map(op => op.scope),
    answer:[reason || text.provider_failure, operations.length ? text.facts_heading+'\n'+facts.answer : text.no_facts, text.analysis_limit].join('\n\n'),
    attempts:(error.attempts || []).map(({provider,code}) => ({provider,code})),
    warnings:[...new Set([error.code || 'processing_limit', ...(context?.warnings || [])])],
    ...(context ? {context:{...context,policy:'rule_based_fallback',included_ids:facts.evidence_ids}} : {})})
}
