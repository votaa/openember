import { normalizeRockawayPayload } from "./normalizeRockaway.js"

export const ROCKAWAY_SOURCE_IDS = [
  "nyc_311_rockaway",
  "nyc_311_electric_hazards_rockaway",
  "nyc_cooling_centers_rockaway",
  "nyc_hurricane_evacuation_centers_rockaway",
  "nycha_developments_rockaway",
]

const DEFAULT_TIMEOUT_MS = 30000
const DEFAULT_MAX_RETRIES = 2
const DEFAULT_BACKOFF_MS = [250, 750]

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function requestError(response) {
  const error = new Error(`HTTP ${response.status}`)
  error.status = response.status
  return error
}

function readableRequestError(error, timeoutMs) {
  if (error?.name === "TimeoutError" || error?.name === "AbortError") {
    return `Request timed out after ${timeoutMs}ms`
  }
  return error?.message || "request_failed"
}

function isTransientRequestError(error) {
  const status = Number(error?.status)
  if (status === 429 || status >= 500) return true
  return error?.name === "TimeoutError"
    || error?.name === "AbortError"
    || error?.name === "TypeError"
    || error?.code === "ECONNRESET"
    || error?.code === "ETIMEDOUT"
}

function staleLastGoodResult(source, previousResult, reason) {
  const records = Array.isArray(previousResult?.records)
    ? previousResult.records.map(record => ({ ...record, data_state: "stale" }))
    : []
  if (!records.length) return null
  return {
    ...previousResult,
    records,
    data_state: "stale",
    reason,
    fetched_at: previousResult?.fetched_at || records[0]?.fetched_at || null,
    activation_state: previousResult?.activation_state || source.activation?.state || null,
  }
}

export function buildRockawayQueryUrl(source) {
  if (!source?.query_select || !source?.required_filter) return source?.endpoint || ""
  const url = new URL(source.endpoint)
  url.searchParams.set("$select", source.query_select)
  url.searchParams.set("$where", source.required_filter)
  if (source.query_order) url.searchParams.set("$order", source.query_order)
  url.searchParams.set("$limit", String(source.query_limit || 50))
  return url.toString()
}

export function buildRockawayAggregateQueryUrl(source, aggregate) {
  if (!source?.endpoint || !aggregate?.query_select || !aggregate?.required_filter) return source?.endpoint || ""
  const url = new URL(source.endpoint)
  url.searchParams.set("$select", aggregate.query_select)
  url.searchParams.set("$where", aggregate.required_filter)
  if (aggregate.query_group) url.searchParams.set("$group", aggregate.query_group)
  if (aggregate.query_order) url.searchParams.set("$order", aggregate.query_order)
  if (aggregate.query_limit) url.searchParams.set("$limit", String(aggregate.query_limit))
  return url.toString()
}

export function unavailableRockawayResult(source) {
  return {
    records: [],
    data_state: source?.enabled ? "unavailable" : source?.failure_state || "unavailable",
    reason: source?.enabled ? "not_fetched" : source?.gate || "source_disabled",
    rejected_count: 0,
    fetched_at: null,
    activation_state: source?.activation?.state || null,
    scope_state: null,
  }
}

export async function fetchRockawaySource(source, {
  fetchImpl = fetch,
  fetchedAt = new Date().toISOString(),
  geographyRecords = [],
  appToken = "",
  previousResult = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
  backoffMs = DEFAULT_BACKOFF_MS,
  sleepImpl = sleep,
} = {}) {
  if (!source?.enabled) return unavailableRockawayResult(source)
  if (!source.normalization) return { ...unavailableRockawayResult(source), reason: "source_not_normalizable" }

  const headers = { Accept: "application/json" }
  if (appToken) headers["X-App-Token"] = appToken
  let finalError = null

  async function fetchJson(url) {
    let error = null
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const response = await fetchImpl(url, {
          headers,
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (!response.ok) throw requestError(response)
        return await response.json()
      } catch (requestFailure) {
        error = requestFailure
        if (!isTransientRequestError(requestFailure) || attempt === maxRetries) break
        await sleepImpl(backoffMs[Math.min(attempt, backoffMs.length - 1)] || 0)
      }
    }
    throw error || new Error("request_failed")
  }

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const payload = await fetchJson(buildRockawayQueryUrl(source))
      const result = { ...normalizeRockawayPayload(source, payload, fetchedAt, fetchedAt, geographyRecords), fetched_at: fetchedAt }
      if (Array.isArray(source.aggregate_queries) && source.aggregate_queries.length) {
        const aggregateResults = []
        let aggregateError = null
        for (const aggregate of source.aggregate_queries) {
          try {
            const aggregatePayload = await fetchJson(buildRockawayAggregateQueryUrl(source, aggregate))
            const row = Array.isArray(aggregatePayload) ? aggregatePayload[0] || {} : {}
            const total = Number(row[aggregate.result_field || "total"])
            aggregateResults.push({
              key: aggregate.key,
              label: aggregate.label,
              total: Number.isFinite(total) ? total : null,
            })
          } catch (aggregateFailure) {
            aggregateError = readableRequestError(aggregateFailure, timeoutMs)
            aggregateResults.push({ key: aggregate.key, label: aggregate.label, total: null })
          }
        }
        result.aggregate_counts = aggregateResults
        result.aggregate_state = aggregateError ? "partial" : "current"
        result.aggregate_reason = aggregateError
      }
      return result
    } catch (error) {
      finalError = error
      if (!isTransientRequestError(error) || attempt === maxRetries) break
      await sleepImpl(backoffMs[Math.min(attempt, backoffMs.length - 1)] || 0)
    }
  }

  const reason = readableRequestError(finalError, timeoutMs)
  return staleLastGoodResult(source, previousResult, reason) || {
    records: [],
    data_state: "unavailable",
    reason,
    rejected_count: 0,
    fetched_at: fetchedAt,
    activation_state: source.activation?.state || null,
    scope_state: null,
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
    aggregate_counts: Array.isArray(result.aggregate_counts) ? result.aggregate_counts : [],
    aggregate_state: result.aggregate_state || null,
    aggregate_reason: result.aggregate_reason || null,
    kind: source.display?.kind || "reference",
    icon: source.display?.icon || "📍",
    color: source.display?.color || "#60a5fa",
    map_capable: source.display?.map_capable === true && mapCount > 0,
    activation_state: result.activation_state || source.activation?.state || null,
    scope_state: result.scope_state || null,
    confirmation_url: source.activation?.confirmation_url || null,
    confirmation_phone: source.activation?.confirmation_phone || null,
  }
}
