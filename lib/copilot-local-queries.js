import { POLICY } from './copilot-contract.js'
// Exact presentation of validated structured evidence. No provider imports.
export function localAnswer(request, plan) {
  const used = []
  const parts = plan.operations.map(op => {
    const blocks = request.evidence.filter(b => op.scope.source_ids.includes(b.source.id))
    if (op.status !== 'ready') return `${POLICY.limitations[op.reason] || 'This part requires more evidence or clarification.'} No exact value is inferred.`
    return blocks.map(block => {
      used.push(block)
      let facts
      if (op.intent === 'forecast_facts') {
        const periods = block.values.periods.filter(p => Date.parse(p.startTime) >= Date.parse(op.scope.interval.start) && Date.parse(p.endTime) <= Date.parse(op.scope.interval.end))
        facts = periods.map(p => {
          const fields = op.scope.fields.map(field => field === 'wind' ? `Wind: ${p.windSpeed} ${p.windDirection}`
            : field === 'conditions' ? `Conditions: ${p.detailedForecast || p.shortForecast}`
            : field === 'precipitation probability' ? `Precipitation probability: ${p.probabilityOfPrecipitation.value}%`
            : `${field === 'temperature' ? 'Temperature' : field === 'low' ? 'Low' : 'High'}: ${p.temperature}°${p.temperatureUnit}`)
          return `${p.name || 'Forecast period'}: ${fields.join('; ')}.\nValid: ${p.startTime} — ${p.endTime} (${op.scope.timezone}).`
        }).join('\n')
      } else if (op.intent === 'map_count') facts = `Complete matching count: ${block.values.complete_count} features. These are features, not distinct organizations or departments.`
      else facts = block.values.aggregate_counts.map(row => `${row.label}: ${row.total}`).join('\n')
        + `\nReporting window: ${op.scope.interval?.start} — ${op.scope.interval?.end} (${op.scope.interval?.timezone}).\nReported NYC 311 complaints, not utility-confirmed outages.`
      return `${block.source.name}\n${facts}\nSource: ${block.source.url || 'URL unavailable'}\nFetched: ${block.fetched_at || 'unavailable'}\nGeography: ${block.geography || 'unspecified'}; filter: ${block.scope.filter || 'unspecified'}; where: ${block.scope.where || 'unspecified'}; scope: ${block.scope.description || 'as supplied'}.`
    }).join('\n\n')
  })
  const unique = [...new Map(used.map(b => [b.id, b])).values()]
  return { contract_version:'1.0',request_id:request.request_id,execution_mode:'local_query',
    answer_status:plan.outcome === 'clarification' ? 'clarification' : plan.operations.every(op => op.status === 'ready') ? 'answered' : 'unsupported',
    intents:plan.operations.map(op => op.intent),answer:parts.join('\n\n'),evidence_ids:unique.map(b=>b.id),response_scope:plan.operations.map(op=>op.scope),
    provider:null,model:null,attempts:[],requested_at:request.requested_at,generated_at:new Date().toISOString(),
    freshness:unique.map(b=>({evidence_id:b.id,state:b.state})),warnings:plan.operations.filter(op=>op.reason).map(op=>op.reason),timing:{} }
}
