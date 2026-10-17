"""Shared ArcGIS geography state and server-scoped operational map queries."""
import datetime
import json
import math
import time

from esri_presentation import build_presentation
from map_builder_filters import FILTER_MODES, UNFILTERED
from regional_geography import filter_features_by_mode
from map_layer_evidence import layer_query_scope


def layer_url(layer):
    return str(layer.get("url") or "").rstrip("/")


def shared_filter_mode(url, operational_layers, builder_layers, filters):
    """Match resolved sublayer URLs, not preset aliases or portal item IDs."""
    url = str(url).rstrip("/")
    if url not in filters:
        matches = [layer for layer in [*builder_layers, *operational_layers] if layer_url(layer) == url]
        filters[url] = next((layer["filter_mode"] for layer in matches
                             if layer.get("filter_mode") in FILTER_MODES), UNFILTERED)
    return filters[url]


def set_shared_filter(url, mode, operational_layers, builder_layers, filters):
    if mode not in FILTER_MODES:
        raise ValueError("unsupported_geography_filter_mode")
    url = str(url).rstrip("/")
    filters[url] = mode
    for layer in [*operational_layers, *builder_layers]:
        if layer_url(layer) == url:
            layer["filter_mode"] = mode


def synchronize_filters(operational_layers, builder_layers, filters):
    for layer in [*builder_layers, *operational_layers]:
        if layer.get("type") == "esri" or "FeatureServer" in layer_url(layer):
            mode = shared_filter_mode(layer_url(layer), operational_layers, builder_layers, filters)
            layer["filter_mode"] = mode


def normalize_map_features(features):
    """Convert one query response once, including native ArcGIS geometries."""
    result = []
    for feature in features:
        properties = feature.get("properties") or feature.get("attributes") or {}
        geometry = feature.get("geometry") or {}
        if "x" in geometry and "y" in geometry:
            geometry = {"type": "Point", "coordinates": [geometry["x"], geometry["y"]]}
        elif "paths" in geometry:
            paths = geometry["paths"]
            geometry = {"type": "LineString" if len(paths) == 1 else "MultiLineString",
                        "coordinates": paths[0] if len(paths) == 1 else paths}
        elif "rings" in geometry:
            geometry = {"type": "Polygon", "coordinates": geometry["rings"]}
        kind = geometry.get("type")
        if kind == "Point":
            coordinates = geometry.get("coordinates", [])
            if len(coordinates) < 2:
                continue
            try:
                lng, lat = float(coordinates[0]), float(coordinates[1])
            except (TypeError, ValueError):
                continue
            if math.isfinite(lng) and math.isfinite(lat) and -180 <= lng <= 180 and -90 <= lat <= 90:
                result.append(dict(type="point", lat=lat, lng=lng, props=properties, geometry=geometry))
        elif kind in ("LineString", "MultiLineString", "Polygon", "MultiPolygon"):
            result.append(dict(type="line" if "LineString" in kind else "polygon",
                               geometry=geometry, props=properties))
    return result


def fetch_scoped_map_features(layer, geography_records, get, post, max_features=500):
    """Apply authoritative geometry before the browse cap, with no broad fallback."""
    scope = layer_query_scope(dict(layer, visible=True, map_query_error=None), geography_records)
    metadata = layer.get("metadata")
    if metadata is None:
        response = get(layer_url(layer), params={"f": "json"}, timeout=15)
        response.raise_for_status()
        metadata = response.json()
        if metadata.get("error"):
            raise ValueError(metadata["error"].get("message", "ArcGIS metadata failed"))
    if metadata.get("capabilities") and "query" not in metadata["capabilities"].lower():
        raise ValueError("feature_analysis_unavailable")
    params = dict(scope, outFields="*", returnGeometry="true", outSR="4326",
                  resultRecordCount=max_features)
    payload = None
    last_error = None
    for output_format in ("geojson", "json"):
        try:
            query = dict(params, f=output_format)
            response = (post(layer_url(layer) + "/query", data=query, timeout=20) if "geometry" in scope else
                        get(layer_url(layer) + "/query", params=query, timeout=20))
            response.raise_for_status()
            candidate = response.json()
            if candidate.get("error"):
                raise ValueError(candidate["error"].get("message", "ArcGIS query failed"))
            if not isinstance(candidate.get("features"), list):
                raise ValueError("ArcGIS returned no feature collection")
            payload = candidate
            break
        except Exception as exc:
            last_error = exc
    if payload is None:
        raise ValueError(str(last_error) or "ArcGIS query failed")
    features = normalize_map_features(payload["features"])
    if layer.get("filter_mode", UNFILTERED) != UNFILTERED:
        matched = filter_features_by_mode(features, geography_records, layer["filter_mode"])
        if len(matched) != len(features):
            raise ValueError("source_returned_out_of_scope_features")
    partial = (bool(payload.get("exceededTransferLimit")) or len(payload["features"]) >= max_features
               or len(features) != len(payload["features"]))
    return dict(features=features, total=len(features), error=None,
                resolved_url=layer_url(layer), metadata=metadata,
                presentation=build_presentation(metadata, features),
                fetched_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                returned_count=len(payload["features"]), browse_state="partial" if partial else "complete",
                query_scope=scope)


def refresh_operational_layer(layer, geography_records, fetch_features, now=None, force=False):
    """Keep a last-good browse only for the exact same query, never another scope."""
    now = time.time() if now is None else now
    signature = None
    try:
        scope = layer_query_scope(dict(layer, visible=True, map_query_error=None), geography_records)
        signature = json.dumps(dict(url=layer_url(layer), mode=layer.get("filter_mode", UNFILTERED),
                                    scope=scope), sort_keys=True)
        if (not force and signature == layer.get("map_query_attempt")
                and now - layer.get("map_query_attempt_at", 0) < 60):
            return layer
        result = fetch_features(layer, geography_records)
        if result.get("error"):
            raise ValueError(result["error"])
        override = (layer.get("presentation") or {}).get("label_field_override")
        presentation = build_presentation(result.get("metadata"), result["features"], label_override=override)
        layer.update(features=result["features"], count=len(result["features"]),
                     metadata=result.get("metadata"), presentation=presentation,
                     fetched_at=result.get("fetched_at"), browse_state=result.get("browse_state", "partial"),
                     returned_count=result.get("returned_count", len(result["features"])),
                     map_query_scope=signature, map_query_error=None, data_state="current")
    except Exception as exc:
        same_scope = signature is not None and signature == layer.get("map_query_scope")
        # Data fetched for a different geography is never drawn beneath this filter label.
        if not same_scope:
            layer.update(features=[], count=0)
        layer.update(map_query_error=str(exc), data_state="stale" if same_scope else "unavailable")
    layer.update(map_query_attempt=signature, map_query_attempt_at=now)
    return layer


def operational_layer_status(layer):
    from map_builder_filters import FILTER_LABELS
    scope = FILTER_LABELS.get(layer.get("filter_mode", UNFILTERED), "Unknown geography")
    if layer.get("map_query_error"):
        kept = "showing last successful result for this same scope" if layer.get("data_state") == "stale" else "map features withheld"
        return f"{scope} · Query unavailable: {layer['map_query_error']} · {kept}"
    kind = "browse subset (up to 500)" if layer.get("browse_state") == "partial" else "complete query browse"
    missing = layer.get("returned_count", layer.get("count", 0)) - layer.get("count", 0)
    unmapped = f" · {missing} records without supported geometry" if missing else ""
    return f"{scope} · {layer.get('count', 0)} mapped features · {kind}{unmapped} · fetched {layer.get('fetched_at') or 'unknown'}"
