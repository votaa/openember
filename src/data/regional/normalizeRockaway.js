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

function matchesScope(row, scope) {
  if (!scope || scope.kind !== "all_fields") return false
  return (scope.fields || []).every(({ field, values }) => {
    const actual = normalizedText(row[field])?.toUpperCase()
    return actual !== null && values.some((value) => String(value).toUpperCase() === actual)
  })
}

function pointGeometry(row, geometryContract) {
  if (geometryContract?.kind === "none") return null
  if (geometryContract?.kind !== "point_fields") throw new Error("unsupported_geometry_contract")

  const latitude = Number(row[geometryContract.latitude_field])
  const longitude = Number(row[geometryContract.longitude_field])
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

export function normalizeRockawayRecord(source, row, fetchedAt, dataState = "current") {
  if (!source?.normalization) throw new Error("source_not_normalizable")
  if (!VALID_DATA_STATES.has(dataState)) throw new Error("invalid_data_state")
  if (!row || typeof row !== "object" || Array.isArray(row)) return null

  const contract = source.normalization
  if (!matchesScope(row, contract.scope)) return null

  const geometry = pointGeometry(row, contract.geometry)
  if (contract.geometry?.kind === "point_fields" && geometry === null) return null

  const sourceRecordId = normalizedText(row[contract.id_field])
  const observedAt = normalizedText(row[contract.observed_at_field])
  const title = normalizedText(row[contract.title_field])
  if (!sourceRecordId || !observedAt || !title) return null

  const description = (contract.description_fields || [])
    .map((field) => normalizedText(row[field]))
    .filter(Boolean)
    .join(" ") || null

  const properties = {}
  for (const field of contract.audit_properties || []) {
    if (row[field] !== undefined && row[field] !== null) properties[field] = row[field]
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
    category: normalizedText(row[contract.category_field]),
    severity: contract.severity_field ? normalizedText(row[contract.severity_field]) : null,
    status: recordStatus(row, contract),
    title,
    description,
    properties,
    source_url: source.endpoint,
    attribution: source.attribution,
    data_state: dataState,
  }
}

export function normalizeRockawayPayload(source, payload, fetchedAt, evaluatedAt = fetchedAt) {
  if (!source?.normalization) {
    return { records: [], data_state: source?.failure_state || "unavailable", reason: "source_not_normalizable", rejected_count: 0 }
  }
  if (!Array.isArray(payload)) {
    return { records: [], data_state: "unavailable", reason: "malformed_payload", rejected_count: 0 }
  }
  if (payload.length === 0) {
    return { records: [], data_state: "partial", reason: "empty_payload", rejected_count: 0 }
  }

  const expiresAt = addSeconds(fetchedAt, source.stale_after_seconds)
  const isStale = new Date(evaluatedAt).getTime() > new Date(expiresAt).getTime()
  const provisional = payload
    .map((row) => normalizeRockawayRecord(source, row, fetchedAt, "current"))
    .filter(Boolean)
  const rejectedCount = payload.length - provisional.length
  const dataState = isStale ? "stale" : rejectedCount > 0 ? "partial" : "current"
  const records = provisional.map((record) => ({ ...record, data_state: dataState }))

  return {
    records,
    data_state: dataState,
    reason: rejectedCount > 0 ? "records_rejected" : null,
    rejected_count: rejectedCount,
  }
}
