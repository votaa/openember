"""Shared-contract normalization for Phase 3 Rockaway source records."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from regional_geography import geometry_intersects_mask
VALID_DATA_STATES = {"current", "stale", "partial", "unavailable", "access_required"}
ROCKAWAY_SOURCE_IDS = [
    "nyc_311_rockaway",
    "nyc_cooling_centers_rockaway",
    "nyc_hurricane_evacuation_centers_rockaway",
    "nypd_incidents_rockaway",
    "nycha_developments_rockaway",
]


def load_sources() -> dict[str, dict[str, Any]]:
    config = json.loads((ROOT / "config" / "jurisdiction.generated.json").read_text())
    return {source["id"]: source for source in config["source_registry"]}


def _parse_instant(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _add_seconds(value: str, seconds: int) -> str:
    result = _parse_instant(value) + timedelta(seconds=int(seconds or 0))
    return result.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _text(value: Any) -> str | None:
    if value is None:
        return None
    result = str(value).strip()
    return result or None


def _matches_field_scope(row: dict[str, Any], scope: dict[str, Any]) -> bool:
    for requirement in scope.get("fields", []):
        actual = _text(row.get(requirement["field"]))
        expected = {str(value).upper() for value in requirement.get("values", [])}
        if actual is None or actual.upper() not in expected:
            return False
    return True


def _geometry(row: dict[str, Any], contract: dict[str, Any]) -> dict[str, Any] | None:
    kind = contract.get("kind")
    if kind == "none":
        return None
    if kind == "feature_geometry":
        return row.get("geometry") if isinstance(row.get("geometry"), dict) else None
    if kind != "point_fields":
        raise ValueError("unsupported_geometry_contract")
    try:
        properties = row.get("properties") if row.get("type") == "Feature" else row
        latitude = float(properties[contract["latitude_field"]])
        longitude = float(properties[contract["longitude_field"]])
    except (KeyError, TypeError, ValueError):
        return None
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        return None
    return {"type": "Point", "coordinates": [longitude, latitude]}


def _status(row: dict[str, Any], contract: dict[str, Any]) -> str | None:
    if contract.get("status_field"):
        return _text(row.get(contract["status_field"]))
    presence_field = contract.get("status_presence_field")
    if presence_field:
        return contract.get("status_present_value") if _text(row.get(presence_field)) else contract.get("status_missing_value")
    return None


def _observed_timestamp(row: dict[str, Any], source: dict[str, Any], contract: dict[str, Any]) -> str | None:
    date_value = _text(row.get(contract.get("observed_at_field")))
    time_value = _text(row.get(contract.get("observed_time_field")))
    if date_value and time_value:
        return f"{date_value[:10]}T{time_value}"
    return date_value or _text(source.get("source_updated_at"))


def _mask_for_scope(geography_records: list[dict[str, Any]], scope: dict[str, Any]) -> dict[str, Any] | None:
    return next(
        (
            record.get("geometry")
            for record in geography_records
            if record.get("source_id") == scope.get("mask_source_id")
            and record.get("scope_key") == scope.get("mask_scope_key")
        ),
        None,
    )


def _matches_scope(
    row: dict[str, Any], scope: dict[str, Any] | None, geometry: dict[str, Any] | None,
    geography_records: list[dict[str, Any]],
) -> bool:
    if scope and scope.get("kind") == "all_fields":
        return _matches_field_scope(row, scope)
    if scope and scope.get("kind") == "geometry_intersects":
        mask = _mask_for_scope(geography_records, scope)
        return bool(mask and geometry and geometry_intersects_mask(geometry, mask))
    return False


def normalize_rockaway_record(
    source: dict[str, Any], row: Any, fetched_at: str, data_state: str = "current",
    geography_records: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    contract = source.get("normalization")
    if not contract:
        raise ValueError("source_not_normalizable")
    if data_state not in VALID_DATA_STATES:
        raise ValueError("invalid_data_state")
    if not isinstance(row, dict):
        return None
    properties_row = row.get("properties") if row.get("type") == "Feature" else row
    if not isinstance(properties_row, dict):
        return None

    geometry = _geometry(row, contract.get("geometry", {}))
    if contract.get("geometry", {}).get("kind") != "none" and geometry is None:
        return None
    if not _matches_scope(properties_row, contract.get("scope"), geometry, geography_records or []):
        return None

    source_record_id = _text(properties_row.get(contract["id_field"]))
    observed_at = _observed_timestamp(properties_row, source, contract)
    title = _text(properties_row.get(contract["title_field"]))
    if not source_record_id or not observed_at or not title:
        return None

    description = " ".join(
        value for value in (_text(properties_row.get(field)) for field in contract.get("description_fields", [])) if value
    ) or None
    properties = {
        field: properties_row[field]
        for field in contract.get("audit_properties", [])
        if field in properties_row and properties_row[field] is not None
    }
    properties["source_record_id"] = source_record_id
    if source.get("source_timestamp_timezone"):
        properties["source_timestamp_timezone"] = source["source_timestamp_timezone"]

    return {
        "source_id": source["id"],
        "source_name": source["name"],
        "owner": source["owner"],
        "geography": "rockaway",
        "observed_at": observed_at,
        "fetched_at": fetched_at,
        "expires_at": _add_seconds(fetched_at, source.get("stale_after_seconds", 0)),
        "geometry": geometry,
        "category": _text(properties_row.get(contract.get("category_field"))) or _text(contract.get("category_value")),
        "severity": _text(properties_row.get(contract.get("severity_field"))) if contract.get("severity_field") else None,
        "status": _text(contract.get("status_value")) or _status(properties_row, contract),
        "title": title,
        "description": description,
        "properties": properties,
        "source_url": source["endpoint"],
        "attribution": source["attribution"],
        "data_state": data_state,
    }


def normalize_rockaway_payload(
    source: dict[str, Any], payload: Any, fetched_at: str, evaluated_at: str | None = None,
    geography_records: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if not source.get("normalization"):
        return {"records": [], "data_state": source.get("failure_state", "unavailable"), "reason": "source_not_normalizable", "rejected_count": 0}
    rows = payload.get("features") if source["normalization"].get("payload_kind") == "feature_collection" and isinstance(payload, dict) and payload.get("type") == "FeatureCollection" else payload if isinstance(payload, list) else None
    if not isinstance(rows, list):
        return {"records": [], "data_state": "unavailable", "reason": "malformed_payload", "rejected_count": 0}
    if not rows:
        return {"records": [], "data_state": "partial", "reason": "empty_payload", "rejected_count": 0}

    scope = source["normalization"].get("scope", {})
    if scope.get("kind") == "geometry_intersects" and not _mask_for_scope(geography_records or [], scope):
        return {"records": [], "data_state": "unavailable", "reason": "missing_spatial_mask", "rejected_count": 0}
    records = [normalize_rockaway_record(source, row, fetched_at, geography_records=geography_records or []) for row in rows]
    records = [record for record in records if record is not None]
    rejected_count = len(rows) - len(records)
    expires_at = _parse_instant(_add_seconds(fetched_at, source.get("stale_after_seconds", 0)))
    is_stale = _parse_instant(evaluated_at or fetched_at) > expires_at
    data_state = "stale" if is_stale else "partial" if rejected_count else "current"
    for record in records:
        record["data_state"] = data_state
    return {
        "records": records,
        "data_state": data_state,
        "reason": "records_rejected" if rejected_count else None,
        "rejected_count": rejected_count,
    }


def build_rockaway_query_url(source: dict[str, Any]) -> str:
    if not source.get("query_select") or not source.get("required_filter"):
        return source.get("endpoint", "")
    params = {
        "$select": source["query_select"],
        "$where": source["required_filter"],
        "$limit": str(source.get("query_limit", 50)),
    }
    if source.get("query_order"):
        params["$order"] = source["query_order"]
    return f'{source["endpoint"]}?{urlencode(params)}'


def unavailable_rockaway_result(source: dict[str, Any]) -> dict[str, Any]:
    return {
        "records": [],
        "data_state": "unavailable" if source.get("enabled") else source.get("failure_state", "unavailable"),
        "reason": "not_fetched" if source.get("enabled") else source.get("gate", "source_disabled"),
        "rejected_count": 0,
        "fetched_at": None,
    }


def fetch_rockaway_source(
    source: dict[str, Any], request_get: Any, fetched_at: str | None = None,
    geography_records: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if not source.get("enabled"):
        return unavailable_rockaway_result(source)
    if not source.get("normalization"):
        result = unavailable_rockaway_result(source)
        result["reason"] = "source_not_normalizable"
        return result

    fetched_at = fetched_at or datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    try:
        response = request_get(build_rockaway_query_url(source), timeout=10, headers={"Accept": "application/json"})
        response.raise_for_status()
        result = normalize_rockaway_payload(source, response.json(), fetched_at, fetched_at, geography_records or [])
        result["fetched_at"] = fetched_at
        return result
    except Exception as exc:
        return {
            "records": [],
            "data_state": "unavailable",
            "reason": str(exc) or "request_failed",
            "rejected_count": 0,
            "fetched_at": fetched_at,
        }


def rockaway_source_card(source: dict[str, Any], result: dict[str, Any] | None = None) -> dict[str, Any]:
    result = result or unavailable_rockaway_result(source)
    records = result.get("records") if isinstance(result.get("records"), list) else []
    observed_values = sorted(record.get("observed_at") for record in records if record.get("observed_at"))
    map_count = sum(1 for record in records if record.get("geometry"))
    display = source.get("display", {})
    return {
        "source_id": source["id"],
        "name": source["name"],
        "owner": source["owner"],
        "geography": "Rockaway / Queens CB14",
        "data_state": result.get("data_state", "unavailable"),
        "record_count": len(records),
        "map_count": map_count,
        "observed_at": observed_values[-1] if observed_values else None,
        "fetched_at": result.get("fetched_at") or (records[0].get("fetched_at") if records else None),
        "attribution": source["attribution"],
        "note": source.get("operational_note") or source.get("gate") or result.get("reason"),
        "kind": display.get("kind", "reference"),
        "icon": display.get("icon", "📍"),
        "color": display.get("color", "#60a5fa"),
        "map_capable": display.get("map_capable") is True and map_count > 0,
    }


def _fixture_output(path: Path) -> dict[str, Any]:
    fixture = json.loads(path.read_text())
    sources = load_sources()
    return {
        case["source_id"]: normalize_rockaway_payload(
            sources[case["source_id"]], case.get("rows", case.get("payload")), fixture["fetched_at"], fixture["evaluated_at"],
            fixture.get("geography_records", []),
        )
        for case in fixture["cases"]
    }


def _fixture_card_output(path: Path) -> dict[str, Any]:
    normalized = _fixture_output(path)
    sources = load_sources()
    return {
        source_id: rockaway_source_card(sources[source_id], normalized.get(source_id))
        for source_id in ROCKAWAY_SOURCE_IDS
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--cards", action="store_true")
    args = parser.parse_args()
    output = _fixture_card_output(args.fixture) if args.cards else _fixture_output(args.fixture)
    print(json.dumps(output, sort_keys=True, separators=(",", ":")))
