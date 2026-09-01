"""State helpers for the Streamlit ArcGIS Map Builder."""


def initialize_map_builder_layers(current_layers: list[dict], configured_layers: list[dict],
                                  initialized: bool) -> tuple[list[dict], bool]:
    """Seed configured layers once while preserving an intentional empty list."""
    if initialized:
        return current_layers, True
    return [
        {
            "id": layer.get("url", ""),
            "name": layer.get("name", "Layer"),
            "url": layer.get("url", ""),
            "item_id": "",
            "type": layer.get("type", "Feature Layer"),
            "source_type": layer.get("type", "Feature Layer"),
            "entry_path": "configured",
            "filter_mode": "unfiltered",
            "opacity": float(layer.get("opacity", 1.0)),
            "visible": True,
            "color": "#a78bfa",
        }
        for layer in configured_layers
    ], True
