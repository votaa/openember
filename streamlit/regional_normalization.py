"""Shared-contract normalization for Phase 3 Rockaway source records."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
VALID_DATA_STATES = {"current", "stale", "partial", "unavailable", "access_required"}


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


def _matches_scope(row: dict[str, Any], scope: dict[str, Any] | None) -> bool:
    if not scope or scope.get("kind") != "all_fields":
        return False
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
    if kind != "point_fields":
        raise ValueError("unsupported_geometry_contract")
    try:
        latitude = float(row[contract["latitude_field"]])
        longitude = float(row[contract["longitude_field"]])
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


def normalize_rockaway_record(
    source: dict[str, Any], row: Any, fetched_at: str, data_state: str = "current"
) -> dict[str, Any] | None:
    contract = source.get("normalization")
    if not contract:
        raise ValueError("source_not_normalizable")
    if data_state not in VALID_DATA_STATES:
        raise ValueError("invalid_data_state")
    if not isinstance(row, dict) or not _matches_scope(row, contract.get("scope")):
        return None

    geometry = _geometry(row, contract.get("geometry", {}))
    if contract.get("geometry", {}).get("kind") == "point_fields" and geometry is None:
        return None

    source_record_id = _text(row.get(contract["id_field"]))
    observed_at = _text(row.get(contract["observed_at_field"]))
    title = _text(row.get(contract["title_field"]))
    if not source_record_id or not observed_at or not title:
        return None

    description = " ".join(
        value for value in (_text(row.get(field)) for field in contract.get("description_fields", [])) if value
    ) or None
    properties = {
        field: row[field]
        for field in contract.get("audit_properties", [])
        if field in row and row[field] is not None
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
        "category": _text(row.get(contract.get("category_field"))),
        "severity": _text(row.get(contract.get("severity_field"))) if contract.get("severity_field") else None,
        "status": _status(row, contract),
        "title": title,
        "description": description,
        "properties": properties,
        "source_url": source["endpoint"],
        "attribution": source["attribution"],
        "data_state": data_state,
    }


def normalize_rockaway_payload(
    source: dict[str, Any], payload: Any, fetched_at: str, evaluated_at: str | None = None
) -> dict[str, Any]:
    if not source.get("normalization"):
        return {"records": [], "data_state": source.get("failure_state", "unavailable"), "reason": "source_not_normalizable", "rejected_count": 0}
    if not isinstance(payload, list):
        return {"records": [], "data_state": "unavailable", "reason": "malformed_payload", "rejected_count": 0}
    if not payload:
        return {"records": [], "data_state": "partial", "reason": "empty_payload", "rejected_count": 0}

    records = [normalize_rockaway_record(source, row, fetched_at) for row in payload]
    records = [record for record in records if record is not None]
    rejected_count = len(payload) - len(records)
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


def _fixture_output(path: Path) -> dict[str, Any]:
    fixture = json.loads(path.read_text())
    sources = load_sources()
    return {
        case["source_id"]: normalize_rockaway_payload(
            sources[case["source_id"]], case["rows"], fixture["fetched_at"], fixture["evaluated_at"]
        )
        for case in fixture["cases"]
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(_fixture_output(args.fixture), sort_keys=True, separators=(",", ":")))
