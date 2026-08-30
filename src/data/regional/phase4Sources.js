import { fetchGeographySource } from "./regionalGeography.js"
import { fetchRegionalSource } from "./regionalObservations.js"
import {
  ROCKAWAY_SOURCE_IDS,
  fetchRockawaySource,
  unavailableRockawayResult,
} from "./rockawaySources.js"

export const PHASE4_GEOGRAPHY_SOURCE_IDS = [
  "nyc_cb14_boundary",
  "nys_civil_boundaries",
  "nys_electric_utility_territories",
]

export const PHASE4_OBSERVATION_SOURCE_IDS = [
  "coops_kings_point",
  "coops_montauk",
  "coops_battery_reference",
  "coops_sandy_hook_reference",
  "usgs_massapequa_creek",
  "usgs_peconic_river",
  "usgs_rosedale_reference",
  "nys_dec_active_sites",
]

export const PHASE4_SOURCE_IDS = [
  ...ROCKAWAY_SOURCE_IDS,
  ...PHASE4_OBSERVATION_SOURCE_IDS,
  ...PHASE4_GEOGRAPHY_SOURCE_IDS,
]

const phase4SourceCache = new Map()

export function clearPhase4SourceCache() {
  phase4SourceCache.clear()
}

function cachedSocrataResult(source, cache, nowMs) {
  const entry = cache.get(source.id)
  if (!entry) return null
  const maxAgeMs = Number(source.refresh_seconds || 0) * 1000
  return maxAgeMs > 0 && nowMs - entry.cached_at < maxAgeMs ? entry.result : null
}

function lastGoodResult(source, cache, previousResults) {
  const cached = cache.get(source.id)?.result
  if (Array.isArray(cached?.records) && cached.records.length) return cached
  const previous = previousResults?.[source.id]
  return Array.isArray(previous?.records) && previous.records.length ? previous : null
}

const GEOGRAPHY_LABELS = {
  rockaway: "Rockaway / Queens CB14",
  nassau: "Nassau County",
  suffolk: "Suffolk County",
  queens: "Queens County",
  regional: "Long Island operational region",
  reference: "Regional reference",
}

function humanReason(reason) {
  if (!reason) return null
  return String(reason).replaceAll("_", " ").replace(/^./, char => char.toUpperCase())
}

function latestTimestamp(records, field) {
  return records.map(record => record?.[field]).filter(Boolean).sort().at(-1) || null
}

function sourceGeography(source, records) {
  if (ROCKAWAY_SOURCE_IDS.includes(source.id)) return GEOGRAPHY_LABELS.rockaway
  const keys = [...new Set(records.map(record => record.geography).filter(Boolean))]
  const configured = keys.length ? keys : source.geographies || []
  return configured.map(key => GEOGRAPHY_LABELS[key] || key).join(" · ") || GEOGRAPHY_LABELS.regional
}

export function unavailablePhase4Result(source) {
  if (ROCKAWAY_SOURCE_IDS.includes(source?.id)) return unavailableRockawayResult(source)
  return {
    records: [],
    data_state: source?.enabled ? "unavailable" : source?.failure_state || "unavailable",
    reason: source?.enabled ? "not_fetched" : source?.gate || "source_disabled",
    rejected_count: 0,
    fetched_at: null,
  }
}

export function phase4SourceCard(source, result = unavailablePhase4Result(source)) {
  const records = Array.isArray(result?.records) ? result.records : []
  const mappedRecords = records.filter(record => record?.geometry)
  const state = result?.data_state || "unavailable"
  const detailParts = []
  if (state !== "current" && result?.reason) detailParts.push(humanReason(result.reason))
  if (source.operational_note) detailParts.push(source.operational_note)
  else if (!source.enabled && !detailParts.length && source.gate) detailParts.push(source.gate)

  return {
    source_id: source.id,
    name: source.name,
    owner: source.owner,
    geography: sourceGeography(source, records),
    data_state: state,
    record_count: records.length,
    map_count: mappedRecords.length,
    observed_at: latestTimestamp(records, "observed_at"),
    fetched_at: result?.fetched_at || latestTimestamp(records, "fetched_at"),
    attribution: source.attribution,
    disclaimer: source.disclaimer || null,
    note: detailParts.join(" · ") || null,
    reason: result?.reason || null,
    rejected_count: Number(result?.rejected_count || 0),
    kind: source.display?.kind || "reference",
    icon: source.display?.icon || "📍",
    color: source.display?.color || "#60a5fa",
    map_capable: source.display?.map_capable === true && mappedRecords.length > 0,
    activation_state: result?.activation_state || source.activation?.state || null,
    scope_state: result?.scope_state || null,
    confirmation_url: source.activation?.confirmation_url || null,
    confirmation_phone: source.activation?.confirmation_phone || null,
  }
}

export async function fetchPhase4SourceBundle(sourceRegistry, {
  fetchImpl = fetch,
  fetchedAt = new Date().toISOString(),
  evaluatedAt = fetchedAt,
  appToken = "",
  previousResults = {},
  cache = phase4SourceCache,
  nowMs = Date.now(),
  sleepImpl,
} = {}) {
  const sources = new Map(sourceRegistry.map(source => [source.id, source]))
  const geographyEntries = await Promise.all(PHASE4_GEOGRAPHY_SOURCE_IDS.map(async sourceId => {
    const source = sources.get(sourceId)
    return [sourceId, source
      ? await fetchGeographySource(source, fetchImpl, fetchedAt)
      : { records: [], data_state: "unavailable", reason: "source_missing", rejected_count: 0, fetched_at: null }]
  }))
  const geographyResults = Object.fromEntries(geographyEntries)
  const geographyRecords = geographyEntries.flatMap(([, result]) => result.records || [])

  const dataEntries = await Promise.all([
    ...ROCKAWAY_SOURCE_IDS.map(async sourceId => {
      const source = sources.get(sourceId)
      if (!source) return [sourceId, { records: [], data_state: "unavailable", reason: "source_missing", rejected_count: 0, fetched_at: null }]
      if (source.family === "socrata") {
        const cached = cachedSocrataResult(source, cache, nowMs)
        if (cached) return [sourceId, cached]
      }
      const result = await fetchRockawaySource(source, {
        fetchImpl,
        fetchedAt,
        geographyRecords,
        appToken: source.family === "socrata" ? appToken : "",
        previousResult: lastGoodResult(source, cache, previousResults),
        sleepImpl,
      })
      if (source.family === "socrata" && result.data_state !== "stale" && Array.isArray(result.records) && result.records.length) {
        cache.set(source.id, { cached_at: nowMs, result })
      }
      return [sourceId, result]
    }),
    ...PHASE4_OBSERVATION_SOURCE_IDS.map(async sourceId => {
      const source = sources.get(sourceId)
      return [sourceId, source
        ? await fetchRegionalSource(source, { fetchImpl, fetchedAt, evaluatedAt, geographyRecords })
        : { records: [], data_state: "unavailable", reason: "source_missing", rejected_count: 0, fetched_at: null }]
    }),
  ])

  return {
    results: { ...Object.fromEntries(dataEntries), ...geographyResults },
    geography_records: geographyRecords,
    fetched_at: fetchedAt,
  }
}
