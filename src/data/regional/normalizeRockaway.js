import { geometryIntersectsMask } from "./regionalGeography.js"

const VALID_DATA_STATES = new Set([
  "current",
  "stale",
  "partial",
  "unavailable",
  "access_required",
])

function addSeconds(isoTimestamp, seconds) {
  const instant = new Date(isoTimestamp)
  if (Number.isNaN(instant.getTime())) throw new Error("invalid_fetched_at")
  return new Date(instant.getTime() + Number(seconds || 0) * 1000).toISOString()
}

function normalizedText(value) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text || null
}

function matchesFieldScope(row, scope) {
  return (scope.fields || []).every(({ field, values }) => {
    const actual = normalizedText(row[field])?.toUpperCase()
    return actual !== null && values.some((value) => String(value).toUpperCase() === actual)
  })
}

function recordGeometry(row, geometryContract) {
  if (geometryContract?.kind === "none") return null
  if (geometryContract?.kind === "feature_geometry") return row?.geometry || null
  if (geometryContract?.kind !== "point_fields") throw new Error("unsupported_geometry_contract")

  const properties = row?.type === "Feature" ? row.properties : row
  const latitude = Number(properties?.[geometryContract.latitude_field])
  const longitude = Number(properties?.[geometryContract.longitude_field])
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
  return { type: "Point", coordinates: [longitude, latitude] }
}

function recordStatus(row, contract) {
  if (contract.status_field) return normalizedText(row[contract.status_field])
  if (contract.status_presence_field) {
    return normalizedText(row[contract.status_presence_field])
      ? contract.status_present_value
      : contract.status_missing_value
  }
  return null
}

function observedTimestamp(row, source, contract) {
  const dateValue = normalizedText(row[contract.observed_at_field])
  const timeValue = normalizedText(row[contract.observed_time_field])
  if (dateValue && timeValue) return `${dateValue.slice(0, 10)}T${timeValue}`
  return dateValue || normalizedText(source.source_updated_at)
}

function maskForScope(geographyRecords, scope) {
  return (geographyRecords || []).find((record) => (
    record.source_id === scope.mask_source_id && record.scope_key === scope.mask_scope_key
  ))?.geometry || null
}

function matchesScope(row, scope, geometry, geographyRecords) {
  if (scope?.kind === "all_fields") return matchesFieldScope(row, scope)
  if (scope?.kind === "geometry_intersects") {
    const mask = maskForScope(geographyRecords, scope)
    return mask ? geometryIntersectsMask(geometry, mask) : false
  }
  return false
}

export function normalizeRockawayRecord(source, row, fetchedAt, dataState = "current", geographyRecords = []) {
  if (!source?.normalization) throw new Error("source_not_normalizable")
  if (!VALID_DATA_STATES.has(dataState)) throw new Error("invalid_data_state")
  if (!row || typeof row !== "object" || Array.isArray(row)) return null

  const contract = source.normalization
  const propertiesRow = row?.type === "Feature" ? row.properties : row
  if (!propertiesRow || typeof propertiesRow !== "object" || Array.isArray(propertiesRow)) return null

  const geometry = recordGeometry(row, contract.geometry)
  if (contract.geometry?.kind !== "none" && !geometry) return null
  if (!matchesScope(propertiesRow, contract.scope, geometry, geographyRecords)) return null

  const sourceRecordId = normalizedText(propertiesRow[contract.id_field])
  const observedAt = observedTimestamp(propertiesRow, source, contract)
  const title = normalizedText(propertiesRow[contract.title_field])
  if (!sourceRecordId || !observedAt || !title) return null

  const description = (contract.description_fields || [])
    .map((field) => normalizedText(propertiesRow[field]))
    .filter(Boolean)
    .join(" ") || null

  const properties = {}
  for (const field of contract.audit_properties || []) {
    if (propertiesRow[field] !== undefined && propertiesRow[field] !== null) properties[field] = propertiesRow[field]
  }
  properties.source_record_id = sourceRecordId
  if (source.source_timestamp_timezone) {
    properties.source_timestamp_timezone = source.source_timestamp_timezone
  }

  return {
    source_id: source.id,
    source_name: source.name,
    owner: source.owner,
    geography: "rockaway",
    observed_at: observedAt,
    fetched_at: fetchedAt,
    expires_at: addSeconds(fetchedAt, source.stale_after_seconds),
    geometry,
    category: normalizedText(propertiesRow[contract.category_field]) || normalizedText(contract.category_value),
    severity: contract.severity_field ? normalizedText(propertiesRow[contract.severity_field]) : null,
    status: normalizedText(contract.status_value) || recordStatus(propertiesRow, contract),
    title,
    description,
    properties,
    source_url: source.endpoint,
    attribution: source.attribution,
    data_state: dataState,
  }
}

export function normalizeRockawayPayload(source, payload, fetchedAt, evaluatedAt = fetchedAt, geographyRecords = []) {
  if (!source?.normalization) {
    return { records: [], data_state: source?.failure_state || "unavailable", reason: "source_not_normalizable", rejected_count: 0 }
  }
  const rows = source.normalization.payload_kind === "feature_collection"
    ? payload?.type === "FeatureCollection" && Array.isArray(payload.features) ? payload.features : null
    : Array.isArray(payload) ? payload : null
  if (!rows) {
    return { records: [], data_state: "unavailable", reason: "malformed_payload", rejected_count: 0 }
  }
  if (rows.length === 0) {
    return { records: [], data_state: "partial", reason: "empty_payload", rejected_count: 0 }
  }

  const expiresAt = addSeconds(fetchedAt, source.stale_after_seconds)
  const isStale = new Date(evaluatedAt).getTime() > new Date(expiresAt).getTime()
  const scope = source.normalization.scope
  if (scope?.kind === "geometry_intersects" && !maskForScope(geographyRecords, scope)) {
    return { records: [], data_state: "unavailable", reason: "missing_spatial_mask", rejected_count: 0 }
  }
  const provisional = rows
    .map((row) => normalizeRockawayRecord(source, row, fetchedAt, "current", geographyRecords))
    .filter(Boolean)
  const rejectedCount = rows.length - provisional.length
  const dataState = isStale ? "stale" : rejectedCount > 0 ? "partial" : "current"
  const records = provisional.map((record) => ({ ...record, data_state: dataState }))

  return {
    records,
    data_state: dataState,
    reason: rejectedCount > 0 ? "records_rejected" : null,
    rejected_count: rejectedCount,
  }
}
