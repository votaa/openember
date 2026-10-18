// Visibility is independent of records, filters, and source health.
export function overlaySelection(values) {
  if (!values.length) return "Unavailable"
  return values.every(Boolean) ? "All" : values.some(Boolean) ? "Some" : "Off"
}
export function participatingRegionalIds(eligibleIds, enrolledIds) {
  return eligibleIds.filter(id => enrolledIds.includes(id))
}
export function visibleAddedLayers(layers) {
  return Object.values(layers).filter(layer => layer.visible !== false)
}
