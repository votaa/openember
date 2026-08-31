"""Pure helpers for map selection state and explicit chat actions."""

import html
import re


def map_feature_from_popup(popup_html: str) -> dict:
    """Extract normalized selection fields from a Folium popup."""
    raw = str(popup_html or "")
    title_match = re.search(r"<b[^>]*>(.*?)</b>", raw, re.IGNORECASE | re.DOTALL)
    spans = re.findall(r"<span[^>]*>(.*?)</span>", raw, re.IGNORECASE | re.DOTALL)

    def clean(value: str) -> str:
        return html.unescape(re.sub(r"<[^>]+>", "", value or "")).strip()

    title = clean(title_match.group(1)) if title_match else "Map feature"
    description = clean(spans[0]) if spans else ""
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
    return f"Emergency considerations and risk profile for: {feature.get('title') or feature.get('name') or 'Map feature'}"
