"""Phase 4 source orchestration and presentation shared by Streamlit tests."""

from __future__ import annotations

import argparse
import copy
import json
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from regional_geography import fetch_geography_source
from regional_normalization import ROCKAWAY_SOURCE_IDS, fetch_rockaway_source, unavailable_rockaway_result
from regional_observations import fetch_regional_source

ROOT = Path(__file__).resolve().parent.parent

PHASE4_GEOGRAPHY_SOURCE_IDS = [
    "nyc_cb14_boundary",
    "nys_civil_boundaries",
    "nys_electric_utility_territories",
]

PHASE4_OBSERVATION_SOURCE_IDS = [
    "coops_kings_point",
    "coops_montauk",
    "coops_battery_reference",
    "coops_sandy_hook_reference",
    "usgs_massapequa_creek",
    "usgs_peconic_river",
    "usgs_rosedale_reference",
    "nys_dec_active_sites",
]

PHASE4_SOURCE_IDS = [*ROCKAWAY_SOURCE_IDS, *PHASE4_OBSERVATION_SOURCE_IDS, *PHASE4_GEOGRAPHY_SOURCE_IDS]

GEOGRAPHY_LABELS = {
    "rockaway": "Rockaway / Queens CB14",
    "nassau": "Nassau County",
    "suffolk": "Suffolk County",
    "queens": "Queens County",
    "regional": "Long Island operational region",
    "reference": "Regional reference",
}


def _human_reason(reason: Any) -> str | None:
    if not reason:
        return None
    return str(reason).replace("_", " ").capitalize()


def _latest_timestamp(records: list[dict[str, Any]], field: str) -> str | None:
    values = sorted(record.get(field) for record in records if record.get(field))
    return values[-1] if values else None


def _source_geography(source: dict[str, Any], records: list[dict[str, Any]]) -> str:
    if source["id"] in ROCKAWAY_SOURCE_IDS:
        return GEOGRAPHY_LABELS["rockaway"]
    keys = list(dict.fromkeys(record.get("geography") for record in records if record.get("geography")))
    configured = keys or source.get("geographies", [])
    return " · ".join(GEOGRAPHY_LABELS.get(key, key) for key in configured) or GEOGRAPHY_LABELS["regional"]


def unavailable_phase4_result(source: dict[str, Any] | None) -> dict[str, Any]:
    if source and source.get("id") in ROCKAWAY_SOURCE_IDS:
        return unavailable_rockaway_result(source)
    return {
        "records": [],
        "data_state": "unavailable" if source and source.get("enabled") else (source or {}).get("failure_state", "unavailable"),
        "reason": "not_fetched" if source and source.get("enabled") else (source or {}).get("gate", "source_disabled"),
        "rejected_count": 0,
        "fetched_at": None,
    }


def phase4_source_card(source: dict[str, Any], result: dict[str, Any] | None = None) -> dict[str, Any]:
    result = result or unavailable_phase4_result(source)
    records = result.get("records") if isinstance(result.get("records"), list) else []
    mapped_records = [record for record in records if record.get("geometry")]
    state = result.get("data_state") or "unavailable"
    detail_parts = []
    if state != "current" and result.get("reason"):
        detail_parts.append(_human_reason(result["reason"]))
    if source.get("operational_note"):
        detail_parts.append(source["operational_note"])
    elif not source.get("enabled") and not detail_parts and source.get("gate"):
        detail_parts.append(source["gate"])
    display = source.get("display", {})

    return {
        "source_id": source["id"],
        "name": source["name"],
        "owner": source["owner"],
        "geography": _source_geography(source, records),
        "data_state": state,
        "record_count": len(records),
        "map_count": len(mapped_records),
        "observed_at": _latest_timestamp(records, "observed_at"),
        "fetched_at": result.get("fetched_at") or _latest_timestamp(records, "fetched_at"),
        "attribution": source["attribution"],
        "disclaimer": source.get("disclaimer"),
        "note": " · ".join(part for part in detail_parts if part) or None,
        "reason": result.get("reason"),
        "rejected_count": int(result.get("rejected_count") or 0),
        "kind": display.get("kind", "reference"),
        "icon": display.get("icon", "📍"),
        "color": display.get("color", "#60a5fa"),
        "map_capable": display.get("map_capable") is True and bool(mapped_records),
        "activation_state": result.get("activation_state") or source.get("activation", {}).get("state"),
        "scope_state": result.get("scope_state"),
        "confirmation_url": source.get("activation", {}).get("confirmation_url"),
        "confirmation_phone": source.get("activation", {}).get("confirmation_phone"),
    }


def fetch_phase4_source_bundle(
    source_registry: list[dict[str, Any]],
    request_get: Any,
    fetched_at: str | None = None,
    evaluated_at: str | None = None,
    app_token: str = "",
    previous_results: dict[str, dict[str, Any]] | None = None,
    cache: dict[str, dict[str, Any]] | None = None,
    now_seconds: float | None = None,
    sleep_fn: Any = time.sleep,
) -> dict[str, Any]:
    fetched_at = fetched_at or datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    evaluated_at = evaluated_at or fetched_at
    previous_results = previous_results or {}
    cache = cache if cache is not None else {}
    now_seconds = time.time() if now_seconds is None else now_seconds
    sources = {source["id"]: source for source in source_registry}

    def fetch_geography(source_id: str) -> tuple[str, dict[str, Any]]:
        source = sources.get(source_id)
        if not source:
            return source_id, {"records": [], "data_state": "unavailable", "reason": "source_missing", "rejected_count": 0, "fetched_at": None}
        return source_id, fetch_geography_source(source, request_get, fetched_at)

    with ThreadPoolExecutor(max_workers=len(PHASE4_GEOGRAPHY_SOURCE_IDS)) as executor:
        geography_results = dict(executor.map(fetch_geography, PHASE4_GEOGRAPHY_SOURCE_IDS))
    geography_records = [
        record for result in geography_results.values() for record in result.get("records", [])
    ]

    def fetch_data(source_id: str) -> tuple[str, dict[str, Any]]:
        source = sources.get(source_id)
        if not source:
            return source_id, {"records": [], "data_state": "unavailable", "reason": "source_missing", "rejected_count": 0, "fetched_at": None}
        if source_id in ROCKAWAY_SOURCE_IDS:
            cache_entry = cache.get(source_id) if source.get("family") == "socrata" else None
            max_age = int(source.get("refresh_seconds") or 0)
            if cache_entry and max_age > 0 and now_seconds - cache_entry["cached_at"] < max_age:
                return source_id, copy.deepcopy(cache_entry["result"])
            cached_result = cache_entry.get("result") if cache_entry else None
            previous_result = cached_result if cached_result and cached_result.get("records") else previous_results.get(source_id)
            result = fetch_rockaway_source(
                source, request_get, fetched_at, geography_records,
                app_token=app_token if source.get("family") == "socrata" else "",
                previous_result=previous_result,
                sleep_fn=sleep_fn,
            )
            if source.get("family") == "socrata" and result.get("data_state") != "stale" and result.get("records"):
                cache[source_id] = {"cached_at": now_seconds, "result": copy.deepcopy(result)}
            return source_id, result
        return source_id, fetch_regional_source(source, request_get, fetched_at, evaluated_at, geography_records)

    data_source_ids = [*ROCKAWAY_SOURCE_IDS, *PHASE4_OBSERVATION_SOURCE_IDS]
    with ThreadPoolExecutor(max_workers=8) as executor:
        data_results = dict(executor.map(fetch_data, data_source_ids))

    return {
        "results": {**data_results, **geography_results},
        "geography_records": geography_records,
        "fetched_at": fetched_at,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cards", type=Path, required=True)
    args = parser.parse_args()
    fixture = json.loads(args.cards.read_text())
    config = json.loads((ROOT / "config" / "jurisdiction.generated.json").read_text())
    sources = {source["id"]: source for source in config["source_registry"]}
    cards = {
        source_id: phase4_source_card(sources[source_id], result)
        for source_id, result in fixture["results"].items()
    }
    print(json.dumps(cards, sort_keys=True, separators=(",", ":")))
