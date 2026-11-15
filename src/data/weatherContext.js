// Preserve forecast coverage and units instead of passing truncated raw JSON.
export function summarizeWeather(data) {
  const p = data?.properties
  if (typeof p?.timestamp === 'string') {
    const fields=['temperature','windSpeed','windGust','windDirection','relativeHumidity','visibility']
    return `Observed: ${p.timestamp}\nStation: ${p.station || 'unknown'}\nConditions: ${p.textDescription || 'unknown'}\n` + fields.filter(k=>p[k]).map(k=>`${k}: ${p[k].value ?? 'unavailable'} (${p[k].unitCode || 'unknown units'}; quality ${p[k].qualityControl || 'unknown'})`).join('\n')
  }
  if (p?.periods) {
    const periods = p.periods.slice(0, p.periods.some(row => row.name) ? 14 : 48)
    return `Updated: ${p.updated || p.generatedAt || "unknown"}\n` + periods.map(row =>
      `${row.name || "Hourly"} [${row.startTime} — ${row.endTime}]: ${row.detailedForecast || row.shortForecast || ""}; ${row.temperature}°${row.temperatureUnit}; wind ${row.windSpeed || "unknown"} ${row.windDirection || ""}; precipitation probability ${row.probabilityOfPrecipitation?.value ?? "unknown"}%`,
    ).join("\n")
  }
  if (Array.isArray(p?.quantitativePrecipitation?.values) || Array.isArray(p?.windSpeed?.values)) {
    return `Updated: ${p.updateTime || "unknown"}\n` + ["quantitativePrecipitation", "probabilityOfPrecipitation", "windSpeed", "windGust"].filter(key => p[key]).map(key =>
      `${key} (${p[key].uom || "unknown units"}):\n` + (p[key].values || []).slice(0, 48).map(row => `  ${row.validTime}: ${row.value ?? "unavailable"}`).join("\n"),
    ).join("\n")
  }
  return null
}
