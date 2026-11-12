export function createAdapters(validateContract) {


const validCount = value => Number.isSafeInteger(value) && value >= 0
const reportKeys = ['all_reported_hazards', 'direct_electric', 'electric_tree_or_wire', 'road_blockage']

// Normalize existing fetch snapshots without fetching, sampling or rewriting sources.
// Metadata is supplied by the owning adapter; its URL is attribution, never fetch authority.
function adaptEvidence(kind, raw, metadata) {
  const fetched = raw.fetched_at ?? raw.fetchedAt ?? null
  const dated = !!fetched && /^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)$/.test(fetched)
  const block = { id: metadata.id, kind, source: structuredClone(metadata.source), fetched_at: fetched,
    valid_interval: metadata.valid_interval ?? null, geography: metadata.geography ?? null,
    scope: { filter: raw.filter ?? metadata.filter ?? null, where: raw.where ?? metadata.where ?? null,
      description: raw.scope ?? metadata.description ?? null, layer_id: metadata.layer_id ?? null },
    state: { availability: metadata.availability ?? 'available', freshness: dated ? (metadata.freshness ?? 'unknown') : 'unknown', completeness: 'unknown', omission_reason: metadata.omission_reason ?? null },
    values: {}, limitations: [...(metadata.limitations || [])] }
  if (fetched && !dated) block.limitations.push('Fetch time has no date or UTC offset; refresh before treating it as current.')
  if (raw.success === false || raw.ok === false || raw.state === 'unavailable' || raw.data_state === 'unavailable') block.state.availability = 'unavailable'
  if (raw.data_state === 'stale') block.state.freshness = 'stale'
  if (raw.visible === false || raw.state === 'hidden') block.state.availability = 'hidden'
  if (raw.error) block.limitations.push(String(raw.error))
  if (kind === 'forecast') {
    const data = raw.data ?? raw
    block.values = { periods: structuredClone(data.properties?.periods || []), raw: structuredClone(data) }
    block.state.completeness = block.values.periods.length ? 'complete' : 'unknown'
  } else if (kind === 'map_layer') {
    const complete = raw.state === 'complete' && validCount(raw.complete_count) && block.state.availability === 'available'
    block.state.completeness = complete ? 'complete' : 'partial'
    block.values = { complete_count: complete ? raw.complete_count : null, samples: structuredClone(raw.samples || []),
      summary: structuredClone(raw.summary || {}), displayed_subset: raw.displayed_subset ?? null, unit: raw.unit ?? null }
  } else if (kind === 'reports_311') {
    const rows = structuredClone(raw.aggregate_counts || [])
    const complete = raw.aggregate_state === 'current' && reportKeys.every(key => rows.filter(row => row.key === key && validCount(row.total)).length === 1)
    block.state.completeness = complete ? 'complete' : 'partial'
    block.values = { aggregate_counts: rows, report_window: structuredClone(raw.report_window ?? null), records: structuredClone(raw.records || []) }
    block.limitations.push('Reported NYC 311 complaints, not utility-confirmed outages.')
  } else if (kind === 'kb') {
    block.values = { module_id: raw.module_id, content: raw.content ?? raw.data ?? '' }
    block.state.completeness = 'complete'
  } else if (kind === 'document') {
    const text = raw.content || ''
    // Code-point offsets, not JS UTF-16 offsets, so Python and JS agree on Unicode.
    block.values = { filename: raw.name, passages: [{ id: `${metadata.id}:0`, text, start: 0, end: Array.from(text).length }] }
    block.state.completeness = raw.extraction_partial ? 'partial' : 'complete'
    if (raw.extraction_partial) block.limitations.push('Upload extraction is partial.')
  } else if (kind === 'catalog') {
    block.values = { content: raw.content || '' }
    block.limitations.push('Catalog metadata, not loaded feature records.')
  } else block.values = structuredClone(raw)
  return validateContract('evidence', block)
}

return adaptEvidence
}
