import { geometryIntersectsMask } from "./regionalGeography.js"

const VALID_STATES = new Set(["current", "stale", "partial", "unavailable"])

function text(value) {
  if (value === null || value === undefined) return null
  const result = String(value).trim()
  return result || null
}

function instant(value) {
  if (!value) return null
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function iso(value) {
  return instant(value)?.toISOString() || null
}

function noaaInstant(value, timeZone) {
  const raw = text(value)
  if (!raw) return null
  return iso(`${raw.replace(" ", "T")}:00${String(timeZone).toLowerCase() === "gmt" ? "Z" : ""}`)
}

function addSeconds(value, seconds) {
  const parsed = instant(value)
  if (!parsed) throw new Error("invalid_fetched_at")
  return new Date(parsed.getTime() + Number(seconds || 0) * 1000).toISOString()
}

function validPoint(geometry) {
  if (geometry?.type !== "Point" || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) return false
  const longitude = Number(geometry.coordinates[0])
  const latitude = Number(geometry.coordinates[1])
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    && longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90
}

function observationState(observedAt, fetchedAt, staleAfterSeconds, evaluatedAt, rejectedCount = 0) {
  const expiryBase = observedAt || fetchedAt
  const stale = instant(evaluatedAt)?.getTime() > instant(addSeconds(expiryBase, staleAfterSeconds))?.getTime()
  const state = stale ? "stale" : rejectedCount > 0 ? "partial" : "current"
  if (!VALID_STATES.has(state)) throw new Error("invalid_data_state")
  return state
}

function geographyFor(source) {
  if (source.role === "reference") return "reference"
  return source.geographies?.find((item) => item !== "regional") || source.geographies?.[0] || "regional"
}

export function buildRegionalSourceUrl(source, { evaluatedAt = new Date().toISOString() } = {}) {
  const url = new URL(source.endpoint)
  if (source.family === "noaa_coops") {
    url.searchParams.set("range", String(source.range_hours))
    url.searchParams.set("station", source.station_id)
    url.searchParams.set("product", source.product)
    url.searchParams.set("datum", source.datum)
    url.searchParams.set("time_zone", source.time_zone)
    url.searchParams.set("units", source.units)
    url.searchParams.set("application", source.application)
    url.searchParams.set("format", "json")
  } else if (source.family === "usgs_ogc") {
    const end = instant(evaluatedAt)
    if (!end) throw new Error("invalid_evaluated_at")
    const start = new Date(end.getTime() - Number(source.window_hours) * 3600000)
    url.searchParams.set("f", "json")
    url.searchParams.set("monitoring_location_id", source.monitoring_location_id)
    url.searchParams.set("parameter_code", source.parameter_code)
    url.searchParams.set("datetime", `${start.toISOString()}/${end.toISOString()}`)
    url.searchParams.set("limit", String(source.query_limit))
  } else if (source.family === "arcgis_map_server") {
    url.pathname = `${url.pathname.replace(/\/$/, "")}/query`
    url.searchParams.set("where", source.required_filter)
    url.searchParams.set("outFields", source.query_out_fields.join(","))
    url.searchParams.set("returnGeometry", "true")
    url.searchParams.set("outSR", "4326")
    url.searchParams.set("resultRecordCount", String(source.query_limit))
    url.searchParams.set("f", "geojson")
  } else {
    throw new Error("unsupported_regional_source_family")
  }
  return url.toString()
}

function baseRecord(source, fetchedAt, observedAt, geometry, dataState) {
  return {
    source_id: source.id,
    source_name: source.name,
    owner: source.owner,
    geography: geographyFor(source),
    observed_at: observedAt,
    fetched_at: fetchedAt,
    expires_at: addSeconds(observedAt || fetchedAt, source.stale_after_seconds),
    geometry,
    source_url: source.endpoint,
    attribution: source.attribution,
    disclaimer: source.disclaimer || null,
    data_state: dataState,
  }
}

function normalizeCoops(source, payload, fetchedAt, evaluatedAt) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return unavailable("malformed_payload")
  if (payload.error) return unavailable(text(payload.error.message) || "upstream_error")
  if (text(payload.metadata?.id) !== source.station_id || !Array.isArray(payload.data)) return unavailable("station_contract_mismatch")
  const geometry = { type: "Point", coordinates: [Number(payload.metadata.lon), Number(payload.metadata.lat)] }
  if (!validPoint(geometry)) return unavailable("invalid_station_geometry")
  const valid = payload.data.map((row) => {
    const observedAt = noaaInstant(row?.t, source.time_zone)
    const value = Number(row?.v)
    return observedAt && Number.isFinite(value) ? { row, observedAt, value } : null
  }).filter(Boolean).sort((left, right) => left.observedAt.localeCompare(right.observedAt))
  if (valid.length === 0) return partial("no_valid_observations", payload.data.length)
  const latest = valid.at(-1)
  const rejectedCount = payload.data.length - valid.length
  const dataState = observationState(latest.observedAt, fetchedAt, source.stale_after_seconds, evaluatedAt, rejectedCount)
  const record = {
    ...baseRecord(source, fetchedAt, latest.observedAt, geometry, dataState),
    category: "water_level",
    severity: null,
    status: text(latest.row.q)?.toLowerCase() === "p" ? "Preliminary" : text(latest.row.q),
    title: text(payload.metadata.name) || source.name,
    description: `${latest.value} ft relative to ${source.datum}`,
    properties: {
      source_record_id: `${source.station_id}:${latest.observedAt}`,
      station_id: source.station_id,
      role: source.role,
      product: source.product,
      datum: source.datum,
      time_zone: source.time_zone,
      units: source.units,
      value: latest.value,
      unit_of_measure: "ft",
      uncertainty: text(latest.row.s),
      flags: text(latest.row.f),
      quality: text(latest.row.q),
    },
  }
  return result([record], dataState, rejectedCount ? "observations_rejected" : null, rejectedCount)
}

function normalizeUsgs(source, payload, fetchedAt, evaluatedAt) {
  if (payload?.type !== "FeatureCollection" || !Array.isArray(payload.features)) return unavailable("malformed_payload")
  const valid = payload.features.map((feature) => {
    const properties = feature?.properties
    const observedAt = iso(properties?.time)
    const value = Number(properties?.value)
    if (feature?.type !== "Feature" || !text(feature.id) || !validPoint(feature.geometry) || !observedAt || !Number.isFinite(value)) return null
    if (text(properties.monitoring_location_id) !== source.monitoring_location_id || text(properties.parameter_code) !== source.parameter_code || !text(properties.unit_of_measure)) return null
    return { feature, properties, observedAt, value }
  }).filter(Boolean).sort((left, right) => left.observedAt.localeCompare(right.observedAt))
  if (valid.length === 0) return partial("no_valid_observations", payload.features.length)
  const latest = valid.at(-1)
  const rejectedCount = payload.features.length - valid.length
  const dataState = observationState(latest.observedAt, fetchedAt, source.stale_after_seconds, evaluatedAt, rejectedCount)
  const record = {
    ...baseRecord(source, fetchedAt, latest.observedAt, latest.feature.geometry, dataState),
    category: "gauge_height",
    severity: null,
    status: text(latest.properties.approval_status),
    title: source.name,
    description: `${latest.value} ${text(latest.properties.unit_of_measure)} gauge height`,
    properties: {
      source_record_id: String(latest.feature.id),
      monitoring_location_id: source.monitoring_location_id,
      role: source.role,
      parameter_code: source.parameter_code,
      statistic_id: text(latest.properties.statistic_id),
      value: latest.value,
      unit_of_measure: text(latest.properties.unit_of_measure),
      approval_status: text(latest.properties.approval_status),
      qualifier: latest.properties.qualifier ?? null,
      last_modified: iso(latest.properties.last_modified),
    },
  }
  return result([record], dataState, rejectedCount ? "observations_rejected" : null, rejectedCount)
}

function countyMask(records, county) {
  return (records || []).find((record) => record.source_id === "nys_civil_boundaries" && record.scope_key === county.toLowerCase())?.geometry || null
}

function normalizeDec(source, payload, fetchedAt, evaluatedAt, geographyRecords) {
  if (payload?.type !== "FeatureCollection" || !Array.isArray(payload.features)) return unavailable("malformed_payload")
  if (payload.features.length === 0) return partial("empty_payload")
  const masks = { Nassau: countyMask(geographyRecords, "Nassau"), Suffolk: countyMask(geographyRecords, "Suffolk") }
  if (!masks.Nassau || !masks.Suffolk) return unavailable("missing_spatial_mask")
  const records = payload.features.map((feature) => {
    const properties = feature?.properties
    const county = text(properties?.COUNTY)
    if (feature?.type !== "Feature" || !validPoint(feature.geometry) || !["Nassau", "Suffolk"].includes(county)) return null
    if (!geometryIntersectsMask(feature.geometry, masks[county])) return null
    const sourceRecordId = text(properties.OBJECTID) || text(feature.id)
    const siteCode = text(properties.SITECODE)
    const title = text(properties.SITENAME)
    if (!sourceRecordId || !siteCode || !title) return null
    return {
      ...baseRecord(source, fetchedAt, null, feature.geometry, "current"),
      geography: county.toLowerCase(),
      category: text(properties.PROGRAM),
      severity: null,
      status: null,
      title,
      description: [text(properties.LOCALITY), text(properties.TOWN), county].filter(Boolean).join(", ") || null,
      properties: {
        source_record_id: sourceRecordId,
        site_code: siteCode,
        program: text(properties.PROGRAM),
        site_class: text(properties.SITECLASS),
        county,
        town: text(properties.TOWN),
        locality: text(properties.LOCALITY),
        zip_code: text(properties.ZIPCODE),
        detail_url: text(properties.DETAIL_URL),
        layer_url: source.endpoint,
      },
      source_url: text(properties.DETAIL_URL) || source.endpoint,
    }
  }).filter(Boolean)
  const rejectedCount = payload.features.length - records.length
  const dataState = observationState(null, fetchedAt, source.stale_after_seconds, evaluatedAt, rejectedCount)
  for (const record of records) record.data_state = dataState
  return result(records, dataState, rejectedCount ? "features_rejected" : records.length ? null : "empty_payload", rejectedCount)
}

function result(records, dataState, reason, rejectedCount) {
  return { records, data_state: dataState, reason, rejected_count: rejectedCount }
}

function unavailable(reason) {
  return result([], "unavailable", reason, 0)
}

function partial(reason, rejectedCount = 0) {
  return result([], "partial", reason, rejectedCount)
}

export function normalizeRegionalPayload(source, payload, fetchedAt, evaluatedAt = fetchedAt, geographyRecords = []) {
  if (source.family === "noaa_coops") return normalizeCoops(source, payload, fetchedAt, evaluatedAt)
  if (source.family === "usgs_ogc") return normalizeUsgs(source, payload, fetchedAt, evaluatedAt)
  if (source.family === "arcgis_map_server") return normalizeDec(source, payload, fetchedAt, evaluatedAt, geographyRecords)
  return unavailable("unsupported_regional_source_family")
}

export async function fetchRegionalSource(source, {
  fetchImpl = fetch,
  fetchedAt = new Date().toISOString(),
  evaluatedAt = fetchedAt,
  geographyRecords = [],
} = {}) {
  if (!source?.enabled) return { ...unavailable(source?.gate || "source_disabled"), fetched_at: null }
  try {
    const response = await fetchImpl(buildRegionalSourceUrl(source, { evaluatedAt }), {
      headers: { Accept: "application/geo+json, application/json" },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return { ...normalizeRegionalPayload(source, await response.json(), fetchedAt, evaluatedAt, geographyRecords), fetched_at: fetchedAt }
  } catch (error) {
    return { ...unavailable(error?.message || "request_failed"), fetched_at: fetchedAt }
  }
}
