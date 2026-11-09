export function appendCartoApiKey(tileUrl, apiKey) {
  const key = apiKey?.trim()
  return key ? `${tileUrl}?key=${encodeURIComponent(key)}` : tileUrl
}

export const BASEMAP_OSM = "OpenStreetMap"
export const BASEMAP_CARTO = "CARTO Dark Matter"
export function basemapOptions(apiKey) {
  return [BASEMAP_OSM, ...(apiKey?.trim() ? [BASEMAP_CARTO] : [])]
}
export function basemapConfig(apiKey, selected = BASEMAP_OSM) {
  if (apiKey?.trim() && selected === BASEMAP_CARTO) {
    return { name: BASEMAP_CARTO,
      url: appendCartoApiKey("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", apiKey),
      options: { attribution: '&copy; OpenStreetMap contributors &copy; CARTO', maxZoom: 19, subdomains: "abcd" } }
  }
  return { name: BASEMAP_OSM, url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19 } }
}
