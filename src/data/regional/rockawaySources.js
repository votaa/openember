import { normalizeRockawayPayload } from "./normalizeRockaway.js"

export const ROCKAWAY_SOURCE_IDS = [
  "nyc_311_rockaway",
  "nyc_cooling_centers_rockaway",
  "nyc_hurricane_evacuation_centers_rockaway",
  "nypd_incidents_rockaway",
  "nycha_developments_rockaway",
]

export function buildRockawayQueryUrl(source) {
  if (!source?.query_select || !source?.required_filter) return source?.endpoint || ""
  const url = new URL(source.endpoint)
  url.searchParams.set("$select", source.query_select)
  url.searchParams.set("$where", source.required_filter)
  if (source.query_order) url.searchParams.set("$order", source.query_order)
  url.searchParams.set("$limit", String(source.query_limit || 50))
  return url.toString()
}

export function unavailableRockawayResult(source) {
  return {
    records: [],
    data_state: source?.enabled ? "unavailable" : source?.failure_state || "unavailable",
    reason: source?.enabled ? "not_fetched" : source?.gate || "source_disabled",
    rejected_count: 0,
    fetched_at: null,
  }
}

export async function fetchRockawaySource(source, {
  fetchImpl = fetch,
  fetchedAt = new Date().toISOString(),
  geographyRecords = [],
} = {}) {
  if (!source?.enabled) return unavailableRockawayResult(source)
  if (!source.normalization) return { ...unavailableRockawayResult(source), reason: "source_not_normalizable" }

  try {
    const response = await fetchImpl(buildRockawayQueryUrl(source), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload = await response.json()
    return { ...normalizeRockawayPayload(source, payload, fetchedAt, fetchedAt, geographyRecords), fetched_at: fetchedAt }
  } catch (error) {
    return {
      records: [],
      data_state: "unavailable",
      reason: error?.message || "request_failed",
      rejected_count: 0,
      fetched_at: fetchedAt,
    }
  }
}

export function rockawaySourceCard(source, result = unavailableRockawayResult(source)) {
  const records = Array.isArray(result.records) ? result.records : []
  const observed = records.map((record) => record.observed_at).filter(Boolean).sort().at(-1) || null
  const mapCount = records.filter((record) => record.geometry).length
  return {
    source_id: source.id,
    name: source.name,
    owner: source.owner,
    geography: "Rockaway / Queens CB14",
    data_state: result.data_state || "unavailable",
    record_count: records.length,
    map_count: mapCount,
    observed_at: observed,
    fetched_at: result.fetched_at || records[0]?.fetched_at || null,
    attribution: source.attribution,
    note: source.operational_note || source.gate || result.reason || null,
    kind: source.display?.kind || "reference",
    icon: source.display?.icon || "📍",
    color: source.display?.color || "#60a5fa",
    map_capable: source.display?.map_capable === true && mapCount > 0,
  }
}
