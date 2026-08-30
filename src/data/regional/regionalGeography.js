const VALID_DATA_STATES = new Set(["current", "stale", "partial", "unavailable"])
export const GEOGRAPHY_FILTER_MODES = Object.freeze({
  OPERATIONAL: "operational",
  PSEG_LONG_ISLAND: "pseg_long_island",
})

function isoInstant(value) {
  if (value === null || value === undefined || value === "") return null
  const instant = typeof value === "number" ? new Date(value) : new Date(String(value))
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString()
}

function addSeconds(value, seconds) {
  const instant = new Date(value)
  if (Number.isNaN(instant.getTime())) throw new Error("invalid_fetched_at")
  return new Date(instant.getTime() + Number(seconds || 0) * 1000).toISOString()
}

function text(value) {
  if (value === null || value === undefined) return null
  const result = String(value).trim()
  return result || null
}

function coordinate(value) {
  return Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(Number(value[0]))
    && Number.isFinite(Number(value[1]))
    && Number(value[0]) >= -180
    && Number(value[0]) <= 180
    && Number(value[1]) >= -90
    && Number(value[1]) <= 90
}

function validRing(ring) {
  if (!Array.isArray(ring) || ring.length < 4 || !ring.every(coordinate)) return false
  const first = ring[0]
  const last = ring[ring.length - 1]
  return Number(first[0]) === Number(last[0]) && Number(first[1]) === Number(last[1])
}

export function validPolygonGeometry(geometry) {
  if (!geometry || !Array.isArray(geometry.coordinates)) return false
  if (geometry.type === "Polygon") {
    return geometry.coordinates.length > 0 && geometry.coordinates.every(validRing)
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.length > 0
      && geometry.coordinates.every((polygon) => Array.isArray(polygon) && polygon.length > 0 && polygon.every(validRing))
  }
  return false
}

function pointOnSegment(point, start, end) {
  const [px, py] = point.map(Number)
  const [ax, ay] = start.map(Number)
  const [bx, by] = end.map(Number)
  const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax)
  if (Math.abs(cross) > 1e-10) return false
  return px >= Math.min(ax, bx) - 1e-10 && px <= Math.max(ax, bx) + 1e-10
    && py >= Math.min(ay, by) - 1e-10 && py <= Math.max(ay, by) + 1e-10
}

function ringLocation(point, ring) {
  let inside = false
  for (let index = 0, prior = ring.length - 1; index < ring.length; prior = index++) {
    const currentPoint = ring[index]
    const priorPoint = ring[prior]
    if (pointOnSegment(point, priorPoint, currentPoint)) return "boundary"
    const [x, y] = point.map(Number)
    const [xi, yi] = currentPoint.map(Number)
    const [xj, yj] = priorPoint.map(Number)
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside ? "inside" : "outside"
}

function pointInPolygonCoordinates(point, polygon) {
  const outer = ringLocation(point, polygon[0])
  if (outer === "outside") return false
  if (outer === "boundary") return true
  for (const hole of polygon.slice(1)) {
    const location = ringLocation(point, hole)
    if (location === "inside") return false
    if (location === "boundary") return true
  }
  return true
}

export function pointInPolygon(point, geometry) {
  if (!coordinate(point) || !validPolygonGeometry(geometry)) return false
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates
  return polygons.some((polygon) => pointInPolygonCoordinates(point, polygon))
}

function orientation(a, b, c) {
  const value = (Number(b[1]) - Number(a[1])) * (Number(c[0]) - Number(b[0]))
    - (Number(b[0]) - Number(a[0])) * (Number(c[1]) - Number(b[1]))
  return Math.abs(value) <= 1e-10 ? 0 : value > 0 ? 1 : 2
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c)
  const o2 = orientation(a, b, d)
  const o3 = orientation(c, d, a)
  const o4 = orientation(c, d, b)
  if (o1 !== o2 && o3 !== o4) return true
  return (o1 === 0 && pointOnSegment(c, a, b))
    || (o2 === 0 && pointOnSegment(d, a, b))
    || (o3 === 0 && pointOnSegment(a, c, d))
    || (o4 === 0 && pointOnSegment(b, c, d))
}

function polygonRings(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates
  return polygons.flatMap((polygon) => polygon)
}

function outerRings(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates
  return polygons.map((polygon) => polygon[0])
}

function polygonBoundariesIntersect(left, right) {
  for (const leftRing of polygonRings(left)) {
    for (const rightRing of polygonRings(right)) {
      for (let li = 1; li < leftRing.length; li += 1) {
        for (let ri = 1; ri < rightRing.length; ri += 1) {
          if (segmentsIntersect(leftRing[li - 1], leftRing[li], rightRing[ri - 1], rightRing[ri])) return true
        }
      }
    }
  }
  return false
}

export function polygonsIntersect(left, right) {
  if (!validPolygonGeometry(left) || !validPolygonGeometry(right)) return false
  if (polygonBoundariesIntersect(left, right)) return true
  return outerRings(left).some((ring) => pointInPolygon(ring[0], right))
    || outerRings(right).some((ring) => pointInPolygon(ring[0], left))
}

function lineCoordinates(geometry) {
  if (geometry?.type === "LineString") return [geometry.coordinates]
  if (geometry?.type === "MultiLineString") return geometry.coordinates
  return []
}

function lineIntersectsPolygon(line, polygon) {
  if (!Array.isArray(line) || line.length < 2 || !line.every(coordinate)) return false
  if (line.some((point) => pointInPolygon(point, polygon))) return true
  for (const ring of polygonRings(polygon)) {
    for (let li = 1; li < line.length; li += 1) {
      for (let ri = 1; ri < ring.length; ri += 1) {
        if (segmentsIntersect(line[li - 1], line[li], ring[ri - 1], ring[ri])) return true
      }
    }
  }
  return false
}

export function geometryIntersectsMask(geometry, mask) {
  if (!validPolygonGeometry(mask) || !geometry) return false
  if (geometry.type === "Point") return pointInPolygon(geometry.coordinates, mask)
  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") return polygonsIntersect(geometry, mask)
  return lineCoordinates(geometry).some((line) => lineIntersectsPolygon(line, mask))
}

export function masksForMode(records, mode) {
  const allowed = mode === GEOGRAPHY_FILTER_MODES.OPERATIONAL
    ? new Set(["nassau", "suffolk", "rockaway"])
    : mode === GEOGRAPHY_FILTER_MODES.PSEG_LONG_ISLAND
      ? new Set(["pseg_long_island"])
      : null
  if (!allowed) throw new Error("unsupported_geography_filter_mode")
  return (records || []).filter((record) => allowed.has(record.scope_key)).map((record) => record.geometry)
}

export function filterFeaturesByMode(features, geographyRecords, mode) {
  const masks = masksForMode(geographyRecords, mode)
  if (masks.length === 0) throw new Error("missing_geography_masks")
  return (features || []).filter((feature) => masks.some((mask) => geometryIntersectsMask(feature?.geometry, mask)))
}

export function buildGeographyQueryUrl(source) {
  const url = new URL(source.endpoint)
  if (source.family === "arcgis_feature_server") {
    url.pathname = `${url.pathname.replace(/\/$/, "")}/query`
    url.searchParams.set("where", source.required_filter)
    url.searchParams.set("outFields", (source.query_out_fields || ["*"]).join(","))
    url.searchParams.set("returnGeometry", "true")
    url.searchParams.set("outSR", "4326")
    url.searchParams.set("f", "geojson")
  } else if (source.family === "socrata_geojson") {
    if (source.query_select) url.searchParams.set("$select", source.query_select)
    if (source.required_filter) url.searchParams.set("$where", source.required_filter)
    url.searchParams.set("$limit", String(source.query_limit || 100))
  } else {
    throw new Error("unsupported_geography_source_family")
  }
  return url.toString()
}

function normalizedFeature(source, feature, fetchedAt) {
  const contract = source.spatial
  if (!contract || feature?.type !== "Feature" || !validPolygonGeometry(feature.geometry)) return null
  const properties = feature.properties
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return null
  const rawKey = text(properties[contract.key_field])
  if (!rawKey || !(contract.allowed_values || []).map(String).includes(rawKey)) return null
  const scopeKey = contract.scope_key_by_value?.[rawKey]
  if (!scopeKey) return null
  const sourceRecordId = text(properties[contract.id_field])
  if (!sourceRecordId) return null
  const selectedProperties = {}
  for (const field of contract.property_fields || []) {
    if (properties[field] !== undefined && properties[field] !== null) selectedProperties[field] = properties[field]
  }
  selectedProperties.source_record_id = sourceRecordId
  selectedProperties.scope_key = scopeKey
  const observedAt = isoInstant(properties[contract.observed_at_field]) || isoInstant(source.source_updated_at)
  return {
    source_id: source.id,
    source_name: source.name,
    owner: source.owner,
    geography: contract.geography_by_value?.[rawKey] || source.geographies?.[0] || "regional",
    scope_key: scopeKey,
    spatial_role: contract.role,
    observed_at: observedAt,
    fetched_at: fetchedAt,
    expires_at: addSeconds(fetchedAt, source.stale_after_seconds),
    geometry: feature.geometry,
    title: contract.title_by_value?.[rawKey] || text(properties[contract.name_field]) || rawKey,
    properties: selectedProperties,
    source_url: source.endpoint,
    attribution: source.attribution,
    disclaimer: source.disclaimer || null,
    data_state: "current",
  }
}

export function normalizeGeographyPayload(source, payload, fetchedAt, evaluatedAt = fetchedAt) {
  if (!source?.spatial) return { records: [], data_state: source?.failure_state || "unavailable", reason: "source_not_spatial", rejected_count: 0 }
  if (!payload || payload.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
    return { records: [], data_state: "unavailable", reason: "malformed_payload", rejected_count: 0 }
  }
  if (payload.features.length === 0) {
    return { records: [], data_state: "partial", reason: "empty_payload", rejected_count: 0 }
  }
  const records = payload.features.map((feature) => normalizedFeature(source, feature, fetchedAt)).filter(Boolean)
  const rejectedCount = payload.features.length - records.length
  const expected = new Set(source.spatial.expected_scope_keys || [])
  const actual = new Set(records.map((record) => record.scope_key))
  const missing = [...expected].filter((scopeKey) => !actual.has(scopeKey)).sort()
  const stale = new Date(evaluatedAt).getTime() > new Date(addSeconds(fetchedAt, source.stale_after_seconds)).getTime()
  const dataState = stale ? "stale" : rejectedCount > 0 || missing.length > 0 ? "partial" : "current"
  if (!VALID_DATA_STATES.has(dataState)) throw new Error("invalid_data_state")
  for (const record of records) record.data_state = dataState
  return {
    records,
    data_state: dataState,
    reason: rejectedCount > 0 ? "features_rejected" : missing.length > 0 ? "missing_expected_features" : null,
    rejected_count: rejectedCount,
    missing_scope_keys: missing,
  }
}

export async function fetchGeographySource(source, fetchImpl = fetch, fetchedAt = new Date().toISOString()) {
  if (!source?.enabled) return { records: [], data_state: source?.failure_state || "unavailable", reason: source?.gate || "source_disabled", rejected_count: 0, fetched_at: null }
  try {
    const response = await fetchImpl(buildGeographyQueryUrl(source), { headers: { Accept: "application/geo+json, application/json" } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const result = normalizeGeographyPayload(source, await response.json(), fetchedAt)
    return { ...result, fetched_at: fetchedAt }
  } catch (error) {
    return { records: [], data_state: "unavailable", reason: error?.message || "request_failed", rejected_count: 0, fetched_at: fetchedAt }
  }
}
