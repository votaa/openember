"""
EMBER — Emergency Management Body of Evidence & Resources
Streamlit version · Ollama Cloud · NYC jurisdiction

Run:
    pip install -r requirements.txt
    export OLLAMA_API_KEY=your_key_here
    streamlit run streamlit/app.py
"""

# ── Imports (all at module level) ─────────────────────────────────────────────
import html as _html
import json, os, re, time as _time, datetime as _dt
from io import StringIO
import folium, requests, streamlit as st
from streamlit.errors import StreamlitSecretNotFoundError
from streamlit_folium import st_folium
from streamlit_autorefresh import st_autorefresh
from tidal_gauges import (
    fetch_all_ny_gauges, fetch_station_list,
    build_gauge_popup, gauge_marker_color,
    FLOOD_THRESHOLDS,
)
from config_loader import load_config, config_exists
from setup_wizard import render_wizard
from carto_tiles import basemap_config
from regional_normalization import (
    ROCKAWAY_SOURCE_IDS,
    fetch_rockaway_source,
    rockaway_source_card,
    unavailable_rockaway_result,
)
from chat_state import (
    background_refresh_allowed,
    begin_chat_response,
    finish_chat_response,
    update_chat_response,
)
from esri_presentation import (
    build_presentation,
    discover_feature_layers,
    feature_label as esri_feature_label,
    feature_popup_html,
)

# ── Load jurisdiction config ──────────────────────────────────────────────────
CFG = load_config()
ROCKAWAY_SOURCES = [
    source for source_id in ROCKAWAY_SOURCE_IDS
    if (source := CFG.source(source_id)) is not None
]

# ── Config ────────────────────────────────────────────────────────────────────
def _setting(name: str, default: str = "") -> str:
    """Read Streamlit secrets when available, then fall back to environment vars.

    Streamlit raises StreamlitSecretNotFoundError when no secrets.toml exists;
    that is a normal local-development state and should not prevent the app
    from launching without optional Ollama credentials.
    """
    try:
        value = st.secrets.get(name)
    except (KeyError, StreamlitSecretNotFoundError):
        value = None
    return str(value) if value not in (None, "") else os.environ.get(name, default)


OLLAMA_API_KEY = _setting("OLLAMA_API_KEY")
OLLAMA_HOST    = _setting("OLLAMA_HOST", "https://ollama.com")
OLLAMA_MODEL   = _setting("OLLAMA_MODEL", "gpt-oss:120b-cloud")
CARTO_API_KEY  = _setting("CARTO_API_KEY")
AGOL_BASE      = "https://www.arcgis.com/sharing/rest"
OLLAMA_HEADERS = {"Content-Type": "application/json", "Authorization": f"Bearer {OLLAMA_API_KEY}"}
GAUGE_STATION_IDS = tuple(CFG.flood_thresholds_dict.keys()) or tuple(FLOOD_THRESHOLDS.keys())


def fetch_configured_gauges(previous=None):
    """Fetch the configured CO-OPS stations with retry and last-good preservation."""
    return fetch_all_ny_gauges(
        list(GAUGE_STATION_IDS), previous=previous, max_attempts=2,
    )


def configured_gauges_complete(gauge_data):
    return all(gauge_data.get(sid, {}).get("level") for sid in GAUGE_STATION_IDS)

# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(
    page_title=f"{CFG.app_title} — {CFG.short_name} Emergency Management",
    page_icon=CFG.logo_emoji, layout="wide", initial_sidebar_state="expanded"
)
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap');
html, body, [class*="css"] { font-family: 'IBM Plex Mono', monospace !important; }
.stApp { background: #07090d; color: #e0e0e8; }
section[data-testid="stSidebar"] { background: #090c12 !important; border-right: 1px solid #111820; }
.pill  { display:inline-block; padding:2px 8px; border-radius:12px; font-size:10px;
         font-weight:700; letter-spacing:0.05em; margin:2px; }
.p-green  { background:#4ade8020; color:#4ade80; border:1px solid #4ade8044; }
.p-red    { background:#f8717120; color:#f87171; border:1px solid #f8717144; }
.p-blue   { background:#60a5fa20; color:#60a5fa; border:1px solid #60a5fa44; }
.p-purple { background:#a78bfa20; color:#a78bfa; border:1px solid #a78bfa44; }
.p-yellow { background:#facc1520; color:#facc15; border:1px solid #facc1544; }
.esri-card { background:#0d1117; border:1px solid #1a1e2e; border-radius:6px;
             padding:10px 12px; margin-bottom:8px; }
</style>
""", unsafe_allow_html=True)

# ═══════════════════════════════════════════════════════════════════════════════
# DATA DEFINITIONS
# ═══════════════════════════════════════════════════════════════════════════════

# Knowledge base is now loaded from config/jurisdiction.yaml via CFG.knowledge_base
# NYC_KB kept as fallback alias
NYC_KB = {
    "floodZones": {"label": "Flood Zones (FEMA)", "source": "FEMA NFHL / NYC OEM", "data":
        "Zone A: High-risk coastal/tidal flood areas — Lower Manhattan, Red Hook, Rockaway Peninsula, Staten Island east shore.\n"
        "Zone AE: Special Flood Hazard Areas — Coney Island, Howard Beach, Broad Channel, southern Staten Island.\n"
        "Zone VE: Coastal high-hazard with wave action — Far Rockaway, Breezy Point, Sea Gate.\n"
        "Zone X (shaded): Moderate flood risk, 0.2% annual chance.\n"
        "Post-Sandy (2012): ~88,000 buildings damaged; $19B in damage."},
    "evacZones": {"label": "Evacuation Zones", "source": "NYC OEM", "data":
        "Zone 1: Mandatory evacuation Cat 1+ hurricanes. Rockaways, Coney Island, South Beach SI, Red Hook waterfront.\n"
        "Zone 2: Evacuation advised Cat 2+. Zones 3-6: progressively lower risk inland.\n"
        "Shelters: 30+ hurricane evacuation centers, ~600,000 primary capacity.\n"
        "Contraflow: FDR Drive, BQE, Staten Island Expressway."},
    "criticalInfrastructure": {"label": "Critical Infrastructure", "source": "NYC OEM / CISA", "data":
        "Hospitals: 11 Level 1 Trauma Centers — Bellevue (Manhattan), Kings County (Brooklyn), Lincoln (Bronx), Staten Island University, Jamaica (Queens).\n"
        "Power: ConEd East River substations critical. Underground feeders in Lower Manhattan flooded during Sandy.\n"
        "Subway: 245 miles track, 472 stations. 52 stations in flood zones.\n"
        "Water: DEP 14 reservoirs, 2 city tunnels. Newtown Creek & North River WWTPs flooded in Sandy."},
    "hazardProfiles": {"label": "Hazard Profiles", "source": "NYC OEM HMP 2023", "data":
        "HURRICANES: Sandy (2012, Cat 1) — $19B damage. Primary risk: storm surge.\n"
        "EXTREME HEAT: 115-150 deaths/year. Protocol at Heat Index >= 100F. 500+ cooling centers.\n"
        "FLOODING: Ida 2021 — 13 deaths in basement apartments. 22,000+ miles combined sewer.\n"
        "WINTER STORMS: Jonas 2016 — 27 inches, travel ban. 2,300 Sanitation plows.\n"
        "EARTHQUAKE: Low risk. Historical 1884 M5.5. Unreinforced masonry stock pre-1930.\n"
        "TERRORISM/HAZMAT: Highest-risk US city (DHS). JTTF, NYPD Intelligence, FDNY HazMat."},
    "resources": {"label": "Contacts & Resources", "source": "NYC OEM / 311", "data":
        "NYC OEM: 718-422-8700 | nyc.gov/oem | EOC: 165 Cadman Plaza East, Brooklyn\n"
        "FDNY: 911 | 718-999-2000 | NYPD: 911 | 646-610-5000\n"
        "NYC Health: 311 | FEMA Region 2: 212-680-3600\n"
        "NWS OKX: 631-924-0517 | Con Edison: 1-800-75-CONED\n"
        "Notify NYC: nyc.gov/notifynyc"},
}

LIVE_ENDPOINTS = [
    {"name": f"NWS Alerts — {CFG.state}",       "url": CFG.nws_alert_url,                                                                                         "type": "weather"},
    {"name": f"NWS Forecast — {CFG.short_name}", "url": CFG.nws_forecast_url,                                                                                      "type": "forecast"},
    {"name": "FEMA Disasters",                   "url": f"https://www.fema.gov/api/open/v2/disasterDeclarationsSummaries?state={CFG.noaa_fema_state}&$top=10&$orderby=declarationDate%20desc", "type": "fema"},
    {"name": "NYC 311 — Rockaway / Queens CB14", "url": f"https://{CFG.socrata_domain}/resource/erm2-nwe9.json?$limit=50&$order=created_date%20DESC&$where=borough%3D%27QUEENS%27%20AND%20community_board%3D%2714%20QUEENS%27%20AND%20latitude%20IS%20NOT%20NULL%20AND%20longitude%20IS%20NOT%20NULL", "type": "civic"},
]

MAP_POINTS = {
    "hospitals": {"label": "Trauma Centers", "color": "#f87171", "features": [
        {"name": "Bellevue Hospital",         "lat": 40.7394, "lng": -73.9754, "note": "Level 1 Trauma | Manhattan"},
        {"name": "Kings County Hospital",     "lat": 40.6551, "lng": -73.9444, "note": "Level 1 Trauma | Brooklyn"},
        {"name": "Lincoln Medical Center",    "lat": 40.8168, "lng": -73.9249, "note": "Level 1 Trauma | Bronx"},
        {"name": "Jamaica Hospital",          "lat": 40.7003, "lng": -73.7958, "note": "Level 1 Trauma | Queens"},
        {"name": "Staten Island University",  "lat": 40.5766, "lng": -74.1159, "note": "Level 1 Trauma | Staten Island"},
        {"name": "Maimonides Medical Center", "lat": 40.6356, "lng": -73.9985, "note": "Level 1 Trauma | Brooklyn"},
    ]},
    "shelters": {"label": "Evac Shelters", "color": "#60a5fa", "features": [
        {"name": "Boys & Girls HS",     "lat": 40.6797, "lng": -73.9434, "note": "Evac Center | Brooklyn"},
        {"name": "Brandeis HS",         "lat": 40.7960, "lng": -73.9804, "note": "Evac Center | Manhattan"},
        {"name": "August Martin HS",    "lat": 40.6719, "lng": -73.7770, "note": "Evac Center | Queens"},
        {"name": "PS 14 Staten Island", "lat": 40.6285, "lng": -74.0754, "note": "Evac Center | Zone 1"},
        {"name": "Lehman HS",           "lat": 40.8780, "lng": -73.8985, "note": "Evac Center | Bronx"},
    ]},
    "gauges": {"label": "Stream Gauges", "color": "#4ade80", "features": [
        {"name": "Battery Park Tidal Gauge", "lat": 40.7003, "lng": -74.0141, "note": "NOAA 8518750 — primary NYC surge gauge"},
        {"name": "Kings Point Tidal Gauge",  "lat": 40.8105, "lng": -73.7659, "note": "NOAA 8516945 — Long Island Sound"},
        {"name": "Jamaica Bay (Inwood)",     "lat": 40.6226, "lng": -73.7576, "note": "NOAA tidal — Zone A monitoring"},
        {"name": "Sandy Hook, NJ",           "lat": 40.4669, "lng": -74.0094, "note": "NOAA 8531680 — outer harbor reference"},
    ]},
    "eoc": {"label": "EOC / Command", "color": "#facc15", "features": [
        {"name": "NYC EOC",        "lat": 40.6967, "lng": -73.9896, "note": "Primary EOC — 165 Cadman Plaza East"},
        {"name": "Pier 92 Backup", "lat": 40.7671, "lng": -74.0029, "note": "Backup EOC / Mass Casualty staging"},
        {"name": "FEMA Region 2",  "lat": 40.7143, "lng": -74.0071, "note": "26 Federal Plaza"},
    ]},
    "floodRisk": {"label": "Flood Risk Areas", "color": "#fb923c", "features": [
        {"name": "Red Hook, Brooklyn",     "lat": 40.6745, "lng": -74.0097, "note": "Zone AE — flooded Sandy 2012"},
        {"name": "Coney Island",           "lat": 40.5755, "lng": -73.9707, "note": "Zone AE — 10ft+ surge Sandy"},
        {"name": "Rockaway Peninsula",     "lat": 40.5874, "lng": -73.8261, "note": "Zone VE/AE — highest surge risk"},
        {"name": "Howard Beach",           "lat": 40.6570, "lng": -73.8378, "note": "Zone AE — interior flood risk"},
        {"name": "South Beach, SI",        "lat": 40.5842, "lng": -74.0783, "note": "Zone AE — major Sandy impact"},
        {"name": "Lower Manhattan (FiDi)", "lat": 40.7074, "lng": -74.0104, "note": "Zone AE — subway/utility risk"},
        {"name": "Breezy Point",           "lat": 40.5587, "lng": -73.9290, "note": "Zone VE — wave action"},
    ]},
}

# Override MAP_POINTS with jurisdiction config if it has map_points defined
_cfg_map_points = CFG.map_points
if _cfg_map_points:
    MAP_POINTS = _cfg_map_points

WIND_STATIONS = CFG.nws_obs_stations or [
    {"id": "KFRG", "name": "Republic Airport", "lat": 40.7288, "lng": -73.4138},
    {"id": "KISP", "name": "Long Island MacArthur Airport", "lat": 40.7952, "lng": -73.1002},
    {"id": "KHWV", "name": "Brookhaven Airport", "lat": 40.8219, "lng": -72.8694},
    {"id": "KFOK", "name": "Gabreski Airport", "lat": 40.8437, "lng": -72.6318},
    {"id": "KMTP", "name": "Montauk Airport", "lat": 41.0765, "lng": -71.9208},
]

NOAA_ENDPOINTS = [
    {"id": "nws_alerts_ny",     "cat": "NWS",    "color": "#60a5fa", "icon": "🌩", "name": f"Active Alerts — {CFG.state}",            "url": CFG.nws_alert_url,        "desc": f"All active NWS alerts for {CFG.state_full}",             "tags": ["alerts","flood","coastal","winter storm"]},
    {"id": "nws_alerts_severe", "cat": "NWS",    "color": "#60a5fa", "icon": "🌩", "name": "Extreme/Severe Alerts Only",             "url": f"{CFG.nws_alert_url}&severity=Extreme,Severe&status=actual", "desc": "Only extreme and severe active alerts",                 "tags": ["extreme","severe","priority"]},
    {"id": "nws_forecast_li",   "cat": "NWS",    "color": "#60a5fa", "icon": "🌩", "name": f"7-Day Forecast — {CFG.short_name}",      "url": CFG.nws_forecast_url,     "desc": f"NWS {CFG.nws_office} 7-day forecast for {CFG.name}",     "tags": ["forecast","7-day","temperature"]},
    {"id": "nws_forecast_hrly", "cat": "NWS",    "color": "#60a5fa", "icon": "🌩", "name": f"Hourly Forecast — {CFG.short_name}",     "url": CFG.nws_hourly_url,       "desc": "Hour-by-hour forecast — temp, wind, precipitation prob", "tags": ["hourly","wind","precipitation"]},
    {"id": "nws_grid_wind",     "cat": "NWS",    "color": "#60a5fa", "icon": "🌩", "name": f"Wind & Precip Grid — {CFG.short_name}",  "url": CFG.nws_gridpoint_url,    "desc": "Full NWS gridpoint — wind, gusts, direction, QPF",       "tags": ["wind","QPF","precipitation","grid"]},
    *[
        {"id": f"nws_obs_{s['id'].lower()}", "cat": "NWS", "color": "#60a5fa", "icon": "🌩",
         "name": f"Observations — {s['name']}", "url": f"https://api.weather.gov/stations/{s['id']}/observations/latest",
         "desc": f"Latest surface observation from {s['name']}", "tags": ["observations","airport","wind","current conditions"]}
        for s in WIND_STATIONS
    ],
    {"id": "nws_products_okx",  "cat": "NWS",    "color": "#60a5fa", "icon": "🌩", "name": f"Text Products — NWS {CFG.nws_office}", "url": f"https://api.weather.gov/products?office={CFG.nws_products_office}&limit=10", "desc": "Latest NWS text products: AFD, Coastal Hazards, etc.", "tags": ["AFD","forecast discussion","text products"]},
    {"id": "coops_kings_point", "cat": "CO-OPS", "color": "#34d399", "icon": "🌊", "name": "Water Level — Kings Point",          "url": "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=8516945&product=water_level&datum=MLLW&time_zone=lst_ldt&units=english&format=json&application=EMBER", "desc": "Real-time water level — Long Island Sound",               "tags": ["water level","long island sound"]},
    {"id": "coops_montauk",     "cat": "CO-OPS", "color": "#34d399", "icon": "🌊", "name": "Water Level — Montauk",              "url": "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=8510560&product=water_level&datum=MLLW&time_zone=lst_ldt&units=english&format=json&application=EMBER", "desc": "Real-time water level — eastern Long Island",              "tags": ["water level","montauk","east end"]},
    {"id": "coops_sandy_hook",  "cat": "CO-OPS", "color": "#34d399", "icon": "🌊", "name": "Water Level — Sandy Hook Reference", "url": "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=8531680&product=water_level&datum=MLLW&time_zone=lst_ldt&units=english&format=json&application=EMBER", "desc": "Outer-harbor water-level reference",                       "tags": ["water level","sandy hook","reference"]},
    {"id": "coops_battery",     "cat": "CO-OPS", "color": "#34d399", "icon": "🌊", "name": "Water Level — The Battery Reference","url": "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=8518750&product=water_level&datum=MLLW&time_zone=lst_ldt&units=english&format=json&application=EMBER", "desc": "NY Harbor surge reference used for regional comparison",   "tags": ["water level","surge","battery","reference"]},
    {"id": "coops_predictions", "cat": "CO-OPS", "color": "#34d399", "icon": "🌊", "name": "Tidal Predictions — Kings Point 48h","url": "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=today&range=48&station=8516945&product=predictions&datum=MLLW&time_zone=lst_ldt&interval=hilo&units=english&format=json&application=EMBER", "desc": "High/low tide predictions — next 48 hours",               "tags": ["tide predictions","high tide","low tide"]},
    {"id": "coops_wind",        "cat": "CO-OPS", "color": "#34d399", "icon": "🌊", "name": "Wind — Kings Point Station",        "url": "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=8516945&product=wind&time_zone=lst_ldt&units=english&format=json&application=EMBER",                   "desc": "Real-time wind speed and direction at Kings Point",        "tags": ["wind","meteorological","long island sound"]},
    {"id": "coops_stations_ny", "cat": "CO-OPS", "color": "#34d399", "icon": "🌊", "name": "All CO-OPS Stations — NY",        "url": "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/portsstation.json?ports=ny",                                                       "desc": "All CO-OPS stations in the New York port region",          "tags": ["stations","inventory"]},
    {"id": "ncei_datasets",     "cat": "NCEI",   "color": "#f59e0b", "icon": "📊", "name": "NCEI Dataset Catalog",            "url": "https://www.ncei.noaa.gov/access/services/support/v3/datasets.json",                                                                    "desc": "Full catalog of all NCEI datasets",                        "tags": ["catalog","datasets","metadata"]},
    {"id": "ncei_daily_frg",    "cat": "NCEI",   "color": "#f59e0b", "icon": "📊", "name": "Daily Summaries — Republic Airport", "url": "DYNAMIC_FRG", "dynamic": True, "desc": "Last 7 days of daily weather from Republic Airport",      "tags": ["daily summaries","farmingdale","republic","wind"]},
    {"id": "ncei_daily_hwv",    "cat": "NCEI",   "color": "#f59e0b", "icon": "📊", "name": "Daily Summaries — Brookhaven Airport","url": "DYNAMIC_HWV", "dynamic": True, "desc": "Last 7 days of daily weather from Brookhaven Airport",    "tags": ["daily summaries","brookhaven","shirley","wind"]},
    {"id": "ncei_daily_fok",    "cat": "NCEI",   "color": "#f59e0b", "icon": "📊", "name": "Daily Summaries — Gabreski Airport",  "url": "DYNAMIC_FOK", "dynamic": True, "desc": "Last 7 days of daily weather from Gabreski Airport",      "tags": ["daily summaries","westhampton","gabreski","wind"]},
    {"id": "ncei_storm_meta",   "cat": "NCEI",   "color": "#f59e0b", "icon": "📊", "name": "Storm Events Dataset Metadata",   "url": "https://www.ncei.noaa.gov/access/services/support/v3/datasets/storm-events.json",                                                      "desc": "Metadata for NCEI storm events database",                  "tags": ["storm events","metadata","historical"]},
    {"id": "spc_watches",       "cat": "SPC",    "color": "#f87171", "icon": "⚡", "name": "Active Watches (Tornado/SVR)",    "url": "https://api.weather.gov/alerts/active?status=actual&event=Tornado%20Watch,Severe%20Thunderstorm%20Watch&zone=NYC059,NYC103,NYC081", "desc": "Currently active tornado and severe thunderstorm watches for Nassau, Suffolk, and Queens", "tags": ["watches","tornado","severe thunderstorm"]},
    {"id": "spc_day1",          "cat": "SPC",    "color": "#f87171", "icon": "⚡", "name": "Day 1 Convective Outlook",        "url": "https://www.spc.noaa.gov/products/outlook/day1otlk.txt", "text": True,  "desc": "SPC Day 1 convective outlook — categorical severe risk",   "tags": ["convective","outlook","severe"]},
    {"id": "swpc_alerts",       "cat": "SWPC",   "color": "#a78bfa", "icon": "☀️", "name": "Space Weather Alerts",           "url": "https://services.swpc.noaa.gov/products/alerts.json",                                                                                   "desc": "Current space weather alerts, watches, warnings",          "tags": ["space weather","geomagnetic","solar flare","GPS"]},
    {"id": "swpc_solar_wind",   "cat": "SWPC",   "color": "#a78bfa", "icon": "☀️", "name": "Solar Wind — DSCOVR Real-Time",  "url": "https://services.swpc.noaa.gov/products/solar-wind/plasma-7-day.json",                                                                 "desc": "Real-time solar wind plasma from DSCOVR satellite",        "tags": ["solar wind","real-time","DSCOVR"]},
    {"id": "swpc_kp",           "cat": "SWPC",   "color": "#a78bfa", "icon": "☀️", "name": "Planetary K-Index (1-min)",      "url": "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json",                                                                        "desc": "1-minute Kp index — geomagnetic disturbance level",        "tags": ["Kp index","geomagnetic"]},
]

MAP_CONNECTED_IDS = {
    "coops_battery", "coops_kings_point", "coops_fire_island", "coops_bay_shore",
    "coops_predictions", "coops_wind",
    "nws_alerts_ny", "nws_alerts_severe",
    *{f"nws_obs_{s['id'].lower()}" for s in WIND_STATIONS},
}

REFRESH_INTERVALS = {
    "coops_battery": 300, "coops_kings_point": 300, "coops_fire_island": 300, "coops_bay_shore": 300,
    "coops_wind": 300, "coops_predictions": 1800,
    "nws_alerts_ny": 180, "nws_alerts_severe": 180,
    **{f"nws_obs_{s['id'].lower()}": 300 for s in WIND_STATIONS},
    "nws_forecast_li": 3600, "nws_forecast_hrly": 3600, "nws_grid_wind": 3600,
    "ncei_daily_frg": 86400, "ncei_daily_hwv": 86400, "ncei_daily_fok": 86400,
}

LIVING_ATLAS_FILTERS = {
    "All Public": "", "Living Atlas Only": "owner:esri_livingatlas",
    "Flood / Hydrology": "tags:flood OR tags:hydrology",
    "Hurricanes": "tags:hurricane OR tags:storm surge",
    "Wildfire": "tags:wildfire OR tags:fire perimeter",
    "Emergency Mgmt": "tags:emergency management OR tags:disaster",
    "Critical Infra": "tags:critical infrastructure",
    "Climate / Weather": "tags:climate OR tags:weather",
    "NYC / New York": "tags:New York City OR tags:NYC",
    "FEMA": "tags:FEMA OR owner:FEMA",
}
ITEM_TYPES = ["", "Feature Layer", "Map Service", "Image Service",
              "Vector Tile Layer", "Web Map", "Web Scene", "Feature Collection",
              "StoryMap", "Dashboard"]

# ═══════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS — all defined at module level before any UI code
# ═══════════════════════════════════════════════════════════════════════════════

def ping_ollama():
    if not OLLAMA_API_KEY: return "no-key"
    try:
        r = requests.get(f"{OLLAMA_HOST}/api/tags", headers=OLLAMA_HEADERS, timeout=5)
        return r.ok
    except:
        return False

def fetch_live(ep):
    try:
        r = requests.get(ep["url"], timeout=7)
        r.raise_for_status()
        return {"success": True, "data": r.json(), "name": ep["name"], "type": ep["type"]}
    except Exception as e:
        return {"success": False, "error": str(e), "name": ep["name"], "type": ep["type"]}

def summarize_api(result):
    if not result["success"]: return f"[{result['name']}: unavailable — {result['error']}]"
    d, t = result["data"], result["type"]
    try:
        if t == "weather" and "features" in d:
            alerts = "; ".join(f"{f['properties']['event']} — {str(f['properties'].get('headline',''))[:80]}" for f in d["features"][:3])
            return f"NWS Alerts (NY): {len(d['features'])} active. {alerts or 'None'}"
        if t == "forecast" and "properties" in d:
            return "NWS Forecast: " + "; ".join(f"{p['name']}: {p['shortForecast']}, {p['temperature']}°{p['temperatureUnit']}" for p in d["properties"].get("periods", [])[:3])
        if t == "flood" and "value" in d:
            return "USGS Gauges: " + "; ".join(f"{g['sourceInfo']['siteName']}: {g['values'][0]['value'][0]['value'] if g.get('values') else 'N/A'} ft" for g in d["value"].get("timeSeries", [])[:4])
        if t == "fema" and "DisasterDeclarationsSummaries" in d:
            return "FEMA NY: " + "; ".join(f"{x['incidentType']} — {x['declarationTitle']}" for x in d["DisasterDeclarationsSummaries"][:3])
        if t == "civic" and isinstance(d, list):
            return "NYC 311: " + "; ".join(f"{x.get('complaint_type','?')}: {x.get('descriptor','?')} ({x.get('borough','?')})" for x in d[:3])
        return f"[{result['name']}: received]"
    except:
        return f"[{result['name']}: parse error]"

def build_live_readings(api_results):
    readings = {}
    for r in api_results:
        if not r.get("success"): continue
        d = r.get("data", {})
        if r.get("type") == "flood" and isinstance(d, dict) and "value" in d:
            for ts in d["value"].get("timeSeries", []):
                site = ts.get("sourceInfo", {}).get("siteName", "")
                vals = ts.get("values", [{}])[0].get("value", [])
                if vals and site:
                    try:
                        fval = float(vals[-1].get("value", 0))
                        readings[site] = {"level": f"{fval:.2f}", "unit": "ft", "source": "USGS",
                                          "status": "flood" if fval > 10 else "elevated" if fval > 5 else "normal"}
                    except:
                        pass
        if r.get("type") == "weather" and isinstance(d, dict) and "features" in d:
            for f in d["features"]:
                evt = f.get("properties", {}).get("event", "")
                if any(kw in evt.lower() for kw in ["flood", "surge", "coastal"]):
                    readings["__flood_alert__"] = {"event": evt, "severity": f["properties"].get("severity", ""),
                                                   "headline": (f["properties"].get("headline") or "")[:120]}
                    break
    return readings

def resolve_url(ep):
    if not ep.get("dynamic"): return ep["url"]
    today    = _dt.date.today().isoformat()
    week_ago = (_dt.date.today() - _dt.timedelta(days=7)).isoformat()
    base = "https://www.ncei.noaa.gov/access/services/data/v1?dataset=daily-summaries&dataTypes=TMAX,TMIN,PRCP,SNOW,AWND&format=json&units=standard"
    station_ids = {
        "ncei_daily_frg": "GHCND:USW00054787",
        "ncei_daily_hwv": "GHCND:USW00094791",
        "ncei_daily_fok": "GHCND:USW00094745",
    }
    if ep["id"] in station_ids:
        return f"{base}&stations={station_ids[ep['id']]}&startDate={week_ago}&endDate={today}"
    return ep["url"]

def fetch_noaa_ep(ep):
    url = resolve_url(ep)
    try:
        r = requests.get(url, timeout=10, headers={"User-Agent": "EMBER/1.0"})
        r.raise_for_status()
        is_text = ep.get("text") or "text/plain" in r.headers.get("content-type", "")
        return {"success": True, "data": r.text if is_text else r.json(),
                "text": is_text, "ep": ep, "fetched_at": _dt.datetime.now().strftime("%H:%M:%S")}
    except Exception as e:
        return {"success": False, "error": str(e), "ep": ep,
                "fetched_at": _dt.datetime.now().strftime("%H:%M:%S")}

def summarize_noaa(result):
    if not result["success"]: return f"[{result['ep']['name']}: failed — {result['error']}]"
    d, ep, ts = result["data"], result["ep"], result.get("fetched_at", "?")
    try:
        if result.get("text"): return f"[NOAA {ep['name']} @ {ts}]\n{str(d)[:800]}"
        if "features" in d and "alert" in ep["id"]:
            alerts = "\n".join(f"  - {f['properties']['event']} ({f['properties']['severity']}): {str(f['properties'].get('headline',''))[:90]}" for f in d["features"][:5])
            return f"[NWS Alerts @ {ts}: {len(d['features'])} active]\n{alerts or '  None active'}"
        if "forecast" in ep["id"] and "properties" in d and "periods" in d.get("properties", {}):
            periods = "\n".join(f"  {p['name']}: {p['shortForecast']}, {p['temperature']}°{p['temperatureUnit']}" for p in d["properties"]["periods"][:6])
            return f"[NWS Forecast @ {ts}]\n{periods}"
        if "grid" in ep["id"] and "properties" in d:
            p = d["properties"]
            ws  = [v for v in p.get("windSpeed", {}).get("values", [])[:6] if v.get("value") is not None]
            qpf = [v for v in p.get("quantitativePrecipitation", {}).get("values", [])[:6] if v.get("value") is not None]
            speeds = ", ".join(f"{v['value']*0.621371:.0f}mph" for v in ws)
            inches = ", ".join(f"{v['value']*0.0393701:.2f}\"" for v in qpf)
            return f"[NWS Grid Wind & Precip @ {ts}]\n  Wind (next 6h): {speeds}\n  QPF (next 6h): {inches}"
        if "obs" in ep["id"] and "properties" in d:
            p = d["properties"]
            tempF   = f"{(p['temperature']['value']*9/5+32):.1f}°F" if p.get("temperature", {}).get("value") is not None else "?"
            windMph = f"{(p['windSpeed']['value']*0.621371):.1f}mph"  if p.get("windSpeed", {}).get("value")  is not None else "?"
            return f"[NWS Obs — {ep['name']} @ {ts}]\n  Temp: {tempF} | Wind: {windMph} | {p.get('textDescription','?')}"
        if "coops" in ep["id"] and "data" in d and ep["id"] != "coops_wind":
            latest = d["data"][-1] if d.get("data") else {}
            meta   = d.get("metadata", {})
            return f"[CO-OPS {meta.get('name', ep['name'])} @ {ts}]\n  Water level: {latest.get('v','?')} ft MLLW @ {latest.get('t','?')}"
        if ep["id"] == "coops_predictions" and "predictions" in d:
            preds = "\n".join(f"  {'HIGH' if p['type']=='H' else 'low '} {p['v']}ft @ {p['t']}" for p in d["predictions"][:8])
            return f"[CO-OPS Tidal Predictions @ {ts}]\n{preds}"
        if ep["id"] == "coops_wind" and "data" in d:
            w = d["data"][-1] if d.get("data") else {}
            return f"[CO-OPS Wind @ {ts}]\n  Speed: {w.get('s','?')} knots | Dir: {w.get('dr','?')} | Gusts: {w.get('g','?')} knots"
        if "stations" in ep["id"] and "stations" in d:
            return f"[CO-OPS Stations: {len(d['stations'])}]\n" + "\n".join(f"  {s['id']}: {s['name']}" for s in d["stations"][:8])
        if "datasets" in d:
            return f"[NCEI Datasets: {len(d['datasets'])}]\n" + "\n".join(f"  {ds['id']}: {ds['name']}" for ds in d["datasets"][:10])
        if isinstance(d, list) and len(d) > 0 and isinstance(d[0], dict) and "DATE" in d[0]:
            rows = "\n".join(f"  {r['DATE']}: TMAX={r.get('TMAX','?')} TMIN={r.get('TMIN','?')} PRCP={r.get('PRCP','?')}" for r in d[:7])
            return f"[NCEI Daily Summaries @ {ts}]\n{rows}"
        if isinstance(d, list) and ep["id"] == "swpc_alerts":
            return f"[Space Weather Alerts @ {ts}: {len(d)}]\n" + "\n".join(f"  {str(a.get('message',''))[:120]}" for a in d[:4])
        return f"[NOAA {ep['name']} @ {ts}]: {json.dumps(d)[:400]}"
    except Exception as e:
        return f"[NOAA {ep['name']}: parse error — {e}]"

def upsert_noaa_kb(ep, result):
    content = summarize_noaa(result)
    ts      = result.get("fetched_at", _dt.datetime.now().strftime("%H:%M:%S"))
    entry   = {"name": f"NOAA: {ep['name']}", "item_id": ep["id"],
               "content": f"[NOAA Open Data — {ep['name']}]\nFetched: {ts}\nSource: {resolve_url(ep)}\n\n{content}",
               "fetched_at": ts, "map_connected": ep["id"] in MAP_CONNECTED_IDS}
    items = st.session_state.noaa_items
    idx   = next((i for i, x in enumerate(items) if x["item_id"] == ep["id"]), None)
    if idx is not None: items[idx] = entry
    else:               items.append(entry)

def extract_map_readings_from_noaa():
    readings = {}
    for ep_id, result in st.session_state.get("noaa_results", {}).items():
        if not result.get("success"): continue
        d  = result["data"]
        ep = result["ep"]
        ts = result.get("fetched_at", "?")
        # CO-OPS water levels
        if isinstance(d, dict) and "data" in d and ep_id.startswith("coops_") and ep_id not in ("coops_wind", "coops_predictions", "coops_stations_ny"):
            meta = d.get("metadata", {})
            vals = d.get("data", [])
            if vals:
                try:
                    fval = float(vals[-1].get("v", 0))
                    name = meta.get("name") or ep["name"]
                    readings[name] = {"level": f"{fval:.2f}", "unit": "ft MLLW", "source": f"CO-OPS @ {ts}",
                                      "status": "flood" if fval > 10 else "elevated" if fval > 5 else "normal"}
                except:
                    pass
        # CO-OPS next HIGH tide
        if isinstance(d, dict) and "predictions" in d and ep_id == "coops_predictions":
            next_high = next((p for p in d["predictions"] if p.get("type") == "H"), None)
            if next_high:
                readings["__next_high_tide__"] = {"level": next_high["v"], "unit": "ft MLLW",
                                                   "time": next_high["t"], "source": f"CO-OPS @ {ts}"}
        # CO-OPS wind
        if isinstance(d, dict) and "data" in d and ep_id == "coops_wind":
            wvals = d.get("data", [])
            if wvals:
                w = wvals[-1]
                readings["__battery_wind__"] = {"speed_knots": w.get("s","?"), "direction": w.get("dr","?"),
                                                 "gusts_knots": w.get("g","?"), "source": f"CO-OPS @ {ts}"}
        # NWS flood alerts
        if isinstance(d, dict) and "features" in d and "alert" in ep_id:
            for f in d["features"]:
                evt = f.get("properties", {}).get("event", "")
                if any(kw in evt.lower() for kw in ["flood", "surge", "coastal"]):
                    readings["__flood_alert__"] = {"event": evt, "severity": f["properties"].get("severity",""),
                                                   "headline": (f["properties"].get("headline") or "")[:120],
                                                   "source": f"NWS @ {ts}"}
                    break
        # NWS surface obs
        if isinstance(d, dict) and "properties" in d and "obs" in ep_id:
            p          = d["properties"]
            station_id = ep_id.replace("nws_obs_", "").upper()
            speed_kmh  = p.get("windSpeed",    {}).get("value")
            gust_kmh   = p.get("windGust",     {}).get("value")
            dir_deg    = p.get("windDirection",{}).get("value")
            precip_mm  = p.get("precipitationLastHour", {}).get("value")
            if speed_kmh is not None and dir_deg is not None:
                readings[f"__nws_obs_{station_id}__"] = {
                "station": station_id,
                "speed_mph": round(speed_kmh * 0.621371, 1),
                "gust_mph":  round(gust_kmh  * 0.621371, 1) if gust_kmh else None,
                "dir_deg":   dir_deg,
                "precip_in": round(precip_mm * 0.0393701, 2) if precip_mm else None,
                "desc":      p.get("textDescription", ""),
                "source":    f"NWS @ {ts}",
                }
    return readings

def auto_fetch_map_endpoints():
    ep_map = {ep["id"]: ep for ep in NOAA_ENDPOINTS}
    for ep_id in MAP_CONNECTED_IDS:
        ep = ep_map.get(ep_id)
        if ep and ep_id not in st.session_state.noaa_results:
            result = fetch_noaa_ep(ep)
            st.session_state.noaa_results[ep_id] = result
            if result["success"]:
                upsert_noaa_kb(ep, result)

def refresh_stale_endpoints():
    now    = _dt.datetime.now()
    ep_map = {ep["id"]: ep for ep in NOAA_ENDPOINTS}
    for ep_id, interval in REFRESH_INTERVALS.items():
        if interval == 0: continue
        result = st.session_state.noaa_results.get(ep_id)
        if result and result.get("fetched_at"):
            try:
                fetched  = _dt.datetime.strptime(result["fetched_at"], "%H:%M:%S").replace(
                    year=now.year, month=now.month, day=now.day)
                if (now - fetched).total_seconds() < interval: continue
            except:
                pass
        ep = ep_map.get(ep_id)
        if not ep: continue
        new_result = fetch_noaa_ep(ep)
        st.session_state.noaa_results[ep_id] = new_result
        if new_result["success"]:
            upsert_noaa_kb(ep, new_result)

def fetch_wind_obs():
    results = []
    for s in WIND_STATIONS:
        try:
            r = requests.get(f"https://api.weather.gov/stations/{s['id']}/observations/latest",
                             timeout=6, headers={"User-Agent": "EMBER/1.0"})
            if not r.ok: continue
            p = r.json()["properties"]
            def _mph(kmh): return round(kmh * 0.621371, 0) if kmh is not None else None
            def _in(mm):  return round(mm * 0.0393701, 2) if mm is not None else None
            results.append({**s,
                "speed_mph": _mph(p.get("windSpeed",           {}).get("value")),
                "gust_mph":  _mph(p.get("windGust",            {}).get("value")),
                "dir_deg":   p.get("windDirection", {}).get("value"),
                "temp_f":    round(p["temperature"]["value"]*9/5+32, 0) if p.get("temperature",{}).get("value") is not None else None,
                "precip_in": _in(p.get("precipitationLastHour",{}).get("value")),
                "desc":      p.get("textDescription", ""),
            })
        except:
            continue
    return results

def build_map(active_layers, show_radar=True, show_wind=True, wind_obs=None,
              live_readings=None, gauge_data=None, map_layers=None, map_points=None,
              rockaway_results=None, active_rockaway_layers=None):
    live_readings = live_readings or {}
    wind_obs      = wind_obs or []
    gauge_data    = gauge_data or {}
    map_layers    = map_layers or []
    map_points    = map_points or MAP_POINTS
    rockaway_results = rockaway_results or {}
    active_rockaway_layers = active_rockaway_layers or []
    basemap_url, basemap_attr, basemap_name = basemap_config(CARTO_API_KEY)
    m = folium.Map(location=list(CFG.center), zoom_start=CFG.zoom,
                   tiles=None, prefer_canvas=True)
    folium.TileLayer(
        tiles=basemap_url, name=basemap_name, attr=basemap_attr,
        overlay=False, control=True,
    ).add_to(m)
    # NEXRAD radar tiles with 5-min cache buster
    if show_radar:
        epoch_5min = int(_time.time() // 300)
        folium.TileLayer(
            tiles=f"https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{{z}}/{{x}}/{{y}}.png?_={epoch_5min}",
            name="NEXRAD Radar", attr="NEXRAD &copy; Iowa State MESONET",
            opacity=0.65, overlay=True, control=True,
        ).add_to(m)

    # ── Live tidal gauge layer (separate from static gauge markers) ────────────
    if gauge_data:
        tg_fg = folium.FeatureGroup(name="🌊 Live Tidal Gauges (CO-OPS)", show=True)
        for sid, gd in gauge_data.items():
            ld = gd.get("level")
            if not ld or not ld.get("lat") or not ld.get("lng"):
                # Try to find coords from the station list if level data has no coords
                continue
            lat, lng = ld.get("lat", 0), ld.get("lng", 0)
            if lat == 0 and lng == 0:
                continue
            color   = gauge_marker_color(gd)
            lft     = ld.get("level_ft", 0)
            status  = ld.get("status", "NORMAL")
            popup_h = build_gauge_popup(gd)

            # Pulsing circle — outer ring shows flood status, inner solid
            folium.CircleMarker(
                location=[lat, lng], radius=16,
                color=color, fill=False, weight=2, opacity=0.5,
            ).add_to(tg_fg)
            folium.CircleMarker(
                location=[lat, lng], radius=9,
                color=color, fill=True, fill_color=color, fill_opacity=0.85, weight=2,
                popup=folium.Popup(popup_h, max_width=280),
                tooltip=f"🌊 {ld.get('station_name','Station')} — {lft:.2f}ft MLLW — {status}",
            ).add_to(tg_fg)

            # Level label
            folium.Marker(
                location=[lat, lng],
                icon=folium.DivIcon(
                    html=f'<div style="font-family:monospace;font-size:10px;font-weight:700;'
                         f'color:{color};background:#07090dcc;padding:1px 4px;border-radius:3px;'
                         f'border:1px solid {color}55;white-space:nowrap;margin-top:14px;margin-left:12px">'
                         f'{lft:.2f}ft</div>',
                    icon_size=(60, 20), icon_anchor=(0, 0)
                )
            ).add_to(tg_fg)

        tg_fg.add_to(m)
    # Marker layers
    for key, layer in map_points.items():
        if key not in active_layers: continue
        fg = folium.FeatureGroup(name=layer["label"])
        for f in layer["features"]:
            reading      = None
            marker_color = layer["color"]
            if key == "gauges" and live_readings:
                for site_name, r in live_readings.items():
                    if site_name.startswith("__"): continue
                    fname_word = f["name"].split(",")[0].lower().split()[0]
                    if fname_word in site_name.lower() or site_name.lower().split(" at ")[0] in f["name"].lower():
                        reading = r
                        marker_color = {"flood": "#f87171", "elevated": "#facc15", "normal": "#4ade80"}.get(r.get("status","normal"), layer["color"])
                        break
            live_html = ""
            if reading:
                sc = {"flood": "#f87171", "elevated": "#facc15", "normal": "#4ade80"}.get(reading.get("status","normal"), "#4ade80")
                live_html = (f'<div style="border-top:1px solid #1e2a40;padding-top:5px;margin-top:4px">'
                             f'<span style="color:{sc};font-weight:700">{reading.get("level","?")} {reading.get("unit","")}</span>'
                             f'<span style="color:#556;font-size:9px;margin-left:4px">{reading.get("status","").upper()}</span><br>'
                             f'<span style="color:#446;font-size:9px">{reading.get("source","")}</span></div>')
            popup_html = (f'<div style="font-family:monospace;font-size:11px">'
                          f'<b style="color:{marker_color}">{f["name"]}</b><br>'
                          f'<span style="color:#778">{f["note"]}</span>{live_html}</div>')
            folium.CircleMarker(
                location=[f["lat"], f["lng"]], radius=8,
                color=marker_color, fill=True, fill_color=marker_color, fill_opacity=0.6,
                popup=folium.Popup(popup_html, max_width=240),
                tooltip=f'{f["name"]}' + (f' — {reading.get("level","?")} {reading.get("unit","")}' if reading else "")
            ).add_to(fg)
        fg.add_to(m)
    # Phase 4 normalized Rockaway layers. Only records carrying approved source
    # geometry are mapped; card-only sources never receive synthetic points.
    for source in ROCKAWAY_SOURCES:
        source_id = source["id"]
        if source_id not in active_rockaway_layers:
            continue
        result = rockaway_results.get(source_id, {})
        records = [record for record in result.get("records", []) if record.get("geometry")]
        if not records:
            continue
        display = source.get("display", {})
        color = display.get("color", "#60a5fa")
        icon = display.get("icon", "📍")
        fg = folium.FeatureGroup(name=f"{icon} {source['name']}", show=True)
        for record in records:
            geometry = record.get("geometry", {})
            if geometry.get("type") != "Point" or len(geometry.get("coordinates", [])) < 2:
                continue
            longitude, latitude = geometry["coordinates"][:2]
            popup_h = (
                f'<div style="font-family:monospace;font-size:11px">'
                f'<b style="color:{color}">{_html.escape(icon)} {_html.escape(str(record.get("title", "")))}</b><br>'
                f'<span style="color:#aac">{_html.escape(str(record.get("description") or record.get("category") or ""))}</span><br><br>'
                f'<span style="color:#778">{_html.escape(str(record.get("source_name", "")))} · {_html.escape(str(record.get("observed_at", "")))}</span><br>'
                f'<span style="color:#556">{_html.escape(str(record.get("attribution", "")))}</span></div>'
            )
            folium.CircleMarker(
                location=[latitude, longitude], radius=7,
                color=color, fill=True, fill_color=color, fill_opacity=0.7,
                popup=folium.Popup(popup_h, max_width=280),
                tooltip=str(record.get("title", source["name"]))[:80],
            ).add_to(fg)
        fg.add_to(m)
    # Wind arrows
    if show_wind and wind_obs:
        wfg = folium.FeatureGroup(name="Wind Observations")
        for o in wind_obs:
            if o.get("speed_mph") is None or o.get("dir_deg") is None: continue
            spd   = int(o["speed_mph"])
            gust  = int(o["gust_mph"]) if o.get("gust_mph") else None
            color = "#4ade80" if spd < 15 else "#facc15" if spd < 25 else "#fb923c" if spd < 40 else "#f87171"
            to_dir = (o["dir_deg"] + 180) % 360
            html = (f'<div style="font-family:monospace;text-align:center">'
                    f'<div style="transform:rotate({to_dir}deg);font-size:20px;color:{color}">↑</div>'
                    f'<div style="font-size:9px;font-weight:700;color:{color};background:#07090dcc;'
                    f'padding:1px 3px;border-radius:2px">{spd}{"g"+str(gust) if gust else ""}mph</div></div>')
            popup_txt = (f'<b style="color:{color}">{o["id"]} — {o["name"]}</b><br>'
                         f'Wind: {spd}mph from {int(o["dir_deg"])}°'
                         + (f' (gusts {gust}mph)' if gust else '')
                         + (f'<br>Precip (1h): {o["precip_in"]}"' if o.get("precip_in") is not None else '')
                         + (f'<br>Temp: {int(o["temp_f"])}°F' if o.get("temp_f") is not None else '')
                         + (f'<br>{o["desc"]}' if o.get("desc") else ''))
            folium.Marker(
                location=[o["lat"], o["lng"]],
                icon=folium.DivIcon(html=html, icon_size=(50, 40), icon_anchor=(25, 10)),
                popup=folium.Popup(f'<div style="font-family:monospace;font-size:11px">{popup_txt}</div>', max_width=220),
                tooltip=f'{o["id"]}: {spd}mph'
            ).add_to(wfg)
        wfg.add_to(m)
    # ── User-added map layers (NYC Open Data + ESRI Feature Layers) ───────────
    LAYER_COLORS = ["#f472b6","#818cf8","#2dd4bf","#fb7185","#a3e635","#fbbf24","#60a5fa","#c084fc"]
    for li, layer in enumerate(map_layers):
        if not layer.get("visible", True): continue
        lcolor = layer.get("color", LAYER_COLORS[li % len(LAYER_COLORS)])
        fg = folium.FeatureGroup(name=f"{layer.get('icon','📍')} {layer['name']}", show=True)

        for feat in layer.get("features", []):
            ftype = feat.get("type", "point")
            presentation = layer.get("presentation")
            label = (
                esri_feature_label(feat, presentation, layer["name"])
                if layer.get("type") == "esri"
                else feat.get("label", layer["name"])
            )
            popup_h = (
                esri_feature_popup_html(feat, layer["name"], lcolor, presentation)
                if layer.get("type") == "esri"
                else layer.get("popup_fn")(feat) if layer.get("popup_fn") else (
                    f'<div style="font-family:monospace;font-size:11px">'
                    f'<b style="color:{lcolor}">{feat.get("label","") or layer["name"]}</b></div>'
                )
            )

            if ftype == "point":
                folium.CircleMarker(
                    location=[feat["lat"], feat["lng"]], radius=6,
                    color=lcolor, fill=True, fill_color=lcolor, fill_opacity=0.7, weight=1.5,
                    popup=folium.Popup(popup_h, max_width=360),
                    tooltip=label[:80],
                ).add_to(fg)

            elif ftype == "polygon":
                try:
                    folium.GeoJson(
                        {"type": "Feature", "geometry": feat["geometry"], "properties": feat["props"]},
                        style_function=lambda f, c=lcolor: {
                            "fillColor": c, "color": c, "weight": 2,
                            "fillOpacity": 0.25, "opacity": 0.8
                        },
                        tooltip=label[:80],
                        popup=folium.Popup(popup_h, max_width=360),
                    ).add_to(fg)
                except:
                    pass

            elif ftype == "line":
                try:
                    folium.GeoJson(
                        {"type": "Feature", "geometry": feat["geometry"], "properties": feat["props"]},
                        style_function=lambda f, c=lcolor: {"color": c, "weight": 3, "opacity": 0.8},
                        tooltip=label[:80],
                        popup=folium.Popup(popup_h, max_width=360),
                    ).add_to(fg)
                except:
                    pass

        fg.add_to(m)

    folium.LayerControl().add_to(m)
    return m

def build_context(files, api_results, active_modules, esri_items, noaa_items=None, gauge_data=None):
    ctx = "=== NYC EMERGENCY MANAGEMENT KNOWLEDGE BASE ===\n\n"
    for key, mod in NYC_KB.items():
        if key in active_modules:
            ctx += f"--- {mod['label']} [{mod['source']}] ---\n{mod['data']}\n\n"
    if gauge_data:
        ctx += "--- LIVE TIDAL GAUGE READINGS (CO-OPS, 6-min updates) ---\n"
        for sid, gd in gauge_data.items():
            ld = gd.get("level")
            if not ld: continue
            nh = gd.get("next_high")
            nl = gd.get("next_low")
            ctx += (f"Station {sid} — {ld.get('station_name','?')}: "
                    f"{ld.get('level_ft','?')} ft MLLW | {ld.get('status','?')} | "
                    f"Trend: {ld.get('trend_str','?')} | "
                    f"Next HIGH: {nh['level_ft']:.2f}ft @ {nh['time'] if nh else 'N/A'} | "
                    f"Next LOW: {nl['level_ft']:.2f}ft @ {nl['time'] if nl else 'N/A'} | "
                    f"Fetched: {gd.get('fetched_at','?')}\n")
        ctx += "\n"
    if api_results:
        ctx += "--- LIVE API DATA ---\n"
        for r in api_results: ctx += summarize_api(r) + "\n"
        ctx += "\n"
    if noaa_items:
        ctx += "--- NOAA OPEN DATA (auto-fetched) ---\n"
        for item in noaa_items: ctx += item["content"] + "\n\n"
    if files:
        ctx += "--- UPLOADED DOCUMENTS ---\n"
        for f in files: ctx += f"[File: {f['name']}]\n{f['content'][:4000]}\n\n"
    if esri_items:
        ctx += "--- ESRI / LIVING ATLAS LAYERS ---\n"
        for item in esri_items: ctx += item["content"] + "\n\n"
    return ctx

def stream_ollama(messages, context):
    if not OLLAMA_API_KEY:
        yield "⚠ No API key. Set OLLAMA_API_KEY. Get one at https://ollama.com/settings/keys"
        return
    system_prompt = (f"You are EMBER — Emergency Management Body of Evidence & Resources — "
                     f"an AI for NYC emergency managers.\n\nKNOWLEDGE BASE:\n{context}\n\n"
                     f"RULES:\n1. Lead with operationally critical information first.\n"
                     f"2. Cite sources: [NYC OEM], [NWS], [FEMA], [USGS], [CO-OPS], [ESRI], etc.\n"
                     f"3. For location queries, prioritize zone and risk data.\n"
                     f"4. Flag data gaps. Use headers and bullets for action items.\n"
                     f"5. For life-safety queries, always include emergency contact numbers.\n"
                     f"6. Never hallucinate.")
    payload = {"model": OLLAMA_MODEL, "stream": True,
               "messages": [{"role": "system", "content": system_prompt}] + messages[-10:]}
    try:
        with requests.post(f"{OLLAMA_HOST}/api/chat", json=payload,
                           headers=OLLAMA_HEADERS, stream=True, timeout=90) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                if line:
                    obj   = json.loads(line)
                    token = obj.get("message", {}).get("content", "")
                    if token: yield token
                    if obj.get("done"): return
    except requests.exceptions.HTTPError as e:
        yield f"\n\n⚠ Ollama Cloud error {e.response.status_code}: {e.response.text[:200]}"
    except Exception as e:
        yield f"\n\n⚠ Connection error: {e}"

def search_agol(query, filter_expr="", item_type="", num=8, start=1):
    q      = query.strip() or "*"
    scope  = ["access:public"]
    if filter_expr: scope.append(f"({filter_expr})")
    if item_type:   scope.append(f'type:"{item_type}"')
    params = {"f": "json", "q": f"{q} {' AND '.join(scope)}",
              "num": str(num), "start": str(start), "sortField": "relevance", "sortOrder": "desc"}
    try:
        r = requests.get(f"{AGOL_BASE}/search", params=params, timeout=10)
        r.raise_for_status()
        d = r.json()
        if "error" in d: return [], 0, d["error"].get("message", "AGOL error")
        return d.get("results", []), d.get("total", 0), None
    except Exception as e:
        return [], 0, str(e)

def fetch_item_metadata(item_id):
    try:
        r = requests.get(f"{AGOL_BASE}/content/items/{item_id}", params={"f": "json"}, timeout=8)
        r.raise_for_status()
        item = r.json()
        try:
            dr   = requests.get(f"{AGOL_BASE}/content/items/{item_id}/data", params={"f": "json"}, timeout=8)
            data = dr.json() if dr.ok else None
        except:
            data = None
        return item, data, None
    except Exception as e:
        return None, None, str(e)

def format_item_for_context(item, data=None):
    if not item: return ""
    tags = ", ".join(item.get("tags", []))
    url  = item.get("url", "") or f"https://www.arcgis.com/home/item.html?id={item.get('id','')}"
    block = (f"[ESRI/Living Atlas: {item.get('title','')}]\n"
             f"  ID: {item.get('id','')} | Type: {item.get('type','')} | Owner: {item.get('owner','')}\n"
             f"  Description: {re.sub(r'<[^>]+>', '', item.get('description',''))[:600]}\n"
             f"  Tags: {tags} | Snippet: {item.get('snippet','')}\n"
             f"  Extent: {item.get('extent','N/A')} | Access: {item.get('access','')}\n"
             f"  Updated: {str(item.get('modified',''))[:10]} | URL: {url}")
    if data and isinstance(data, dict):
        if "layers" in data:
            block += "\n  Layers: " + ", ".join(f"{l.get('id')}:{l.get('name','')}" for l in data["layers"])
        if "operationalLayers" in data:
            block += "\n  Operational Layers: " + ", ".join(l.get("title","?") for l in data["operationalLayers"])
    return block

# ═══════════════════════════════════════════════════════════════════════════════
# NYC OPEN DATA (SOCRATA) HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

# Only presets approved in the jurisdiction configuration are one-click sources.
NYC_OPEN_DATA_PRESETS = CFG.socrata_presets

def search_nyc_open_data(query: str, app_token: str = "", limit: int = 20) -> list[dict]:
    """Search the NYC Open Data catalog using the Socrata catalog API."""
    try:
        params = {"q": query, "limit": limit, "only": "dataset"}
        headers = {}
        if app_token:
            headers["X-App-Token"] = app_token
        r = requests.get(
            "https://data.cityofnewyork.us/api/catalog/v1",
            params=params, headers=headers, timeout=10
        )
        r.raise_for_status()
        results = r.json().get("results", [])
        return [
            {
                "id":          d.get("resource", {}).get("id", ""),
                "name":        d.get("resource", {}).get("name", ""),
                "description": d.get("resource", {}).get("description", "")[:300],
                "agency":      d.get("classification", {}).get("owning_department", ""),
                "category":    d.get("classification", {}).get("categories", [""])[0] if d.get("classification", {}).get("categories") else "",
                "updated":     d.get("resource", {}).get("updatedAt", "")[:10],
                "columns":     d.get("resource", {}).get("columns_name", []),
                "permalink":   d.get("permalink", ""),
            }
            for d in results if d.get("resource", {}).get("id")
        ]
    except Exception as e:
        return []

def fetch_socrata_dataset(
    dataset_id: str,
    app_token: str = "",
    lat_col: str = "latitude",
    lng_col: str = "longitude",
    label_col: str = "",
    where_clause: str = "",
    limit: int = 500,
) -> dict:
    """
    Fetch rows from a Socrata dataset and return as a mappable dict.
    Uses the v2 /resource/ endpoint (GeoJSON output).
    Returns {"features": [...], "error": None} where each feature has lat/lng/label/props.
    """
    headers = {"Accept": "application/json"}
    if app_token:
        headers["X-App-Token"] = app_token

    params = {"$limit": limit, "$order": ":id"}
    if where_clause:
        params["$where"] = where_clause

    try:
        url = f"https://data.cityofnewyork.us/resource/{dataset_id}.json"
        r = requests.get(url, params=params, headers=headers, timeout=15)
        r.raise_for_status()
        rows = r.json()

        features = []
        skipped  = 0
        for row in rows:
            # Try to get lat/lng — could be in dedicated columns or in a location object
            lat, lng = None, None
            if lat_col in row and lng_col in row:
                try:
                    lat = float(row[lat_col])
                    lng = float(row[lng_col])
                except (TypeError, ValueError):
                    pass
            # Fallback: look for a .location dict
            if lat is None:
                for key in ("location", "geocoded_column", "the_geom"):
                    loc = row.get(key, {})
                    if isinstance(loc, dict):
                        try:
                            lat = float(loc.get("latitude") or loc.get("coordinates", [None, None])[1])
                            lng = float(loc.get("longitude") or loc.get("coordinates", [None, None])[0])
                            break
                        except (TypeError, ValueError, IndexError):
                            pass
            if lat is None or lng is None or lat == 0 or lng == 0:
                skipped += 1
                continue

            label = str(row.get(label_col, "")) if label_col else ""
            features.append({"lat": lat, "lng": lng, "label": label, "props": row})

        return {
            "features":    features,
            "total_rows":  len(rows),
            "skipped":     skipped,
            "dataset_id":  dataset_id,
            "error":       None,
        }
    except Exception as e:
        return {"features": [], "total_rows": 0, "skipped": 0, "dataset_id": dataset_id, "error": str(e)}

def socrata_popup_html(feature: dict, label_col: str, dataset_name: str, color: str) -> str:
    """Build a Folium popup for a Socrata data point."""
    props = feature["props"]
    label = feature["label"] or dataset_name

    # Top fields to show (skip long/system fields)
    skip_keys = {"latitude", "longitude", "location", "the_geom", "geocoded_column",
                 ":id", "@id", "x_coordinate_state_plane", "y_coordinate_state_plane"}
    show_props = {k: v for k, v in props.items()
                  if k not in skip_keys and not k.startswith(":") and v not in (None, "", [])}
    # Limit to 8 most informative fields
    show_props = dict(list(show_props.items())[:8])

    rows_html = "".join(
        f'<div style="margin-bottom:2px"><span style="color:#556">{k}:</span> '
        f'<span style="color:#aab">{str(v)[:80]}</span></div>'
        for k, v in show_props.items()
    )
    return (f'<div style="font-family:monospace;font-size:10px;max-width:250px">'
            f'<div style="font-weight:700;color:{color};margin-bottom:5px;font-size:11px">{label[:60]}</div>'
            f'{rows_html}'
            f'<div style="color:#446;font-size:9px;margin-top:4px;border-top:1px solid #1e2a40;padding-top:3px">'
            f'NYC Open Data · {dataset_name}</div>'
            f'</div>')

# ═══════════════════════════════════════════════════════════════════════════════
# ESRI FEATURE SERVICE → MAP HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

@st.cache_data(ttl=3600, show_spinner=False)
def discover_esri_feature_layers(service_url: str) -> dict:
    """Cache ArcGIS service discovery so reruns do not repeatedly fetch metadata."""
    return discover_feature_layers(service_url, requests.get)


@st.cache_data(ttl=3600, show_spinner=False)
def fetch_esri_layer_metadata(layer_url: str) -> dict:
    discovery = discover_esri_feature_layers(layer_url)
    if discovery.get("error"):
        return {"metadata": None, "error": discovery["error"]}
    layers = discovery.get("layers", [])
    if len(layers) != 1:
        return {"metadata": None, "error": "Select one Feature Layer sublayer"}
    if layers[0].get("metadata") is not None:
        return {"metadata": layers[0]["metadata"], "error": None}
    return {"metadata": None, "error": "Feature Layer metadata was unavailable"}


def fetch_esri_feature_layer(service_url: str, max_features: int = 500) -> dict:
    """
    Query an ArcGIS REST layer endpoint and return GeoJSON-like features.
    Works with public ArcGIS Feature/Map Services — no auth required.
    Appends /query if not already present. Some older or specially configured
    services reject ``f=geojson``, so fall back to ArcGIS JSON and normalize
    its native geometry format.
    """
    base = service_url.rstrip("/")
    if "arcgis.com/home/item" in base:
        return {"features": [], "error": "Item page URL — use the Service URL (REST endpoint), not the item page URL"}

    discovery = discover_esri_feature_layers(base)
    if discovery.get("error"):
        return {"features": [], "total": 0, "error": discovery["error"]}
    layers = discovery.get("layers", [])
    if len(layers) != 1:
        return {
            "features": [], "total": 0,
            "error": "This service contains multiple Feature Layers. Select one or more sublayers first.",
        }
    base = layers[0]["url"]
    metadata = layers[0].get("metadata")
    if metadata is None:
        layer_discovery = discover_esri_feature_layers(base)
        if layer_discovery.get("layers"):
            metadata = layer_discovery["layers"][0].get("metadata")
    query_url = base + "/query"

    params = {
        "where":        "1=1",
        "outFields":    "*",
        "returnGeometry": "true",
        "outSR":        "4326",
        "resultRecordCount": max_features,
    }
    try:
        headers = {"User-Agent": "EMBER/1.0"}
        r = requests.get(query_url, params={**params, "f": "geojson"}, timeout=15, headers=headers)

        # GeoJSON output is not enabled on every public ArcGIS layer. Retry
        # with the universally supported ArcGIS JSON representation.
        if r.status_code == 400:
            r = requests.get(query_url, params={**params, "f": "json"}, timeout=15, headers=headers)
        r.raise_for_status()
        payload = r.json()

        if "error" in payload:
            return {"features": [], "error": payload["error"].get("message", "ArcGIS error")}

        features = []
        for feat in payload.get("features", []):
            # ArcGIS JSON uses attributes/geometry; GeoJSON uses
            # properties/geometry. Keep the existing map contract unchanged.
            props = feat.get("properties") or feat.get("attributes") or {}
            geom = feat.get("geometry") or {}
            if "x" in geom and "y" in geom:
                features.append({"type": "point", "lat": geom["y"], "lng": geom["x"], "props": props})
                continue

            if "paths" in geom:
                paths = geom["paths"]
                coordinates = paths[0] if len(paths) == 1 else paths
                gtype = "LineString" if len(paths) == 1 else "MultiLineString"
                features.append({"type": "line", "geometry": {"type": gtype, "coordinates": coordinates}, "props": props})
                continue

            if "rings" in geom:
                features.append({"type": "polygon", "geometry": {"type": "Polygon", "coordinates": geom["rings"]}, "props": props})
                continue

            # Already-normalized GeoJSON geometry, if returned by the service.
            gtype = geom.get("type", "")
            if gtype == "Point":
                coords = geom.get("coordinates", [])
                if len(coords) >= 2:
                    features.append({"type": "point", "lat": coords[1], "lng": coords[0], "props": props})
            elif gtype in ("Polygon", "MultiPolygon"):
                features.append({"type": "polygon", "geometry": geom, "props": props})
            elif gtype in ("LineString", "MultiLineString"):
                features.append({"type": "line", "geometry": geom, "props": props})

        return {
            "features": features,
            "total": len(features),
            "error": None,
            "resolved_url": base,
            "metadata": metadata,
            "presentation": build_presentation(metadata, features),
        }
    except Exception as e:
        return {"features": [], "total": 0, "error": str(e)}

def esri_feature_popup_html(feature: dict, layer_name: str, color: str,
                            presentation: dict | None = None) -> str:
    """Build a metadata-aware Folium popup for any ESRI geometry type."""
    return feature_popup_html(feature, presentation, layer_name, color)


def add_operational_esri_layer(item_id: str, item_title: str, layer_choice: dict,
                               color: str = "#a78bfa") -> dict:
    """Fetch one selected sublayer and add it to the operational Folium map."""
    result = fetch_esri_feature_layer(layer_choice["url"], max_features=500)
    if result.get("error") or not result.get("features"):
        return result
    layer_name = item_title
    if layer_choice.get("name") and layer_choice["name"] != item_title:
        layer_name = f"{item_title} — {layer_choice['name']}"
    st.session_state.map_layers.append({
        "id": f"esri_{item_id}_{layer_choice['id']}",
        "owner_item_id": item_id,
        "sublayer_id": layer_choice["id"],
        "name": layer_name,
        "type": "esri",
        "color": color,
        "icon": "⊕",
        "features": result["features"],
        "visible": True,
        "count": result["total"],
        "source": f"ESRI · {result.get('resolved_url', layer_choice['url'])}",
        "url": result.get("resolved_url", layer_choice["url"]),
        "metadata": result.get("metadata"),
        "presentation": result.get("presentation"),
    })
    return result


def add_map_builder_feature_layer(item_id: str, item_title: str, layer_choice: dict,
                                  color: str = "#a78bfa") -> dict:
    """Add one selected ArcGIS Feature Layer with its presentation metadata."""
    metadata_result = fetch_esri_layer_metadata(layer_choice["url"])
    metadata = metadata_result.get("metadata")
    layer_name = item_title
    if layer_choice.get("name") and layer_choice["name"] != item_title:
        layer_name = f"{item_title} — {layer_choice['name']}"
    st.session_state.mb_layers.append({
        "id": f"{item_id}_{layer_choice['id']}",
        "owner_item_id": item_id,
        "sublayer_id": layer_choice["id"],
        "name": layer_name[:80],
        "url": layer_choice["url"],
        "item_id": "",
        "type": "Feature Layer",
        "opacity": 1.0,
        "visible": True,
        "color": color,
        "metadata": metadata,
        "presentation": build_presentation(metadata) if metadata else None,
        "metadata_error": metadata_result.get("error"),
    })
    return metadata_result

# ═══════════════════════════════════════════════════════════════════════════════
# SESSION STATE INIT
# ═══════════════════════════════════════════════════════════════════════════════

for k, v in [
    ("messages",     [{"role": "assistant", "content":
                        f"EMBER initialized — Emergency Management Body of Evidence & Resources\n"
                        f"Backend: Ollama Cloud · {OLLAMA_MODEL}\nJurisdiction: {CFG.name}\n\n"
                        f"Knowledge base loaded · NOAA feeds auto-fetching · Radar & wind on by default\n"
                        f"Tidal gauges: fetching live CO-OPS water levels for all NY stations\n"
                        f"Click a map marker or type a query to begin."}]),
    ("files",        []),
    ("api_results",  []),
    ("esri_items",   []),
    ("esri_results", []),
    ("esri_total",   0),
    ("esri_searched",False),
    ("noaa_results", {}),
    ("noaa_items",   []),
    ("show_radar",   True),
    ("show_wind",    True),
    ("gauge_data",   {}),       # live tidal gauge readings keyed by station_id
    ("gauge_stations", []),     # CO-OPS station list for NY (dynamic)
    ("gauge_fetched_at", _dt.datetime.min), # last fetch timestamp
    ("map_layers",  []),        # user-added map layers: [{id, name, type, color, icon, features, ...}]
    ("esri_pending_adds", {}),  # FeatureServer roots awaiting sublayer selection
    ("_runtime_map_points", MAP_POINTS), # setup wizard edits before/reload after save
    ("nyc_token",   ""),        # NYC Open Data app token (user-provided)
    ("mb_layers",   []),        # Map Builder layers: [{id, name, url, type, opacity, visible, color}]
    ("mb_basemap",  "dark-gray-vector"),  # Map Builder basemap
    ("rockaway_results", {source["id"]: unavailable_rockaway_result(source) for source in ROCKAWAY_SOURCES}),
    ("active_rockaway_layers", ["nyc_311_rockaway"]),
    ("rockaway_initialized", False),
    ("chat_response_pending", False),
]:
    if k not in st.session_state:
        st.session_state[k] = v


def refresh_rockaway_sources():
    st.session_state.rockaway_results = {
        source["id"]: fetch_rockaway_source(source, requests.get)
        for source in ROCKAWAY_SOURCES
    }
    st.session_state.rockaway_initialized = True


if not st.session_state.rockaway_initialized:
    refresh_rockaway_sources()

# Fetch wind obs on first load
if "wind_obs" not in st.session_state:
    st.session_state.wind_obs            = fetch_wind_obs()
    st.session_state.wind_obs_fetched_at = _dt.datetime.now()

# Load saved Map Builder layers from jurisdiction.yaml if mb_layers is empty
if not st.session_state.mb_layers:
    _saved_mb = CFG.raw().get("map_builder_layers", [])
    if _saved_mb:
        st.session_state.mb_layers = [
            {"id": l.get("url",""), "name": l.get("name","Layer"),
             "url": l.get("url",""), "item_id": "",
             "type": l.get("type","Feature Layer"),
             "opacity": float(l.get("opacity",1.0)),
             "visible": True, "color": "#a78bfa"}
            for l in _saved_mb
        ]

# Hydrate older/saved Feature Layer entries once so they receive the same
# aliases, domains, popup fields, and label behavior as newly added layers.
for _mb_layer in st.session_state.mb_layers:
    if "/FeatureServer" not in _mb_layer.get("url", "") or _mb_layer.get("_presentation_attempted"):
        continue
    _mb_layer["_presentation_attempted"] = True
    _mb_discovery = discover_esri_feature_layers(_mb_layer["url"])
    if len(_mb_discovery.get("layers", [])) == 1:
        _mb_choice = _mb_discovery["layers"][0]
        _mb_metadata_result = fetch_esri_layer_metadata(_mb_choice["url"])
        _mb_layer["url"] = _mb_choice["url"]
        _mb_layer["metadata"] = _mb_metadata_result.get("metadata")
        _mb_layer["presentation"] = (
            build_presentation(_mb_layer.get("metadata")) if _mb_layer.get("metadata") else None
        )
        _mb_layer["metadata_error"] = _mb_metadata_result.get("error")
    else:
        _mb_layer["metadata_error"] = (
            _mb_discovery.get("error")
            or "Saved Feature Service roots must be removed and re-added so sublayers can be selected."
        )

# ═══════════════════════════════════════════════════════════════════════════════
# GLOBAL AUTO-REFRESH (60s tick)
# ═══════════════════════════════════════════════════════════════════════════════

if background_refresh_allowed(st.session_state.chat_response_pending):
    st_autorefresh(interval=60_000, key="global_autorefresh")

# Refresh wind obs if stale (>5 min)
_wind_fetched = st.session_state.get("wind_obs_fetched_at") or _dt.datetime.min
_wind_age = (_dt.datetime.now() - _wind_fetched).total_seconds()
if _wind_age > 300:
    st.session_state.wind_obs            = fetch_wind_obs()
    st.session_state.wind_obs_fetched_at = _dt.datetime.now()

# Refresh tidal gauges after 6 min, or retry a partial batch after 1 min.
_gauge_fetched = st.session_state.get("gauge_fetched_at") or _dt.datetime.min
_gauge_age = (_dt.datetime.now() - _gauge_fetched).total_seconds()
_gauge_refresh_seconds = 360 if configured_gauges_complete(st.session_state.gauge_data) else 60
if _gauge_age > _gauge_refresh_seconds or not st.session_state.gauge_data:
    # Fetch station list once
    if not st.session_state.gauge_stations:
        st.session_state.gauge_stations = fetch_station_list("NY")
    st.session_state.gauge_data       = fetch_configured_gauges(st.session_state.gauge_data)
    st.session_state.gauge_fetched_at = _dt.datetime.now()

# Seed map-connected NOAA endpoints and refresh stale ones
auto_fetch_map_endpoints()
refresh_stale_endpoints()

# ═══════════════════════════════════════════════════════════════════════════════
# SIDEBAR
# ═══════════════════════════════════════════════════════════════════════════════

with st.sidebar:
    st.markdown(f"## {CFG.logo_emoji} {CFG.app_title}")
    st.caption(f"Ollama Cloud · {OLLAMA_MODEL} · {CFG.name}")

    status = ping_ollama()
    if status == "no-key":
        st.markdown('<span class="pill p-yellow">⚠ NO API KEY</span>', unsafe_allow_html=True)
        st.info("Set OLLAMA_API_KEY. Get one at ollama.com/settings/keys")
    elif status is True:
        st.markdown('<span class="pill p-green">● OLLAMA CLOUD OK</span>', unsafe_allow_html=True)
    else:
        st.markdown('<span class="pill p-red">● CLOUD UNREACHABLE</span>', unsafe_allow_html=True)

    st.divider()
    st.markdown("**KNOWLEDGE BASE**")
    active_kb = [k for k, m in NYC_KB.items() if st.checkbox(m["label"], value=True, key=f"kb_{k}")]

    st.divider()
    st.markdown("**MAP LAYERS**")
    layer_opts = {"hospitals": "🏥 Trauma Centers", "shelters": "🏫 Evac Shelters",
                  "gauges": "📡 Stream Gauges", "eoc": "🏛 EOC / Command", "floodRisk": "💧 Flood Risk Areas"}
    active_layers = [k for k, label in layer_opts.items() if st.checkbox(label, value=True, key=f"map_{k}")]

    st.markdown("**WEATHER OVERLAYS**")
    show_radar = st.checkbox("📡 NEXRAD Radar (auto-refresh)", key="show_radar",
                             help="Iowa State MESONET — tiles refresh every 5min automatically")
    show_wind  = st.checkbox("💨 Wind Observations (auto-refresh)", key="show_wind",
                             help="Live NWS surface obs — refreshes every 5min automatically")

    st.divider()
    st.markdown("**TIDAL GAUGES**")
    g_fetched = st.session_state.get("gauge_fetched_at")
    g_age_s   = int((_dt.datetime.now() - g_fetched).total_seconds()) if g_fetched else None
    g_age_str = f"last fetched {g_age_s//60}m ago" if g_age_s else "not yet fetched"
    st.caption(f"CO-OPS · auto-refresh 6min · {g_age_str}")
    if st.button("↺ Refresh Gauges Now", use_container_width=True):
        with st.spinner("Fetching live gauge data…"):
            st.session_state.gauge_data       = fetch_configured_gauges(st.session_state.gauge_data)
            st.session_state.gauge_fetched_at = _dt.datetime.now()
        st.rerun()
    # Show current flood status for each gauge
    for sid in GAUGE_STATION_IDS:
        gd = st.session_state.gauge_data.get(sid, {})
        ld = gd.get("level")
        if not ld:
            name = CFG.flood_thresholds_dict.get(sid, {}).get("name", sid)
            st.markdown(
                f'<span class="pill p-yellow">○ {name[:18]}: unavailable · retrying</span>',
                unsafe_allow_html=True,
            )
            continue
        color = ld.get("color","#4ade80")
        st.markdown(
            f'<span class="pill" style="background:{color}18;color:{color};border:1px solid {color}33">'
            f'● {ld.get("station_name","?")[:18]}: {ld.get("level_ft","?")}ft — {ld.get("status","?")}'
            f'</span>',
            unsafe_allow_html=True
        )

    st.divider()
    st.markdown("**LIVE FEEDS** (sidebar)")
    if st.button("↺ Fetch All Feeds", use_container_width=True):
        with st.spinner("Fetching…"):
            st.session_state.api_results = [fetch_live(ep) for ep in LIVE_ENDPOINTS]
    for r in st.session_state.api_results:
        cls = "p-green" if r["success"] else "p-red"
        st.markdown(f'<span class="pill {cls}">{"●" if r["success"] else "○"} {r["name"]}</span>',
                    unsafe_allow_html=True)

    st.divider()
    st.markdown("**INGEST DOCUMENTS**")
    uploads = st.file_uploader("SOPs, GeoJSON, CSV, plans", accept_multiple_files=True,
                               type=["txt", "csv", "json", "geojson", "md"])
    if uploads:
        existing = {f["name"] for f in st.session_state.files}
        for up in uploads:
            if up.name not in existing:
                st.session_state.files.append({
                    "name": up.name,
                    "content": StringIO(up.read().decode("utf-8", errors="replace")).read()
                })
    for f in st.session_state.files:
        st.markdown(f'<span class="pill p-blue">📄 {f["name"]}</span>', unsafe_allow_html=True)
    if st.session_state.files and st.button("Clear Documents"):
        st.session_state.files = []

    st.divider()
    if st.button("Clear Chat", use_container_width=True):
        st.session_state.messages = []
        st.rerun()

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN MAP
# ═══════════════════════════════════════════════════════════════════════════════

st.markdown(f"### 🗺️ {CFG.name} Operational Map")

# ── Tidal gauge live status strip ──────────────────────────────────────────────
gauge_data = st.session_state.gauge_data
if gauge_data:
    gauge_fetched = st.session_state.get("gauge_fetched_at")
    g_age_s = int((_dt.datetime.now() - gauge_fetched).total_seconds()) if gauge_fetched else None
    g_age_str = f"{g_age_s//60}m{g_age_s%60:02d}s ago" if g_age_s is not None else "?"
    st.markdown(
        f"**🌊 Live Tidal Gauges (CO-OPS)** "
        f"<span style='font-size:11px;color:#446'>· {g_age_str} · auto-refreshes every 6min</span>",
        unsafe_allow_html=True
    )
    gcols = st.columns(min(len(GAUGE_STATION_IDS), 6))
    for i, sid in enumerate(GAUGE_STATION_IDS):
        gd = gauge_data.get(sid, {})
        ld = gd.get("level")
        with gcols[i % 6]:
            if not ld:
                name = CFG.flood_thresholds_dict.get(sid, {}).get("name", sid)
                st.markdown(
                    f'<div style="background:#0d1520;border:1px solid #facc1544;border-radius:6px;'
                    f'padding:8px 10px;font-family:monospace">'
                    f'<div style="font-size:9px;color:#556;margin-bottom:2px">{name}</div>'
                    f'<div style="font-size:12px;font-weight:700;color:#facc15">Unavailable</div>'
                    f'<div style="font-size:8px;color:#446;margin-top:3px">Retrying automatically</div>'
                    f'</div>',
                    unsafe_allow_html=True,
                )
                continue
            color  = ld.get("color", "#4ade80")
            status = ld.get("status", "NORMAL")
            lft    = ld.get("level_ft", 0)
            name   = ld.get("station_name", sid)
            nh     = gd.get("next_high")
            st.markdown(
                f'<div style="background:#0d1520;border:1px solid {color}44;border-radius:6px;'
                f'padding:8px 10px;font-family:monospace">'
                f'<div style="font-size:9px;color:#556;margin-bottom:2px">{name}</div>'
                f'<div style="font-size:18px;font-weight:700;color:{color}">{lft:.2f}ft</div>'
                f'<div style="font-size:9px;color:{color}">{status}</div>'
                f'<div style="font-size:8px;color:#446;margin-top:3px">{ld.get("trend_str","")}</div>'
                f'{f"""<div style="font-size:8px;color:#60a5fa;margin-top:2px">▲ {nh["level_ft"]:.2f}ft @ {nh["time"][-5:]}</div>""" if nh else ""}'
                f'</div>',
                unsafe_allow_html=True
            )

wind_obs = st.session_state.get("wind_obs", []) if show_wind else []

if show_wind and wind_obs:
    wind_fetched = st.session_state.get("wind_obs_fetched_at")
    age_s   = int((_dt.datetime.now() - wind_fetched).total_seconds()) if wind_fetched else None
    age_str = f"{age_s//60}m{age_s%60:02d}s ago" if age_s is not None else "?"
    st.markdown(
        f"**💨 Wind Observations** "
        f"<span style='font-size:11px;color:#446'>· {age_str} · auto-refreshes every 5min</span>",
        unsafe_allow_html=True
    )
    wcols = st.columns(min(len(wind_obs), 4))
    for i, o in enumerate(wind_obs):
        with wcols[i % 4]:
            spd  = int(o["speed_mph"]) if o.get("speed_mph") is not None else None
            gust = int(o["gust_mph"])  if o.get("gust_mph")  is not None else None
            st.metric(
                label=f"{o['id']} — {o['name']}",
                value=f"{spd}mph" + (f" g{gust}" if gust else "") if spd is not None else "—",
                delta=f"{int(o['dir_deg'])}° · {o.get('desc','')[:20]}" if o.get("dir_deg") is not None else None,
                delta_color="off"
            )

if st.session_state.map_layers:
    n_layers = len(st.session_state.map_layers)
    st.markdown(f"**🗂 Active User Layers ({n_layers})**", unsafe_allow_html=True)
    layer_cols = st.columns(min(n_layers, 4))
    for i, layer in enumerate(st.session_state.map_layers):
        with layer_cols[i % 4]:
            color = layer.get("color","#60a5fa")
            st.markdown(
                f'<div style="background:{color}12;border:1px solid {color}44;border-radius:5px;'
                f'padding:5px 8px;font-family:monospace;font-size:10px">'
                f'<span style="color:{color};font-weight:700">{layer["icon"]} {layer["name"][:28]}</span><br>'
                f'<span style="color:#446">{layer["count"]} features · {layer["type"].upper()}</span>'
                f'</div>',
                unsafe_allow_html=True
            )

if show_radar:
    next_refresh = 300 - (int(_time.time()) % 300)
    st.caption(f"📡 NEXRAD radar active — next tile refresh in ~{next_refresh}s · Iowa State MESONET")



live_rdgs = {
    **build_live_readings(st.session_state.api_results),
    **extract_map_readings_from_noaa(),
}

if "__flood_alert__" in live_rdgs:
    a = live_rdgs["__flood_alert__"]
    st.error(f"⚠ **{a['event']}** ({a['severity']}) — {a['headline']}")

map_data = st_folium(
    build_map(active_layers, show_radar=show_radar, show_wind=show_wind,
              wind_obs=wind_obs, live_readings=live_rdgs,
              gauge_data=st.session_state.gauge_data,
              map_layers=st.session_state.map_layers,
              map_points=st.session_state.get("_runtime_map_points", MAP_POINTS),
              rockaway_results=st.session_state.rockaway_results,
              active_rockaway_layers=st.session_state.active_rockaway_layers),
    width="100%", height=380, returned_objects=["last_object_clicked_popup"]
)

if map_data and map_data.get("last_object_clicked_popup"):
    m2 = re.search(r'<b[^>]*>([^<]+)</b>', map_data["last_object_clicked_popup"] or "")
    if m2 and "pending_query" not in st.session_state:
        st.session_state.pending_query = f"Emergency considerations and risk profile for: {m2.group(1)}"

st.markdown("---")

# ═══════════════════════════════════════════════════════════════════════════════
# TABS
# ═══════════════════════════════════════════════════════════════════════════════

tab_chat, tab_noaa, tab_nyc, tab_esri, tab_mapbuilder, tab_setup = st.tabs([
    "💬 EMBER Chat",
    "📡 NOAA Data Stack",
    "🗽 NYC Open Data",
    "⊕ ESRI / Living Atlas",
    "🗺 Map Builder",
    "⚙️ Setup",
])

# ── NOAA Tab ──────────────────────────────────────────────────────────────────
with tab_noaa:
    st.markdown("#### NOAA Open Data Stack")
    st.caption("Auto-fetches map-connected endpoints · All fetched data auto-added to KB · No API key required")

    n_fetched = len(st.session_state.noaa_results)
    n_live    = sum(1 for r in st.session_state.noaa_results.values() if r.get("success"))
    n_kb      = len(st.session_state.noaa_items)
    n_map     = sum(1 for x in st.session_state.noaa_items if x.get("map_connected"))

    s1, s2, s3, s4 = st.columns(4)
    s1.metric("Fetched", n_fetched)
    s2.metric("Live / OK", n_live)
    s3.metric("In KB", n_kb)
    s4.metric("Map-connected", n_map)
    st.divider()

    nc1, nc2 = st.columns([3, 2])
    with nc1: noaa_search = st.text_input("Search endpoints…", placeholder="flood, tide, temperature, alerts…", key="noaa_search")
    with nc2: noaa_cat    = st.selectbox("Category", ["All","NWS","CO-OPS","NCEI","SPC","SWPC"], key="noaa_cat")

    filtered_eps = [ep for ep in NOAA_ENDPOINTS if
        (noaa_cat == "All" or ep["cat"] == noaa_cat) and
        (not noaa_search or
         noaa_search.lower() in ep["name"].lower() or
         noaa_search.lower() in ep["desc"].lower() or
         any(noaa_search.lower() in t for t in ep.get("tags", [])))]

    for ep in filtered_eps:
        result   = st.session_state.noaa_results.get(ep["id"])
        in_kb    = any(x["item_id"] == ep["id"] for x in st.session_state.noaa_items)
        is_map   = ep["id"] in MAP_CONNECTED_IDS
        interval = REFRESH_INTERVALS.get(ep["id"], 0)
        ts       = result.get("fetched_at", "—") if result else "—"

        map_badge = '<span class="pill" style="background:#34d39918;color:#34d399;border:1px solid #34d39933">🗺 MAP</span>' if is_map else ""
        kb_badge  = '<span class="pill p-green">✓ KB</span>' if in_kb else ""
        ok_str    = ("● OK" if result and result.get("success") else "○ ERR" if result else "○")
        ok_cls    = "p-green" if result and result.get("success") else "p-red"
        ref_txt   = f"↺ {interval//60}min" if interval else ""

        st.markdown(f"""<div class="esri-card" style="border-left:3px solid {ep['color']}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div>
                <div style="font-weight:700;color:#dde;margin-bottom:2px">{ep['icon']} {ep['name']}</div>
                <div style="font-size:10px;color:#556;margin-bottom:4px">{ep['desc']}</div>
                <div>{map_badge}{kb_badge}
                  {"".join(f'<span class="pill" style="background:{ep["color"]}18;color:{ep["color"]};border:1px solid {ep["color"]}33">{t}</span>' for t in ep.get("tags",[])[:3])}
                </div>
              </div>
              <div style="font-size:9px;color:#334;text-align:right;white-space:nowrap">
                <span class="pill {ok_cls}">{ok_str}</span><br>
                {f"@ {ts}" if ts != "—" else ""}<br>{ref_txt}
              </div>
            </div>
        </div>""", unsafe_allow_html=True)

        b1, b2, b3 = st.columns([1, 1, 2])
        with b1:
            if st.button("▶ Fetch now", key=f"nfetch_{ep['id']}", use_container_width=True):
                with st.spinner("Fetching…"):
                    new_result = fetch_noaa_ep(ep)
                st.session_state.noaa_results[ep["id"]] = new_result
                if new_result["success"]:
                    upsert_noaa_kb(ep, new_result)
                st.rerun()
        with b2:
            st.link_button("↗ URL", resolve_url(ep))
        with b3:
            if result and result.get("success"):
                with st.expander("Preview"):
                    st.code(summarize_noaa(result), language=None)
        st.markdown("---")

    if st.session_state.noaa_items:
        st.markdown(f"**{n_kb} NOAA feed(s) in KB** — auto-updated on refresh")
        for i, ni in enumerate(st.session_state.noaa_items):
            c1, c2 = st.columns([5, 1])
            map_tag = " 🗺" if ni.get("map_connected") else ""
            with c1:
                st.markdown(f'<span class="pill p-green">▶ {ni["name"][:50]}{map_tag} · {ni.get("fetched_at","?")}</span>',
                            unsafe_allow_html=True)
            with c2:
                if st.button("✕", key=f"rm_noaa_{i}"):
                    st.session_state.noaa_items.pop(i)
                    st.rerun()

# ── NYC Open Data Tab ─────────────────────────────────────────────────────────
with tab_nyc:
    st.markdown("#### 🗽 NYC Open Data")
    st.caption("Powered by Socrata SODA API · data.cityofnewyork.us · App token recommended (free at opendata.cityofnewyork.us)")

    # ── Token input ────────────────────────────────────────────────────────────
    with st.expander("🔑 NYC Open Data App Token (optional but recommended)", expanded=not st.session_state.nyc_token):
        st.markdown(
            "An app token removes rate limits. Get one free at "
            "[opendata.cityofnewyork.us](https://opendata.cityofnewyork.us/) → Sign In → Manage → App Tokens"
        )
        token_input = st.text_input("Paste your app token", value=st.session_state.nyc_token,
                                     type="password", key="nyc_token_input",
                                     placeholder="e.g. aBcDeFgHiJkLmNoP123456789")
        if st.button("Save Token", key="save_nyc_token"):
            st.session_state.nyc_token = token_input
            st.success("Token saved for this session.")

    nyc_token = st.session_state.nyc_token

    st.divider()

    # ── Qualified Rockaway sources ────────────────────────────────────────────
    _rockaway_title_col, _rockaway_refresh_col = st.columns([4, 1])
    with _rockaway_title_col:
        st.markdown("**🌊 Rockaway Sources**")
        st.caption("Queens Community Board 14 · includes Broad Channel · normalized Phase 3 records")
    with _rockaway_refresh_col:
        if st.button("↺ Refresh", key="refresh_rockaway_sources", use_container_width=True):
            with st.spinner("Fetching bounded Rockaway records…"):
                refresh_rockaway_sources()
            st.rerun()

    _state_colors = {
        "current": "#4ade80", "stale": "#facc15", "partial": "#fb923c",
        "unavailable": "#f87171", "access_required": "#a78bfa",
    }
    _rockaway_cols = st.columns(3)
    for _index, _source in enumerate(ROCKAWAY_SOURCES):
        _card = rockaway_source_card(_source, st.session_state.rockaway_results.get(_source["id"]))
        _state_color = _state_colors.get(_card["data_state"], "#778")
        _note = _html.escape(str(_card.get("note") or ""))
        _observed = _html.escape(str(_card.get("observed_at") or "Not available"))
        _fetched = _html.escape(str(_card.get("fetched_at") or "Not available"))
        _is_active = _source["id"] in st.session_state.active_rockaway_layers
        with _rockaway_cols[_index % 3]:
            st.markdown(
                f'<div style="background:#0d1117;border:1px solid #1a1e28;border-left:3px solid {_card["color"]};'
                f'border-radius:6px;padding:9px 10px;margin-bottom:9px;min-height:174px;font-family:monospace">'
                f'<div style="display:flex;justify-content:space-between;gap:6px">'
                f'<b style="font-size:10px;color:#dde">{_html.escape(_card["icon"])} {_html.escape(_card["name"])}</b>'
                f'<span style="font-size:8px;color:{_state_color};white-space:nowrap">{_html.escape(_card["data_state"].replace("_", " ").upper())}</span></div>'
                f'<div style="font-size:8px;color:#556;margin-top:3px">{_html.escape(_card["owner"])} · {_html.escape(_card["geography"])}</div>'
                f'<div style="font-size:8px;color:#334;margin-top:8px">RECORDS <span style="color:#aac">{_card["record_count"]}</span></div>'
                f'<div style="font-size:8px;color:#334;margin-top:3px">OBSERVED <span style="color:#aac">{_observed}</span></div>'
                f'<div style="font-size:8px;color:#334;margin-top:3px">FETCHED <span style="color:#aac">{_fetched}</span></div>'
                f'<div style="font-size:8px;color:#667;line-height:1.35;margin-top:7px">{_note}</div>'
                f'<div style="font-size:8px;color:#445;margin-top:7px">{_html.escape(_card["kind"].replace("_", " "))} · {_html.escape(_card["attribution"])}</div>'
                f'</div>',
                unsafe_allow_html=True,
            )
            if _card["map_capable"]:
                _map_action = "Remove from Map" if _is_active else "Add to Map"
                if st.button(
                    _map_action,
                    key=f'rockaway_map_{_source["id"]}',
                    use_container_width=True,
                ):
                    if _is_active:
                        st.session_state.active_rockaway_layers = [
                            _source_id for _source_id in st.session_state.active_rockaway_layers
                            if _source_id != _source["id"]
                        ]
                    else:
                        st.session_state.active_rockaway_layers = [
                            *st.session_state.active_rockaway_layers,
                            _source["id"],
                        ]
                    st.rerun()
            else:
                st.button(
                    "Not map-ready",
                    key=f'rockaway_map_{_source["id"]}',
                    use_container_width=True,
                    disabled=True,
                    help=_card.get("note") or "No approved map geometry",
                )

    st.divider()

    # ── Preset emergency datasets ──────────────────────────────────────────────
    st.markdown("**Emergency-Relevant Datasets (one-click)**")
    st.caption("Click ▶ to fetch and add directly to the map. Data is sampled (up to 500 records).")

    preset_cols = st.columns(3)
    for pi, preset in enumerate(NYC_OPEN_DATA_PRESETS):
        with preset_cols[pi % 3]:
            already_on_map = any(l["id"] == f"nyc_{preset['id']}" for l in st.session_state.map_layers)
            st.markdown(
                f'<div class="esri-card" style="border-left:3px solid {preset["color"]};min-height:90px">'
                f'<div style="font-weight:700;color:{preset["color"]};margin-bottom:2px">{preset["icon"]} {preset["name"]}</div>'
                f'<div style="font-size:9px;color:#556;margin-bottom:4px">{preset["agency"]} · {preset["id"]}</div>'
                f'<div style="font-size:10px;color:#778">{preset["desc"][:80]}</div>'
                f'</div>',
                unsafe_allow_html=True
            )
            if already_on_map:
                if st.button(f"✓ On Map", key=f"preset_rm_{preset['id']}", use_container_width=True):
                    st.session_state.map_layers = [l for l in st.session_state.map_layers if l["id"] != f"nyc_{preset['id']}"]
                    st.rerun()
            else:
                if st.button(f"▶ Add to Map", key=f"preset_add_{preset['id']}", use_container_width=True):
                    with st.spinner(f"Fetching {preset['name']}…"):
                        result = fetch_socrata_dataset(
                            preset["id"], nyc_token,
                            lat_col=preset["lat_col"], lng_col=preset["lng_col"],
                            label_col=preset["label_col"],
                            where_clause=preset.get("required_filter", ""), limit=500
                        )
                    if result["error"]:
                        st.error(f"Error: {result['error']}")
                    elif not result["features"]:
                        st.warning(f"No mappable records returned (dataset may lack lat/lng in recent records)")
                    else:
                        color   = preset["color"]
                        def make_popup_fn(ds_name, col, clr):
                            def fn(feat):
                                return socrata_popup_html(feat, col, ds_name, clr)
                            return fn
                        st.session_state.map_layers.append({
                            "id":       f"nyc_{preset['id']}",
                            "name":     preset["name"],
                            "type":     "socrata",
                            "color":    color,
                            "icon":     preset["icon"],
                            "features": result["features"],
                            "visible":  True,
                            "popup_fn": make_popup_fn(preset["name"], preset["label_col"], color),
                            "count":    len(result["features"]),
                            "source":   f"NYC Open Data · {preset['id']}",
                        })
                        st.success(f"✓ Added {len(result['features'])} features to map")
                        st.rerun()

    st.divider()

    # ── Custom dataset search ──────────────────────────────────────────────────
    st.markdown("**Search NYC Open Data Catalog**")
    sc1, sc2 = st.columns([4, 1])
    with sc1: nyc_query  = st.text_input("Search datasets…", placeholder="flood zones, shelters, hospitals, 311, FDNY…", key="nyc_query")
    with sc2: do_nyc_search = st.button("🔍 Search", use_container_width=True, key="nyc_search_btn")

    if do_nyc_search and nyc_query:
        with st.spinner("Searching NYC Open Data catalog…"):
            nyc_results = search_nyc_open_data(nyc_query, nyc_token, limit=15)
        st.session_state["nyc_search_results"] = nyc_results
        st.session_state["nyc_search_query"]   = nyc_query

    if st.session_state.get("nyc_search_results"):
        results  = st.session_state["nyc_search_results"]
        st.caption(f"{len(results)} datasets found for '{st.session_state.get('nyc_search_query','')}'")

        for ds in results:
            cols_str = ", ".join(ds["columns"][:6]) if ds["columns"] else "—"
            has_geo  = any(c.lower() in ("latitude","longitude","the_geom","location","geocoded_column")
                          for c in (ds["columns"] or []))
            geo_badge = '<span class="pill p-green">📍 mappable</span>' if has_geo else '<span class="pill p-yellow">⚠ no geometry</span>'

            st.markdown(f"""<div class="esri-card">
                <div style="display:flex;justify-content:space-between;align-items:flex-start">
                  <div>
                    <div style="font-weight:700;color:#dde;margin-bottom:2px">{ds['name']}</div>
                    <div style="font-size:9px;color:#556;margin-bottom:4px">
                      {ds['agency']} · {ds['category']} · updated {ds['updated']} · ID: <code>{ds['id']}</code>
                    </div>
                    <div style="font-size:10px;color:#778;margin-bottom:4px">{ds['description'][:120]}</div>
                    <div style="font-size:9px;color:#446">Columns: {cols_str}</div>
                  </div>
                  <div>{geo_badge}</div>
                </div>
            </div>""", unsafe_allow_html=True)

            if has_geo:
                ncola, ncolb, ncolc = st.columns([2, 2, 2])
                with ncola:
                    lat_guess  = next((c for c in (ds["columns"] or []) if "lat" in c.lower()), "latitude")
                    lng_guess  = next((c for c in (ds["columns"] or []) if "lon" in c.lower() or "lng" in c.lower()), "longitude")
                    label_guess= next((c for c in (ds["columns"] or []) if any(x in c.lower() for x in ("name","type","desc","title"))), "")
                    lat_col_in = st.text_input("Lat column", value=lat_guess, key=f"lat_{ds['id']}")
                with ncolb:
                    lng_col_in = st.text_input("Lng column", value=lng_guess, key=f"lng_{ds['id']}")
                with ncolc:
                    lbl_col_in = st.text_input("Label column", value=label_guess, key=f"lbl_{ds['id']}")

                on_map = any(l["id"] == f"nyc_{ds['id']}" for l in st.session_state.map_layers)
                if on_map:
                    if st.button(f"✕ Remove from Map", key=f"rm_{ds['id']}", use_container_width=True):
                        st.session_state.map_layers = [l for l in st.session_state.map_layers if l["id"] != f"nyc_{ds['id']}"]
                        st.rerun()
                else:
                    if st.button(f"▶ Add '{ds['name'][:30]}' to Map", key=f"add_{ds['id']}", use_container_width=True):
                        with st.spinner(f"Fetching {ds['name']}…"):
                            result = fetch_socrata_dataset(
                                ds["id"], nyc_token,
                                lat_col=lat_col_in, lng_col=lng_col_in,
                                label_col=lbl_col_in, limit=500
                            )
                        if result["error"]:
                            st.error(f"Error: {result['error']}")
                        elif not result["features"]:
                            st.warning("No mappable records — check lat/lng column names")
                        else:
                            color   = "#60a5fa"
                            def make_popup_fn2(dname, lcol, clr):
                                def fn(feat): return socrata_popup_html(feat, lcol, dname, clr)
                                return fn
                            st.session_state.map_layers.append({
                                "id":       f"nyc_{ds['id']}",
                                "name":     ds["name"],
                                "type":     "socrata",
                                "color":    color,
                                "icon":     "🗽",
                                "features": result["features"],
                                "visible":  True,
                                "popup_fn": make_popup_fn2(ds["name"], lbl_col_in, color),
                                "count":    len(result["features"]),
                                "source":   f"NYC Open Data · {ds['id']}",
                            })
                            st.success(f"✓ Added {len(result['features'])} features to map")
                            st.rerun()
            else:
                if ds.get("permalink"):
                    st.link_button("↗ View on NYC Open Data", ds["permalink"])

            st.markdown("---")

    st.divider()

    # ── Custom endpoint ────────────────────────────────────────────────────────
    st.markdown("**Custom Dataset URL**")
    st.caption("Paste any NY Open Data resource URL or dataset ID to fetch and map it")
    ccol1, ccol2 = st.columns([3, 1])
    with ccol1:
        custom_id = st.text_input("Dataset ID or URL", placeholder="e.g. fhrw-4uyv or https://data.cityofnewyork.us/resource/fhrw-4uyv.json", key="nyc_custom_id")
    with ccol2:
        custom_lat = st.text_input("Lat col", value="latitude", key="nyc_custom_lat")

    ccol3, ccol4, ccol5 = st.columns([1, 1, 2])
    with ccol3: custom_lng   = st.text_input("Lng col", value="longitude", key="nyc_custom_lng")
    with ccol4: custom_label = st.text_input("Label col", value="", key="nyc_custom_label")
    with ccol5:
        custom_where = st.text_input("WHERE filter (optional SoQL)", placeholder="status='Active'", key="nyc_custom_where")

    if st.button("▶ Fetch & Add to Map", key="nyc_custom_fetch", use_container_width=True) and custom_id:
        # Extract ID from URL if needed
        ds_id = custom_id.strip()
        if "/" in ds_id:
            ds_id = ds_id.rstrip("/").split("/")[-1].replace(".json","").replace(".geojson","")
        with st.spinner("Fetching dataset…"):
            result = fetch_socrata_dataset(
                ds_id, nyc_token,
                lat_col=custom_lat, lng_col=custom_lng,
                label_col=custom_label, where_clause=custom_where, limit=500
            )
        if result["error"]:
            st.error(f"Error: {result['error']}")
        elif not result["features"]:
            st.warning(f"No mappable records returned. Fetched {result['total_rows']} rows but {result['skipped']} lacked valid lat/lng.")
        else:
            color = "#f472b6"
            def make_custom_popup(lcol, clr):
                def fn(feat): return socrata_popup_html(feat, lcol, ds_id, clr)
                return fn
            st.session_state.map_layers.append({
                "id":       f"nyc_{ds_id}",
                "name":     f"NYC OD: {ds_id}",
                "type":     "socrata",
                "color":    color,
                "icon":     "🗽",
                "features": result["features"],
                "visible":  True,
                "popup_fn": make_custom_popup(custom_label, color),
                "count":    len(result["features"]),
                "source":   f"NYC Open Data · {ds_id}",
            })
            st.success(f"✓ Added {len(result['features'])} features to map")
            st.rerun()

    # ── Active map layers ──────────────────────────────────────────────────────
    nyc_active = [l for l in st.session_state.map_layers if l["type"] == "socrata"]
    if nyc_active:
        st.divider()
        st.markdown(f"**{len(nyc_active)} NYC Open Data layer(s) on map:**")
        for i, layer in enumerate(nyc_active):
            c1, c2 = st.columns([5, 1])
            with c1:
                st.markdown(
                    f'<span class="pill p-blue">{layer["icon"]} {layer["name"][:50]} · {layer["count"]} features</span>',
                    unsafe_allow_html=True
                )
            with c2:
                if st.button("✕", key=f"rm_nyc_layer_{i}"):
                    st.session_state.map_layers = [l for l in st.session_state.map_layers if l["id"] != layer["id"]]
                    st.rerun()

# ── ESRI Tab ───────────────────────────────────────────────────────────────────
with tab_esri:
    st.markdown("#### Search ArcGIS Online & Living Atlas")
    st.caption("Public layers, no authentication required. Inject metadata into the EMBER knowledge base.")

    col1, col2, col3 = st.columns([3, 2, 2])
    with col1: esri_query        = st.text_input("Search layers, maps, services…", placeholder="e.g. NYC flood zones")
    with col2: esri_filter_label = st.selectbox("Filter", list(LIVING_ATLAS_FILTERS.keys()))
    with col3: esri_type         = st.selectbox("Item Type", ITEM_TYPES)
    esri_filter = LIVING_ATLAS_FILTERS[esri_filter_label]

    col_s, col_p = st.columns([2, 3])
    with col_s: do_search = st.button("🔍 Search ArcGIS Online", use_container_width=True)
    with col_p: esri_page = st.number_input("Page", min_value=1, value=1, step=1, label_visibility="collapsed")

    if do_search and esri_query:
        with st.spinner("Searching ArcGIS Online…"):
            results, total, err = search_agol(esri_query, esri_filter, esri_type, num=8, start=(esri_page-1)*8+1)
            st.session_state.esri_results  = results
            st.session_state.esri_total    = total
            st.session_state.esri_searched = True
            if err: st.error(f"Search error: {err}")

    if st.session_state.esri_searched:
        results      = st.session_state.esri_results
        total        = st.session_state.esri_total
        injected_ids = {i["item_id"] for i in st.session_state.esri_items}
        if not results:
            st.info("No results. Try broader search terms.")
        else:
            st.caption(f"{total:,} results found")
            for item in results:
                is_la    = "esri" in (item.get("owner", "")).lower()
                tags     = ", ".join((item.get("tags") or [])[:6])
                updated  = str(item.get("modified", ""))[:10]
                injected = item["id"] in injected_ids
                st.markdown(f"""<div class="esri-card">
                    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px">
                      <span class="pill p-blue">{item.get('type','')}</span>
                      {"<span class='pill p-purple'>Living Atlas</span>" if is_la else ""}
                      {"<span class='pill p-green'>✓ In KB</span>" if injected else ""}
                    </div>
                    <div style="font-weight:700;color:#dde;margin-bottom:4px">{item.get('title','')}</div>
                    <div style="font-size:10px;color:#555;margin-bottom:4px">{item.get('owner','')} · {updated}</div>
                    <div style="font-size:11px;color:#778;margin-bottom:6px">{(item.get('snippet') or '')[:160]}</div>
                    {f'<div style="font-size:9px;color:#3a3e58">{tags}</div>' if tags else ''}
                </div>""", unsafe_allow_html=True)
                ca, cb, cc, cd = st.columns([2, 2, 1, 1])
                with ca:
                    if st.button("⊕ Inspect Metadata", key=f"inspect_{item['id']}", use_container_width=True):
                        with st.spinner("Fetching metadata…"):
                            full_item, data, err = fetch_item_metadata(item["id"])
                        if err:
                            st.error(f"Error: {err}")
                        else:
                            with st.expander("📋 Full Metadata", expanded=True):
                                st.markdown(f"**ID:** `{full_item.get('id','')}` | **Type:** {full_item.get('type','')} | **Owner:** {full_item.get('owner','')}")
                                if full_item.get("url"): st.markdown(f"**Service URL:** [{full_item['url']}]({full_item['url']})")
                                st.markdown(f"**Tags:** {', '.join(full_item.get('tags',[]))}")
                                desc = re.sub(r'<[^>]+>', '', full_item.get('description', ''))
                                if desc: st.markdown(f"**Description:** {desc[:800]}")
                                if data:
                                    if "layers" in data: st.markdown("**Layers:** " + ", ".join(f"{l.get('id')}:{l.get('name','')}" for l in data["layers"]))
                                    if "operationalLayers" in data: st.markdown("**Operational Layers:** " + ", ".join(l.get("title","?") for l in data["operationalLayers"]))
                                    st.json(data, expanded=False)
                                st.json(full_item, expanded=False)
                with cb:
                    if not injected:
                        if st.button("+ Add to KB", key=f"inject_{item['id']}", use_container_width=True):
                            full_item, data, _ = fetch_item_metadata(item["id"])
                            ctx_text = format_item_for_context(full_item or item, data)
                            st.session_state.esri_items.append({"name": f"ESRI: {item.get('title','')}", "item_id": item["id"], "content": ctx_text})
                            st.session_state.pending_query = f"I just added '{item.get('title','')}' to the KB. Summarize what it contains and how it supports NYC emergency management."
                            st.rerun()
                    else:
                        st.button("✓ In KB", key=f"injected_{item['id']}", disabled=True, use_container_width=True)
                with cc: st.link_button("↗ AGOL", f"https://www.arcgis.com/home/item.html?id={item['id']}")
                with cd:
                    if item.get("url"): st.link_button("↗ Service", item["url"])

                # Add to Map button — only for Feature Layers / Map Services with a URL
                if item.get("url") and item.get("type") in ("Feature Layer", "Feature Service", "Map Service"):
                    esri_on_map = any(
                        l.get("owner_item_id") == item["id"]
                        for l in st.session_state.map_layers if l.get("type") == "esri"
                    )
                    if esri_on_map:
                        if st.button(f"✕ Remove from Map", key=f"esri_rm_map_{item['id']}", use_container_width=True):
                            st.session_state.map_layers = [
                                l for l in st.session_state.map_layers
                                if l.get("owner_item_id") != item["id"]
                            ]
                            st.rerun()
                    else:
                        if st.button(f"🗺 Add to Map", key=f"esri_map_{item['id']}", use_container_width=True):
                            with st.spinner("Inspecting Feature Service layers…"):
                                discovery = discover_esri_feature_layers(item["url"])
                            if discovery.get("error"):
                                st.error(f"Error inspecting service: {discovery['error']}")
                            elif len(discovery.get("layers", [])) == 1:
                                result = add_operational_esri_layer(
                                    item["id"], item.get("title", item["id"]), discovery["layers"][0]
                                )
                                if result.get("error"):
                                    st.error(f"Error fetching layer: {result['error']}")
                                elif not result.get("features"):
                                    st.warning("No features returned — layer may be empty or require authentication")
                                else:
                                    st.success(f"✓ Added {result['total']} features to map")
                                    st.rerun()
                            elif discovery.get("layers"):
                                st.session_state.esri_pending_adds[f"operational:{item['id']}"] = {
                                    "item": item, "layers": discovery.get("layers", [])
                                }
                                st.rerun()
                            else:
                                st.warning("No Feature Layer sublayers were found in this service")

                        pending_key = f"operational:{item['id']}"
                        pending = st.session_state.esri_pending_adds.get(pending_key)
                        if pending:
                            choices = pending["layers"]
                            selected_urls = st.multiselect(
                                "Choose Feature Layer sublayers",
                                [choice["url"] for choice in choices],
                                format_func=lambda url, cs=choices: next(
                                    f"{c['id']}: {c['name']}" for c in cs if c["url"] == url
                                ),
                                key=f"esri_sub_{item['id']}",
                            )
                            if st.button("Add selected sublayers", key=f"esri_sub_add_{item['id']}",
                                         disabled=not selected_urls, use_container_width=True):
                                failures = []
                                for choice in choices:
                                    if choice["url"] in selected_urls:
                                        result = add_operational_esri_layer(
                                            item["id"], item.get("title", item["id"]), choice
                                        )
                                        if result.get("error") or not result.get("features"):
                                            failures.append(f"{choice['name']}: {result.get('error') or 'no features'}")
                                st.session_state.esri_pending_adds.pop(pending_key, None)
                                if failures:
                                    st.error("; ".join(failures))
                                else:
                                    st.rerun()

    if st.session_state.esri_items:
        st.divider()
        st.markdown(f"**{len(st.session_state.esri_items)} ESRI layer(s) in KB:**")
        for i, ei in enumerate(st.session_state.esri_items):
            c1, c2 = st.columns([5, 1])
            with c1: st.markdown(f'<span class="pill p-purple">⊕ {ei["name"][:60]}</span>', unsafe_allow_html=True)
            with c2:
                if st.button("✕", key=f"rm_esri_{i}"):
                    st.session_state.esri_items.pop(i)
                    st.rerun()

    # ESRI layers currently on map
    esri_map_layers = [l for l in st.session_state.map_layers if l["type"] == "esri"]
    if esri_map_layers:
        st.divider()
        st.markdown(f"**{len(esri_map_layers)} ESRI layer(s) on map:**")
        for i, layer in enumerate(esri_map_layers):
            c1, c2 = st.columns([5, 1])
            with c1:
                st.markdown(f'<span class="pill p-purple">⊕ {layer["name"][:50]} · {layer["count"]} features</span>', unsafe_allow_html=True)
            with c2:
                if st.button("✕", key=f"rm_esri_map_{i}"):
                    st.session_state.map_layers = [l for l in st.session_state.map_layers if l["id"] != layer["id"]]
                    st.rerun()
            presentation = layer.get("presentation") or build_presentation(
                layer.get("metadata"), layer.get("features", [])
            )
            options = ["__auto__"] + presentation.get("fields", [])
            current = presentation.get("label_field_override") or "__auto__"
            selected = st.selectbox(
                "Hover label",
                options,
                index=options.index(current) if current in options else 0,
                format_func=lambda field, p=presentation: (
                    f"Automatic ({p.get('aliases', {}).get(p.get('label_field_auto'), p.get('label_field_auto') or 'layer name')})"
                    if field == "__auto__" else p.get("aliases", {}).get(field, field)
                ),
                key=f"esri_label_{layer['id']}",
            )
            layer["presentation"] = build_presentation(
                layer.get("metadata"), layer.get("features", []),
                None if selected == "__auto__" else selected,
            )

# ── Chat Tab ──────────────────────────────────────────────────────────────────
with tab_chat:
    for msg in st.session_state.messages:
        with st.chat_message(msg["role"]):
            st.markdown(msg["content"])

    with st.expander("▸ Quick Queries"):
        qcols = st.columns(2)
        quick = [
            "Storm surge risk — Long Beach and Fire Island",
            "Zone A assets at risk from Cat 2 hurricane",
            "Trauma centers and hospital surge capacity on Long Island",
            "Current NWS alerts for Long Island",
            "Heat emergency protocol thresholds Nassau and Suffolk",
            "Evacuation routes from barrier island communities",
            "Critical infrastructure in FEMA Zone AE — south shore",
            "What do the current water levels indicate at Kings Point and Montauk?",
                ]

        for i, q in enumerate(quick):
            if qcols[i % 2].button(q, key=f"quick_{i}", use_container_width=True):
                st.session_state.pending_query = q

    def run_query(prompt):
        assistant_index = begin_chat_response(st.session_state.messages, prompt)
        with st.chat_message("user"):
            st.markdown(prompt)
        ctx  = build_context(
            st.session_state.files, st.session_state.api_results,
            active_kb, st.session_state.esri_items,
            st.session_state.get("noaa_items", []),
            st.session_state.get("gauge_data", {}),
        )
        msgs = [
            {"role": m["role"], "content": m["content"]}
            for m in st.session_state.messages[max(0, assistant_index - 10):assistant_index]
        ]
        with st.chat_message("assistant"):
            placeholder = st.empty()
            full = ""
            try:
                for token in stream_ollama(msgs, ctx):
                    full += token
                    update_chat_response(st.session_state.messages, assistant_index, full)
                    placeholder.markdown(full + "▋")
            except Exception as exc:
                full += f"\n\n⚠ Chat response interrupted: {exc}"
            finally:
                finish_chat_response(st.session_state.messages, assistant_index, full)
                st.session_state.chat_response_pending = False
            placeholder.markdown(full)
        st.rerun()

    if "pending_query" in st.session_state:
        if not st.session_state.chat_response_pending:
            st.session_state.chat_response_pending = True
            st.rerun()
        run_query(st.session_state.pop("pending_query"))

    def queue_chat_prompt():
        prompt = st.session_state.get("chat_prompt", "").strip()
        if prompt:
            st.session_state.pending_query = prompt
            st.session_state.chat_response_pending = True

    st.chat_input(
        "Incident type + location… e.g. 'Cat 2 hurricane at Coney Island'",
        key="chat_prompt",
        on_submit=queue_chat_prompt,
    )

# ── Map Builder Tab ────────────────────────────────────────────────────────────
with tab_mapbuilder:
    st.markdown("#### 🗺 ESRI ArcGIS Map Builder")
    st.caption("Build an interactive map with ArcGIS Online layers — powered by the ArcGIS Maps SDK for JavaScript (CDN, no install)")

    # ── Layer management sidebar within tab ────────────────────────────────────
    mb_col_left, mb_col_right = st.columns([1, 2])

    with mb_col_left:
        st.markdown("**Add Layers**")

        # Quick-add from ESRI search results already in session
        if st.session_state.esri_results:
            st.caption("From your ESRI search results:")
            for item in st.session_state.esri_results:
                if item.get("url") and item.get("type") in (
                    "Feature Layer", "Feature Service", "Map Service",
                    "Image Service", "Vector Tile Layer"
                ):
                    already = any(
                        l.get("owner_item_id") == item["id"] or l["id"] == item["id"]
                        for l in st.session_state.mb_layers
                    )
                    btn_label = "✓ Added" if already else f"+ {item.get('title','')[:30]}"
                    if not already:
                        if st.button(btn_label, key=f"mb_add_{item['id']}", use_container_width=True):
                            surl = item["url"]
                            if "/FeatureServer" in surl:
                                discovery = discover_esri_feature_layers(surl)
                                if discovery.get("error"):
                                    st.error(discovery["error"])
                                elif len(discovery.get("layers", [])) == 1:
                                    add_map_builder_feature_layer(
                                        item["id"], item.get("title", item["id"]), discovery["layers"][0]
                                    )
                                elif discovery.get("layers"):
                                    st.session_state.esri_pending_adds[f"builder:{item['id']}"] = {
                                        "item": item, "layers": discovery.get("layers", [])
                                    }
                                else:
                                    st.warning("No Feature Layer sublayers were found")
                            else:
                                st.session_state.mb_layers.append({
                                    "id": item["id"], "name": item.get("title", item["id"])[:40],
                                    "url": surl, "item_id": item["id"],
                                    "type": item.get("type", "Feature Layer"), "opacity": 1.0,
                                    "visible": True, "color": "#a78bfa",
                                })
                            st.rerun()

                        pending = st.session_state.esri_pending_adds.get(f"builder:{item['id']}")
                        if pending:
                            choices = pending["layers"]
                            selected_urls = st.multiselect(
                                "Choose sublayers", [choice["url"] for choice in choices],
                                format_func=lambda url, cs=choices: next(
                                    f"{c['id']}: {c['name']}" for c in cs if c["url"] == url
                                ), key=f"mb_sub_{item['id']}",
                            )
                            if st.button("Add selected", key=f"mb_sub_add_{item['id']}",
                                         disabled=not selected_urls, use_container_width=True):
                                for choice in choices:
                                    if choice["url"] in selected_urls:
                                        add_map_builder_feature_layer(
                                            item["id"], item.get("title", item["id"]), choice
                                        )
                                st.session_state.esri_pending_adds.pop(f"builder:{item['id']}", None)
                                st.rerun()
                    else:
                        st.markdown(f'<span class="pill p-purple">✓ {item.get("title","")[:28]}</span>', unsafe_allow_html=True)
        else:
            st.caption("Search ESRI layers in the ⊕ ESRI / Living Atlas tab first, then return here to add them.")

        st.divider()

        # Manual URL entry
        st.markdown("**Add by URL or Item ID**")
        mb_url_in   = st.text_input("Feature Service URL or AGOL Item ID", key="mb_url_input",
                                     placeholder="https://services.arcgis.com/.../FeatureServer/0")
        mb_name_in  = st.text_input("Layer name", key="mb_name_input", placeholder="My Layer")
        mb_type_sel = st.selectbox("Layer type", ["Feature Layer","Map Service","Image Service","Vector Tile Layer"], key="mb_type_sel")

        if st.button("+ Add Layer", key="mb_add_manual", use_container_width=True) and mb_url_in:
            entry_id = mb_url_in.strip()
            # If it's a bare AGOL item ID (8–16 alphanumeric chars), load as portalItem
            is_item_id = re.match(r'^[a-f0-9]{16,32}$', entry_id, re.I)
            surl = entry_id
            if "/FeatureServer" in surl:
                discovery = discover_esri_feature_layers(surl)
                if discovery.get("error"):
                    st.error(discovery["error"])
                elif len(discovery.get("layers", [])) == 1:
                    add_map_builder_feature_layer(
                        entry_id, mb_name_in or discovery["layers"][0]["name"], discovery["layers"][0], "#60a5fa"
                    )
                elif discovery.get("layers"):
                    st.session_state.esri_pending_adds["builder:manual"] = {
                        "item": {"id": entry_id, "title": mb_name_in or "Feature Service"},
                        "layers": discovery.get("layers", []),
                    }
                else:
                    st.warning("No Feature Layer sublayers were found")
            else:
                st.session_state.mb_layers.append({
                    "id": entry_id, "name": mb_name_in or entry_id[:30], "url": surl,
                    "item_id": entry_id if is_item_id else "", "type": mb_type_sel,
                    "opacity": 1.0, "visible": True, "color": "#60a5fa",
                })
            st.rerun()

        manual_pending = st.session_state.esri_pending_adds.get("builder:manual")
        if manual_pending:
            choices = manual_pending["layers"]
            selected_urls = st.multiselect(
                "Choose URL sublayers", [choice["url"] for choice in choices],
                format_func=lambda url, cs=choices: next(
                    f"{c['id']}: {c['name']}" for c in cs if c["url"] == url
                ), key="mb_manual_sublayers",
            )
            if st.button("Add selected URL sublayers", disabled=not selected_urls,
                         key="mb_manual_sublayers_add", use_container_width=True):
                item = manual_pending["item"]
                for choice in choices:
                    if choice["url"] in selected_urls:
                        add_map_builder_feature_layer(item["id"], item["title"], choice, "#60a5fa")
                st.session_state.esri_pending_adds.pop("builder:manual", None)
                st.rerun()

        st.divider()

        # Living Atlas quick-adds — curated emergency-relevant public layers
        st.markdown("**Living Atlas Quick-Add**")
        LIVING_ATLAS_PRESETS = [
            {"name": "USA Flood Hazard Areas (FEMA)",    "url": "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Flood_Hazard_Reduced_Set_gdb/FeatureServer/0", "color": "#60a5fa"},
            {"name": "USA Hurricane Tracks",              "url": "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/Historical_Hurricane_Tracks/FeatureServer/1",        "color": "#f87171"},
            {"name": "USA Hospitals",                     "url": "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Hospitals/FeatureServer/0",                      "color": "#34d399"},
            {"name": "USA Fire Stations",                 "url": "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Fire_Stations/FeatureServer/0",                  "color": "#fb923c"},
            {"name": "FEMA Disaster Declarations",        "url": "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/FEMA_Disaster_Declaration_Areas/FeatureServer/0",    "color": "#facc15"},
            {"name": "World Imagery (basemap tile)",      "url": "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",                                          "color": "#a78bfa"},
        ]
        for preset in LIVING_ATLAS_PRESETS:
            already = any(l["url"] == preset["url"] for l in st.session_state.mb_layers)
            if not already:
                if st.button(f"+ {preset['name']}", key=f"mb_preset_{preset['name'][:20]}", use_container_width=True):
                    if "/FeatureServer" in preset["url"]:
                        discovery = discover_esri_feature_layers(preset["url"])
                        if discovery.get("layers"):
                            add_map_builder_feature_layer(
                                preset["url"], preset["name"], discovery["layers"][0], preset["color"]
                            )
                        else:
                            st.error(discovery.get("error") or "No Feature Layers found")
                    else:
                        st.session_state.mb_layers.append({
                            "id": preset["url"], "name": preset["name"], "url": preset["url"],
                            "item_id": "", "type": "Map Service", "opacity": 1.0,
                            "visible": True, "color": preset["color"],
                        })
                    st.rerun()
            else:
                st.markdown(f'<span class="pill p-purple">✓ {preset["name"][:28]}</span>', unsafe_allow_html=True)

        st.divider()

        # Layer list with controls
        if st.session_state.mb_layers:
            st.markdown(f"**Active Layers ({len(st.session_state.mb_layers)})**")
            for li, layer in enumerate(st.session_state.mb_layers):
                with st.container():
                    lc1, lc2 = st.columns([4, 1])
                    with lc1:
                        color = layer.get("color","#a78bfa")
                        st.markdown(
                            f'<div style="font-family:monospace;font-size:10px;color:{color};'
                            f'font-weight:700;margin-bottom:2px">{layer["name"]}</div>'
                            f'<div style="font-size:9px;color:#446">{layer["type"]}</div>',
                            unsafe_allow_html=True
                        )
                    with lc2:
                        if st.button("✕", key=f"mb_rm_{li}_{layer['id'][:8]}"):
                            st.session_state.mb_layers.pop(li)
                            st.rerun()

                    if layer.get("metadata_error"):
                        st.caption(f"Metadata fallback: {layer['metadata_error']}")

                    new_opacity = st.slider("Opacity", 0.0, 1.0,
                                            value=float(layer.get("opacity", 1.0)),
                                            step=0.05, key=f"mb_op_{li}_{layer['id'][:8]}")
                    new_visible = st.checkbox("Visible", value=layer.get("visible", True),
                                              key=f"mb_vis_{li}_{layer['id'][:8]}")
                    st.session_state.mb_layers[li]["opacity"] = new_opacity
                    st.session_state.mb_layers[li]["visible"] = new_visible
                    presentation = layer.get("presentation")
                    if presentation and presentation.get("fields"):
                        options = ["__auto__"] + presentation["fields"]
                        current = presentation.get("label_field_override") or "__auto__"
                        selected = st.selectbox(
                            "Hover / popup title",
                            options, index=options.index(current) if current in options else 0,
                            format_func=lambda field, p=presentation: (
                                f"Automatic ({p.get('aliases', {}).get(p.get('label_field_auto'), p.get('label_field_auto') or 'layer name')})"
                                if field == "__auto__" else p.get("aliases", {}).get(field, field)
                            ), key=f"mb_label_{li}_{layer['id'][:8]}",
                        )
                        st.session_state.mb_layers[li]["presentation"] = build_presentation(
                            layer.get("metadata"), label_override=None if selected == "__auto__" else selected
                        )
                    st.markdown("---")

        # Basemap picker
        st.markdown("**Basemap**")
        BASEMAPS = {
            "Dark Gray":     "dark-gray-vector",
            "Streets":       "streets-vector",
            "Imagery":       "satellite",
            "Topo":          "topo-vector",
            "Oceans":        "oceans",
            "Light Gray":    "gray-vector",
            "Navigation":    "navigation",
            "OSM Standard":  "osm",
        }
        selected_bm_label = st.selectbox("Basemap", list(BASEMAPS.keys()),
                                          index=list(BASEMAPS.values()).index(
                                              st.session_state.get("mb_basemap","dark-gray-vector")
                                          ), key="mb_basemap_sel")
        st.session_state.mb_basemap = BASEMAPS[selected_bm_label]

    # ── ArcGIS Map Panel ───────────────────────────────────────────────────────
    with mb_col_right:
        layers_json = json.dumps([
            {
                "id":      l["id"],
                "name":    l["name"],
                "url":     l["url"],
                "item_id": l.get("item_id",""),
                "type":    l.get("type","Feature Layer"),
                "opacity": l.get("opacity", 1.0),
                "visible": l.get("visible", True),
                "color": l.get("color", "#a78bfa"),
                "presentation": l.get("presentation"),
            }
            for l in st.session_state.mb_layers
        ])
        center = CFG.center
        basemap = st.session_state.get("mb_basemap","dark-gray-vector")

        map_html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://js.arcgis.com/4.32/esri/themes/dark/main.css" />
  <script src="https://js.arcgis.com/4.32/"></script>
  <style>
    * {{ margin:0; padding:0; box-sizing:border-box; }}
    html, body, #viewDiv {{ width:100%; height:100%; background:#07090d; font-family:monospace; }}
    #status {{ position:absolute; top:10px; left:50%; transform:translateX(-50%);
               background:#07090dcc; color:#4ade80; font-family:monospace; font-size:11px;
               padding:4px 12px; border-radius:4px; border:1px solid #4ade8044;
               z-index:999; pointer-events:none; }}
    #noLayers {{ position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
                 color:#334; font-family:monospace; font-size:13px; text-align:center; }}
    #featureTooltip {{ position:absolute; display:none; z-index:1000; pointer-events:none;
                       max-width:260px; background:#07090dee; color:#e5e7eb; border:1px solid #818cf877;
                       border-radius:4px; padding:5px 8px; font:11px monospace; box-shadow:0 3px 12px #0008; }}
  </style>
</head>
<body>
  <div id="viewDiv"></div>
  <div id="status">EMBER Map Builder · ArcGIS Maps SDK 4.32</div>
  <div id="featureTooltip"></div>
  {"<div id='noLayers'>← Add layers from the left panel<br><span style='font-size:10px;color:#223'>Search ESRI tab or use Living Atlas quick-adds</span></div>" if not st.session_state.mb_layers else ""}
  <script>
    const LAYERS   = {layers_json};
    const CENTER   = [{center[0]}, {center[1]}];
    const BASEMAP  = "{basemap}";

    require([
      "esri/Map",
      "esri/views/MapView",
      "esri/layers/FeatureLayer",
      "esri/layers/MapImageLayer",
      "esri/layers/ImageryLayer",
      "esri/layers/VectorTileLayer",
      "esri/widgets/LayerList",
      "esri/widgets/Legend",
      "esri/widgets/Search",
      "esri/widgets/ScaleBar",
      "esri/widgets/Fullscreen",
      "esri/widgets/Home",
      "esri/widgets/BasemapGallery",
      "esri/widgets/Expand",
    ], function(Map, MapView, FeatureLayer, MapImageLayer, ImageryLayer,
                VectorTileLayer, LayerList, Legend, Search, ScaleBar,
                Fullscreen, Home, BasemapGallery, Expand) {{

      const map = new Map({{ basemap: BASEMAP }});

      function escapeHtml(value) {{
        return String(value == null ? "" : value).replace(/[&<>"']/g, function(ch) {{
          return ({{"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}})[ch];
        }});
      }}

      function displayValue(field, value, attributes, presentation) {{
        if (value == null) return "";
        const domains = (presentation.domains || {{}})[field] || {{}};
        const typeField = presentation.type_id_field;
        const subtype = typeField && attributes[typeField] != null ? String(attributes[typeField]) : null;
        const subtypeDomains = subtype
          ? (((presentation.subtype_domains || {{}})[subtype] || {{}})[field] || {{}})
          : {{}};
        return String(subtypeDomains[String(value)] ?? domains[String(value)] ?? value);
      }}

      function presentationLabel(attributes, presentation, fallback) {{
        if (!presentation) return fallback;
        const field = presentation.label_field;
        const value = field ? displayValue(field, attributes[field], attributes, presentation) : "";
        return value.trim() ? value.slice(0, 80) : fallback;
      }}

      function presentationPopup(graphic, cfg) {{
        const attributes = graphic.attributes || {{}};
        const p = cfg.presentation;
        if (!p) return escapeHtml(cfg.name);
        const rows = (p.field_order || []).filter(function(field) {{
          const value = attributes[field];
          return value !== null && value !== undefined && value !== "";
        }}).map(function(field) {{
          return '<div style="margin-bottom:3px"><span style="color:#667">' +
            escapeHtml((p.aliases || {{}})[field] || field) + ':</span> <span>' +
            escapeHtml(displayValue(field, attributes[field], attributes, p).slice(0, 500)) + '</span></div>';
        }});
        const primary = rows.slice(0, 8).join("");
        const more = rows.length > 8
          ? '<details style="margin-top:6px"><summary style="cursor:pointer;color:#818cf8">' +
            (rows.length - 8) + ' more attribute(s)</summary><div style="margin-top:5px">' +
            rows.slice(8).join("") + '</div></details>'
          : "";
        return '<div style="font:11px monospace;max-width:340px;max-height:320px;overflow:auto">' +
          primary + more + '<div style="color:#667;font-size:9px;margin-top:7px;border-top:1px solid #334">' +
          'ESRI Feature Layer · ' + escapeHtml(cfg.name) + '</div></div>';
      }}

      const view = new MapView({{
        container: "viewDiv",
        map: map,
        center: [CENTER[1], CENTER[0]],
        zoom: {CFG.zoom},
        ui: {{ padding: {{ top: 40 }} }},
      }});

      // ── Add layers ────────────────────────────────────────────────────────
      LAYERS.forEach(function(layerCfg) {{
        var lyr;
        var opts = {{
          title:   layerCfg.name,
          opacity: layerCfg.opacity,
          visible: layerCfg.visible,
        }};

        if (layerCfg.presentation) {{
          opts.outFields = ["*"];
          opts.popupTemplate = {{
            title: layerCfg.presentation.label_field
              ? "{" + layerCfg.presentation.label_field + "}"
              : layerCfg.name,
            outFields: ["*"],
            content: function(event) {{ return presentationPopup(event.graphic, layerCfg); }},
          }};
        }}

        if (layerCfg.item_id && layerCfg.item_id.length > 10 && !layerCfg.url.startsWith("http")) {{
          // Portal item ID
          opts.portalItem = {{ id: layerCfg.item_id }};
          lyr = new FeatureLayer(opts);
        }} else {{
          opts.url = layerCfg.url;
          var t = layerCfg.type;
          if (t === "Map Service" || t === "MapImageLayer") {{
            lyr = new MapImageLayer(opts);
          }} else if (t === "Image Service" || t === "ImageryLayer") {{
            lyr = new ImageryLayer(opts);
          }} else if (t === "Vector Tile Layer") {{
            lyr = new VectorTileLayer(opts);
          }} else {{
            lyr = new FeatureLayer(opts);
          }}
        }}

        lyr.__emberConfig = layerCfg;

        lyr.when(function() {{
          document.getElementById("status").textContent =
            "✓ " + lyr.title + " loaded";
          setTimeout(function() {{
            document.getElementById("status").textContent =
              "EMBER Map Builder · " + map.layers.length + " layer(s)";
          }}, 2000);
        }}, function(err) {{
          document.getElementById("status").textContent =
            "⚠ " + layerCfg.name + ": " + (err.message || "load error");
          console.warn("Layer load error:", layerCfg.name, err);
        }});

        map.add(lyr);
      }});

      // Metadata-aware hover labels for points, lines, and polygons.
      const tooltip = document.getElementById("featureTooltip");
      let hoverRequest = 0;
      view.on("pointer-move", function(event) {{
        const requestId = ++hoverRequest;
        view.hitTest(event).then(function(response) {{
          if (requestId !== hoverRequest) return;
          const hit = response.results.find(function(result) {{
            return result.graphic && result.graphic.layer && result.graphic.layer.__emberConfig &&
              result.graphic.layer.__emberConfig.presentation;
          }});
          if (!hit) {{ tooltip.style.display = "none"; return; }}
          const cfg = hit.graphic.layer.__emberConfig;
          tooltip.textContent = presentationLabel(hit.graphic.attributes || {{}}, cfg.presentation, cfg.name);
          tooltip.style.left = (event.x + 14) + "px";
          tooltip.style.top = (event.y + 14) + "px";
          tooltip.style.display = "block";
        }}).catch(function() {{ tooltip.style.display = "none"; }});
      }});
      view.on("pointer-leave", function() {{ tooltip.style.display = "none"; }});

      // ── Widgets ────────────────────────────────────────────────────────────
      view.when(function() {{
        // Layer list (expandable, bottom-right)
        var layerListExpand = new Expand({{
          view: view,
          content: new LayerList({{ view: view, listItemCreatedFunction: function(event) {{
            var item = event.item;
            item.panel = {{
              content: "legend",
              open: item.layer.visible,
            }};
          }}}}),
          expandIcon: "layers",
          expandTooltip: "Layer List",
          expanded: true,
          group: "top-right",
        }});

        // Legend (expandable)
        var legendExpand = new Expand({{
          view: view,
          content: new Legend({{ view: view }}),
          expandIcon: "legend",
          expandTooltip: "Legend",
          group: "top-right",
        }});

        // Basemap gallery (expandable)
        var bmExpand = new Expand({{
          view: view,
          content: new BasemapGallery({{ view: view }}),
          expandIcon: "basemap",
          expandTooltip: "Change Basemap",
          group: "top-right",
        }});

        // Search
        var searchWidget = new Search({{ view: view }});

        // Scale bar
        var scaleBar = new ScaleBar({{ view: view, unit: "dual" }});

        // Home button
        var homeBtn = new Home({{ view: view }});

        // Fullscreen
        var fullscreen = new Fullscreen({{ view: view }});

        view.ui.add(searchWidget,    "top-left");
        view.ui.add(homeBtn,         "top-left");
        view.ui.add(layerListExpand, "top-right");
        view.ui.add(legendExpand,    "top-right");
        view.ui.add(bmExpand,        "top-right");
        view.ui.add(scaleBar,        "bottom-left");
        view.ui.add(fullscreen,      "bottom-right");

        document.getElementById("status").textContent =
          "EMBER Map Builder · " + map.layers.length + " layer(s) · ArcGIS JS SDK 4.32";
      }});
    }});
  </script>
</body>
</html>"""

        st.iframe(map_html, height=620)

        # ── Share / export ─────────────────────────────────────────────────
        if st.session_state.mb_layers:
            st.divider()
            st.markdown("**Share & Export**")
            exp_col1, exp_col2 = st.columns(2)

            with exp_col1:
                # Generate embed iframe snippet
                layer_params = "&".join(
                    f"layer{i}={l['url']}"
                    for i, l in enumerate(st.session_state.mb_layers)
                    if l.get("visible")
                )
                embed_code = (
                    f'<iframe src="https://arcgis.com/apps/mapviewer/index.html?basemapUrl={basemap}" '
                    f'width="100%" height="500" frameborder="0"></iframe>'
                )
                st.text_area("Embed code (customize in AGOL Map Viewer)", value=embed_code, height=80)

            with exp_col2:
                # Save layer config to jurisdiction.yaml
                if st.button("💾 Save Layer Config to jurisdiction.yaml", use_container_width=True):
                    try:
                        import yaml
                        from config_loader import _DEFAULT_CFG
                        with open(_DEFAULT_CFG) as f:
                            cfg_raw = yaml.safe_load(f)
                        cfg_raw["map_builder_layers"] = [
                            {"name": l["name"], "url": l["url"],
                             "type": l["type"], "opacity": l["opacity"]}
                            for l in st.session_state.mb_layers
                        ]
                        with open(_DEFAULT_CFG, "w") as f:
                            yaml.dump(cfg_raw, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
                        st.success("✓ Saved — layers will auto-load next session")
                    except Exception as e:
                        st.error(f"Save failed: {e}")

                # Layer URLs for sharing
                with st.expander("Layer URLs"):
                    for l in st.session_state.mb_layers:
                        st.code(l["url"], language=None)

# ── Setup Tab ─────────────────────────────────────────────────────────────────
with tab_setup:
    render_wizard()
