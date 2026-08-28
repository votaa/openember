export function appendCartoApiKey(tileUrl, apiKey) {
  const key = apiKey?.trim()
  return key ? `${tileUrl}?key=${encodeURIComponent(key)}` : tileUrl
}
