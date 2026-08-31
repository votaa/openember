export function normalizeMapFeature(feature = {}) {
  const title = feature.title || feature.name || "Map feature"
  return {
    title,
    name: feature.name || title,
    description: feature.description || feature.note || "",
    sourceName: feature.sourceName || feature.source_name || feature.layerLabel || "Map layer",
    layerLabel: feature.layerLabel || feature.sourceName || feature.source_name || "Map layer",
    geometryType: feature.geometryType || feature.geometry_type || "unknown",
    observedAt: feature.observedAt || feature.observed_at || null,
    fetchedAt: feature.fetchedAt || feature.fetched_at || null,
    attribution: feature.attribution || null,
    color: feature.color || "#60a5fa",
  }
}

export function mapFeatureChatPrompt(feature = {}) {
  const normalized = normalizeMapFeature(feature)
  return `Tell me about emergency considerations for ${normalized.name} — ${normalized.description}`
}
