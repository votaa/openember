import {
  GEOGRAPHY_FILTER_MODES,
  filterFeaturesByMode,
  masksForMode,
} from "./regional/regionalGeography.js"

export const MAP_BUILDER_FILTER_MODES = Object.freeze({
  UNFILTERED: "unfiltered",
  OPERATIONAL: GEOGRAPHY_FILTER_MODES.OPERATIONAL,
  PSEG_LONG_ISLAND: GEOGRAPHY_FILTER_MODES.PSEG_LONG_ISLAND,
})

export const MAP_BUILDER_FILTER_LABELS = Object.freeze({
  [MAP_BUILDER_FILTER_MODES.UNFILTERED]: "Unfiltered",
  [MAP_BUILDER_FILTER_MODES.OPERATIONAL]: "Limit to operational geography",
  [MAP_BUILDER_FILTER_MODES.PSEG_LONG_ISLAND]: "Limit to PSEG Long Island territory",
})

export const MAP_BUILDER_PRESETS = Object.freeze([
  { id:"fema_flood_hazards", name:"USA Flood Hazard Areas (FEMA)", url:"https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Flood_Hazard_Reduced_Set_gdb/FeatureServer/0", type:"Feature Layer", owner:"FEMA / ArcGIS Living Atlas", color:"#60a5fa" },
  { id:"historical_hurricane_tracks", name:"Historical Hurricane Tracks (NOAA/IBTrACS)", url:"https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/IBTrACS_ALL_list_v04r00_lines_1/FeatureServer/0", type:"Feature Layer", owner:"NOAA / Esri U.S. Federal Datasets", color:"#f87171" },
  { id:"usa_hospitals", name:"USA Hospitals/Medical Centers (USGS)", url:"https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Structures_Medical_Emergency_Response_v1/FeatureServer/0", type:"Feature Layer", owner:"USGS / Esri U.S. Federal Datasets", color:"#34d399" },
  { id:"usa_fire_ems", name:"USA Fire/EMS Stations (USGS)", url:"https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Structures_Medical_Emergency_Response_v1/FeatureServer/2", type:"Feature Layer", owner:"USGS / Esri U.S. Federal Datasets", color:"#fb923c" },
  { id:"fema_disaster_totals", name:"FEMA Disaster Declaration Totals (2000–2025)", url:"https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/Total_FEMA_Disaster_Declarations_2000_2021/FeatureServer/0", type:"Feature Layer", owner:"FEMA ArcGIS Online", color:"#facc15" },
  { id:"world_imagery", name:"World Imagery", url:"https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer", type:"Map Service", owner:"Esri World Imagery", color:"#a78bfa" },
])

export function mapBuilderFilterSupported(layer) {
  const type = String(layer?.sourceType || layer?.type || "").toLowerCase()
  const url = String(layer?.url || "")
  return (type.includes("feature layer") || type.includes("feature service"))
    && /\/FeatureServer(?:\/\d+)?\/?$/i.test(url)
}

export function filterMasksByMode(geographyRecords, mode) {
  if (mode === MAP_BUILDER_FILTER_MODES.UNFILTERED) return []
  return masksForMode(geographyRecords, mode)
}

// ArcGIS FeatureServer queries need a single polygon geometry. Multiple
// disconnected masks are represented as multiple rings in the same polygon.
export function arcGISGeometryForMode(geographyRecords, mode) {
  const rings = filterMasksByMode(geographyRecords, mode).flatMap((geometry) => {
    if (geometry.type === "Polygon") return geometry.coordinates
    if (geometry.type === "MultiPolygon") return geometry.coordinates.flat()
    return []
  }).map((ring) => ring.slice().reverse())
  return rings.length ? { rings, spatialReference:{wkid:4326} } : null
}

export function evaluateMapBuilderFilter(layer, geographyRecords) {
  const records = Array.isArray(layer?.records) ? layer.records : []
  const requestedMode = layer?.filterMode || MAP_BUILDER_FILTER_MODES.UNFILTERED
  const supported = mapBuilderFilterSupported(layer)
  const base = {
    requestedMode,
    effectiveMode: MAP_BUILDER_FILTER_MODES.UNFILTERED,
    supported,
    inputCount: records.length,
    outputCount: records.length,
    rejectedCount: 0,
    records,
    reason: null,
  }
  if (requestedMode === MAP_BUILDER_FILTER_MODES.UNFILTERED) return base
  if (layer?.filterLoading) return { ...base, reason:"loading_filtered_records" }
  if (layer?.filterError) return { ...base, reason:layer.filterError }
  if (!supported) return { ...base, reason:"unsupported_layer_type" }
  try {
    const filtered = filterFeaturesByMode(records, geographyRecords, requestedMode)
    return {
      ...base,
      effectiveMode: requestedMode,
      outputCount: filtered.length,
      rejectedCount: records.length - filtered.length,
      records: filtered,
    }
  } catch (error) {
    return { ...base, reason:error.message || "geography_filter_unavailable" }
  }
}
