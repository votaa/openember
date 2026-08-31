"""Pure helpers for map selection state and explicit chat actions."""

import html
import re


def map_feature_popup_html(
    content: str,
    title: str,
    source_name: str,
    geometry_type: str,
    description: str = "",
) -> str:
    """Wrap popup presentation HTML with stable, parser-readable metadata."""
    return (
        f'<div data-feature-title="{html.escape(str(title or "Map feature"), quote=True)}" '
        f'data-source-name="{html.escape(str(source_name or "Map layer"), quote=True)}" '
        f'data-geometry-type="{html.escape(str(geometry_type or "unknown"), quote=True)}" '
        f'data-feature-description="{html.escape(str(description or ""), quote=True)}">'
        f'{content}</div>'
    )


def map_feature_from_popup(popup_html: str) -> dict:
    """Extract normalized selection fields from a Folium popup."""
    raw = str(popup_html or "")
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
