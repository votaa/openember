"""CARTO basemap URL and attribution helpers."""

from urllib.parse import quote


CARTO_TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
CARTO_ATTRIBUTION = (
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> '
    'contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
)
OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
OSM_ATTRIBUTION = (
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
)


def basemap_config(api_key: str | None, selected: str = "OpenStreetMap") -> tuple[str, str, str]:
    """Return tile URL, attribution, and layer name for the selected basemap, falling back to OpenStreetMap."""
    key = (api_key or "").strip()
    if key and selected == "CARTO Dark Matter":
        return (
            f"{CARTO_TILE_URL}?key={quote(key, safe='')}",
            CARTO_ATTRIBUTION,
            "CARTO Dark Matter",
        )
    return OSM_TILE_URL, OSM_ATTRIBUTION, "OpenStreetMap"
