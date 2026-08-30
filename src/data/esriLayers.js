const SERVICE_URL_PATTERN = /\/rest\/services\/.*\/(FeatureServer|MapServer)(?:\/\d+)?\/?$/i
const LAYER_URL_PATTERN = /\/(FeatureServer|MapServer)\/(\d+)$/i
const DEFAULT_MAX_FEATURES = 500

function cleanServiceUrl(value) {
  if (!value) return ""
  try {
    const url = new URL(String(value).trim())
    url.search = ""
    url.hash = ""
    return url.toString().replace(/\/$/, "")
  } catch {
    return ""
  }
}

function arcgisError(payload, fallback) {
  return payload?.error?.message || payload?.error?.details?.filter(Boolean)?.join("; ") || fallback
}

async function fetchJson(url, fetchImpl, timeoutMs = 15000) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
  let payload = null
  try {
    payload = await response.json()
  } catch {
    throw new Error(`ArcGIS returned an unreadable response (HTTP ${response.status})`)
  }
  if (!response.ok || payload?.error) {
    throw new Error(arcgisError(payload, `ArcGIS request failed (HTTP ${response.status})`))
  }
  return payload
}

export function isQueryableArcGISServiceUrl(value) {
  return SERVICE_URL_PATTERN.test(cleanServiceUrl(value))
}

export async function discoverArcGISLayers(serviceUrl, { fetchImpl = fetch } = {}) {
  const resolvedUrl = cleanServiceUrl(serviceUrl)
  if (!isQueryableArcGISServiceUrl(resolvedUrl)) {
    throw new Error("This item does not expose a queryable FeatureServer or MapServer URL")
  }

  const metadata = await fetchJson(`${resolvedUrl}?f=json`, fetchImpl)
  const layerMatch = resolvedUrl.match(LAYER_URL_PATTERN)
  if (layerMatch) {
    return [{
      id: Number(layerMatch[2]),
      name: metadata.name || `Layer ${layerMatch[2]}`,
      url: resolvedUrl,
      metadata,
    }]
  }

  const layers = Array.isArray(metadata.layers) ? metadata.layers : []
  if (!layers.length) throw new Error("This ArcGIS service does not expose any feature layers")
  return layers.map(layer => ({
    id: Number(layer.id),
    name: layer.name || `Layer ${layer.id}`,
    url: `${resolvedUrl}/${layer.id}`,
    metadata: null,
  }))
}

function normalizedGeometry(geometry) {
  if (!geometry || typeof geometry !== "object") return null
  if (geometry.type && Array.isArray(geometry.coordinates)) return geometry
  if (Number.isFinite(Number(geometry.x)) && Number.isFinite(Number(geometry.y))) {
    return { type: "Point", coordinates: [Number(geometry.x), Number(geometry.y)] }
  }
  if (Array.isArray(geometry.paths) && geometry.paths.length) {
    return geometry.paths.length === 1
      ? { type: "LineString", coordinates: geometry.paths[0] }
      : { type: "MultiLineString", coordinates: geometry.paths }
  }
  if (Array.isArray(geometry.rings) && geometry.rings.length) {
    return { type: "Polygon", coordinates: geometry.rings }
  }
  return null
}

function displayValue(properties, metadata) {
  const preferredFields = [
    metadata?.displayField,
    "name", "Name", "NAME", "title", "Title", "TITLE",
    "label", "Label", "LABEL", "description", "Description",
  ].filter(Boolean)
  for (const field of preferredFields) {
    const value = properties?.[field]
    if (value !== undefined && value !== null && String(value).trim()) return String(value)
  }
  const firstValue = Object.values(properties || {}).find(value => value !== null && typeof value !== "object")
  return firstValue === undefined ? "ArcGIS feature" : String(firstValue)
}

function featureDescription(properties, title) {
  return Object.entries(properties || {})
    .filter(([, value]) => value !== null && value !== "" && typeof value !== "object")
    .filter(([, value]) => String(value) !== title)
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ")
}

export function normalizeArcGISFeatures(payload, { item, layer, fetchedAt = new Date().toISOString() } = {}) {
  const metadata = layer?.metadata || {}
  return (payload?.features || []).flatMap((feature, index) => {
    const geometry = normalizedGeometry(feature?.geometry)
    if (!geometry) return []
    const properties = feature.properties || feature.attributes || {}
    const title = displayValue(properties, metadata)
    return [{
      source_id: `esri_${item?.id || "item"}_${layer?.id ?? "layer"}`,
      source_name: layer?.name && layer.name !== item?.title ? `${item?.title} — ${layer.name}` : item?.title || layer?.name || "ArcGIS layer",
      owner: item?.owner || "ArcGIS Online",
      observed_at: null,
      fetched_at: fetchedAt,
      geometry,
      title: title || `Feature ${index + 1}`,
      description: featureDescription(properties, title),
      properties,
      source_url: layer?.url || item?.url || "",
      attribution: `ArcGIS Online · ${item?.owner || "public source"}`,
      data_state: "current",
    }]
  })
}

async function queryLayer(layerUrl, params, fetchImpl) {
  const queryUrl = `${layerUrl}/query?${new URLSearchParams(params)}`
  const response = await fetchImpl(queryUrl, { signal: AbortSignal.timeout(20000) })
  let payload = null
  try { payload = await response.json() } catch { /* handled below */ }
  return { response, payload }
}

export async function fetchArcGISLayer(item, layer, {
  fetchImpl = fetch,
  maxFeatures = DEFAULT_MAX_FEATURES,
  entryPath = "search",
  color = item?.color || "#a78bfa",
  geometry = null,
} = {}) {
  const discovered = layer?.url ? layer : (await discoverArcGISLayers(item?.url, { fetchImpl }))[0]
  if (!discovered?.url) throw new Error("Select an ArcGIS feature layer first")

  const metadata = discovered.metadata || await fetchJson(`${discovered.url}?f=json`, fetchImpl)
  const capabilities = String(metadata.capabilities || "")
  if (capabilities && !capabilities.toLowerCase().includes("query")) {
    throw new Error("The selected ArcGIS layer does not allow feature queries")
  }
  const resolvedLayer = { ...discovered, name: discovered.name || metadata.name, metadata }
  const params = {
    where: "1=1",
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
    resultRecordCount: String(maxFeatures),
    f: "geojson",
  }
  if (geometry) {
    params.geometry = JSON.stringify(geometry)
    params.geometryType = "esriGeometryPolygon"
    params.spatialRel = "esriSpatialRelIntersects"
  }

  let { response, payload } = await queryLayer(resolvedLayer.url, params, fetchImpl)
  let format = "geojson"
  if (!response.ok || payload?.error || !payload) {
    ({ response, payload } = await queryLayer(resolvedLayer.url, { ...params, f: "json" }, fetchImpl))
    format = "arcgis-json"
  }
  if (!response.ok || payload?.error || !payload) {
    throw new Error(arcgisError(payload, `ArcGIS layer query failed (HTTP ${response.status})`))
  }

  const fetchedAt = new Date().toISOString()
  const records = normalizeArcGISFeatures(payload, { item, layer: resolvedLayer, fetchedAt })
  if (!records.length) throw new Error("The selected layer returned no supported map geometry")
  return {
    id: `esri_${item.id}_${resolvedLayer.id}`,
    ownerItemId: item.id,
    sublayerId: resolvedLayer.id,
    name: resolvedLayer.name && resolvedLayer.name !== item.title ? `${item.title} — ${resolvedLayer.name}` : item.title,
    color,
    icon: "⊕",
    type: "Feature Layer",
    sourceType: item.type || "Feature Layer",
    entryPath,
    filterMode: "unfiltered",
    records,
    count: records.length,
    url: resolvedLayer.url,
    originalUrl: item.url || resolvedLayer.url,
    attribution: `ArcGIS Online · ${item.owner || "public source"}`,
    format,
  }
}
