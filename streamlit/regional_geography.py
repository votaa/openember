"""Shared regional polygon adapters and spatial predicates for Streamlit."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parent.parent
GEOGRAPHY_FILTER_MODES = {"operational", "pseg_long_island"}
_POLYGON_VALIDITY_CACHE: dict[int, tuple[dict, bool]] = {}
_POLYGON_BOUNDS_CACHE: dict[int, tuple[dict, tuple[float, float, float, float]]] = {}


def _bounded_cache_store(cache: dict, key: int, value: tuple) -> None:
    if len(cache) >= 256:
        cache.clear()
    cache[key] = value


def load_sources() -> dict[str, dict[str, Any]]:
    config = json.loads((ROOT / "config" / "jurisdiction.generated.json").read_text())
    return {source["id"]: source for source in config["source_registry"]}


def _instant(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    try:
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(float(value) / 1000, timezone.utc)
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError, OverflowError):
        return None


def _iso(value: Any) -> str | None:
    parsed = _instant(value)
    return parsed.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z") if parsed else None


def _add_seconds(value: str, seconds: int) -> str:
    parsed = _instant(value)
    if not parsed:
        raise ValueError("invalid_fetched_at")
    return (parsed + timedelta(seconds=int(seconds or 0))).astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _text(value: Any) -> str | None:
    if value is None:
        return None
    result = str(value).strip()
    return result or None


def _coordinate(value: Any) -> bool:
    if not isinstance(value, list) or len(value) < 2:
        return False
    try:
        longitude, latitude = float(value[0]), float(value[1])
    except (TypeError, ValueError):
        return False
    return -180 <= longitude <= 180 and -90 <= latitude <= 90


def _valid_ring(ring: Any) -> bool:
    return (
        isinstance(ring, list)
        and len(ring) >= 4
        and all(_coordinate(point) for point in ring)
        and float(ring[0][0]) == float(ring[-1][0])
        and float(ring[0][1]) == float(ring[-1][1])
    )


def valid_polygon_geometry(geometry: Any) -> bool:
    if not isinstance(geometry, dict) or not isinstance(geometry.get("coordinates"), list):
        return False
    cached = _POLYGON_VALIDITY_CACHE.get(id(geometry))
    if cached and cached[0] is geometry:
        return cached[1]
    coordinates = geometry["coordinates"]
    valid = False
    if geometry.get("type") == "Polygon":
        valid = bool(coordinates) and all(_valid_ring(ring) for ring in coordinates)
    elif geometry.get("type") == "MultiPolygon":
        valid = bool(coordinates) and all(
            isinstance(polygon, list) and bool(polygon) and all(_valid_ring(ring) for ring in polygon)
            for polygon in coordinates
        )
    _bounded_cache_store(_POLYGON_VALIDITY_CACHE, id(geometry), (geometry, valid))
    return valid


def _point_on_segment(point: list, start: list, end: list) -> bool:
    px, py = map(float, point[:2])
    ax, ay = map(float, start[:2])
    bx, by = map(float, end[:2])
    cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax)
    return abs(cross) <= 1e-10 and min(ax, bx) - 1e-10 <= px <= max(ax, bx) + 1e-10 and min(ay, by) - 1e-10 <= py <= max(ay, by) + 1e-10


def _ring_location(point: list, ring: list) -> str:
    inside = False
    prior = len(ring) - 1
    x, y = map(float, point[:2])
    for index, current in enumerate(ring):
        previous = ring[prior]
        if _point_on_segment(point, previous, current):
            return "boundary"
        xi, yi = map(float, current[:2])
        xj, yj = map(float, previous[:2])
        if (yi > y) != (yj > y) and x < ((xj - xi) * (y - yi)) / (yj - yi) + xi:
            inside = not inside
        prior = index
    return "inside" if inside else "outside"


def _point_in_polygon_coordinates(point: list, polygon: list) -> bool:
    outer = _ring_location(point, polygon[0])
    if outer == "outside":
        return False
    if outer == "boundary":
        return True
    for hole in polygon[1:]:
        location = _ring_location(point, hole)
        if location == "inside":
            return False
        if location == "boundary":
            return True
    return True


def point_in_polygon(point: list, geometry: dict) -> bool:
    if not _coordinate(point) or not valid_polygon_geometry(geometry):
        return False
    polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    return any(_point_in_polygon_coordinates(point, polygon) for polygon in polygons)


def _orientation(a: list, b: list, c: list) -> int:
    value = (float(b[1]) - float(a[1])) * (float(c[0]) - float(b[0])) - (float(b[0]) - float(a[0])) * (float(c[1]) - float(b[1]))
    return 0 if abs(value) <= 1e-10 else 1 if value > 0 else 2


def _segments_intersect(a: list, b: list, c: list, d: list) -> bool:
    o1, o2, o3, o4 = _orientation(a, b, c), _orientation(a, b, d), _orientation(c, d, a), _orientation(c, d, b)
    if o1 != o2 and o3 != o4:
        return True
    return (o1 == 0 and _point_on_segment(c, a, b)) or (o2 == 0 and _point_on_segment(d, a, b)) or (o3 == 0 and _point_on_segment(a, c, d)) or (o4 == 0 and _point_on_segment(b, c, d))


def _polygon_rings(geometry: dict) -> list[list]:
    polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    return [ring for polygon in polygons for ring in polygon]


def _outer_rings(geometry: dict) -> list[list]:
    polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    return [polygon[0] for polygon in polygons]


def _geometry_bounds(geometry: dict) -> tuple[float, float, float, float]:
    cached = _POLYGON_BOUNDS_CACHE.get(id(geometry))
    if cached and cached[0] is geometry:
        return cached[1]
    points = [point for ring in _polygon_rings(geometry) for point in ring]
    bounds = (
        min(float(point[0]) for point in points),
        min(float(point[1]) for point in points),
        max(float(point[0]) for point in points),
        max(float(point[1]) for point in points),
    )
    _bounded_cache_store(_POLYGON_BOUNDS_CACHE, id(geometry), (geometry, bounds))
    return bounds


def _bounds_intersect(left: tuple[float, float, float, float], right: tuple[float, float, float, float]) -> bool:
    return left[0] <= right[2] and left[2] >= right[0] and left[1] <= right[3] and left[3] >= right[1]


def polygons_intersect(left: dict, right: dict) -> bool:
    if not valid_polygon_geometry(left) or not valid_polygon_geometry(right):
        return False
    if not _bounds_intersect(_geometry_bounds(left), _geometry_bounds(right)):
        return False
    for left_ring in _polygon_rings(left):
        for right_ring in _polygon_rings(right):
            for li in range(1, len(left_ring)):
                for ri in range(1, len(right_ring)):
                    if _segments_intersect(left_ring[li - 1], left_ring[li], right_ring[ri - 1], right_ring[ri]):
                        return True
    return any(point_in_polygon(ring[0], right) for ring in _outer_rings(left)) or any(point_in_polygon(ring[0], left) for ring in _outer_rings(right))


def _line_coordinates(geometry: dict) -> list[list]:
    if geometry.get("type") == "LineString":
        return [geometry.get("coordinates", [])]
    if geometry.get("type") == "MultiLineString":
        return geometry.get("coordinates", [])
    return []


def _line_intersects_polygon(line: list, polygon: dict) -> bool:
    if not isinstance(line, list) or len(line) < 2 or not all(_coordinate(point) for point in line):
        return False
    if any(point_in_polygon(point, polygon) for point in line):
        return True
    for ring in _polygon_rings(polygon):
        for li in range(1, len(line)):
            for ri in range(1, len(ring)):
                if _segments_intersect(line[li - 1], line[li], ring[ri - 1], ring[ri]):
                    return True
    return False


def geometry_intersects_mask(geometry: dict, mask: dict) -> bool:
    if not valid_polygon_geometry(mask) or not isinstance(geometry, dict):
        return False
    if geometry.get("type") == "Point":
        return point_in_polygon(geometry.get("coordinates", []), mask)
    if geometry.get("type") in {"Polygon", "MultiPolygon"}:
        return polygons_intersect(geometry, mask)
    return any(_line_intersects_polygon(line, mask) for line in _line_coordinates(geometry))


def masks_for_mode(records: list[dict], mode: str) -> list[dict]:
    if mode == "operational":
        allowed = {"nassau", "suffolk", "rockaway"}
    elif mode == "pseg_long_island":
        allowed = {"pseg_long_island"}
    else:
        raise ValueError("unsupported_geography_filter_mode")
    return [record["geometry"] for record in records if record.get("scope_key") in allowed]


def filter_features_by_mode(features: list[dict], geography_records: list[dict], mode: str) -> list[dict]:
    masks = masks_for_mode(geography_records, mode)
    if not masks:
        raise ValueError("missing_geography_masks")
    return [feature for feature in features if any(geometry_intersects_mask(feature.get("geometry"), mask) for mask in masks)]


def build_geography_query_url(source: dict[str, Any]) -> str:
    if source.get("family") == "arcgis_feature_server":
        params = {"where": source["required_filter"], "outFields": ",".join(source.get("query_out_fields", ["*"])), "returnGeometry": "true", "outSR": "4326", "f": "geojson"}
        return f'{source["endpoint"].rstrip("/")}/query?{urlencode(params)}'
    if source.get("family") == "socrata_geojson":
        params = {"$select": source.get("query_select", "*"), "$where": source.get("required_filter", "1=1"), "$limit": str(source.get("query_limit", 100))}
        return f'{source["endpoint"]}?{urlencode(params)}'
    raise ValueError("unsupported_geography_source_family")


def _normalized_feature(source: dict[str, Any], feature: Any, fetched_at: str) -> dict[str, Any] | None:
    contract = source.get("spatial")
    if not contract or not isinstance(feature, dict) or feature.get("type") != "Feature" or not valid_polygon_geometry(feature.get("geometry")):
        return None
    properties = feature.get("properties")
    if not isinstance(properties, dict):
        return None
    raw_key = _text(properties.get(contract["key_field"]))
    if not raw_key or raw_key not in {str(value) for value in contract.get("allowed_values", [])}:
        return None
    scope_key = contract.get("scope_key_by_value", {}).get(raw_key)
    source_record_id = _text(properties.get(contract["id_field"]))
    if not scope_key or not source_record_id:
        return None
    selected_properties = {field: properties[field] for field in contract.get("property_fields", []) if field in properties and properties[field] is not None}
    selected_properties.update({"source_record_id": source_record_id, "scope_key": scope_key})
    observed_at = _iso(properties.get(contract.get("observed_at_field"))) or _iso(source.get("source_updated_at"))
    return {
        "source_id": source["id"], "source_name": source["name"], "owner": source["owner"],
        "geography": contract.get("geography_by_value", {}).get(raw_key) or source.get("geographies", ["regional"])[0],
        "scope_key": scope_key, "spatial_role": contract["role"], "observed_at": observed_at,
        "fetched_at": fetched_at, "expires_at": _add_seconds(fetched_at, source.get("stale_after_seconds", 0)),
        "geometry": feature["geometry"],
        "title": contract.get("title_by_value", {}).get(raw_key) or _text(properties.get(contract.get("name_field"))) or raw_key,
        "properties": selected_properties, "source_url": source["endpoint"], "attribution": source["attribution"],
        "disclaimer": source.get("disclaimer"), "data_state": "current",
    }


def normalize_geography_payload(source: dict[str, Any], payload: Any, fetched_at: str, evaluated_at: str | None = None) -> dict[str, Any]:
    if not source.get("spatial"):
        return {"records": [], "data_state": source.get("failure_state", "unavailable"), "reason": "source_not_spatial", "rejected_count": 0}
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection" or not isinstance(payload.get("features"), list):
        return {"records": [], "data_state": "unavailable", "reason": "malformed_payload", "rejected_count": 0}
    if not payload["features"]:
        return {"records": [], "data_state": "partial", "reason": "empty_payload", "rejected_count": 0}
    records = [record for feature in payload["features"] if (record := _normalized_feature(source, feature, fetched_at)) is not None]
    rejected_count = len(payload["features"]) - len(records)
    expected = set(source["spatial"].get("expected_scope_keys", []))
    missing = sorted(expected - {record["scope_key"] for record in records})
    stale = _instant(evaluated_at or fetched_at) > _instant(_add_seconds(fetched_at, source.get("stale_after_seconds", 0)))
    data_state = "stale" if stale else "partial" if rejected_count or missing else "current"
    for record in records:
        record["data_state"] = data_state
    return {"records": records, "data_state": data_state, "reason": "features_rejected" if rejected_count else "missing_expected_features" if missing else None, "rejected_count": rejected_count, "missing_scope_keys": missing}


def fetch_geography_source(source: dict[str, Any], request_get: Any, fetched_at: str | None = None) -> dict[str, Any]:
    if not source.get("enabled"):
        return {"records": [], "data_state": source.get("failure_state", "unavailable"), "reason": source.get("gate", "source_disabled"), "rejected_count": 0, "fetched_at": None}
    fetched_at = fetched_at or datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    try:
        response = request_get(build_geography_query_url(source), timeout=15, headers={"Accept": "application/geo+json, application/json"})
        response.raise_for_status()
        result = normalize_geography_payload(source, response.json(), fetched_at)
        result["fetched_at"] = fetched_at
        return result
    except Exception as exc:
        return {"records": [], "data_state": "unavailable", "reason": str(exc) or "request_failed", "rejected_count": 0, "fetched_at": fetched_at}


def _fixture_output(path: Path) -> dict[str, Any]:
    fixture = json.loads(path.read_text())
    sources = load_sources()
    return {case["source_id"]: normalize_geography_payload(sources[case["source_id"]], case["payload"], fixture["fetched_at"], fixture["evaluated_at"]) for case in fixture["cases"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(_fixture_output(args.fixture), sort_keys=True, separators=(",", ":")))
