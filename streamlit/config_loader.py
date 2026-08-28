"""
config_loader.py — EMBER Jurisdiction Configuration Loader

Reads config/jurisdiction.yaml and exposes typed, validated config objects
that replace all hardcoded NYC values in app.py.

Usage:
    from config_loader import load_config
    cfg = load_config()          # loads config/jurisdiction.yaml
    cfg = load_config("config/my_city.yaml")  # loads a specific file
"""

import os
import yaml
import datetime as _dt
from pathlib import Path
from typing import Any


# ── Paths ─────────────────────────────────────────────────────────────────────
# Config lives at ember-final/config/jurisdiction.yaml
# This file lives at ember-final/streamlit/config_loader.py
_HERE        = Path(__file__).parent
_CONFIG_DIR  = _HERE.parent / "config"
_DEFAULT_CFG = _CONFIG_DIR / "jurisdiction.yaml"
_EXAMPLE_CFG = _CONFIG_DIR / "jurisdiction.example.yaml"


# ── Defaults (used when optional fields are missing) ──────────────────────────
_DEFAULTS = {
    "jurisdiction": {
        "name":         "My City",
        "short_name":   "City",
        "state":        "NY",
        "state_full":   "New York",
        "county":       "",
        "center_lat":   40.7128,
        "center_lng":  -74.0060,
        "bbox_north":   41.0,
        "bbox_south":   40.4,
        "bbox_east":   -73.7,
        "bbox_west":   -74.3,
        "timezone":     "America/New_York",
        "zoom_default": 11,
    },
    "nws": {
        "office":       "OKX",
        "grid_x":       33,
        "grid_y":       37,
        "alert_zone":   "NYZ178",
        "obs_stations": [],
    },
    "coops_stations": [],
    "regions": {},
    "source_registry": [],
    "knowledge_base": {
        "flood_zones":             "No flood zone information configured.",
        "evac_zones":              "No evacuation zone information configured.",
        "critical_infrastructure": "No critical infrastructure information configured.",
        "hazard_profiles":         "No hazard profile information configured.",
        "resources":               "No emergency resources configured.",
    },
    "map_points": {},
    "socrata": {
        "domain":          "data.cityofnewyork.us",
        "preset_datasets": [],
    },
    "noaa": {
        "alert_state": "NY",
        "usgs_state":  "NY",
        "fema_state":  "NY",
    },
    "branding": {
        "app_title":         "EMBER",
        "app_subtitle":      "Emergency Management Body of Evidence & Resources",
        "jurisdiction_line": "JURISDICTION",
        "primary_color":     "#e8372c",
        "logo_emoji":        "🚨",
    },
}


# ── Loader ─────────────────────────────────────────────────────────────────────
class JurisdictionConfig:
    """Typed accessor for a loaded jurisdiction YAML config."""

    def __init__(self, raw: dict):
        self._raw = raw
        self._validate()

    def _validate(self):
        j = self._raw.get("jurisdiction", {})
        missing = [f for f in ("name", "state", "center_lat", "center_lng")
                   if not j.get(f)]
        if missing:
            raise ValueError(f"jurisdiction.yaml is missing required fields: {missing}")

        regions = self._raw.get("regions", {})
        if not isinstance(regions, dict):
            raise ValueError("jurisdiction.yaml regions must be a mapping")

        sources = self._raw.get("source_registry", [])
        if not isinstance(sources, list):
            raise ValueError("jurisdiction.yaml source_registry must be a list")

        source_ids = [source.get("id") for source in sources]
        if any(not source_id for source_id in source_ids):
            raise ValueError("every source_registry entry must have an id")
        if len(source_ids) != len(set(source_ids)):
            raise ValueError("source_registry ids must be unique")

    # ── jurisdiction ──────────────────────────────────────────────────────────
    @property
    def name(self) -> str:
        return self._raw["jurisdiction"]["name"]

    @property
    def short_name(self) -> str:
        return self._raw["jurisdiction"].get("short_name", self.name.split()[0])

    @property
    def state(self) -> str:
        return self._raw["jurisdiction"]["state"].upper()

    @property
    def state_full(self) -> str:
        return self._raw["jurisdiction"].get("state_full", self.state)

    @property
    def center(self) -> tuple[float, float]:
        j = self._raw["jurisdiction"]
        return (float(j["center_lat"]), float(j["center_lng"]))

    @property
    def bbox(self) -> dict:
        j = self._raw["jurisdiction"]
        return {
            "north": float(j.get("bbox_north", self.center[0] + 0.5)),
            "south": float(j.get("bbox_south", self.center[0] - 0.5)),
            "east":  float(j.get("bbox_east",  self.center[1] + 0.5)),
            "west":  float(j.get("bbox_west",  self.center[1] - 0.5)),
        }

    @property
    def zoom(self) -> int:
        return int(self._raw["jurisdiction"].get("zoom_default", 11))

    @property
    def timezone(self) -> str:
        return self._raw["jurisdiction"].get("timezone", "America/New_York")

    # ── Regional geography and sources ───────────────────────────────────────
    @property
    def regions(self) -> dict[str, dict]:
        return self._raw.get("regions", {})

    @property
    def source_registry(self) -> list[dict]:
        return self._raw.get("source_registry", [])

    def source(self, source_id: str) -> dict | None:
        return next(
            (source for source in self.source_registry if source.get("id") == source_id),
            None,
        )

    @property
    def enabled_sources(self) -> list[dict]:
        return [source for source in self.source_registry if source.get("enabled") is True]

    # ── NWS ───────────────────────────────────────────────────────────────────
    @property
    def nws_office(self) -> str:
        return self._raw.get("nws", {}).get("office", "OKX").upper()

    @property
    def nws_products_office(self) -> str:
        office = self.nws_office
        return office if len(office) == 4 else f"K{office}"

    @property
    def nws_grid(self) -> tuple[int, int]:
        nws = self._raw.get("nws", {})
        return (int(nws.get("grid_x", 33)), int(nws.get("grid_y", 37)))

    @property
    def nws_alert_zone(self) -> str:
        return self._raw.get("nws", {}).get("alert_zone", "")

    @property
    def nws_obs_stations(self) -> list[dict]:
        return self._raw.get("nws", {}).get("obs_stations", [])

    @property
    def nws_alert_url(self) -> str:
        return f"https://api.weather.gov/alerts/active?area={self.state}"

    @property
    def nws_forecast_url(self) -> str:
        gx, gy = self.nws_grid
        return f"https://api.weather.gov/gridpoints/{self.nws_office}/{gx},{gy}/forecast"

    @property
    def nws_hourly_url(self) -> str:
        gx, gy = self.nws_grid
        return f"https://api.weather.gov/gridpoints/{self.nws_office}/{gx},{gy}/forecast/hourly"

    @property
    def nws_gridpoint_url(self) -> str:
        gx, gy = self.nws_grid
        return f"https://api.weather.gov/gridpoints/{self.nws_office}/{gx},{gy}"

    # ── CO-OPS Gauges ─────────────────────────────────────────────────────────
    @property
    def coops_stations(self) -> list[dict]:
        return self._raw.get("coops_stations", [])

    @property
    def primary_gauge(self) -> dict | None:
        for s in self.coops_stations:
            if s.get("is_primary"):
                return s
        return self.coops_stations[0] if self.coops_stations else None

    def flood_thresholds(self, station_id: str) -> dict:
        for s in self.coops_stations:
            if s["id"] == station_id:
                return s.get("flood_thresholds", {
                    "action": 4.5, "minor": 5.5, "moderate": 6.5, "major": 8.5
                })
        return {"action": 4.5, "minor": 5.5, "moderate": 6.5, "major": 8.5}

    @property
    def flood_thresholds_dict(self) -> dict:
        """Dict keyed by station_id for use in tidal_gauges module."""
        return {
            s["id"]: {
                "name": s["name"],
                **s.get("flood_thresholds", {
                    "action": 4.5, "minor": 5.5, "moderate": 6.5, "major": 8.5
                })
            }
            for s in self.coops_stations
        }

    # ── Knowledge Base ─────────────────────────────────────────────────────────
    @property
    def knowledge_base(self) -> dict[str, dict]:
        """Returns the KB dict in the format expected by build_context()."""
        kb_raw = self._raw.get("knowledge_base", {})
        label_map = {
            "flood_zones":             ("Flood Zones",             "FEMA / Local"),
            "evac_zones":              ("Evacuation Zones",        "Local OEM"),
            "critical_infrastructure": ("Critical Infrastructure", "Local OEM / CISA"),
            "hazard_profiles":         ("Hazard Profiles",         "Local Hazard Mitigation Plan"),
            "resources":               ("Contacts & Resources",    "Local OEM"),
        }
        result = {}
        for key, (label, source) in label_map.items():
            text = kb_raw.get(key, _DEFAULTS["knowledge_base"][key])
            result[key] = {"label": label, "source": source, "data": text.strip()}
        return result

    # ── Map Points ─────────────────────────────────────────────────────────────
    @property
    def map_points(self) -> dict:
        """
        Returns MAP_POINTS dict compatible with build_map().
        Converts from YAML structure to the format used in app.py.
        """
        raw_mp = self._raw.get("map_points", {})
        result = {}
        for key, cat in raw_mp.items():
            normalized_key = "floodRisk" if key == "flood_risk" else key
            features = []
            for f in cat.get("features", []):
                feat = {
                    "name": f.get("name", ""),
                    "lat":  float(f.get("lat", 0)),
                    "lng":  float(f.get("lng", 0)),
                    "note": f.get("note", ""),
                }
                if f.get("borough"):
                    feat["borough"] = f["borough"]
                features.append(feat)
            if normalized_key in result:
                result[normalized_key]["features"].extend(features)
                continue
            result[normalized_key] = {
                "label":    cat.get("label", key),
                "color":    cat.get("color", "#60a5fa"),
                "icon":     cat.get("icon",  "📍"),
                "features": features,
            }
        return result

    # ── Socrata / NYC Open Data ─────────────────────────────────────────────────
    @property
    def socrata_domain(self) -> str:
        return self._raw.get("socrata", {}).get("domain", "data.cityofnewyork.us")

    @property
    def socrata_presets(self) -> list[dict]:
        return self._raw.get("socrata", {}).get("preset_datasets", [])

    # ── NOAA endpoint parameters ───────────────────────────────────────────────
    @property
    def noaa_alert_state(self) -> str:
        return self._raw.get("noaa", {}).get("alert_state", self.state)

    @property
    def noaa_usgs_state(self) -> str:
        return self._raw.get("noaa", {}).get("usgs_state", self.state)

    @property
    def noaa_fema_state(self) -> str:
        return self._raw.get("noaa", {}).get("fema_state", self.state)

    # ── Branding ──────────────────────────────────────────────────────────────
    @property
    def app_title(self) -> str:
        return self._raw.get("branding", {}).get("app_title", "EMBER")

    @property
    def app_subtitle(self) -> str:
        return self._raw.get("branding", {}).get("app_subtitle",
               "Emergency Management Body of Evidence & Resources")

    @property
    def jurisdiction_line(self) -> str:
        return self._raw.get("branding", {}).get("jurisdiction_line",
               f"{self.short_name} JURISDICTION")

    @property
    def primary_color(self) -> str:
        return self._raw.get("branding", {}).get("primary_color", "#e8372c")

    @property
    def logo_emoji(self) -> str:
        return self._raw.get("branding", {}).get("logo_emoji", "🚨")

    # ── System prompt snippet ─────────────────────────────────────────────────
    @property
    def system_prompt_header(self) -> str:
        return (f"You are EMBER — Emergency Management Body of Evidence & Resources — "
                f"an AI assistant for {self.name} ({self.state}) emergency managers and first responders.")

    # ── Raw access ────────────────────────────────────────────────────────────
    def raw(self) -> dict:
        return self._raw

    def get(self, *keys, default=None) -> Any:
        """Nested key access: cfg.get('nws', 'office')"""
        d = self._raw
        for k in keys:
            if not isinstance(d, dict):
                return default
            d = d.get(k, default)
        return d


# ── Public API ────────────────────────────────────────────────────────────────

def config_exists(path: Path | None = None) -> bool:
    """Return True if a jurisdiction config file exists."""
    target = Path(path) if path else _DEFAULT_CFG
    return target.exists()


def load_config(path: Path | str | None = None) -> JurisdictionConfig:
    """
    Load and parse jurisdiction.yaml. Falls back to NYC defaults if file missing.
    Raises ValueError if required fields are absent.
    """
    target = Path(path) if path else _DEFAULT_CFG

    if not target.exists():
        # Return NYC defaults so the app doesn't crash on first run
        return JurisdictionConfig(_build_nyc_defaults())

    with open(target, "r") as f:
        raw = yaml.safe_load(f)

    # Merge with defaults for missing optional sections
    for section, defaults in _DEFAULTS.items():
        if section not in raw:
            raw[section] = defaults
        elif isinstance(defaults, dict) and isinstance(raw.get(section), dict):
            merged = {**defaults, **raw[section]}
            raw[section] = merged

    return JurisdictionConfig(raw)


def save_config(data: dict, path: Path | str | None = None) -> Path:
    """Write a config dict to YAML. Returns the path written."""
    target = Path(path) if path else _DEFAULT_CFG
    target.parent.mkdir(parents=True, exist_ok=True)
    with open(target, "w") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
    return target


def get_example_yaml() -> str:
    """Return the contents of the example template."""
    if _EXAMPLE_CFG.exists():
        return _EXAMPLE_CFG.read_text()
    return ""


def _build_nyc_defaults() -> dict:
    """Return the full NYC config as a Python dict (used when no file exists)."""
    nyc = Path(__file__).parent.parent / "config" / "jurisdiction.yaml"
    if nyc.exists():
        with open(nyc) as f:
            return yaml.safe_load(f)
    return _DEFAULTS


# ── NWS auto-discovery ────────────────────────────────────────────────────────

def discover_nws_office(lat: float, lng: float) -> dict | None:
    """
    Query the NWS Points API to auto-discover the office, grid coords,
    and forecast zone for a given lat/lng.
    Returns dict with office, grid_x, grid_y, alert_zone or None on failure.
    """
    import requests
    try:
        r = requests.get(
            f"https://api.weather.gov/points/{lat:.4f},{lng:.4f}",
            timeout=8, headers={"User-Agent": "EMBER/1.0"}
        )
        if not r.ok:
            return None
        d = r.json().get("properties", {})
        return {
            "office":     d.get("cwa", ""),
            "grid_x":     d.get("gridX", 0),
            "grid_y":     d.get("gridY", 0),
            "alert_zone": d.get("forecastZone", "").split("/")[-1],
            "timezone":   d.get("timeZone", "America/New_York"),
            "county":     d.get("county", "").split("/")[-1],
        }
    except Exception:
        return None


def discover_coops_stations(bbox: dict, limit: int = 10) -> list[dict]:
    """
    Fetch CO-OPS water level stations within a bounding box.
    Returns list of {id, name, lat, lng} dicts sorted by proximity to bbox center.
    """
    import requests, math
    center_lat = (bbox["north"] + bbox["south"]) / 2
    center_lng = (bbox["east"]  + bbox["west"])  / 2

    try:
        # CO-OPS metadata API returns all stations; we filter by bbox
        r = requests.get(
            "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json"
            "?type=waterlevels",
            timeout=10, headers={"User-Agent": "EMBER/1.0"}
        )
        r.raise_for_status()
        all_stations = r.json().get("stations", [])

        in_bbox = []
        for s in all_stations:
            try:
                slat = float(s.get("lat", 0))
                slng = float(s.get("lng", 0))
            except (TypeError, ValueError):
                continue
            if (bbox["south"] <= slat <= bbox["north"] and
                    bbox["west"] <= slng <= bbox["east"]):
                dist = math.sqrt((slat - center_lat)**2 + (slng - center_lng)**2)
                in_bbox.append({
                    "id":   s["id"],
                    "name": s["name"],
                    "lat":  slat,
                    "lng":  slng,
                    "dist": dist,
                    "flood_thresholds": {
                        "action": 4.5, "minor": 5.5, "moderate": 6.5, "major": 8.5
                    }
                })

        in_bbox.sort(key=lambda x: x["dist"])
        # Remove internal dist key
        for s in in_bbox:
            s.pop("dist", None)
        return in_bbox[:limit]
    except Exception:
        return []
