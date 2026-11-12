import { forecastPeriods } from './copilot-forecast.js'
export function createPlanner(POLICY, validateContract) {


const clean = text => text.toLowerCase().replace(/’/g,"'").replace(/^what's\b/, 'what is').replace(/\blow temperature\b/g,'low').replace(/\bhigh temperature\b/g,'high').replace(/\bwind speed and direction\b/g,'wind').replace(/\bwind speed\b/g,'wind').trim().replace(/[?.!]+$/, '').trim()
const baseScope = request => ({ geography: request.selection.geography ?? request.jurisdiction.name,
  timezone: request.jurisdiction.timezone, period: null, interval: null, layer_ids: [],
  feature_ids: [...request.selection.feature_ids], source_ids: [], fields: [] })

function operation(question, request) {
  const text = clean(question)
  const scope = baseScope(request)
  const synthesis = () => ({ intent: 'synthesis', question, scope: baseScope(request), status: 'synthesis', reason: 'unmatched_or_analytical' })
  if (new RegExp(POLICY.guards, 'i').test(text)) return synthesis()
  for (const rule of POLICY.rules) {
    for (let i = 0; i < rule.patterns.length; i++) {
      const match = new RegExp(`^(?:${rule.patterns[i]})$`, 'i').exec(text)
      if (!match) continue
      const capture = rule.captures[i]
      // Open-ended names must not swallow another instruction or quoted text.
      const name = match[capture.place || capture.layer] || ''
      if (/\b(?:and|but|then|also|or)\b|[;"]/i.test(name)) return synthesis()
      const op = { intent: rule.intent, question, scope, status: 'acquire', reason: 'required_evidence_missing' }
      if (capture.place && match[capture.place]) scope.geography = match[capture.place]
      if (capture.period) scope.period = match[capture.period]
      if (capture.interval_start) scope.period = `${match[capture.interval_start]} to ${match[capture.interval_end]}`
      scope.fields = capture.fields ? capture.fields.map(index => match[index]).filter(Boolean) : [rule.intent === 'map_count' ? 'complete_count' : 'aggregate_counts']
      let candidates = request.evidence.filter(block => block.kind === ({ forecast_facts: 'forecast', map_count: 'map_layer', reports_311: 'reports_311' })[rule.intent])
      if (request.selection.source_ids.length) candidates = candidates.filter(block => request.selection.source_ids.includes(block.source.id))
      if (rule.intent === 'map_count') {
        const target = clean(match[capture.layer]).replace(/^the /, '')
        if (['this layer', 'this loaded layer', 'loaded layer', 'selected layer'].includes(target)) {
          candidates = candidates.filter(block => request.selection.layer_ids.includes(block.scope.layer_id))
        } else if (['each loaded layer', 'each visible layer'].includes(target)) {
          candidates = candidates.filter(block => block.state.availability !== 'hidden')
        } else {
          candidates = candidates.filter(block => [block.source.name, block.scope.layer_id].some(name => name && clean(name) === target))
          // A document/KB question is not a missing map layer merely because it asks a count.
          if (!candidates.length && !/\blayer\b/.test(target)) return synthesis()
        }
        if (!candidates.length || (candidates.length > 1 && !target.startsWith('each '))) return { ...op, status: 'clarify', reason: 'layer_selection_ambiguous_or_missing' }
        scope.layer_ids = candidates.map(block => block.scope.layer_id)
      } else {
        candidates = candidates.filter(block => block.geography && clean(block.geography) === clean(scope.geography))
        if (candidates.length > 1) return { ...op, status: 'clarify', reason: 'source_selection_ambiguous' }
      }
      scope.source_ids = candidates.map(block => block.source.id)
      if (!candidates.length) return op
      if (candidates.some(block => block.state.availability === 'omitted' && block.state.omission_reason === 'budget'))
        return { ...op, reason: 'evidence_omitted_by_budget' }
      if (candidates.some(block => ['hidden', 'omitted'].includes(block.state.availability))) return { ...op, status: 'unsupported', reason: 'evidence_not_visible' }
      if (candidates.some(block => block.state.availability === 'unavailable' || block.state.freshness !== 'current')) return { ...op, reason: 'refresh_required' }
      if (candidates.some(block => block.state.completeness !== 'complete')) return { ...op, status: 'unsupported', reason: 'population_incomplete' }
      if (rule.intent === 'forecast_facts') {
        const periods = candidates[0].values.periods
        const selected = forecastPeriods(periods,scope,request.requested_at)
        if (!selected.length) return { ...op, status: 'clarify', reason: 'forecast_period_ambiguous_or_uncovered' }
        const period = selected[0]
        scope.interval = period.startTime && period.endTime ? { start: period.startTime, end: selected.at(-1).endTime, timezone: scope.timezone } : null
        if (!scope.interval || selected.some(period => (scope.fields.includes('low') && period.isDaytime !== false) || (scope.fields.includes('high') && period.isDaytime !== true)))
          return { ...op, status: 'unsupported', reason: 'requested_forecast_fields_unavailable' }
        const missing = selected.some(period => scope.fields.some(field => ['low', 'high', 'temperature'].includes(field)
          ? typeof period.temperature !== 'number' || !period.temperatureUnit
          : field === 'wind' ? !period.windSpeed || !period.windDirection
          : field === 'conditions' ? !(period.detailedForecast || period.shortForecast)
          : period.probabilityOfPrecipitation?.value == null))
        if (missing) return { ...op, status: 'unsupported', reason: 'requested_forecast_fields_unavailable' }
      }
      if (rule.intent === 'reports_311') {
        scope.interval = candidates[0].values.report_window
        if (!scope.interval) return {...op,status:'unsupported',reason:'reporting_window_unavailable'}
      }
      return { ...op, status: 'ready', reason: null }
    }
  }
  return synthesis()
}

function planRequest(request) {
  validateContract('request', request)
  const question = request.question
  let operations
  const follow = /^what about (tonight|today|tomorrow)\??$/i.exec(question.trim())
  if (/\b(?:not|never|instead|without)\b|["“”]/i.test(question)) {
    operations = [{ intent: 'synthesis', question, scope: baseScope(request), status: 'synthesis', reason: 'unmatched_or_analytical' }]
  } else if (follow) {
    const previous = request.history.filter(message => message.role === 'user').at(-1)
    const prior = previous && operation(previous.content, request)
    if (prior?.intent === 'forecast_facts' && (!request.selection.geography || clean(prior.scope.geography) === clean(request.selection.geography))) {
      // Resolve only a single, previously explicit forecast operation; never assistant claims.
      const resolved = previous.content.replace(/\b(tonight|today|tomorrow|first period)\b/i, follow[1])
      operations = [{ ...operation(resolved, request), question }]
    } else operations = [{ intent: 'synthesis', question, scope: baseScope(request), status: 'clarify', reason: 'follow_up_scope_ambiguous' }]
  } else operations = question.split(new RegExp(POLICY.compound_separator, 'i')).map(part => operation(part, request))
  let outcome = operations.some(op => op.status === 'synthesis') ? 'synthesis' : operations.some(op => op.status === 'clarify') ? 'clarification' : 'local'
  let reason = outcome === 'synthesis' ? 'entire_request_requires_synthesis' : outcome === 'clarification' ? 'scope_requires_clarification' : 'supported_operations_only'
  if (request.answer_method === 'model') { outcome = 'synthesis'; reason = 'explicit_model_preference' }
  return validateContract('plan', { contract_version: '1.0', question, outcome, reason, operations,
    enabled_kb_modules: [...request.jurisdiction.enabled_kb_modules], context_policy: 'provider_specific' })
}

return planRequest
}
