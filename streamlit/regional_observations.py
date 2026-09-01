"""Shared NOAA, USGS, and NYS DEC Phase 3 regional adapters."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode, urlparse, urlunparse

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from regional_geography import geometry_intersects_mask


def load_sources() -> dict[str, dict[str, Any]]:
    config = json.loads((ROOT / "config" / "jurisdiction.generated.json").read_text())
    return {source["id"]: source for source in config["source_registry"]}


def _text(value: Any) -> str | None:
    if value is None:
        return None
    result = str(value).strip()
    return result or None


def _instant(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def _iso(value: Any) -> str | None:
    parsed = _instant(value)
    return parsed.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z") if parsed else None


def _noaa_instant(value: Any, time_zone_name: str) -> str | None:
    raw = _text(value)
    if not raw:
        return None
    suffix = "+00:00" if str(time_zone_name).lower() == "gmt" else ""
    return _iso(f"{raw.replace(' ', 'T')}:00{suffix}")


def _add_seconds(value: str, seconds: int) -> str:
    parsed = _instant(value)
    if not parsed:
        raise ValueError("invalid_fetched_at")
    return (parsed + timedelta(seconds=int(seconds or 0))).astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _valid_point(geometry: Any) -> bool:
    if not isinstance(geometry, dict) or geometry.get("type") != "Point":
        return False
    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, list) or len(coordinates) < 2:
        return False
    try:
        longitude, latitude = float(coordinates[0]), float(coordinates[1])
    except (TypeError, ValueError):
        return False
    return -180 <= longitude <= 180 and -90 <= latitude <= 90


def _observation_state(observed_at: str | None, fetched_at: str, stale_after: int, evaluated_at: str, rejected_count: int = 0) -> str:
    expires_at = _instant(_add_seconds(observed_at or fetched_at, stale_after))
    evaluated = _instant(evaluated_at)
    stale = bool(evaluated and expires_at and evaluated > expires_at)
    return "stale" if stale else "partial" if rejected_count else "current"


def _geography_for(source: dict[str, Any]) -> str:
    if source.get("role") == "reference":
        return "reference"
    return next((item for item in source.get("geographies", []) if item != "regional"), source.get("geographies", ["regional"])[0])


def build_regional_source_url(source: dict[str, Any], evaluated_at: str | None = None) -> str:
    evaluated_at = evaluated_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    parsed = urlparse(source["endpoint"])
    if source["family"] == "noaa_coops":
        params = {
            "range": str(source["range_hours"]), "station": source["station_id"], "product": source["product"],
            "datum": source["datum"], "time_zone": source["time_zone"], "units": source["units"],
            "application": source["application"], "format": "json",
        }
        path = parsed.path
    elif source["family"] == "usgs_ogc":
        end = _instant(evaluated_at)
        if not end:
            raise ValueError("invalid_evaluated_at")
        start = end - timedelta(hours=int(source["window_hours"]))
        params = {
            "f": "json", "monitoring_location_id": source["monitoring_location_id"],
            "parameter_code": source["parameter_code"],
            "datetime": f'{start.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")}/{end.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")}',
            "limit": str(source["query_limit"]),
        }
        path = parsed.path
    elif source["family"] == "arcgis_map_server":
        params = {
            "where": source["required_filter"], "outFields": ",".join(source["query_out_fields"]),
            "returnGeometry": "true", "outSR": "4326", "resultRecordCount": str(source["query_limit"]), "f": "geojson",
        }
        path = f'{parsed.path.rstrip("/")}/query'
    else:
        raise ValueError("unsupported_regional_source_family")
    return urlunparse((parsed.scheme, parsed.netloc, path, "", urlencode(params), ""))


def _base_record(source: dict[str, Any], fetched_at: str, observed_at: str | None, geometry: dict, data_state: str) -> dict[str, Any]:
    return {
        "source_id": source["id"], "source_name": source["name"], "owner": source["owner"],
        "geography": _geography_for(source), "observed_at": observed_at, "fetched_at": fetched_at,
        "expires_at": _add_seconds(observed_at or fetched_at, source.get("stale_after_seconds", 0)),
        "geometry": geometry, "source_url": source["endpoint"], "attribution": source["attribution"],
        "disclaimer": source.get("disclaimer"), "data_state": data_state,
    }


def _result(records: list, data_state: str, reason: str | None, rejected_count: int) -> dict[str, Any]:
    return {"records": records, "data_state": data_state, "reason": reason, "rejected_count": rejected_count}


def _unavailable(reason: str) -> dict[str, Any]:
    return _result([], "unavailable", reason, 0)


def _partial(reason: str, rejected_count: int = 0) -> dict[str, Any]:
    return _result([], "partial", reason, rejected_count)


def _normalize_coops(source: dict[str, Any], payload: Any, fetched_at: str, evaluated_at: str) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return _unavailable("malformed_payload")
    if payload.get("error"):
        return _unavailable(_text(payload["error"].get("message")) or "upstream_error")
    if _text(payload.get("metadata", {}).get("id")) != source["station_id"] or not isinstance(payload.get("data"), list):
        return _unavailable("station_contract_mismatch")
    geometry = {"type": "Point", "coordinates": [float(payload["metadata"].get("lon", "nan")), float(payload["metadata"].get("lat", "nan"))]}
    if not _valid_point(geometry):
        return _unavailable("invalid_station_geometry")
    valid = []
    for row in payload["data"]:
        observed_at = _noaa_instant(row.get("t"), source["time_zone"]) if isinstance(row, dict) else None
        try:
            value = float(row.get("v"))
        except (TypeError, ValueError, AttributeError):
            continue
        if observed_at:
            valid.append((observed_at, value, row))
    valid.sort(key=lambda item: item[0])
    if not valid:
        return _partial("no_valid_observations", len(payload["data"]))
    observed_at, value, row = valid[-1]
    rejected_count = len(payload["data"]) - len(valid)
    data_state = _observation_state(observed_at, fetched_at, source["stale_after_seconds"], evaluated_at, rejected_count)
    record = {
        **_base_record(source, fetched_at, observed_at, geometry, data_state),
        "category": "water_level", "severity": None,
        "status": "Preliminary" if (_text(row.get("q")) or "").lower() == "p" else _text(row.get("q")),
        "title": _text(payload["metadata"].get("name")) or source["name"],
        "description": f'{value:g} ft relative to {source["datum"]}',
        "properties": {
            "source_record_id": f'{source["station_id"]}:{observed_at}', "station_id": source["station_id"],
            "role": source["role"], "product": source["product"], "datum": source["datum"],
            "time_zone": source["time_zone"], "units": source["units"], "value": value,
            "unit_of_measure": "ft", "uncertainty": _text(row.get("s")), "flags": _text(row.get("f")),
            "quality": _text(row.get("q")),
        },
    }
    return _result([record], data_state, "observations_rejected" if rejected_count else None, rejected_count)


def _normalize_usgs(source: dict[str, Any], payload: Any, fetched_at: str, evaluated_at: str) -> dict[str, Any]:
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection" or not isinstance(payload.get("features"), list):
        return _unavailable("malformed_payload")
    valid = []
    for feature in payload["features"]:
        properties = feature.get("properties") if isinstance(feature, dict) else None
        observed_at = _iso(properties.get("time")) if isinstance(properties, dict) else None
        try:
            value = float(properties.get("value"))
        except (TypeError, ValueError, AttributeError):
            continue
        if feature.get("type") != "Feature" or not _text(feature.get("id")) or not _valid_point(feature.get("geometry")) or not observed_at:
            continue
        if _text(properties.get("monitoring_location_id")) != source["monitoring_location_id"] or _text(properties.get("parameter_code")) != source["parameter_code"] or not _text(properties.get("unit_of_measure")):
            continue
        valid.append((observed_at, value, feature, properties))
    valid.sort(key=lambda item: item[0])
    if not valid:
        return _partial("no_valid_observations", len(payload["features"]))
    observed_at, value, feature, properties = valid[-1]
    rejected_count = len(payload["features"]) - len(valid)
    data_state = _observation_state(observed_at, fetched_at, source["stale_after_seconds"], evaluated_at, rejected_count)
    unit = _text(properties.get("unit_of_measure"))
    record = {
        **_base_record(source, fetched_at, observed_at, feature["geometry"], data_state),
        "category": "gauge_height", "severity": None, "status": _text(properties.get("approval_status")),
        "title": source["name"], "description": f"{value:g} {unit} gauge height",
        "properties": {
            "source_record_id": str(feature["id"]), "monitoring_location_id": source["monitoring_location_id"],
            "role": source["role"], "parameter_code": source["parameter_code"],
            "statistic_id": _text(properties.get("statistic_id")), "value": value, "unit_of_measure": unit,
            "approval_status": _text(properties.get("approval_status")), "qualifier": properties.get("qualifier"),
            "last_modified": _iso(properties.get("last_modified")),
        },
    }
    return _result([record], data_state, "observations_rejected" if rejected_count else None, rejected_count)


def _county_mask(records: list[dict[str, Any]], county: str) -> dict | None:
    return next((record.get("geometry") for record in records if record.get("source_id") == "nys_civil_boundaries" and record.get("scope_key") == county.lower()), None)


def _normalize_dec(source: dict[str, Any], payload: Any, fetched_at: str, evaluated_at: str, geography_records: list[dict[str, Any]]) -> dict[str, Any]:
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection" or not isinstance(payload.get("features"), list):
        return _unavailable("malformed_payload")
    if not payload["features"]:
        return _partial("empty_payload")
    masks = {"Nassau": _county_mask(geography_records, "Nassau"), "Suffolk": _county_mask(geography_records, "Suffolk")}
    if not all(masks.values()):
        return _unavailable("missing_spatial_mask")
    records = []
    for feature in payload["features"]:
        properties = feature.get("properties") if isinstance(feature, dict) else None
        county = _text(properties.get("COUNTY")) if isinstance(properties, dict) else None
        if feature.get("type") != "Feature" or not _valid_point(feature.get("geometry")) or county not in masks:
            continue
        if not geometry_intersects_mask(feature["geometry"], masks[county]):
            continue
        source_record_id = _text(properties.get("OBJECTID")) or _text(feature.get("id"))
        site_code, title = _text(properties.get("SITECODE")), _text(properties.get("SITENAME"))
        if not source_record_id or not site_code or not title:
            continue
        record = {
            **_base_record(source, fetched_at, None, feature["geometry"], "current"),
            "geography": county.lower(), "category": _text(properties.get("PROGRAM")), "severity": None,
            "status": None, "title": title,
            "description": ", ".join(filter(None, [_text(properties.get("LOCALITY")), _text(properties.get("TOWN")), county])) or None,
            "properties": {
                "source_record_id": source_record_id, "site_code": site_code, "program": _text(properties.get("PROGRAM")),
                "site_class": _text(properties.get("SITECLASS")), "county": county, "town": _text(properties.get("TOWN")),
                "locality": _text(properties.get("LOCALITY")), "zip_code": _text(properties.get("ZIPCODE")),
                "detail_url": _text(properties.get("DETAIL_URL")), "layer_url": source["endpoint"],
            },
            "source_url": _text(properties.get("DETAIL_URL")) or source["endpoint"],
        }
        records.append(record)
    rejected_count = len(payload["features"]) - len(records)
    data_state = _observation_state(None, fetched_at, source["stale_after_seconds"], evaluated_at, rejected_count)
    for record in records:
        record["data_state"] = data_state
    return _result(records, data_state, "features_rejected" if rejected_count else None if records else "empty_payload", rejected_count)


def normalize_regional_payload(source: dict[str, Any], payload: Any, fetched_at: str, evaluated_at: str | None = None, geography_records: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    evaluated_at = evaluated_at or fetched_at
    if source["family"] == "noaa_coops":
        return _normalize_coops(source, payload, fetched_at, evaluated_at)
    if source["family"] == "usgs_ogc":
        return _normalize_usgs(source, payload, fetched_at, evaluated_at)
    if source["family"] == "arcgis_map_server":
        return _normalize_dec(source, payload, fetched_at, evaluated_at, geography_records or [])
    return _unavailable("unsupported_regional_source_family")


def fetch_regional_source(source: dict[str, Any], request_get: Any, fetched_at: str | None = None, evaluated_at: str | None = None, geography_records: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    if not source.get("enabled"):
        return {**_unavailable(source.get("gate", "source_disabled")), "fetched_at": None}
    fetched_at = fetched_at or datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    evaluated_at = evaluated_at or fetched_at
    try:
        response = request_get(build_regional_source_url(source, evaluated_at), timeout=15, headers={"Accept": "application/geo+json, application/json"})
        response.raise_for_status()
        return {**normalize_regional_payload(source, response.json(), fetched_at, evaluated_at, geography_records or []), "fetched_at": fetched_at}
    except Exception as exc:
        return {**_unavailable(str(exc) or "request_failed"), "fetched_at": fetched_at}


def _fixture_output(path: Path) -> dict[str, Any]:
    fixture = json.loads(path.read_text())
    sources = load_sources()
    return {
        case["source_id"]: normalize_regional_payload(
            sources[case["source_id"]], case["payload"], fixture["fetched_at"], fixture["evaluated_at"],
            fixture.get("geography_records", []),
        )
        for case in fixture["cases"]
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(_fixture_output(args.fixture), sort_keys=True, separators=(",", ":")))
