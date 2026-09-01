"""Metadata-driven presentation helpers for public ArcGIS Feature Layers."""

from __future__ import annotations

import html
import re
from typing import Any


FEATURE_URL_RE = re.compile(r"^(.*?/FeatureServer)(?:/(\d+))?(?:/query)?$", re.I)
SYSTEM_FIELD_NAMES = {
    "objectid", "fid", "globalid", "shape", "shape_length", "shape_area",
    "shape__length", "shape__area", "shape.len", "shape.area",
}
SEMANTIC_TOKENS = (
    "name", "title", "label", "route", "branch", "line", "site",
    "facility", "address", "description", "desc",
)
POPUP_TOKENS = (
    "name", "title", "label", "type", "category", "status", "route", "branch",
    "line", "address", "location", "city", "county", "date", "time", "description",
)


def feature_service_parts(url: str) -> tuple[str | None, str | None]:
    match = FEATURE_URL_RE.match((url or "").rstrip("/"))
    return match.groups() if match else (None, None)


def discover_feature_layers(service_url: str, get) -> dict:
    """Resolve a FeatureServer root or layer URL into selectable sublayers."""
    root, requested_id = feature_service_parts(service_url)
    if not root:
        return {"service_root": None, "layers": [], "error": "Not an ArcGIS FeatureServer URL"}

    try:
        if requested_id is not None:
            response = get(f"{root}/{requested_id}", params={"f": "json"}, timeout=15,
                           headers={"User-Agent": "EMBER/1.0"})
            response.raise_for_status()
            metadata = response.json()
            if "error" in metadata:
                return {"service_root": root, "layers": [], "error": metadata["error"].get("message", "ArcGIS error")}
            return {
                "service_root": root,
                "layers": [{
                    "id": int(requested_id),
                    "name": metadata.get("name") or f"Layer {requested_id}",
                    "url": f"{root}/{requested_id}",
                    "geometry_type": metadata.get("geometryType"),
                    "metadata": metadata,
                }],
                "error": None,
            }

        response = get(root, params={"f": "json"}, timeout=15,
                       headers={"User-Agent": "EMBER/1.0"})
        response.raise_for_status()
        metadata = response.json()
        if "error" in metadata:
            return {"service_root": root, "layers": [], "error": metadata["error"].get("message", "ArcGIS error")}
        layers = [{
            "id": layer.get("id"),
            "name": layer.get("name") or f"Layer {layer.get('id')}",
            "url": f"{root}/{layer.get('id')}",
            "geometry_type": layer.get("geometryType"),
            "metadata": None,
        } for layer in metadata.get("layers", []) if layer.get("type", "Feature Layer") == "Feature Layer"]
        return {"service_root": root, "layers": layers, "error": None}
    except Exception as exc:
        return {"service_root": root, "layers": [], "error": str(exc)}


def is_system_field(field: dict) -> bool:
    name = str(field.get("name", "")).lower()
    field_type = str(field.get("type", "")).lower()
    return (
        name in SYSTEM_FIELD_NAMES
        or name.startswith("shape_")
        or name.startswith("shape__")
        or field_type in {"esrifieldtypeoid", "esrifieldtypeglobalid", "esrifieldtypeguid", "esrifieldtypegeometry"}
    )


def _coded_values(domain: Any) -> dict[str, str]:
    if not isinstance(domain, dict):
        return {}
    return {
        str(item.get("code")): str(item.get("name"))
        for item in domain.get("codedValues", [])
        if item.get("code") is not None and item.get("name") is not None
    }


def _renderer_fields(metadata: dict) -> list[str]:
    renderer = metadata.get("drawingInfo", {}).get("renderer", {}) or {}
    fields = [renderer.get(key) for key in ("field1", "field2", "field3", "field")]
    for variable in renderer.get("visualVariables", []) or []:
        fields.append(variable.get("field"))
    return [str(field) for field in fields if field]


def build_presentation(metadata: dict | None, features: list[dict] | None = None,
                       label_override: str | None = None) -> dict:
    """Build a serializable field/label contract from ArcGIS metadata."""
    metadata = metadata or {}
    features = features or []
    fields = metadata.get("fields") or []
    if not fields:
        seen = []
        for feature in features[:25]:
            for name, value in (feature.get("props") or {}).items():
                if name not in seen:
                    seen.append(name)
                    fields.append({
                        "name": name,
                        "alias": name,
                        "type": "esriFieldTypeString" if isinstance(value, str) else "unknown",
                        "domain": None,
                    })

    field_map = {field.get("name"): field for field in fields if field.get("name")}
    useful_fields = [field.get("name") for field in fields if field.get("name") and not is_system_field(field)]
    string_fields = {
        field.get("name") for field in fields
        if field.get("name") and str(field.get("type", "")).lower() == "esrifieldtypestring" and not is_system_field(field)
    }

    candidates = []
    candidates.extend(name for name in _renderer_fields(metadata) if name in string_fields)
    display_field = metadata.get("displayField")
    if display_field in string_fields:
        candidates.append(display_field)
    type_id_field = metadata.get("typeIdField")
    if type_id_field in string_fields:
        candidates.append(type_id_field)
    candidates.extend(
        name for name in useful_fields
        if name in string_fields and any(token in f"{name} {field_map[name].get('alias', '')}".lower() for token in SEMANTIC_TOKENS)
    )
    candidates.extend(name for name in useful_fields if name in string_fields)

    auto_label = next((name for name in candidates if name in field_map), None)
    label_field = label_override if label_override in field_map and not is_system_field(field_map[label_override]) else auto_label

    aliases = {name: str(field_map[name].get("alias") or name) for name in useful_fields}
    domains = {name: _coded_values(field_map[name].get("domain")) for name in useful_fields}
    subtype_domains = {}
    for subtype in metadata.get("types", []) or []:
        subtype_domains[str(subtype.get("id"))] = {
            name: _coded_values(domain)
            for name, domain in (subtype.get("domains") or {}).items()
        }

    def popup_priority(name: str) -> tuple[int, int]:
        searchable = f"{name} {field_map[name].get('alias', '')}".lower()
        semantic_rank = next(
            (index for index, token in enumerate(POPUP_TOKENS) if token in searchable),
            len(POPUP_TOKENS),
        )
        return semantic_rank, useful_fields.index(name)

    remaining_fields = sorted(
        (name for name in useful_fields if name != label_field), key=popup_priority
    )
    ordered = ([label_field] if label_field else []) + remaining_fields
    return {
        "metadata_state": "current" if metadata else "inferred",
        "layer_name": metadata.get("name"),
        "geometry_type": metadata.get("geometryType"),
        "object_id_field": metadata.get("objectIdField") or metadata.get("objectIdFieldName"),
        "display_field": display_field,
        "type_id_field": type_id_field,
        "label_field_auto": auto_label,
        "label_field_override": label_override if label_override in useful_fields else None,
        "label_field": label_field,
        "fields": useful_fields,
        "field_order": ordered,
        "aliases": aliases,
        "domains": domains,
        "subtype_domains": subtype_domains,
    }


def display_value(field: str, value: Any, props: dict, presentation: dict) -> str:
    if value is None:
        return ""
    domain = (presentation.get("domains") or {}).get(field, {})
    type_field = presentation.get("type_id_field")
    subtype = str(props.get(type_field)) if type_field and props.get(type_field) is not None else None
    subtype_domain = ((presentation.get("subtype_domains") or {}).get(subtype, {}) if subtype else {}).get(field, {})
    return str(subtype_domain.get(str(value), domain.get(str(value), value)))


def feature_label(feature: dict, presentation: dict | None, layer_name: str) -> str:
    props = feature.get("props") or {}
    presentation = presentation or build_presentation(None, [feature])
    field = presentation.get("label_field")
    value = display_value(field, props.get(field), props, presentation) if field else ""
    if value.strip():
        return value[:80]
    object_id = presentation.get("object_id_field")
    return f"{layer_name} · {props.get(object_id)}" if object_id and props.get(object_id) is not None else layer_name


def feature_popup_html(feature: dict, presentation: dict | None,
                       layer_name: str, color: str) -> str:
    props = feature.get("props") or {}
    presentation = presentation or build_presentation(None, [feature])
    rows = []
    for field in presentation.get("field_order", []):
        if field not in props or props[field] in (None, "", []):
            continue
        alias = html.escape(str((presentation.get("aliases") or {}).get(field, field)))
        value = html.escape(display_value(field, props[field], props, presentation)[:500])
        rows.append((alias, value))

    def render(items):
        return "".join(
            f'<div style="margin-bottom:3px"><span style="color:#667">{alias}:</span> '
            f'<span style="color:#bbc">{value}</span></div>'
            for alias, value in items
        )

    primary = render(rows[:8])
    remainder = ""
    if len(rows) > 8:
        remainder = (
            f'<details style="margin-top:6px"><summary style="color:#818cf8;cursor:pointer">'
            f'{len(rows) - 8} more attribute(s)</summary><div style="margin-top:5px">{render(rows[8:])}</div></details>'
        )
    label = html.escape(feature_label(feature, presentation, layer_name))
    return (
        f'<div style="font-family:monospace;font-size:10px;max-width:320px;max-height:300px;overflow:auto">'
        f'<div style="font-weight:700;color:{html.escape(color)};margin-bottom:6px;font-size:11px">{label}</div>'
        f'{primary}{remainder}'
        f'<div style="color:#446;font-size:9px;margin-top:6px;border-top:1px solid #1e2a40;padding-top:4px">'
        f'ESRI Feature Layer · {html.escape(layer_name)}</div></div>'
    )
