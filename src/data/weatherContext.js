// Preserve forecast coverage and units instead of passing truncated raw JSON.
export function summarizeWeather(data) {
  const p = data?.properties
  if (p?.periods) {
    const periods = p.periods.slice(0, p.periods.some(row => row.name) ? 14 : 48)
    return `Updated: ${p.updated || p.generatedAt || "unknown"}\n` + periods.map(row =>
      `${row.name || "Hourly"} [${row.startTime} — ${row.endTime}]: ${row.detailedForecast || row.shortForecast || ""}; ${row.temperature}°${row.temperatureUnit}; wind ${row.windSpeed || "unknown"} ${row.windDirection || ""}; precipitation probability ${row.probabilityOfPrecipitation?.value ?? "unknown"}%`,
    ).join("\n")
  }
  if (p?.quantitativePrecipitation || p?.windSpeed) {
    return `Updated: ${p.updateTime || "unknown"}\n` + ["quantitativePrecipitation", "probabilityOfPrecipitation", "windSpeed", "windGust"].filter(key => p[key]).map(key =>
      `${key} (${p[key].uom || "unknown units"}):\n` + (p[key].values || []).slice(0, 48).map(row => `  ${row.validTime}: ${row.value ?? "unavailable"}`).join("\n"),
    ).join("\n")
  }
  return null
}
