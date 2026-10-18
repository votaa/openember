"""Session-owned operational overlay inventory (separate from Map Builder)."""
STANDARD_IDS = ("hospitals", "shelters", "gauges", "eoc", "floodRisk")
WEATHER_IDS = ("show_radar", "show_wind", "show_tidal")


def overlay_inventory(state, regional_ids):
    enrolled = state.get("enrolled_phase4_layers", state.get("active_phase4_layers", []))
    regional_ids = [key for key in regional_ids if key in enrolled]
    return {**{f"map_{key}": state.get(f"map_{key}", True) for key in STANDARD_IDS},
            **{key: state.get(key, True) for key in WEATHER_IDS},
            **{f"regional:{key}": key in state.get("active_phase4_layers", []) for key in regional_ids},
            **{f"user:{layer['id']}": layer.get("visible", True) for layer in state.get("map_layers", [])}}


def selection_state(inventory):
    values = list(inventory.values())
    if not values:
        return "Unavailable"
    return "All" if all(values) else "Some" if any(values) else "Off"


def set_overlay(state, overlay_id, visible):
    if overlay_id.startswith("regional:"):
        key = overlay_id.removeprefix("regional:")
        if visible:
            enrolled = list(state.get("enrolled_phase4_layers", state.get("active_phase4_layers", [])))
            if key not in enrolled:
                enrolled.append(key)
            state["enrolled_phase4_layers"] = enrolled
        selected = [item for item in state.get("active_phase4_layers", []) if item != key]
        state["active_phase4_layers"] = selected + ([key] if visible else [])
    elif overlay_id.startswith("user:"):
        for layer in state.get("map_layers", []):
            if layer["id"] == overlay_id.removeprefix("user:"):
                layer["visible"] = visible
                state[f"visible_user:{layer['id']}"] = visible
    else:
        state[overlay_id] = visible
    state["selected_map_feature"] = None


def select_overlays(state, regional_ids, visible):
    enrolled = state.get("enrolled_phase4_layers", state.get("active_phase4_layers", []))
    state["enrolled_phase4_layers"] = list(enrolled)
    regional_ids = [key for key in regional_ids if key in enrolled]
    for key in overlay_inventory(state, regional_ids):
        set_overlay(state, key, visible)
    # Clear unavailable regional selections too, preventing late arrivals while Off.
    state["active_phase4_layers"] = list(enrolled) if visible else []


def initialize_added_visibility(state):
    known = set(state.get("known_operational_layers", []))
    for layer in state.get("map_layers", []):
        if layer["id"] not in known:
            layer["visible"] = state.get("previous_overlay_state", "All") != "Off"
            state[f"visible_user:{layer['id']}"] = layer["visible"]
    state["known_operational_layers"] = [layer["id"] for layer in state.get("map_layers", [])]
