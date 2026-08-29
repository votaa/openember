#!/usr/bin/env node
/**
 * scripts/build-config.js
 * Converts config/jurisdiction.yaml -> src/config/jurisdiction.js
 * Fully synchronous. Uses js-yaml if available, Python3 as fallback.
 */

import fs            from "fs"
import path          from "path"
import { execSync }  from "child_process"
import { createRequire } from "module"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT      = path.resolve(__dirname, "..")

// ── YAML parser (js-yaml preferred, python3 fallback) ─────────────────────────
function parseYAML(text) {
  // Try js-yaml first (available after npm install on Vercel)
  try {
    const require = createRequire(import.meta.url)
    const { load } = require("js-yaml")
    return load(text)
  } catch (_) {}

  // Fallback: python3 (always available on Vercel and most CI)
  try {
    const result = execSync(
      'python3 -c "import sys,yaml,json; print(json.dumps(yaml.safe_load(sys.stdin.read())))"',
      { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    )
    return JSON.parse(result.trim())
  } catch (e) {
    throw new Error("Cannot parse YAML — neither js-yaml nor python3 yaml available: " + e.message)
  }
}

// ── Code generation ──────────────────────────────────────────────────────────
function s(val) { return JSON.stringify(val, null, 2) }

function generateJS(cfg) {
  const j     = cfg.jurisdiction    || {}
  const nws   = cfg.nws             || {}
  const coops = cfg.coops_stations  || []
  const regions = cfg.regions       || {}
  const sources = cfg.source_registry || []
  const kb    = cfg.knowledge_base  || {}
  const mp    = cfg.map_points      || {}
  const soc   = cfg.socrata         || {}
  const noaa  = cfg.noaa            || {}
  const brand = cfg.branding        || {}

  const state     = String(j.state   || "NY").toUpperCase()
  const office    = String(nws.office || "OKX")
  const gx        = nws.grid_x || 33
  const gy        = nws.grid_y || 37
  const shortName = j.short_name || j.name || "City"

  const JURISDICTION = {
    name: j.name || "My City", short_name: shortName, state,
    state_full: j.state_full || "", county: j.county || "",
    center: [j.center_lat || 40.7128, j.center_lng || -74.006],
    bbox: { north: j.bbox_north || null, south: j.bbox_south || null,
            east:  j.bbox_east  || null, west:  j.bbox_west  || null },
    zoom: j.zoom_default || 11, timezone: j.timezone || "America/New_York",
  }

  const NWS = {
    office, grid_x: gx, grid_y: gy,
    alert_zone:   nws.alert_zone   || "",
    obs_stations: nws.obs_stations || [],
    alert_url:    "https://api.weather.gov/alerts/active?area=" + state,
    forecast_url: "https://api.weather.gov/gridpoints/" + office + "/" + gx + "," + gy + "/forecast",
    hourly_url:   "https://api.weather.gov/gridpoints/" + office + "/" + gx + "," + gy + "/forecast/hourly",
    gridpoint_url:"https://api.weather.gov/gridpoints/" + office + "/" + gx + "," + gy,
  }

  const FLOOD_THRESHOLDS = {}
  coops.forEach(function(st) {
    FLOOD_THRESHOLDS[st.id] = Object.assign(
      { name: st.name },
      st.flood_thresholds || { action: 4.5, minor: 5.5, moderate: 6.5, major: 8.5 }
    )
  })

  const KNOWLEDGE_BASE = {
    floodZones:             { label: "Flood Zones",             source: "FEMA / Local", data: kb.flood_zones             || "" },
    evacZones:              { label: "Evacuation Zones",        source: "Local OEM",    data: kb.evac_zones              || "" },
    criticalInfrastructure: { label: "Critical Infrastructure", source: "Local OEM",    data: kb.critical_infrastructure || "" },
    hazardProfiles:         { label: "Hazard Profiles",         source: "Local HMP",    data: kb.hazard_profiles         || "" },
    resources:              { label: "Contacts & Resources",    source: "Local OEM",    data: kb.resources               || "" },
  }

  const MAP_LAYERS = {}
  Object.entries(mp).forEach(function(pair) {
    const key = pair[0], cat = pair[1]
    MAP_LAYERS[key] = {
      label: cat.label || key, color: cat.color || "#60a5fa", icon: cat.icon || "📍",
      features: (cat.features || []).map(function(f) {
        return { name: f.name || "", lat: f.lat || 0, lng: f.lng || 0,
                 note: f.note || "", borough: f.borough || "" }
      }),
    }
  })

  const SOCRATA = {
    domain:  soc.domain          || "data.cityofnewyork.us",
    presets: soc.preset_datasets || [],
  }

  const NOAA_STATES = {
    alerts: noaa.alert_state || state,
    usgs:   noaa.usgs_state  || state,
    fema:   noaa.fema_state  || state,
  }

  const BRANDING = {
    appTitle:         brand.app_title         || "EMBER",
    appSubtitle:      brand.app_subtitle      || "Emergency Management Body of Evidence & Resources",
    jurisdictionLine: brand.jurisdiction_line || shortName + " JURISDICTION",
    primaryColor:     brand.primary_color     || "#e8372c",
    logoEmoji:        brand.logo_emoji        || "🚨",
  }

  return [
    "// Auto-generated from config/jurisdiction.yaml — do not edit directly",
    "// Run: node scripts/build-config.js to regenerate",
    "",
    "export const JURISDICTION = "     + s(JURISDICTION)     + ";",
    "export const REGIONS = "          + s(regions)          + ";",
    "export const SOURCE_REGISTRY = "  + s(sources)          + ";",
    "export const NWS = "              + s(NWS)              + ";",
    "export const COOPS_STATIONS = "   + s(coops)            + ";",
    "export const FLOOD_THRESHOLDS = " + s(FLOOD_THRESHOLDS) + ";",
    "export const KNOWLEDGE_BASE = "   + s(KNOWLEDGE_BASE)   + ";",
    "export const MAP_LAYERS = "       + s(MAP_LAYERS)       + ";",
    "export const SOCRATA = "          + s(SOCRATA)          + ";",
    "export const NOAA_STATES = "      + s(NOAA_STATES)      + ";",
    "export const BRANDING = "         + s(BRANDING)         + ";",
    "",
  ].join("\n")
}

function defaultJS() {
  return [
    "// Auto-generated — no jurisdiction.yaml found, using NYC defaults",
    "export const JURISDICTION = " + JSON.stringify({ name:"New York City", short_name:"NYC", state:"NY", center:[40.7128,-74.006], zoom:10 }) + ";",
    "export const REGIONS = {};",
    "export const SOURCE_REGISTRY = [];",
    "export const NWS = {};",
    "export const COOPS_STATIONS = [];",
    "export const FLOOD_THRESHOLDS = {};",
    "export const KNOWLEDGE_BASE = {};",
    "export const MAP_LAYERS = {};",
    "export const SOCRATA = { domain:'data.cityofnewyork.us', presets:[] };",
    "export const NOAA_STATES = { alerts:'NY', usgs:'NY', fema:'NY' };",
    "export const BRANDING = { appTitle:'EMBER', appSubtitle:'', jurisdictionLine:'NYC JURISDICTION', primaryColor:'#e8372c', logoEmoji:'🚨' };",
    "",
  ].join("\n")
}

// ── Entry point ───────────────────────────────────────────────────────────────

const yamlPath = process.argv[2] || path.join(ROOT, "config", "jurisdiction.yaml")
const outPath  = path.join(ROOT, "src", "config", "jurisdiction.js")
const jsonOutPath = path.join(ROOT, "config", "jurisdiction.generated.json")

fs.mkdirSync(path.dirname(outPath), { recursive: true })

if (!fs.existsSync(yamlPath)) {
  console.warn("⚠  No config/jurisdiction.yaml found — writing NYC defaults")
  fs.writeFileSync(outPath, defaultJS())
  process.exit(0)
}

let cfg
try {
  cfg = parseYAML(fs.readFileSync(yamlPath, "utf8"))
} catch (e) {
  console.error("❌ YAML parse failed:", e.message)
  console.warn("   Writing NYC defaults")
  fs.writeFileSync(outPath, defaultJS())
  process.exit(0)
}

fs.writeFileSync(jsonOutPath, JSON.stringify(cfg, null, 2) + "\n")

fs.writeFileSync(outPath, generateJS(cfg))
console.log("✓ src/config/jurisdiction.js written from", path.relative(ROOT, yamlPath))
