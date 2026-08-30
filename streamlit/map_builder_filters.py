"""Shared Map Builder filtering contract for Streamlit."""

from regional_geography import filter_features_by_mode, masks_for_mode


UNFILTERED = "unfiltered"
OPERATIONAL = "operational"
PSEG_LONG_ISLAND = "pseg_long_island"
FILTER_MODES = (UNFILTERED, OPERATIONAL, PSEG_LONG_ISLAND)
FILTER_LABELS = {
    UNFILTERED: "Unfiltered",
    OPERATIONAL: "Limit to operational geography",
    PSEG_LONG_ISLAND: "Limit to PSEG Long Island territory",
}


def filter_supported(layer: dict) -> bool:
    source_type = str(layer.get("source_type") or layer.get("type") or "").lower()
    url = str(layer.get("url") or "").rstrip("/")
    return (
        ("feature layer" in source_type or "feature service" in source_type)
        and (url.endswith("/FeatureServer") or "/FeatureServer/" in url)
    )


def filter_masks_by_mode(geography_records: list[dict], mode: str) -> list[dict]:
    if mode == UNFILTERED:
        return []
    return masks_for_mode(geography_records, mode)


def evaluate_map_builder_filter(layer: dict, geography_records: list[dict]) -> dict:
    features = layer.get("features") if isinstance(layer.get("features"), list) else []
    requested_mode = layer.get("filter_mode") or UNFILTERED
    supported = filter_supported(layer)
    result = {
        "requested_mode": requested_mode,
        "effective_mode": UNFILTERED,
        "supported": supported,
        "input_count": len(features),
        "output_count": len(features),
        "rejected_count": 0,
        "features": features,
        "reason": None,
    }
    if requested_mode == UNFILTERED:
        return result
    if not supported:
        result["reason"] = "unsupported_layer_type"
        return result
    try:
        filtered = filter_features_by_mode(features, geography_records, requested_mode)
    except ValueError as exc:
        result["reason"] = str(exc) or "geography_filter_unavailable"
        return result
    result.update({
        "effective_mode": requested_mode,
        "output_count": len(filtered),
        "rejected_count": len(features) - len(filtered),
        "features": filtered,
    })
    return result
