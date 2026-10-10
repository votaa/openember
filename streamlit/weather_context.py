"""Forecast evidence contract shared with the React application."""


def summarize_weather(data):
    p = data.get("properties", {}) if isinstance(data, dict) else {}
    if "periods" in p:
        periods = p["periods"]
        limit = 14 if any(row.get("name") for row in periods) else 48
        lines = [f"Updated: {p.get('updated') or p.get('generatedAt') or 'unknown'}"]
        for row in periods[:limit]:
            probability = (row.get("probabilityOfPrecipitation") or {}).get("value")
            lines.append(
                f"{row.get('name') or 'Hourly'} [{row.get('startTime')} — {row.get('endTime')}]: "
                f"{row.get('detailedForecast') or row.get('shortForecast') or ''}; "
                f"{row.get('temperature')}°{row.get('temperatureUnit')}; "
                f"wind {row.get('windSpeed') or 'unknown'} {row.get('windDirection') or ''}; "
                f"precipitation probability {probability if probability is not None else 'unknown'}%"
            )
        return "\n".join(lines)
    if "quantitativePrecipitation" in p or "windSpeed" in p:
        lines = [f"Updated: {p.get('updateTime') or 'unknown'}"]
        for key in ("quantitativePrecipitation", "probabilityOfPrecipitation", "windSpeed", "windGust"):
            if key not in p:
                continue
            series = p[key]
            lines.append(f"{key} ({series.get('uom') or 'unknown units'}):")
            for row in series.get("values", [])[:48]:
                value = row.get("value")
                lines.append(f"  {row.get('validTime')}: {value if value is not None else 'unavailable'}")
        return "\n".join(lines)
    return None
