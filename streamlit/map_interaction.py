"""Pure helpers for map selection state and explicit chat actions."""

import base64
import html
import json
import re
from typing import Optional


FEATURE_METADATA_PREFIX = "OPENEMBER_FEATURE:"
MAP_RETURNED_OBJECTS = (
    "last_object_clicked_popup",
    "last_object_clicked_tooltip",
    "last_object_clicked",
    "last_object_clicked_count",
)


def _feature_metadata_token(feature: dict) -> str:
    payload = json.dumps(feature, ensure_ascii=False, separators=(",", ":"))
    encoded = base64.urlsafe_b64encode(payload.encode("utf-8")).decode("ascii")
    return f"{FEATURE_METADATA_PREFIX}{encoded}"


def _normalized_feature(
    title: str,
    source_name: str,
    geometry_type: str,
    description: str = "",
) -> dict:
    normalized_title = str(title or "Map feature")
    return {
        "title": normalized_title,
        "name": normalized_title,
        "source_name": str(source_name or "Map layer"),
        "geometry_type": str(geometry_type or "unknown"),
        "description": str(description or ""),
    }


def _feature_metadata_span(feature: dict) -> str:
    token = html.escape(_feature_metadata_token(feature), quote=True)
    return (
        f'<span aria-hidden="true" '
        f'style="font-size:0;line-height:0;color:transparent">{token}</span>'
    )


def _feature_metadata_from_text(value: str) -> Optional[dict]:
    match = re.search(
        rf"{re.escape(FEATURE_METADATA_PREFIX)}([A-Za-z0-9_=-]+)",
        value or "",
    )
    if not match:
        return None
    try:
        decoded = base64.urlsafe_b64decode(match.group(1).encode("ascii")).decode("utf-8")
        metadata = json.loads(decoded)
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    return metadata if isinstance(metadata, dict) else None


def map_feature_popup_html(
    content: str,
    title: str,
    source_name: str,
    geometry_type: str,
    description: str = "",
) -> str:
    """Wrap popup HTML with metadata that survives Streamlit-Folium ``innerText``.

    Streamlit-Folium returns a popup element's ``innerText`` rather than its
    source HTML. The zero-size token therefore carries the normalized fields in
    text while remaining invisible in the rendered popup. The data attributes
    are retained for direct HTML consumers and backward compatibility.
    """
    feature = _normalized_feature(
        title, source_name, geometry_type, description
    )
    return (
        f'<div data-feature-title="{html.escape(feature["title"], quote=True)}" '
        f'data-source-name="{html.escape(feature["source_name"], quote=True)}" '
        f'data-geometry-type="{html.escape(feature["geometry_type"], quote=True)}" '
        f'data-feature-description="{html.escape(feature["description"], quote=True)}">'
        f'{content}{_feature_metadata_span(feature)}</div>'
    )


def map_feature_tooltip_html(
    label: str,
    title: str,
    source_name: str,
    geometry_type: str,
    description: str = "",
) -> str:
    """Return visible tooltip text plus selection metadata for GeoJSON clicks."""
    feature = _normalized_feature(
        title, source_name, geometry_type, description
    )
    return f"{html.escape(str(label or title or 'Map feature'))}{_feature_metadata_span(feature)}"


def map_feature_from_popup(popup_html: str) -> dict:
    """Extract normalized selection fields from a Folium popup."""
    raw = str(popup_html or "")
    metadata = _feature_metadata_from_text(html.unescape(raw))
    if metadata:
        title = str(metadata.get("title") or metadata.get("name") or "Map feature")
        return {
            "title": title,
            "name": title,
            "description": str(metadata.get("description") or ""),
            "source_name": str(metadata.get("source_name") or "Map layer"),
            "geometry_type": str(metadata.get("geometry_type") or "unknown"),
        }

    title_attribute = re.search(r'data-feature-title=["\']([^"\']+)', raw, re.IGNORECASE)
    title_match = re.search(r"<b[^>]*>(.*?)</b>", raw, re.IGNORECASE | re.DOTALL)
    spans = re.findall(r"<span[^>]*>(.*?)</span>", raw, re.IGNORECASE | re.DOTALL)

    def clean(value: str) -> str:
        return html.unescape(re.sub(r"<[^>]+>", "", value or "")).strip()

    title = clean(title_attribute.group(1)) if title_attribute else (
        clean(title_match.group(1)) if title_match else "Map feature"
    )
    description_match = re.search(r'data-feature-description=["\']([^"\']*)', raw, re.IGNORECASE)
    description = clean(description_match.group(1)) if description_match else (
        clean(spans[0]) if spans else ""
    )
    source_match = re.search(r'data-source-name=["\']([^"\']+)', raw, re.IGNORECASE)
    source = clean(source_match.group(1)) if source_match else (clean(spans[1]) if len(spans) > 1 else "")
    source = source.split(" · ", 1)[0] if source else "Map layer"
    geometry_match = re.search(r'data-geometry-type=["\']([^"\']+)', raw, re.IGNORECASE)
    return {
        "title": title,
        "name": title,
        "description": description,
        "source_name": source,
        "geometry_type": geometry_match.group(1) if geometry_match else "unknown",
    }


def map_feature_from_map_data(map_data: Optional[dict]) -> Optional[dict]:
    """Return the selected feature from a Streamlit-Folium event payload."""
    if not map_data:
        return None
    popup = map_data.get("last_object_clicked_popup")
    tooltip = map_data.get("last_object_clicked_tooltip")
    for candidate in (popup, tooltip):
        metadata = _feature_metadata_from_text(html.unescape(str(candidate or "")))
        if metadata:
            title = str(metadata.get("title") or metadata.get("name") or "Map feature")
            return {
                "title": title,
                "name": title,
                "description": str(metadata.get("description") or ""),
                "source_name": str(metadata.get("source_name") or "Map layer"),
                "geometry_type": str(metadata.get("geometry_type") or "unknown"),
            }
    return map_feature_from_popup(popup) if popup else None


def reset_map_feature_selection(state) -> None:
    """Clear selection and remount the map component for a fresh click event."""
    state["selected_map_feature"] = None
    state["map_interaction_revision"] = int(state.get("map_interaction_revision", 0)) + 1


def map_component_key(revision: int) -> str:
    """Return a stable component key that can be advanced after dismissal."""
    return f"operational_map_{int(revision)}"


def leaflet_geometry_parts(geometry: dict) -> list:
    """Normalize GeoJSON vectors into Leaflet ``(lat, lng)`` geometry parts."""
    geometry_type = str((geometry or {}).get("type") or "")
    coordinates = (geometry or {}).get("coordinates") or []

    def line_locations(line):
        return [
            [coordinate[1], coordinate[0]]
            for coordinate in line
            if isinstance(coordinate, (list, tuple)) and len(coordinate) >= 2
        ]

    if geometry_type == "LineString":
        locations = line_locations(coordinates)
        return [{"kind": "line", "locations": locations}] if len(locations) >= 2 else []
    if geometry_type == "MultiLineString":
        return [
            {"kind": "line", "locations": locations}
            for locations in (line_locations(line) for line in coordinates)
            if len(locations) >= 2
        ]
    if geometry_type == "Polygon":
        rings = [line_locations(ring) for ring in coordinates]
        rings = [ring for ring in rings if len(ring) >= 3]
        return [{"kind": "polygon", "locations": rings}] if rings else []
    if geometry_type == "MultiPolygon":
        parts = []
        for polygon in coordinates:
            rings = [line_locations(ring) for ring in polygon]
            rings = [ring for ring in rings if len(ring) >= 3]
            if rings:
                parts.append({"kind": "polygon", "locations": rings})
        return parts
    return []


def map_feature_chat_prompt(feature: dict) -> str:
    title = feature.get("title") or feature.get("name") or "Map feature"
    lines = [f"Emergency considerations and risk profile for: {title}"]
    source = feature.get("source_name")
    geometry = feature.get("geometry_type")
    if source and source != "Map layer":
        lines.append(f"Source layer: {source}")
    if geometry and geometry != "unknown":
        lines.append(f"Feature type: {geometry}")
    return "\n".join(lines)
