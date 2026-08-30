import { useState, useRef, useEffect, useCallback, useMemo } from "react"

// ── All config and data inline — no module-level imports that can throw ───────

// Static import of jurisdiction config — generated at build time by scripts/build-config.js
import {
  JURISDICTION  as _J_raw,
  REGIONS       as _REGIONS_raw,
  SOURCE_REGISTRY as _SOURCE_REGISTRY_raw,
  NWS           as _NWS_raw,
  KNOWLEDGE_BASE as _KB_raw,
  MAP_LAYERS    as _ML_raw,
  SOCRATA       as _SOC_raw,
  BRANDING      as _BR_raw,
  COOPS_STATIONS as _COOPS_raw,
} from "./config/jurisdiction.js"
import { appendCartoApiKey } from "./utils/carto.js"
import {
  ROCKAWAY_SOURCE_IDS,
} from "./data/regional/rockawaySources.js"
import {
  PHASE4_GEOGRAPHY_SOURCE_IDS,
  PHASE4_OBSERVATION_SOURCE_IDS,
  PHASE4_SOURCE_IDS,
  clearPhase4SourceCache,
  fetchPhase4SourceBundle,
  phase4SourceCard,
  unavailablePhase4Result,
} from "./data/regional/phase4Sources.js"
import {
  discoverArcGISLayers,
  fetchArcGISLayer,
  isQueryableArcGISServiceUrl,
} from "./data/esriLayers.js"
import {
  MAP_BUILDER_FILTER_LABELS,
  MAP_BUILDER_FILTER_MODES,
  MAP_BUILDER_PRESETS,
  arcGISGeometryForMode,
  evaluateMapBuilderFilter,
} from "./data/mapBuilderFilters.js"

const _J     = _J_raw     || {}
const _REGIONS = _REGIONS_raw || {}
const _SOURCE_REGISTRY = _SOURCE_REGISTRY_raw || []
const _NWS   = _NWS_raw   || {}
const _KB    = _KB_raw    || {}
const _ML    = _ML_raw    || {}
const _SOC   = _SOC_raw   || {}
const _BR    = _BR_raw    || {}
const _COOPS = _COOPS_raw || []

// Regional NWS/METAR observation stations used by the WIND OBS map layer.
// Prioritize Long Island airports, with nearby stations for western Sound/JFK context.
const WIND_STATIONS = [
  { id: "KFRG", name: "Republic Airport",              lat: 40.7288, lng: -73.4134 },
  { id: "KISP", name: "Long Island MacArthur Airport", lat: 40.7952, lng: -73.1002 },
  { id: "KHWV", name: "Brookhaven Airport",            lat: 40.8219, lng: -72.8694 },
  { id: "KFOK", name: "Gabreski Airport",              lat: 40.8437, lng: -72.6318 },
  { id: "KMTP", name: "Montauk Airport",               lat: 41.0765, lng: -71.9208 },
  { id: "KJFK", name: "JFK Airport",                   lat: 40.6413, lng: -73.7781 },
  { id: "KLGA", name: "LaGuardia Airport",             lat: 40.7772, lng: -73.8726 },
  { id: "KBDR", name: "Bridgeport Airport",            lat: 41.1635, lng: -73.1262 },
]

const CFG = {
  name:       _J.name       || "New York City",
  shortName:  _J.short_name || "NYC",
  state:      _J.state      || "NY",
  center:     _J.center     || [40.7128, -74.006],
  zoom:       _J.zoom       || 10,
  bbox:       _J.bbox       || null,
  regions:    _REGIONS,
  sources:    _SOURCE_REGISTRY,
}
const NWS_ALERT_URL    = _NWS.alert_url    || `https://api.weather.gov/alerts/active?area=${CFG.state}`
const NWS_FORECAST_URL = _NWS.forecast_url || `https://api.weather.gov/gridpoints/OKX/33,37/forecast`
const SOCRATA_DOMAIN   = _SOC.domain       || "data.cityofnewyork.us"
const OLLAMA_HOST        = import.meta.env?.VITE_OLLAMA_HOST  || "https://ollama.com"
const OLLAMA_MODEL       = import.meta.env?.VITE_OLLAMA_MODEL || "gpt-oss:120b-cloud"
const OLLAMA_KEY_ENV     = import.meta.env?.VITE_OLLAMA_API_KEY || ""
const NYC_OPEN_DATA_TOKEN_ENV = import.meta.env?.VITE_NYC_OPEN_DATA_APP_TOKEN || ""
const CARTO_TILE_URL     = appendCartoApiKey(
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  import.meta.env.VITE_CARTO_API_KEY,
)

// ── localStorage config — persists across sessions, overrides build-time defaults ──
const LS_KEY = "ember_config_v1"
const MAP_WIDTH_LS_KEY = "ember_map_width"

function loadLocalConfig() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}") } catch { return {} }
}
function saveLocalConfig(cfg) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); return true } catch { return false }
}
function clearLocalConfig() {
  try { localStorage.removeItem(LS_KEY) } catch {}
}
function loadMapWidth(defaultWidth) {
  try {
    const width = parseFloat(localStorage.getItem(MAP_WIDTH_LS_KEY))
    return Number.isFinite(width) ? width : defaultWidth
  } catch {
    return defaultWidth
  }
}
function saveMapWidth(width) {
  try { localStorage.setItem(MAP_WIDTH_LS_KEY, String(width)) } catch {}
}

// Merge: localStorage values override build-time values
function buildRuntimeConfig(local) {
  const j = local.jurisdiction || {}
  return {
    name:      j.name      || _J.name      || "New York City",
    shortName: j.shortName || _J.short_name|| "NYC",
    state:     (j.state    || _J.state     || "NY").toUpperCase(),
    center:    j.center    || _J.center    || [40.7128, -74.006],
    zoom:      j.zoom      || _J.zoom      || 10,
    nwsOffice: j.nwsOffice || _NWS.office  || "OKX",
    nwsGridX:  j.nwsGridX  != null ? j.nwsGridX : (_NWS.grid_x  || 33),
    nwsGridY:  j.nwsGridY  != null ? j.nwsGridY : (_NWS.grid_y  || 37),
    socrataDomain: j.socrataDomain || _SOC.domain || "data.cityofnewyork.us",
  }
}

function buildRuntimeKB(local) {
  const lkb = local.kb || {}
  return {
    floodZones:             { label:"Flood Zones",             source:"FEMA / Local", data: lkb.floodZones             || _KB.floodZones?.data             || DEFAULT_KB_TEXT.floodZones },
    evacZones:              { label:"Evacuation Zones",        source:"Local OEM",    data: lkb.evacZones              || _KB.evacZones?.data              || DEFAULT_KB_TEXT.evacZones },
    criticalInfrastructure: { label:"Critical Infrastructure", source:"Local OEM",    data: lkb.criticalInfrastructure || _KB.criticalInfrastructure?.data  || DEFAULT_KB_TEXT.criticalInfrastructure },
    hazardProfiles:         { label:"Hazard Profiles",         source:"Local HMP",    data: lkb.hazardProfiles         || _KB.hazardProfiles?.data         || DEFAULT_KB_TEXT.hazardProfiles },
    resources:              { label:"Contacts & Resources",    source:"Local OEM",    data: lkb.resources              || _KB.resources?.data              || DEFAULT_KB_TEXT.resources },
  }
}

function buildRuntimeMapLayers(local) {
  if (local.mapLayers && Object.keys(local.mapLayers).length) return local.mapLayers
  if (Object.keys(_ML).length) return _ML
  return DEFAULT_MAP_LAYERS
}

const DEFAULT_KB_TEXT = {
  floodZones: "Zone A: High-risk coastal/tidal flood areas.\nZone AE: Special Flood Hazard Areas.\nZone VE: Coastal high-hazard with wave action.\nAdd your jurisdiction's specific flood zone details here.",
  evacZones: "Describe your evacuation zone system here.\nInclude zone names, trigger conditions, shelter locations, and contraflow routes.",
  criticalInfrastructure: "List key hospitals (with trauma level), power substations, water/wastewater plants, transit hubs.\nNote any facilities in flood zones.",
  hazardProfiles: "Describe primary hazards for your jurisdiction.\nInclude historical events and typical impacts.",
  resources: "Emergency Management: [phone] | [website]\nFire: 911 | Police: 911\nAdd your local emergency contacts here.",
}

// Runtime key
function getRuntimeKey() {
  try { return sessionStorage.getItem("ember_ollama_key") || OLLAMA_KEY_ENV } catch { return OLLAMA_KEY_ENV }
}
function setRuntimeKey(k) {
  try { sessionStorage.setItem("ember_ollama_key", k) } catch {}
}

function getNycOpenDataToken() {
  try { return sessionStorage.getItem("ember_nyc_open_data_token") || NYC_OPEN_DATA_TOKEN_ENV } catch { return NYC_OPEN_DATA_TOKEN_ENV }
}
function setNycOpenDataToken(k) {
  try {
    if (k) sessionStorage.setItem("ember_nyc_open_data_token", k)
    else sessionStorage.removeItem("ember_nyc_open_data_token")
  } catch {}
}

// Default map layers (NYC hardcoded fallback if config not loaded)
const DEFAULT_MAP_LAYERS = {
  hospitals: { label:"Trauma Centers", color:"#f87171", icon:"🏥", features:[
    {name:"Bellevue Hospital",lat:40.7394,lng:-73.9754,note:"Level 1 Trauma | Manhattan"},
    {name:"Kings County Hospital",lat:40.6551,lng:-73.9444,note:"Level 1 Trauma | Brooklyn"},
    {name:"Lincoln Medical Center",lat:40.8168,lng:-73.9249,note:"Level 1 Trauma | Bronx"},
    {name:"Jamaica Hospital",lat:40.7003,lng:-73.7958,note:"Level 1 Trauma | Queens"},
    {name:"Staten Island University",lat:40.5766,lng:-74.1159,note:"Level 1 Trauma | SI"},
  ]},
  shelters: { label:"Evac Shelters", color:"#60a5fa", icon:"🏫", features:[
    {name:"Boys & Girls HS",lat:40.6797,lng:-73.9434,note:"Evac Center | Brooklyn"},
    {name:"Brandeis HS",lat:40.7960,lng:-73.9804,note:"Evac Center | Manhattan"},
    {name:"August Martin HS",lat:40.6719,lng:-73.7770,note:"Evac Center | Queens"},
    {name:"Lehman HS",lat:40.8780,lng:-73.8985,note:"Evac Center | Bronx"},
  ]},
  gauges: { label:"Stream Gauges", color:"#4ade80", icon:"📡", features:[
    {name:"Battery Park Tidal Gauge",lat:40.7003,lng:-74.0141,note:"NOAA 8518750 — primary NYC surge gauge"},
    {name:"Kings Point Tidal Gauge",lat:40.8105,lng:-73.7659,note:"NOAA 8516945 — Long Island Sound"},
    {name:"Sandy Hook, NJ",lat:40.4669,lng:-74.0094,note:"NOAA 8531680 — outer harbor"},
  ]},
  eoc: { label:"EOC / Command", color:"#facc15", icon:"🏛", features:[
    {name:"NYC EOC",lat:40.6967,lng:-73.9896,note:"Primary EOC — 165 Cadman Plaza East"},
    {name:"FEMA Region 2",lat:40.7143,lng:-74.0071,note:"26 Federal Plaza"},
  ]},
  floodRisk: { label:"Flood Risk Areas", color:"#fb923c", icon:"💧", features:[
    {name:"Red Hook, Brooklyn",lat:40.6745,lng:-74.0097,note:"Zone AE — flooded Sandy 2012"},
    {name:"Coney Island",lat:40.5755,lng:-73.9707,note:"Zone AE — 10ft+ surge Sandy"},
    {name:"Rockaway Peninsula",lat:40.5874,lng:-73.8261,note:"Zone VE/AE — highest surge risk"},
    {name:"Howard Beach",lat:40.6570,lng:-73.8378,note:"Zone AE — interior flood risk"},
    {name:"Lower Manhattan",lat:40.7074,lng:-74.0104,note:"Zone AE — subway/utility risk"},
  ]},
}
const MAP_LAYERS = (Object.keys(_ML).length > 0) ? _ML : DEFAULT_MAP_LAYERS

const DEFAULT_KB = {
  floodZones:{"label":"Flood Zones","source":"FEMA / NYC OEM","data":"Zone A: High-risk coastal/tidal — Lower Manhattan, Red Hook, Rockaway Peninsula, Staten Island east shore.\nZone AE: Special Flood Hazard Areas — Coney Island, Howard Beach, Broad Channel.\nZone VE: Coastal high-hazard with wave action — Far Rockaway, Breezy Point, Sea Gate.\nPost-Sandy 2012: ~88,000 buildings damaged; $19B damage."},
  evacZones:{"label":"Evacuation Zones","source":"NYC OEM","data":"Zone 1: Mandatory evacuation Cat 1+ hurricanes. Rockaways, Coney Island, Red Hook waterfront.\nZone 2: Advised Cat 2+. Zones 3–6: progressively lower risk inland.\nShelters: 30+ hurricane evacuation centers, ~600,000 capacity.\nContraflow: FDR Drive, BQE, Staten Island Expressway."},
  criticalInfrastructure:{"label":"Critical Infrastructure","source":"NYC OEM / CISA","data":"Hospitals: 11 Level 1 Trauma Centers — Bellevue, Kings County, Lincoln, Jamaica, Staten Island University.\nPower: ConEd East River substations critical. Underground feeders flooded during Sandy.\nSubway: 245 miles track, 472 stations. 52 stations in flood zones."},
  hazardProfiles:{"label":"Hazard Profiles","source":"NYC OEM HMP 2023","data":"HURRICANES: Sandy 2012 Cat 1 — $19B damage. Primary risk: storm surge.\nEXTREME HEAT: 115–150 deaths/year. Protocol at Heat Index ≥100°F.\nFLOODING: Ida 2021 — 13 deaths in basement apartments.\nWINTER STORMS: Jonas 2016 — 27 inches, travel ban."},
  resources:{"label":"Contacts & Resources","source":"Nassau OEM / Suffolk OEM / NYC OEM","data":"Nassau OEM: 516-573-9600 | nassaucountyny.gov/oem\nSuffolk OEM: 631-852-4900 | scoem.suffolkcountyny.gov\nNYC OEM (Rockaway): 718-422-8700 | nyc.gov/oem\nNWS OKX: 631-924-0517 | PSEG LI: 1-800-490-0075\nNassau Nixle: text OneNassau to 888777 | SuffolkAlert: text SuffolkAlerts to 67283"},
}
const KNOWLEDGE_BASE = (Object.keys(_KB).length > 0) ? _KB : DEFAULT_KB

const BRANDING = {
  appTitle: _BR.appTitle || "EMBER",
  jurisdictionLine: _BR.jurisdictionLine || `${CFG.shortName} EMERGENCY MANAGEMENT`,
  primaryColor: _BR.primaryColor || "#e8372c",
}

const KB_MODULES = [
  {id:"floodZones",label:"FLOOD ZONES"},
  {id:"evacZones",label:"EVAC ZONES"},
  {id:"criticalInfrastructure",label:"INFRASTRUCTURE"},
  {id:"hazardProfiles",label:"HAZARDS"},
  {id:"resources",label:"CONTACTS"},
]
const MAP_LAYER_TOGGLES = [
  {id:"floodRisk",label:"FLOOD RISK",color:"#fb923c"},
  {id:"gauges",label:"GAUGES",color:"#4ade80"},
  {id:"shelters",label:"SHELTERS",color:"#60a5fa"},
  {id:"hospitals",label:"TRAUMA CTR",color:"#f87171"},
  {id:"eoc",label:"EOC / CMD",color:"#facc15"},
]
const QUICK_QUERIES = [
  "Storm surge risk — Long Beach and Fire Island",
  "Zone A assets at risk from Cat 2 hurricane",         
  "Trauma centers and hospital surge capacity on Long Island",
  "Current NWS alerts for Long Island",
  "Heat emergency protocol thresholds Nassau and Suffolk",
  "Evacuation routes from barrier island communities",
  "Critical infrastructure in FEMA Zone AE — south shore",
  "What do the current water levels indicate at Kings Point and Montauk?",
]

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchLiveData(ep) {
  try {
    const r = await fetch(ep.url, { signal: AbortSignal.timeout(7000) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return { success:true, data:await r.json(), name:ep.name, type:ep.type }
  } catch(e) { return { success:false, error:e.message, name:ep.name, type:ep.type } }
}

function summarizeAPIData(r) {
  if (!r.success) return `[${r.name}: unavailable — ${r.error}]`
  const d = r.data
  try {
    if (r.type === "weather" && d?.features) {
      const alerts = d.features.slice(0,3).map(f=>`${f.properties?.event} — ${(f.properties?.headline||"").substring(0,80)}`).join("; ")
      return `NWS Alerts (${CFG.state}): ${d.features.length} active. ${alerts || "None"}`
    }
    if (r.type === "forecast" && d?.properties?.periods) {
      return "NWS Forecast: " + d.properties.periods.slice(0,3).map(p=>`${p.name}: ${p.shortForecast}, ${p.temperature}°${p.temperatureUnit}`).join("; ")
    }
    if (r.type === "flood" && d?.value?.timeSeries) {
      return "USGS Gauges: " + d.value.timeSeries.slice(0,4).map(ts=>`${ts.sourceInfo?.siteName}: ${ts.values?.[0]?.value?.[0]?.value||"N/A"} ft`).join("; ")
    }
    return `[${r.name}: received]`
  } catch { return `[${r.name}: parse error]` }
}

function buildContext(files, apiResults, activeKB) {
  return buildContextRT(files, apiResults, activeKB, buildRuntimeKB(loadLocalConfig()), buildRuntimeConfig(loadLocalConfig()).name)
}

function buildContextRT(files, apiResults, activeKB, kb, jurisdictionName) {
  let ctx = `=== ${(jurisdictionName||"MY CITY").toUpperCase()} EMERGENCY MANAGEMENT KNOWLEDGE BASE ===\n\n`
  for (const [key, mod] of Object.entries(kb)) {
    if (activeKB.includes(key)) ctx += `--- ${mod.label} [${mod.source}] ---\n${mod.data}\n\n`
  }
  if (apiResults.length) {
    ctx += `--- LIVE API DATA (${new Date().toUTCString()}) ---\n`
    apiResults.forEach(r => { ctx += summarizeAPIData(r) + "\n" })
    ctx += "\n"
  }
  if (files.length) {
    ctx += "--- UPLOADED DOCUMENTS ---\n"
    files.forEach(f => { ctx += `[${f.name}]\n${f.content.substring(0,4000)}\n\n` })
  }
  return ctx
}

async function* streamOllama(messages, context, signal, apiKey) {
  const key = apiKey || getRuntimeKey()

  // Build the system prompt + message array
  const system = `You are EMBER — Emergency Management Body of Evidence & Resources — an AI for ${CFG.name} emergency managers.\n\nKNOWLEDGE BASE:\n${context}\n\nRULES: Lead with critical info. Cite sources [NYC OEM] [NWS] [FEMA] [USGS]. Be concise. Never hallucinate.`
  const allMessages = [
    { role: "system", content: system },
    ...messages.slice(-10),
  ]

  // Use the server-side proxy (/api/chat) to avoid CORS.
  // Pass the user's runtime key as a header if not baked in at build time.
  const headers = { "Content-Type": "application/json" }
  if (key && !import.meta.env?.VITE_OLLAMA_API_KEY) {
    headers["x-ollama-key"] = key
  }

  let res
  try {
    res = await fetch("/api/chat", {
      method:  "POST",
      headers,
      body:    JSON.stringify({ messages: allMessages, model: OLLAMA_MODEL }),
      signal,
    })
  } catch (e) {
    yield `⚠ Network error: ${e.message}\n\nMake sure the app is deployed on Vercel (the /api/chat proxy is required). It won't work on a plain static host.`
    return
  }

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`
    try { const j = await res.json() ; errMsg = j.error || errMsg } catch {}
    if (res.status === 401) {
      yield `⚠ No API key configured.\n\nGo to your Vercel dashboard → Project → Settings → Environment Variables and add:\n  OLLAMA_API_KEY = your_key_here\n\nGet a free key at: https://ollama.com/settings/keys\n\nThen redeploy.`
    } else {
      yield `⚠ Ollama error: ${errMsg}`
    }
    return
  }

  // Stream NDJSON lines from the proxy
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split("\n") ; buf = lines.pop()
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const obj = JSON.parse(line)
        if (obj.message?.content) yield obj.message.content
        if (obj.done) return
      } catch {}
    }
  }
}

// ── Full NOAA endpoint catalogue ──────────────────────────────────────────────
const NOAA_ENDPOINTS = [
  // NWS
  {id:"nws_alerts",    cat:"NWS",    color:"#60a5fa", icon:"🌩", name:`Active Alerts — ${CFG.state}`,          url: NWS_ALERT_URL,                                                                                          mapKey:true},
  {id:"nws_alerts_sv", cat:"NWS",    color:"#60a5fa", icon:"🌩", name:"Extreme/Severe Alerts",                 url:`https://api.weather.gov/alerts/active?area=${CFG.state}&severity=Extreme,Severe&status=actual`,         mapKey:true},
  {id:"nws_forecast",  cat:"NWS",    color:"#60a5fa", icon:"🌩", name:`7-Day Forecast — ${CFG.shortName}`,     url: NWS_FORECAST_URL},
  {id:"nws_hourly",    cat:"NWS",    color:"#60a5fa", icon:"🌩", name:"Hourly Forecast",                       url:`${NWS_FORECAST_URL}/hourly`},
  {id:"nws_grid",      cat:"NWS",    color:"#60a5fa", icon:"🌩", name:"Wind & Precip Grid",                    url:`https://api.weather.gov/gridpoints/${_NWS.office||"OKX"}/${_NWS.grid_x||33},${_NWS.grid_y||37}`},
  {id:"nws_obs_kjfk",  cat:"NWS",    color:"#60a5fa", icon:"🌩", name:"Observations — JFK Airport",            url:"https://api.weather.gov/stations/KJFK/observations/latest",                                              mapKey:true},
  // CO-OPS
  {id:"coops_battery", cat:"CO-OPS", color:"#34d399", icon:"🌊", name:"Water Level — The Battery",             url:"https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=recent&station=8518750&product=water_level&datum=MLLW&time_zone=lst_ldt&units=english&format=json&application=EMBER", mapKey:true},
  {id:"coops_preds",   cat:"CO-OPS", color:"#34d399", icon:"🌊", name:"Tidal Predictions — Battery 48h",       url:"https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=today&range=48&station=8518750&product=predictions&datum=MLLW&time_zone=lst_ldt&interval=hilo&units=english&format=json&application=EMBER"},
  {id:"coops_kings",   cat:"CO-OPS", color:"#34d399", icon:"🌊", name:"Water Level — Kings Point",             url:"https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=8516945&product=water_level&datum=MLLW&time_zone=lst_ldt&units=english&format=json&application=EMBER", mapKey:true},
  {id:"coops_montauk", cat:"CO-OPS", color:"#34d399", icon:"🌊", name:"Water Level — Montauk",                 url:"https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=8510560&product=water_level&datum=MLLW&time_zone=lst_ldt&units=english&format=json&application=EMBER", mapKey:true},
  {id:"coops_sandy",   cat:"CO-OPS", color:"#34d399", icon:"🌊", name:"Water Level — Sandy Hook",              url:"https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=8531680&product=water_level&datum=MLLW&time_zone=lst_ldt&units=english&format=json&application=EMBER", mapKey:true},
  {id:"coops_wind",    cat:"CO-OPS", color:"#34d399", icon:"🌊", name:"Wind — The Battery",                    url:"https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=8518750&product=wind&time_zone=lst_ldt&units=english&format=json&application=EMBER"},
  // SPC / SWPC
  {id:"spc_watches",   cat:"SPC",    color:"#f87171", icon:"⚡", name:"Active SPC Watches",                    url:"https://api.weather.gov/alerts/active?status=actual&event=Tornado%20Watch,Severe%20Thunderstorm%20Watch&zone=NYC059,NYC103,NYC081"},
  {id:"spc_day1",      cat:"SPC",    color:"#f87171", icon:"⚡", name:"Day 1 Convective Outlook",              url:"https://www.spc.noaa.gov/products/outlook/day1otlk.txt",                                                text:true},
  {id:"swpc_alerts",   cat:"SWPC",   color:"#a78bfa", icon:"☀️", name:"Space Weather Alerts",                  url:"https://services.swpc.noaa.gov/products/alerts.json"},
  {id:"swpc_kp",       cat:"SWPC",   color:"#a78bfa", icon:"☀️", name:"Planetary K-Index",                     url:"https://services.swpc.noaa.gov/json/planetary_k_index_1m.json"},
]

function summarizeNOAA(result) {
  if (!result?.ok) return result?.preview || "fetch failed"
  const d = result.data
  const ep = result.ep
  try {
    if (result.text) return String(d).substring(0, 300)
    if (d?.features && ep?.id?.includes("alert")) {
      const active = d.features.filter(f => f.properties?.status === "Actual")
      return `${active.length} active alert(s):\n` + active.slice(0,5).map(f => `  • ${f.properties?.event} (${f.properties?.severity}): ${(f.properties?.headline||"").substring(0,80)}`).join("\n")
    }
    if (d?.properties?.periods) return d.properties.periods.slice(0,4).map(p => `${p.name}: ${p.shortForecast}, ${p.temperature}°${p.temperatureUnit}`).join("\n")
    if (d?.data && ep?.id?.startsWith("coops_")) {
      const last = d.data[d.data.length - 1]
      const meta = d.metadata || {}
      return `${meta.name || ep.name}\nLatest: ${last?.v || "?"} ft MLLW @ ${last?.t || "?"}`
    }
    if (d?.predictions) return d.predictions.slice(0,6).map(p => `${p.type==="H"?"HIGH":"low "} ${p.v}ft @ ${p.t}`).join("\n")
    if (Array.isArray(d)) return `${d.length} records. First: ${JSON.stringify(d[0]).substring(0,120)}`
    return JSON.stringify(d).substring(0, 300)
  } catch(e) { return "parse error: " + e.message }
}

// ── Map component ─────────────────────────────────────────────────────────────

function escapeMapHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char])
}

function MapPanel({ activeLayers, showRadar, showWind, liveReadings={}, onMarkerClick, mapWidth, mapLayers, regionalRecords={}, activeRegionalLayers=[], regionalLayerMetadata={} }) {
  const runtimeMapLayers = (mapLayers && Object.keys(mapLayers).length) ? mapLayers : MAP_LAYERS
  const mapRef    = useRef(null)
  const leafRef   = useRef(null)
  const layerRefs = useRef({})
  const regionalLayerRefs = useRef({})
  const radarRef  = useRef(null)
  const windRef   = useRef(null)
  const [ready, setReady] = useState(false)
  const [radarTs, setRadarTs] = useState(null)

  useEffect(() => {
    if (leafRef.current) return
    import("leaflet").then(({default: L}) => {
      const map = L.map(mapRef.current, { center: CFG.center, zoom: CFG.zoom, zoomControl:true })
      L.tileLayer(CARTO_TILE_URL, {
        attribution:'&copy; OpenStreetMap &copy; CARTO', maxZoom:19, subdomains:"abcd"
      }).addTo(map)
      if (CFG.bbox) {
        map.fitBounds([
          [CFG.bbox.south, CFG.bbox.west],
          [CFG.bbox.north, CFG.bbox.east],
        ], { padding: [24, 24] })
      }

      // Radar
      const epoch5 = Math.floor(Date.now()/300000)
      const radarLayer = L.tileLayer(
        `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png?_=${epoch5}`,
        { opacity:0.65, attribution:'NEXRAD &copy; Iowa State MESONET' }
      )
      radarRef.current = radarLayer
      setRadarTs(new Date().toLocaleTimeString())

      // Wind group
      windRef.current = L.layerGroup()

      // Marker layers
      for (const [key, layer] of Object.entries(runtimeMapLayers)) {
        const group = L.layerGroup()
        const features = Array.isArray(layer.features) ? layer.features : []
        const color = layer.color || "#60a5fa"
        const icon  = layer.icon  || "📍"
        const label = layer.label || key
        features.forEach(f => {
          if (!f.lat || !f.lng) return
          const mk = L.marker([f.lat, f.lng], {
            icon: L.divIcon({
              className:"", iconSize:[28,28], iconAnchor:[14,14], popupAnchor:[0,-16],
              html:`<div style="width:28px;height:28px;border-radius:50%;background:${color}22;border:2px solid ${color};display:flex;align-items:center;justify-content:center;font-size:13px;cursor:pointer;box-shadow:0 0 8px ${color}44">${icon}</div>`
            })
          })
          mk.bindPopup(`<div style="font-family:monospace;font-size:12px"><b style="color:${color}">${icon} ${f.name}</b><br><span style="color:#aac;font-size:11px">${f.note||""}</span></div>`)
          mk.on("click", () => onMarkerClick?.({...f, layerLabel:label, color}))
          group.addLayer(mk)
        })
        layerRefs.current[key] = group
      }

      leafRef.current = map
      setReady(true)
    }).catch(e => console.error("Leaflet init failed:", e))
  }, [])

  useEffect(() => {
    if (!leafRef.current) return
    requestAnimationFrame(() => leafRef.current?.invalidateSize())
  }, [mapWidth])

  // Layer visibility
  useEffect(() => {
    if (!ready || !leafRef.current) return
    const map = leafRef.current
    for (const [key, group] of Object.entries(layerRefs.current)) {
      activeLayers.includes(key) ? map.hasLayer(group)||group.addTo(map) : map.hasLayer(group)&&map.removeLayer(group)
    }
  }, [activeLayers, ready])

  // Phase 4 normalized source layers. Point, line, and polygon records use the
  // same approved geometry contract; records without geometry remain card-only.
  useEffect(() => {
    if (!ready || !leafRef.current) return
    const map = leafRef.current
    import("leaflet").then(({default:L}) => {
      for (const group of Object.values(regionalLayerRefs.current)) {
        if (map.hasLayer(group)) map.removeLayer(group)
      }
      regionalLayerRefs.current = {}

      for (const [sourceId, records] of Object.entries(regionalRecords)) {
        const source = regionalLayerMetadata[sourceId] || CFG.sources.find(item => item.id === sourceId)
        const color = source?.display?.color || "#60a5fa"
        const icon = source?.display?.icon || "📍"
        const group = L.layerGroup()
        for (const record of records || []) {
          const geometry = record.geometry
          if (!geometry?.type) continue
          const popup = `<div style="font-family:monospace;font-size:11px"><b style="color:${color}">${escapeMapHtml(icon)} ${escapeMapHtml(record.title)}</b><br><span style="color:#aac">${escapeMapHtml(record.description || record.category || record.status || "")}</span><br><br><span style="color:#778">${escapeMapHtml(record.source_name)} · ${escapeMapHtml(record.observed_at || record.fetched_at || "Timestamp unavailable")}</span><br><span style="color:#556">${escapeMapHtml(record.attribution)}</span></div>`
          let featureLayer = null
          if (geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
            const [longitude, latitude] = geometry.coordinates.map(Number)
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue
            featureLayer = L.marker([latitude, longitude], {icon:L.divIcon({
              className:"", iconSize:[28,28], iconAnchor:[14,14], popupAnchor:[0,-16],
              html:`<div style="width:28px;height:28px;border-radius:50%;background:${color}22;border:2px solid ${color};display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 0 8px ${color}44">${escapeMapHtml(icon)}</div>`,
            })})
          } else if (["LineString", "MultiLineString", "Polygon", "MultiPolygon"].includes(geometry.type)) {
            featureLayer = L.geoJSON(geometry, {style: {
              color,
              weight: geometry.type.includes("Line") ? 3 : 2,
              opacity: 0.9,
              fillColor: color,
              fillOpacity: geometry.type.includes("Polygon") ? 0.14 : 0,
            }})
          }
          if (!featureLayer) continue
          featureLayer.bindPopup(popup)
          featureLayer.on("click", () => onMarkerClick?.({name:record.title,note:record.description || record.category || "",sourceId}))
          group.addLayer(featureLayer)
        }
        regionalLayerRefs.current[sourceId] = group
        if (activeRegionalLayers.includes(sourceId)) group.addTo(map)
      }
    })
  }, [regionalRecords, regionalLayerMetadata, ready])

  useEffect(() => {
    if (!ready || !leafRef.current) return
    const map = leafRef.current
    for (const [sourceId, group] of Object.entries(regionalLayerRefs.current)) {
      activeRegionalLayers.includes(sourceId)
        ? map.hasLayer(group) || group.addTo(map)
        : map.hasLayer(group) && map.removeLayer(group)
    }
  }, [activeRegionalLayers, ready])

  // Radar
  useEffect(() => {
    if (!ready || !leafRef.current || !radarRef.current) return
    const map = leafRef.current
    showRadar ? map.hasLayer(radarRef.current)||radarRef.current.addTo(map) : map.hasLayer(radarRef.current)&&map.removeLayer(radarRef.current)
  }, [showRadar, ready])

  // Wind obs
  useEffect(() => {
    if (!ready || !leafRef.current || !windRef.current) return
    const map = leafRef.current

    if (!showWind) {
      windRef.current.clearLayers()
      if (map.hasLayer(windRef.current)) map.removeLayer(windRef.current)
      return
    }

    if (!map.hasLayer(windRef.current)) windRef.current.addTo(map)
    Promise.all(WIND_STATIONS.map(s =>
      fetch(`https://api.weather.gov/stations/${s.id}/observations/latest`, {signal:AbortSignal.timeout(6000),headers:{"User-Agent":"EMBER/1.0"}})
        .then(r=>r.ok?r.json():null).then(d=>{
          if (!d) return null
          const p = d.properties
          return {...s,
            speedMph: p.windSpeed?.value!=null ? Math.round(p.windSpeed.value*0.621371) : null,
            gustMph:  p.windGust?.value!=null  ? Math.round(p.windGust.value*0.621371)  : null,
            dirDeg:   p.windDirection?.value   ?? null,
            desc:     p.textDescription        ?? "",
          }
        }).catch(()=>null)
    )).then(obs => {
      import("leaflet").then(({default:L}) => {
        windRef.current?.clearLayers()
        obs.filter(Boolean).forEach(o => {
          if (o.speedMph==null||o.dirDeg==null) return
          const color = o.speedMph<15?"#4ade80":o.speedMph<25?"#facc15":o.speedMph<40?"#fb923c":"#f87171"
          const toDir = (o.dirDeg+180)%360
          const mk = L.marker([o.lat,o.lng], {icon:L.divIcon({
            className:"", iconSize:[50,40], iconAnchor:[25,20],
            html:`<div style="display:flex;flex-direction:column;align-items:center;gap:1px"><div style="font-size:20px;transform:rotate(${toDir}deg);filter:drop-shadow(0 0 3px ${color}88)">↑</div><div style="font-size:9px;font-family:monospace;font-weight:700;color:${color};background:#07090dcc;padding:1px 3px;border-radius:2px">${o.speedMph}${o.gustMph?`g${o.gustMph}`:""}mph</div></div>`
          })})
          mk.bindPopup(`<div style="font-family:monospace;font-size:11px"><b style="color:${color}">${o.id} — ${o.name}</b><br>Wind: ${o.speedMph}mph from ${o.dirDeg}°${o.gustMph?` (gusts ${o.gustMph}mph)`:""}<br>${o.desc}</div>`)
          windRef.current?.addLayer(mk)
        })
      })
    })
  }, [showWind, ready])

  // Live readings → update gauge popups
  useEffect(() => {
    if (!ready || !Object.keys(liveReadings).length) return
    import("leaflet").then(({default:L}) => {
      const gaugeGroup = layerRefs.current.gauges
      if (!gaugeGroup) return
      gaugeGroup.eachLayer(mk => {
        const f = mk._emberFeature
        if (!f) return
        const key = Object.keys(liveReadings).find(k => !k.startsWith("__") && (k.toLowerCase().includes(f.name.split(",")[0].toLowerCase().split(" ")[0]) || f.name.toLowerCase().includes(k.toLowerCase().split(" at ")[0])))
        const reading = key ? liveReadings[key] : null
        if (!reading) return
        const statusColor = {flood:"#f87171",elevated:"#facc15",normal:"#4ade80"}[reading.status]||"#4ade80"
        mk.setPopupContent(`<div style="font-family:monospace;font-size:11px"><b style="color:${statusColor}">📡 ${f.name}</b><br><span style="color:#aac">${f.note}</span><br><br><b style="color:${statusColor}">${reading.level} ${reading.unit}</b> <span style="color:#556;font-size:9px">${(reading.status||"").toUpperCase()}</span><br><span style="color:#446;font-size:9px">${reading.source} · live</span></div>`)
        mk.setIcon(L.divIcon({className:"",iconSize:[28,28],iconAnchor:[14,14],popupAnchor:[0,-16],html:`<div style="width:28px;height:28px;border-radius:50%;background:${statusColor}22;border:2px solid ${statusColor};display:flex;align-items:center;justify-content:center;font-size:13px;cursor:pointer;box-shadow:0 0 8px ${statusColor}44">📡</div>`}))
      })
    })
  }, [liveReadings, ready])

  return (
    <div style={{position:"relative",width:"100%",height:"100%"}}>
      <div ref={mapRef} style={{width:"100%",height:"100%"}} />
      {radarTs && showRadar && (
        <div style={{position:"absolute",bottom:28,left:10,zIndex:1000,background:"#07090dcc",color:"#60a5fa",fontFamily:"monospace",fontSize:9,padding:"2px 8px",borderRadius:4,border:"1px solid #60a5fa33",pointerEvents:"none"}}>
          📡 NEXRAD · {radarTs}
        </div>
      )}
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────

const SOURCE_STATE_COLORS = {
  current: "#4ade80",
  stale: "#facc15",
  partial: "#fb923c",
  unavailable: "#f87171",
  access_required: "#a78bfa",
}

const PHASE4_SOURCE_GROUPS = [
  { id:"rockaway", label:"Rockaway / Queens CB14", detail:"Operational and reference sources scoped through the approved CB14 contract", sourceIds:ROCKAWAY_SOURCE_IDS },
  { id:"observations", label:"Regional observations and inventories", detail:"NOAA water levels, USGS gauge height, and NYS DEC Active Sites", sourceIds:PHASE4_OBSERVATION_SOURCE_IDS },
  { id:"boundaries", label:"Operational boundaries", detail:"CB14, county, and electric-utility responsibility overlays", sourceIds:PHASE4_GEOGRAPHY_SOURCE_IDS },
]

function compactTimestamp(value) {
  if (!value) return "Not available"
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}

function Phase4SourcesPanel({ sources, results, loading, onRefresh, activeLayers, onToggleLayer }) {
  const sourcesById = new Map(sources.map(source => [source.id, source]))
  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0}}>
      <div style={{flexShrink:0,padding:"12px 18px 9px",borderBottom:"1px solid #111820"}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center"}}>
          <div>
            <div style={{color:"#60a5fa",fontWeight:700,marginBottom:3}}>🗂 Phase 4 Sources</div>
            <div style={{fontSize:9.5,color:"#556"}}>Shared normalized records · visible freshness and failure states · approved geometry only</div>
          </div>
          <button onClick={onRefresh} disabled={loading} style={{padding:"4px 10px",borderRadius:4,fontSize:9.5,border:"1px solid #60a5fa44",background:"transparent",color:"#60a5fa",cursor:"pointer",fontFamily:"inherit",opacity:loading?0.5:1}}>
            {loading?"↺ Fetching…":"↺ Refresh"}
          </button>
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"10px 14px"}}>
        {PHASE4_SOURCE_GROUPS.map(group => (
          <section key={group.id} style={{marginBottom:14}}>
            <div style={{fontSize:10,color:"#aac",fontWeight:700,margin:"3px 2px"}}>{group.label}</div>
            <div style={{fontSize:8.5,color:"#445",margin:"0 2px 7px"}}>{group.detail}</div>
            {group.sourceIds.map(sourceId => {
              const source = sourcesById.get(sourceId)
              if (!source) return null
              const result = results[source.id] || unavailablePhase4Result(source)
              const card = phase4SourceCard(source, result)
              const stateColor = SOURCE_STATE_COLORS[card.data_state] || "#778"
              const isActive = activeLayers.includes(source.id)
              return (
                <div key={source.id} style={{marginBottom:9,padding:"9px 10px",background:"#0d1117",border:"1px solid #1a1e28",borderLeft:`3px solid ${card.color}`,borderRadius:6}}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"flex-start"}}>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:10.5,color:"#dde",fontWeight:700}}>{card.icon} {card.name}</div>
                      <div style={{fontSize:8.5,color:"#556",marginTop:2}}>{card.owner} · {card.geography}</div>
                    </div>
                    <span style={{fontSize:8,fontWeight:700,color:stateColor,border:`1px solid ${stateColor}55`,background:stateColor+"12",borderRadius:8,padding:"1px 6px",whiteSpace:"nowrap"}}>{card.data_state.replaceAll("_"," ").toUpperCase()}</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:5,marginTop:7,fontSize:8.5}}>
                    <div><span style={{color:"#334"}}>RECORDS</span><br/><span style={{color:"#aac"}}>{card.record_count}</span></div>
                    <div><span style={{color:"#334"}}>MAPPED</span><br/><span style={{color:"#aac"}}>{card.map_count}</span></div>
                    <div><span style={{color:"#334"}}>OBSERVED</span><br/><span style={{color:"#aac"}}>{compactTimestamp(card.observed_at)}</span></div>
                    <div><span style={{color:"#334"}}>FETCHED</span><br/><span style={{color:"#aac"}}>{compactTimestamp(card.fetched_at)}</span></div>
                  </div>
                  {card.note && <div style={{fontSize:8.5,color:"#667",lineHeight:1.45,marginTop:7}}>{card.note}</div>}
                  {card.activation_state && <div style={{fontSize:8.5,color:"#facc15",marginTop:5}}>Activation: {card.activation_state.replaceAll("_", " ")}{card.confirmation_phone?` · verify via ${card.confirmation_phone}`:""}{card.confirmation_url?<>{" · "}<a href={card.confirmation_url} target="_blank" rel="noopener noreferrer" style={{color:"#60a5fa"}}>official finder</a></>:null}</div>}
                  {card.disclaimer && <div style={{fontSize:8,color:"#445",marginTop:5}}>{card.disclaimer}</div>}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginTop:7}}>
                    <span style={{fontSize:8,color:"#445"}}>{card.kind.replaceAll("_"," ")} · {card.attribution}{card.rejected_count?` · ${card.rejected_count} rejected`:""}</span>
                    <button onClick={()=>onToggleLayer(source.id)} disabled={!card.map_capable} style={{padding:"2px 7px",borderRadius:4,fontSize:8.5,border:`1px solid ${card.map_capable?card.color+"55":"#1a1e28"}`,background:isActive?card.color+"18":"transparent",color:card.map_capable?card.color:"#334",cursor:card.map_capable?"pointer":"not-allowed",fontFamily:"inherit"}}>
                      {card.map_capable ? (isActive?"Hide from map":"Show on map") : "Not map-ready"}
                    </button>
                  </div>
                </div>
              )
            })}
          </section>
        ))}
      </div>
    </div>
  )
}

export default function App() {
  // ── Runtime config (localStorage overrides build-time defaults) ───────────
  const [localConfig, setLocalConfig] = useState(loadLocalConfig)
  const CFG_RT  = buildRuntimeConfig(localConfig)
  const KB_RT   = buildRuntimeKB(localConfig)
  const ML_RT   = buildRuntimeMapLayers(localConfig)
  const LIVE_ENDPOINTS_RT = [
    {name:`NWS Alerts — ${CFG_RT.state}`,      url:`https://api.weather.gov/alerts/active?area=${CFG_RT.state}`,                                                               type:"weather"},
    {name:`NWS Forecast — ${CFG_RT.shortName}`, url:`https://api.weather.gov/gridpoints/${CFG_RT.nwsOffice}/${CFG_RT.nwsGridX},${CFG_RT.nwsGridY}/forecast`,                  type:"forecast"},
    {name:"FEMA Disasters",                      url:`https://www.fema.gov/api/open/v2/disasterDeclarationsSummaries?state=${CFG_RT.state}&$top=10&$orderby=declarationDate%20desc`, type:"fema"},
  ]

  const saveConfig = (updates) => {
    const merged = { ...localConfig, ...updates }
    setLocalConfig(merged)
    if (!saveLocalConfig(merged)) console.warn("EMBER config could not be saved to localStorage")
  }
  const [messages, setMessages]         = useState([{role:"assistant",content:`${BRANDING.appTitle} initialized — ${CFG_RT.name} (${CFG_RT.state})\nBackend: Ollama Cloud · ${OLLAMA_MODEL}${!getRuntimeKey()?" · ⚠ NO API KEY":""  }\n\nKnowledge base loaded · Map ready\nUse ⚙️ Settings tab to change jurisdiction, KB text, and map points.`}])
  const [input, setInput]               = useState("")
  const [keyInput, setKeyInput]         = useState("")
  const [runtimeKey, setRuntimeKeyState]= useState(getRuntimeKey)
  const [nycOpenDataToken, setNycOpenDataTokenState] = useState(getNycOpenDataToken)
  const [streaming, setStreaming]       = useState(false)
  const [activeKB, setActiveKB]         = useState(["floodZones","evacZones","criticalInfrastructure","hazardProfiles","resources"])
  const [activeMapLayers, setActiveLayers] = useState(["floodRisk","hospitals","shelters","gauges","eoc"])
  const [showRadar, setShowRadar]       = useState(true)
  const [showWind, setShowWind]         = useState(true)
  const [files, setFiles]               = useState([])
  const [esriItems, setEsriItems]       = useState([])
  const [esriMapLayers, setEsriMapLayers] = useState({})
  const [noaaItems, setNoaaItems]       = useState([])
  const [apiResults, setApiResults]     = useState([])
  const [apiStatus, setApiStatus]       = useState("idle")
  const [fetching, setFetching]         = useState(false)
  const [rightTab, setRightTab]         = useState("chat")
  const [noaaCat, setNoaaCat]           = useState("ALL")
  const [noaaCache, setNoaaCache]       = useState({})
  const [showQuick, setShowQuick]       = useState(false)
  const MAP_WIDTH_DEFAULT = 80
  const MAP_WIDTH_MIN = 60
  const MAP_WIDTH_MAX = 88
  const clampMapWidth = width => Math.max(MAP_WIDTH_MIN, Math.min(MAP_WIDTH_MAX, width))
  const [mapWidth, setMapWidth]         = useState(() => loadMapWidth(MAP_WIDTH_DEFAULT))
  const [liveReadings, setLiveReadings] = useState({})
  const phase4Sources = useMemo(
    () => PHASE4_SOURCE_IDS.map(id => CFG.sources.find(source => source.id === id)).filter(Boolean),
    [],
  )
  const [phase4Results, setPhase4Results] = useState(() => Object.fromEntries(
    phase4Sources.map(source => [source.id, unavailablePhase4Result(source)]),
  ))
  const phase4ResultsRef = useRef(phase4Results)
  const [phase4Loading, setPhase4Loading] = useState(false)
  const [activePhase4Layers, setActivePhase4Layers] = useState(["nyc_311_rockaway"])
  const togglePhase4Layer = useCallback(sourceId => {
    setActivePhase4Layers(previous => previous.includes(sourceId)
      ? previous.filter(id => id !== sourceId)
      : [...previous, sourceId])
  }, [])
  const phase4Records = useMemo(
    () => Object.fromEntries(phase4Sources.map(source => [source.id, phase4Results[source.id]?.records || []])),
    [phase4Results, phase4Sources],
  )
  const geographyFilterRecords = useMemo(
    () => PHASE4_GEOGRAPHY_SOURCE_IDS.flatMap(sourceId => phase4Results[sourceId]?.records || []),
    [phase4Results],
  )
  const evaluatedEsriMapLayers = useMemo(
    () => Object.fromEntries(Object.values(esriMapLayers).map(layer => [
      layer.id,
      { ...layer, filter:evaluateMapBuilderFilter(layer, geographyFilterRecords) },
    ])),
    [esriMapLayers, geographyFilterRecords],
  )
  const esriMapRecords = useMemo(
    () => Object.fromEntries(Object.values(evaluatedEsriMapLayers).map(layer => [layer.id, layer.filter.records])),
    [evaluatedEsriMapLayers],
  )
  const esriMapMetadata = useMemo(
    () => Object.fromEntries(Object.values(evaluatedEsriMapLayers).map(layer => [layer.id, {
      name: layer.name,
      display: { color: layer.color, icon: layer.icon },
    }])),
    [evaluatedEsriMapLayers],
  )
  const regionalMapRecords = useMemo(
    () => ({ ...phase4Records, ...esriMapRecords }),
    [phase4Records, esriMapRecords],
  )
  const activeRegionalMapLayers = useMemo(
    () => [...activePhase4Layers, ...Object.keys(evaluatedEsriMapLayers)],
    [activePhase4Layers, evaluatedEsriMapLayers],
  )
  const mapLayersVersion = JSON.stringify(ML_RT)
  const setRuntimeKey_ = (k) => { setRuntimeKeyState(k); setRuntimeKey(k); setKeyInput("") }
  const setNycOpenDataToken_ = (token) => {
    const nextToken = token.trim()
    clearPhase4SourceCache()
    setNycOpenDataToken(nextToken)
    setNycOpenDataTokenState(nextToken)
  }
  const abortRef   = useRef(null)
  const fileInputRef = useRef(null)
  const endRef     = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({behavior:"smooth"}) }, [messages])
  useEffect(() => { saveMapWidth(mapWidth) }, [mapWidth])
  useEffect(() => { phase4ResultsRef.current = phase4Results }, [phase4Results])
  useEffect(() => {
    const onStorage = e => {
      if (e.key === LS_KEY) setLocalConfig(loadLocalConfig())
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const refreshPhase4Sources = useCallback(async () => {
    setPhase4Loading(true)
    try {
      const bundle = await fetchPhase4SourceBundle(CFG.sources, {
        appToken: nycOpenDataToken,
        previousResults: phase4ResultsRef.current,
      })
      setPhase4Results(bundle.results)
    } finally {
      setPhase4Loading(false)
    }
  }, [nycOpenDataToken])

  useEffect(() => { refreshPhase4Sources() }, [refreshPhase4Sources])

  const fetchAPIs = async () => {
    setFetching(true)
    const results = await Promise.all(LIVE_ENDPOINTS_RT.map(fetchLiveData))
    setApiResults(results)
    setApiStatus(results.some(r=>r.success)?"live":"error")
    // Extract live readings for map
    const readings = {}
    for (const r of results) {
      if (!r.success) continue
      if (r.type==="flood" && r.data?.value?.timeSeries) {
        for (const ts of r.data.value.timeSeries) {
          const site = ts.sourceInfo?.siteName||""
          const val  = ts.values?.[0]?.value?.[0]?.value
          if (val!=null) readings[site] = {level:parseFloat(val).toFixed(2),unit:"ft",source:"USGS",status:parseFloat(val)>10?"flood":parseFloat(val)>5?"elevated":"normal"}
        }
      }
    }
    setLiveReadings(readings)
    setFetching(false)
  }

  const sendQuery = useCallback(async (override) => {
    const q = (override||input).trim()
    if (!q||streaming) return
    setInput("") ; setShowQuick(false) ; setRightTab("chat")
    const userMsg = {role:"user",content:q}
    setMessages(p=>[...p,userMsg])
    setStreaming(true)
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const ctx = buildContextRT(files, apiResults, activeKB, KB_RT, CFG_RT.name)
      + (noaaItems.length ? "--- NOAA DATA ---\n"+noaaItems.map(i=>i.content).join("\n\n")+"\n\n" : "")
      + (esriItems.length ? "--- ESRI LAYERS ---\n"+esriItems.map(i=>i.content).join("\n\n")+"\n" : "")
    const msgs = [...messages, userMsg].map(m=>({role:m.role,content:m.content}))
    let full = ""
    setMessages(p=>[...p,{role:"assistant",content:"▋"}])
    try {
      for await (const token of streamOllama(msgs, ctx, abortRef.current.signal, runtimeKey)) {
        full += token
        setMessages(p=>[...p.slice(0,-1),{role:"assistant",content:full+"▋"}])
      }
    } catch(e) {
      if (e.name!=="AbortError") full += `\n\n⚠ Error: ${e.message}`
    }
    setMessages(p=>[...p.slice(0,-1),{role:"assistant",content:full}])
    setStreaming(false)
  }, [input, streaming, messages, files, apiResults, activeKB, noaaItems, esriItems])

  const ingestFile = useCallback(file => {
    const reader = new FileReader()
    reader.onload = e => setFiles(p=>[...p,{name:file.name,content:e.target.result}])
    reader.readAsText(file)
  }, [])

  // ── Styles ────────────────────────────────────────────────────────────────
  const pill = (label, active, onClick, color="#4ade80") => (
    <button key={label} onClick={onClick} aria-pressed={active} style={{padding:"2px 9px",borderRadius:10,fontSize:9,fontWeight:700,border:`1px solid ${active?color+"66":"#1a1e28"}`,background:active?color+"15":"transparent",color:active?color:"#334",cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.05em",transition:"all 0.1s"}}>
      {label}
    </button>
  )

  const statusDot = (ok, label) => (
    <span style={{display:"flex",alignItems:"center",gap:4}}>
      <span style={{width:6,height:6,borderRadius:"50%",background:ok===true?"#4ade80":ok===false?"#f87171":"#334",flexShrink:0,boxShadow:ok===true?"0 0 6px #4ade8088":ok===false?"0 0 6px #f8717188":"none"}}/>
      <span style={{color:ok===true?"#4ade80":ok===false?"#f87171":"#334"}}>{label}</span>
    </span>
  )

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:"#07090d",color:"#e0e0e8",fontFamily:"'IBM Plex Mono',monospace",overflow:"hidden"}}>

      {/* Header */}
      <div style={{flexShrink:0,padding:"10px 18px",borderBottom:"1px solid #111820",background:"#090c12",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:26,height:26,background:BRANDING.primaryColor,borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13,color:"#fff"}}>E</div>
          <span style={{fontWeight:700,letterSpacing:"0.14em",fontSize:14,color:"#fff"}}>{BRANDING.appTitle}</span>
          <span style={{fontSize:9,color:"#2a2e3a",letterSpacing:"0.06em"}}>{CFG_RT.name.toUpperCase()} · {CFG_RT.state} · v2.0</span>
        </div>
        <div style={{display:"flex",gap:14,alignItems:"center",fontSize:9.5}}>
          {statusDot(true,"ACTIVE")}
          {statusDot(!!runtimeKey, runtimeKey?`OLLAMA · ${OLLAMA_MODEL}`:"NO API KEY")}
          {statusDot(apiStatus==="live"?true:apiStatus==="error"?false:null, apiStatus==="live"?"FEEDS LIVE":apiStatus==="error"?"FEED ERR":"FEEDS IDLE")}
        </div>
      </div>

      {!runtimeKey && (
        <div style={{flexShrink:0,background:"#1a0808",borderBottom:"1px solid #3a1010",padding:"5px 18px",fontSize:10,color:"#f87171",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <span>⚠ No Ollama API key — add <code style={{background:"#2a0808",padding:"1px 5px",borderRadius:3}}>OLLAMA_API_KEY</code> to Vercel env vars &amp; redeploy ·{" "}
            <a href="https://ollama.com/settings/keys" target="_blank" rel="noopener noreferrer" style={{color:"#f87171"}}>Get a free key</a>
          </span>
          <span style={{color:"#556",fontSize:9}}>or enter for this session:</span>
          <input value={keyInput} onChange={e=>setKeyInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&setRuntimeKey_(keyInput)} placeholder="sk-..." type="password"
            style={{background:"#1a0808",border:"1px solid #f8717144",borderRadius:4,padding:"2px 8px",color:"#f87171",fontFamily:"monospace",fontSize:10,outline:"none",width:180}}/>
          <button onClick={()=>setRuntimeKey_(keyInput)} style={{padding:"2px 10px",borderRadius:4,background:"#e8372c",border:"none",color:"#fff",fontFamily:"monospace",fontSize:10,fontWeight:700,cursor:"pointer"}}>Save</button>
        </div>
      )}

      {/* Control rail */}
      <div style={{flexShrink:0,padding:"6px 18px",borderBottom:"1px solid #0f1218",background:"#090c12",display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontSize:8.5,color:"#2a2e3a",fontWeight:700,letterSpacing:"0.1em",marginRight:3}}>KB</span>
        {KB_MODULES.map(m => pill(m.label, activeKB.includes(m.id), ()=>setActiveKB(p=>p.includes(m.id)?p.filter(x=>x!==m.id):[...p,m.id])))}
        <div style={{width:1,height:14,background:"#1a1e28",margin:"0 4px"}}/>
        <span style={{fontSize:8.5,color:"#2a2e3a",fontWeight:700,letterSpacing:"0.1em",marginRight:3}}>MAP</span>
        {MAP_LAYER_TOGGLES.map(m => pill(m.label, activeMapLayers.includes(m.id), ()=>setActiveLayers(p=>p.includes(m.id)?p.filter(x=>x!==m.id):[...p,m.id]), m.color))}
        {pill("311 ROCKAWAY", activePhase4Layers.includes("nyc_311_rockaway"), ()=>togglePhase4Layer("nyc_311_rockaway"), "#f59e0b")}
        <div style={{width:1,height:14,background:"#1a1e28",margin:"0 4px"}}/>
        <span style={{fontSize:8.5,color:"#2a2e3a",fontWeight:700,letterSpacing:"0.1em",marginRight:3}}>WX</span>
        {pill("NEXRAD RADAR", showRadar, ()=>setShowRadar(p=>!p), "#3b82f6")}
        {pill("WIND OBS", showWind, ()=>setShowWind(p=>!p), "#4ade80")}
        <div style={{marginLeft:"auto",display:"flex",gap:7}}>
          <button onClick={fetchAPIs} disabled={fetching} style={{padding:"2px 10px",borderRadius:4,fontSize:9.5,fontWeight:700,border:"1.5px solid #4ade8044",background:"transparent",color:"#4ade80",cursor:"pointer",fontFamily:"inherit",opacity:fetching?0.5:1}}>
            {fetching?"↺…":"↺ LIVE FEEDS"}
          </button>
          <button onClick={()=>fileInputRef.current?.click()} style={{padding:"2px 10px",borderRadius:4,fontSize:9.5,fontWeight:700,border:"1.5px solid #60a5fa44",background:"transparent",color:"#60a5fa",cursor:"pointer",fontFamily:"inherit"}}>⬆ INGEST</button>
          <input ref={fileInputRef} type="file" multiple accept=".txt,.csv,.json,.geojson,.md" onChange={e=>Array.from(e.target.files).forEach(ingestFile)} style={{display:"none"}}/>
        </div>
      </div>

      {/* Main content */}
      <div style={{flex:1,display:"flex",minHeight:0,overflow:"hidden"}}>

        {/* Map panel */}
        <div style={{width:`${mapWidth}%`,flexShrink:0,borderRight:"1px solid #111820",position:"relative"}}>
          <MapPanel key={mapLayersVersion} activeLayers={activeMapLayers} showRadar={showRadar} showWind={showWind} liveReadings={liveReadings} onMarkerClick={m=>{setRightTab("chat");sendQuery(`Tell me about emergency considerations for ${m.name} — ${m.note}`)}} mapLayers={ML_RT} mapWidth={mapWidth} regionalRecords={regionalMapRecords} activeRegionalLayers={activeRegionalMapLayers} regionalLayerMetadata={esriMapMetadata} />
          {/* Resize handle */}
          <div onPointerDown={e=>{
            e.preventDefault()
            const handle=e.currentTarget
            const pointerId=e.pointerId
            handle.setPointerCapture?.(pointerId)
            const startX=e.clientX,startW=mapWidth
            const getNextWidth=clientX=>clampMapWidth(startW+(clientX-startX)/window.innerWidth*100)
            const onMove=ev=>{
              if (ev.pointerId!==pointerId) return
              setMapWidth(getNextWidth(ev.clientX))
            }
            const onUp=ev=>{
              if (ev.pointerId!==pointerId) return
              const finalWidth=getNextWidth(ev.clientX)
              setMapWidth(finalWidth)
              saveMapWidth(finalWidth)
              handle.releasePointerCapture?.(pointerId)
              document.removeEventListener("pointermove",onMove)
              document.removeEventListener("pointerup",onUp)
              document.removeEventListener("pointercancel",onUp)
            }
            document.addEventListener("pointermove",onMove)
            document.addEventListener("pointerup",onUp)
            document.addEventListener("pointercancel",onUp)
          }} style={{position:"absolute",top:0,right:-6,width:16,height:"100%",cursor:"col-resize",zIndex:10,background:"transparent",touchAction:"none"}} />
        </div>

        {/* Right panel */}
        <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,minHeight:0}}>

          {/* Tab bar */}
          <div style={{flexShrink:0,display:"flex",borderBottom:"1px solid #111820",background:"#090c12",overflowX:"auto"}}>
            {[{id:"chat",label:"💬 CHAT"},{id:"sources",label:"🗂 SOURCES"},{id:"noaa",label:"📡 NOAA"},{id:"esri",label:"⊕ ESRI"},{id:"settings",label:"⚙️ SETTINGS"}].map(t=>(
              <button key={t.id} onClick={()=>setRightTab(t.id)} style={{padding:"8px 12px",flexShrink:0,background:rightTab===t.id?"#0d1117":"transparent",color:rightTab===t.id?"#e0e0e8":"#334",border:"none",borderBottom:rightTab===t.id?"2px solid #4ade80":"2px solid transparent",fontFamily:"inherit",fontSize:9.5,fontWeight:700,cursor:"pointer",letterSpacing:"0.04em"}}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Chat tab */}
          {rightTab==="chat" && (
            <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0}}>
              <div style={{flex:1,overflowY:"auto",padding:"16px 18px",display:"flex",flexDirection:"column",gap:10}}>
                {messages.map((m,i)=>(
                  <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                    <div style={{flexShrink:0,width:22,height:22,borderRadius:"50%",background:m.role==="assistant"?"#e8372c15":"#60a5fa15",border:`1px solid ${m.role==="assistant"?"#e8372c44":"#60a5fa44"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,marginTop:1}}>
                      {m.role==="assistant"?"E":"U"}
                    </div>
                    <div style={{flex:1,fontSize:12,lineHeight:1.65,color:m.role==="assistant"?"#d0d0dc":"#a0b0cc",whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
                      {m.content}
                    </div>
                  </div>
                ))}
                <div ref={endRef}/>
              </div>

              {/* Quick queries */}
              <div style={{flexShrink:0,padding:"6px 18px",borderTop:"1px solid #0f1218"}}>
                <button onClick={()=>setShowQuick(p=>!p)} style={{fontSize:9,color:"#334",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>
                  {showQuick?"▾":"▸"} Quick Queries
                </button>
                {showQuick && (
                  <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:6}}>
                    {QUICK_QUERIES.map((q,i)=>(
                      <button key={i} onClick={()=>sendQuery(q)} style={{padding:"3px 10px",borderRadius:4,fontSize:9.5,border:"1px solid #1a1e28",background:"#0d1117",color:"#556",cursor:"pointer",fontFamily:"inherit"}}>
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Input */}
              <div style={{flexShrink:0,padding:"10px 18px",borderTop:"1px solid #111820",display:"flex",gap:8}}>
                <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),sendQuery())} placeholder={`Incident type + location… e.g. 'Cat 2 hurricane at Coney Island'`} style={{flex:1,background:"#0d1117",border:"1px solid #1a1e28",borderRadius:6,padding:"8px 12px",color:"#e0e0e8",fontFamily:"inherit",fontSize:12,outline:"none"}}/>
                <button onClick={()=>streaming?abortRef.current?.abort():sendQuery()} style={{padding:"8px 16px",borderRadius:6,background:streaming?"#1a0808":"#e8372c",border:"none",color:"#fff",fontFamily:"inherit",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                  {streaming?"◼ STOP":"▶ SEND"}
                </button>
              </div>
            </div>
          )}

          {rightTab==="sources" && (
            <Phase4SourcesPanel
              sources={phase4Sources}
              results={phase4Results}
              loading={phase4Loading}
              onRefresh={refreshPhase4Sources}
              activeLayers={activePhase4Layers}
              onToggleLayer={togglePhase4Layer}
            />
          )}

          {/* NOAA tab — full endpoint list */}
          {rightTab==="noaa" && (
            <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0}}>
              <div style={{flexShrink:0,padding:"12px 18px 8px",borderBottom:"1px solid #111820"}}>
                <div style={{color:"#4ade80",fontWeight:700,marginBottom:4}}>📡 NOAA Data Stack</div>
                <div style={{fontSize:9.5,color:"#556"}}>NWS · CO-OPS · SPC · SWPC · No API key required · Fetched data auto-added to KB</div>
                <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
                  {["ALL","NWS","CO-OPS","SPC","SWPC"].map(cat=>(
                    <button key={cat} onClick={()=>setNoaaCat(cat)} style={{padding:"2px 10px",borderRadius:10,fontSize:9,fontWeight:700,border:`1px solid ${noaaCat===cat?"#4ade8066":"#1a1e28"}`,background:noaaCat===cat?"#4ade8015":"transparent",color:noaaCat===cat?"#4ade80":"#334",cursor:"pointer",fontFamily:"inherit"}}>{cat}</button>
                  ))}
                </div>
              </div>
              <div style={{flex:1,overflowY:"auto",padding:"10px 18px"}}>
                {NOAA_ENDPOINTS.filter(ep=>noaaCat==="ALL"||ep.cat===noaaCat).map(ep=>(
                  <NOAAEndpointRow key={ep.id} ep={ep} cached={noaaCache[ep.id]} onFetch={result=>{
                    setNoaaCache(p=>({...p,[ep.id]:result}))
                    if (result.ok) {
                      const summary = summarizeNOAA(result)
                      const content = `[NOAA: ${ep.name}]\nFetched: ${new Date().toLocaleTimeString()}\nSource: ${ep.url}\n\n${summary}`
                      setNoaaItems(p=>{
                        const existing = p.findIndex(x=>x.itemId===ep.id)
                        const entry = {name:`NOAA: ${ep.name}`,itemId:ep.id,content,mapKey:ep.mapKey||false}
                        if (existing>=0){const n=[...p];n[existing]=entry;return n}
                        return [...p,entry]
                      })
                    }
                  }}/>
                ))}
                {noaaItems.length>0 && (
                  <div style={{marginTop:12,borderTop:"1px solid #111820",paddingTop:10}}>
                    <div style={{fontSize:9.5,color:"#4ade80",fontWeight:700,marginBottom:6}}>{noaaItems.length} feed(s) in KB · auto-updated on fetch:</div>
                    {noaaItems.map((item,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                        <span style={{fontSize:9.5,color:item.mapKey?"#34d399":"#4ade80",background:item.mapKey?"#34d39912":"#4ade8012",padding:"2px 8px",borderRadius:10,border:`1px solid ${item.mapKey?"#34d39933":"#4ade8033"}`}}>
                          {item.mapKey?"🗺 ":""}{item.name.substring(0,44)}
                        </span>
                        <button onClick={()=>setNoaaItems(p=>p.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"#f87171",cursor:"pointer",fontSize:10}}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ESRI tab — simplified inline */}
          {rightTab==="esri" && (
          <ESRIPanel onInject={item=>{
              setEsriItems(p=>p.find(x=>x.itemId===item.itemId)?p:[...p,item])
              setMessages(p=>[...p,{role:"assistant",content:`✓ ESRI layer added: ${item.name}. Try: "What does this layer cover?"`}])
              setRightTab("chat")
            }} esriItems={esriItems} onRemove={i=>setEsriItems(p=>p.filter((_,j)=>j!==i))}
              esriMapLayers={evaluatedEsriMapLayers}
              onMapLayerAdd={layer=>setEsriMapLayers(previous=>previous[layer.id]?previous:{...previous,[layer.id]:{...layer,baseRecords:layer.records}})}
              onMapLayerFilterChange={async (layerId,filterMode)=>{
                const layer = esriMapLayers[layerId]
                if (!layer) return
                if (filterMode === MAP_BUILDER_FILTER_MODES.UNFILTERED) {
                  setEsriMapLayers(previous=>({...previous,[layerId]:{
                    ...previous[layerId], records:previous[layerId].baseRecords || previous[layerId].records,
                    filterMode, filterLoading:false, filterError:"", serverFilteredMode:filterMode,
                  }}))
                  return
                }
                const geometry = arcGISGeometryForMode(geographyFilterRecords, filterMode)
                if (!geometry) {
                  setEsriMapLayers(previous=>({...previous,[layerId]:{...previous[layerId],filterMode,filterLoading:false,filterError:"missing_geography_masks"}}))
                  return
                }
                setEsriMapLayers(previous=>({...previous,[layerId]:{...previous[layerId],filterMode,filterLoading:true,filterError:""}}))
                try {
                  const refreshed = await fetchArcGISLayer(
                    {id:layer.ownerItemId,title:layer.name,owner:layer.owner,type:layer.sourceType,url:layer.originalUrl,color:layer.color},
                    {id:layer.sublayerId,name:layer.name,url:layer.url},
                    {entryPath:layer.entryPath,color:layer.color,geometry},
                  )
                  setEsriMapLayers(previous=>({...previous,[layerId]:{
                    ...previous[layerId], records:refreshed.records, count:refreshed.records.length,
                    filterMode, filterLoading:false, filterError:"", serverFilteredMode:filterMode,
                  }}))
                } catch (error) {
                  setEsriMapLayers(previous=>({...previous,[layerId]:{...previous[layerId],filterLoading:false,filterError:error.message || "filtered_query_failed"}}))
                }
              }}
              onMapLayerRemove={layerId=>setEsriMapLayers(previous=>{
                const next = {...previous}
                delete next[layerId]
                return next
              })}/>
          )}

          {/* Settings tab */}
          {rightTab==="settings" && (
            <SettingsPanel
              localConfig={localConfig}
              nycOpenDataToken={nycOpenDataToken}
              onSave={saveConfig}
              onSaveNycToken={setNycOpenDataToken_}
              onReset={()=>{ clearLocalConfig(); setNycOpenDataToken_(""); setLocalConfig({}); window.location.reload() }}
            />
          )}

        </div>
      </div>
    </div>
  )
}

// ── NOAA row component ────────────────────────────────────────────────────────
function NOAAEndpointRow({ep, cached, onFetch}) {
  const [loading, setLoading] = useState(false)

  const doFetch = async () => {
    setLoading(true)
    try {
      const r = await fetch(ep.url, {signal:AbortSignal.timeout(10000),headers:{"User-Agent":"EMBER/1.0"}})
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const ct = r.headers.get("content-type")||""
      const isText = ep.text || ct.includes("text/plain")
      const data = isText ? await r.text() : await r.json()
      const ts = new Date().toLocaleTimeString()
      onFetch({ok:true, data, text:isText, ep, ts, preview: isText ? String(data).substring(0,150) : JSON.stringify(data).substring(0,150)})
    } catch(e) {
      onFetch({ok:false, error:e.message, ep})
    }
    setLoading(false)
  }

  const color = ep.color || "#4ade80"
  const isInKB = !!cached?.ok

  return (
    <div style={{marginBottom:8,padding:"8px 10px",background:"#0d1117",border:`1px solid ${isInKB?"#1e2e20":"#1a1e28"}`,borderLeft:`3px solid ${color}`,borderRadius:6}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:5}}>
        <div>
          <span style={{fontSize:10,color:"#dde",fontWeight:700}}>{ep.icon} {ep.name}</span>
          {ep.mapKey && <span style={{marginLeft:6,fontSize:8,padding:"1px 5px",borderRadius:8,background:"#34d39912",color:"#34d399",border:"1px solid #34d39933"}}>🗺 MAP</span>}
          {isInKB && <span style={{marginLeft:4,fontSize:8,padding:"1px 5px",borderRadius:8,background:"#4ade8012",color:"#4ade80",border:"1px solid #4ade8033"}}>✓ KB</span>}
        </div>
        {cached && <span style={{fontSize:8,color:cached.ok?"#4ade80":"#f87171",flexShrink:0}}>{"● "+(cached.ok?"OK @ "+(cached.ts||""):"ERR")}</span>}
      </div>
      <div style={{display:"flex",gap:5,alignItems:"center"}}>
        <button onClick={doFetch} disabled={loading} style={{padding:"2px 10px",borderRadius:4,fontSize:9,border:`1px solid ${color}33`,background:"transparent",color,cursor:"pointer",fontFamily:"inherit",opacity:loading?0.5:1}}>
          {loading?"…":"▶ Fetch"}
        </button>
        <a href={ep.url} target="_blank" rel="noopener noreferrer" style={{padding:"2px 8px",borderRadius:4,fontSize:9,border:"1px solid #1a1e28",color:"#556",textDecoration:"none"}}>↗</a>
      </div>
      {cached?.preview && <div style={{marginTop:5,fontSize:9,color:color+"88",fontFamily:"monospace",wordBreak:"break-all"}}>{cached.preview.substring(0,100)}{cached.preview.length>100?"…":""}</div>}
    </div>
  )
}

// ── ESRI panel component ──────────────────────────────────────────────────────
function manualArcGISItemId(url) {
  let hash = 0
  for (const char of String(url)) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0
  return `manual_${Math.abs(hash)}`
}

function ESRIPanel({onInject, esriItems, onRemove, esriMapLayers, onMapLayerAdd, onMapLayerFilterChange, onMapLayerRemove}) {
  const [query, setQuery]     = useState("")
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal]     = useState(0)
  const [mapState, setMapState] = useState({})
  const [manualUrl, setManualUrl] = useState("")
  const [manualName, setManualName] = useState("")

  const search = async () => {
    if (!query.trim()) return
    setLoading(true)
    try {
      const params = new URLSearchParams({f:"json",q:`${query} access:public`,num:"8",sortField:"relevance",sortOrder:"desc"})
      const r = await fetch(`https://www.arcgis.com/sharing/rest/search?${params}`, {signal:AbortSignal.timeout(10000)})
      const d = await r.json()
      setResults(d.results||[])
      setTotal(d.total||0)
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  const injectedIds = new Set(esriItems.map(i=>i.itemId))
  const mappedLayers = Object.values(esriMapLayers)

  const updateMapState = (itemId, updates) => setMapState(previous => ({
    ...previous,
    [itemId]: { ...previous[itemId], ...updates },
  }))

  const addItemToMap = async (item, entryPath="search") => {
    const current = mapState[item.id] || {}
    updateMapState(item.id, {loading:true,error:""})
    try {
      let layers = current.layers
      if (!layers) {
        layers = await discoverArcGISLayers(item.url)
        if (layers.length > 1) {
          updateMapState(item.id, {loading:false,layers,selectedUrl:layers[0].url})
          return
        }
      }
      const selected = layers.find(layer => layer.url === current.selectedUrl) || layers[0]
      const layer = await fetchArcGISLayer(item, selected, {entryPath,color:item.color})
      updateMapState(item.id, {loading:false,layers,selectedUrl:selected.url,error:""})
      onMapLayerAdd(layer)
    } catch (error) {
      updateMapState(item.id, {loading:false,error:error.message || "Unable to load this ArcGIS layer"})
    }
  }

  const manualItem = manualUrl.trim() ? {
    id:manualArcGISItemId(manualUrl.trim()),
    title:manualName.trim() || "Pasted ArcGIS Feature Service",
    owner:"User-provided ArcGIS service",
    type:/\/MapServer(?:\/\d+)?\/?$/i.test(manualUrl.trim()) ? "Map Service" : "Feature Service",
    url:manualUrl.trim(),
    color:"#60a5fa",
  } : null
  const manualMapState = manualItem ? mapState[manualItem.id] || {} : {}
  const manualSelectedLayer = manualMapState.layers?.find(layer=>layer.url===manualMapState.selectedUrl) || manualMapState.layers?.[0]

  return (
    <div style={{flex:1,overflowY:"auto",padding:"16px 18px"}}>
      <div style={{color:"#a78bfa",fontWeight:700,marginBottom:8}}>⊕ ESRI / Living Atlas</div>
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()} placeholder="Search ArcGIS Online…" style={{flex:1,background:"#0d1117",border:"1px solid #1a1e28",borderRadius:4,padding:"6px 10px",color:"#e0e0e8",fontFamily:"inherit",fontSize:11,outline:"none"}}/>
        <button onClick={search} disabled={loading} style={{padding:"6px 14px",borderRadius:4,fontSize:10,border:"1px solid #a78bfa33",background:"transparent",color:"#a78bfa",cursor:"pointer",fontFamily:"inherit",opacity:loading?0.5:1}}>
          {loading?"…":"🔍 Search"}
        </button>
      </div>
      <div style={{marginBottom:12,padding:"9px 10px",border:"1px solid #1a1e28",borderRadius:6,background:"#090d14"}}>
        <div style={{fontSize:9.5,color:"#60a5fa",fontWeight:700,marginBottom:6}}>MAP BUILDER · PASTE FEATURE SERVICE</div>
        <input value={manualUrl} onChange={event=>setManualUrl(event.target.value)} placeholder="https://…/FeatureServer or /FeatureServer/0" style={{width:"100%",boxSizing:"border-box",background:"#0d1117",border:"1px solid #1a1e28",borderRadius:4,padding:"5px 8px",color:"#e0e0e8",fontFamily:"inherit",fontSize:9.5,outline:"none",marginBottom:5}}/>
        <div style={{display:"flex",gap:5}}>
          <input value={manualName} onChange={event=>setManualName(event.target.value)} placeholder="Layer name (optional)" style={{flex:1,minWidth:0,background:"#0d1117",border:"1px solid #1a1e28",borderRadius:4,padding:"5px 8px",color:"#e0e0e8",fontFamily:"inherit",fontSize:9.5,outline:"none"}}/>
          <button onClick={()=>manualItem&&addItemToMap(manualItem,"pasted_url")} disabled={!manualItem||manualMapState.loading} style={{padding:"3px 9px",borderRadius:4,fontSize:9,border:"1px solid #60a5fa44",background:"transparent",color:"#60a5fa",cursor:manualMapState.loading?"wait":"pointer",fontFamily:"inherit",opacity:!manualItem||manualMapState.loading?0.5:1}}>{manualMapState.loading?"Loading…":"+ Add URL"}</button>
        </div>
        {manualMapState.layers?.length>1 && <select aria-label="Pasted service sublayer" value={manualSelectedLayer?.url||""} onChange={event=>updateMapState(manualItem.id,{selectedUrl:event.target.value,error:""})} style={{width:"100%",marginTop:6,background:"#0d1117",border:"1px solid #60a5fa44",borderRadius:4,padding:"4px 6px",color:"#9dc7f3",fontFamily:"inherit",fontSize:9}}>{manualMapState.layers.map(layer=><option key={layer.url} value={layer.url}>{layer.id}: {layer.name}</option>)}</select>}
        {manualMapState.layers?.length>1 && <button onClick={()=>addItemToMap(manualItem,"pasted_url")} style={{marginTop:5,padding:"2px 9px",borderRadius:4,fontSize:9,border:"1px solid #60a5fa44",background:"transparent",color:"#60a5fa",cursor:"pointer",fontFamily:"inherit"}}>+ Add selected sublayer</button>}
        {manualMapState.error && <div role="alert" style={{marginTop:5,fontSize:9,color:"#f87171"}}>{manualMapState.error}</div>}
      </div>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:9.5,color:"#facc15",fontWeight:700,marginBottom:6}}>LIVING ATLAS QUICK-ADDS</div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {MAP_BUILDER_PRESETS.map(preset=>{
            const mapped = mappedLayers.some(layer=>layer.ownerItemId===preset.id)
            const supported = preset.type === "Feature Layer" && isQueryableArcGISServiceUrl(preset.url)
            return <button key={preset.id} onClick={()=>supported&&!mapped&&addItemToMap({...preset,title:preset.name},"quick_add")} disabled={!supported||mapped} title={!supported?"Map Services, imagery, and vector tiles cannot be added as queryable features":preset.owner} style={{padding:"3px 7px",borderRadius:4,fontSize:8.5,border:`1px solid ${preset.color}44`,background:mapped?`${preset.color}12`:"transparent",color:supported?preset.color:"#445",cursor:supported&&!mapped?"pointer":"default",fontFamily:"inherit"}}>{mapped?"✓ ":supported?"+ ":"Unavailable · "}{preset.name}</button>
          })}
        </div>
        <div style={{marginTop:5,fontSize:8.5,color:"#556"}}>Map Services, imagery, and vector tiles remain unfiltered; non-queryable quick-adds are disabled.</div>
      </div>
      {total>0 && <div style={{fontSize:9,color:"#334",marginBottom:8}}>{total.toLocaleString()} results</div>}
      {results.map(item=>{
        const itemMapState = mapState[item.id] || {}
        const selectedLayer = itemMapState.layers?.find(layer => layer.url === itemMapState.selectedUrl) || itemMapState.layers?.[0]
        const selectedMapId = selectedLayer ? `esri_${item.id}_${selectedLayer.id}` : null
        const selectedIsMapped = Boolean(selectedMapId && esriMapLayers[selectedMapId])
        const itemMappedLayers = mappedLayers.filter(layer => layer.ownerItemId === item.id)
        const canMap = isQueryableArcGISServiceUrl(item.url)
        return (
        <div key={item.id} style={{marginBottom:8,padding:"8px 10px",background:"#0d1117",border:"1px solid #1a1e28",borderRadius:6}}>
          <div style={{display:"flex",gap:4,marginBottom:4,flexWrap:"wrap"}}>
            <span style={{fontSize:9,padding:"1px 6px",borderRadius:8,background:"#60a5fa12",color:"#60a5fa",border:"1px solid #60a5fa22"}}>{item.type}</span>
            {String(item.owner || "").toLowerCase().includes("esri") && <span style={{fontSize:9,padding:"1px 6px",borderRadius:8,background:"#a78bfa12",color:"#a78bfa",border:"1px solid #a78bfa22"}}>Living Atlas</span>}
            {injectedIds.has(item.id) && <span style={{fontSize:9,padding:"1px 6px",borderRadius:8,background:"#4ade8012",color:"#4ade80",border:"1px solid #4ade8022"}}>✓ In KB</span>}
            {itemMappedLayers.length>0 && <span style={{fontSize:9,padding:"1px 6px",borderRadius:8,background:"#22d3ee12",color:"#22d3ee",border:"1px solid #22d3ee22"}}>✓ On Map</span>}
          </div>
          <div style={{fontSize:10.5,color:"#dde",fontWeight:700,marginBottom:2}}>{item.title}</div>
          <div style={{fontSize:9.5,color:"#556",marginBottom:6}}>{(item.snippet||"").substring(0,120)}</div>
          {itemMapState.layers?.length>1 && (
            <select aria-label={`Map layer for ${item.title}`} value={selectedLayer?.url || ""} onChange={event=>updateMapState(item.id,{selectedUrl:event.target.value,error:""})} style={{width:"100%",marginBottom:6,background:"#090d14",border:"1px solid #22d3ee33",borderRadius:4,padding:"4px 6px",color:"#9de7f3",fontFamily:"inherit",fontSize:9.5}}>
              {itemMapState.layers.map(layer=><option key={layer.url} value={layer.url}>{layer.id}: {layer.name}</option>)}
            </select>
          )}
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {!injectedIds.has(item.id) ? (
              <button onClick={()=>{
                const tags = (item.tags||[]).join(", ")
                const content = `[ESRI: ${item.title}]\nType: ${item.type}\nOwner: ${item.owner}\nSnippet: ${item.snippet||""}\nTags: ${tags}\nURL: ${item.url||""}\nItem ID: ${item.id}`
                onInject({name:`ESRI: ${item.title}`,itemId:item.id,content})
              }} style={{padding:"2px 10px",borderRadius:4,fontSize:9.5,border:"1px solid #a78bfa33",background:"transparent",color:"#a78bfa",cursor:"pointer",fontFamily:"inherit"}}>
                + Add to KB
              </button>
            ) : (
              <button disabled style={{padding:"2px 10px",borderRadius:4,fontSize:9.5,border:"1px solid #33334433",background:"transparent",color:"#334",fontFamily:"inherit"}}>✓ In KB</button>
            )}
            {canMap && (selectedIsMapped ? (
              <button onClick={()=>onMapLayerRemove(selectedMapId)} style={{padding:"2px 10px",borderRadius:4,fontSize:9.5,border:"1px solid #22d3ee55",background:"#22d3ee12",color:"#22d3ee",cursor:"pointer",fontFamily:"inherit"}}>− Remove from Map</button>
            ) : (
              <button onClick={()=>addItemToMap(item,"search")} disabled={itemMapState.loading} style={{padding:"2px 10px",borderRadius:4,fontSize:9.5,border:"1px solid #22d3ee44",background:"transparent",color:"#22d3ee",cursor:itemMapState.loading?"wait":"pointer",fontFamily:"inherit",opacity:itemMapState.loading?0.55:1}}>
                {itemMapState.loading?"Loading…":itemMapState.layers?.length>1?"+ Add Selected to Map":"+ Add to Map"}
              </button>
            ))}
            <a href={`https://www.arcgis.com/home/item.html?id=${item.id}`} target="_blank" rel="noopener noreferrer" style={{padding:"2px 10px",borderRadius:4,fontSize:9.5,border:"1px solid #33334433",color:"#556",textDecoration:"none"}}>↗ AGOL</a>
            {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" style={{padding:"2px 10px",borderRadius:4,fontSize:9.5,border:"1px solid #33334433",color:"#556",textDecoration:"none"}}>↗ Service</a>}
          </div>
          {itemMappedLayers.length>0 && <div style={{marginTop:5,fontSize:9,color:"#22d3ee88"}}>{itemMappedLayers.map(layer=>`${layer.name} (${layer.count.toLocaleString()} features)`).join(" · ")}</div>}
          {itemMapState.error && <div role="alert" style={{marginTop:5,fontSize:9,color:"#f87171"}}>{itemMapState.error}</div>}
          {!canMap && <div style={{marginTop:5,fontSize:9,color:"#667"}}>Map and geography filtering unavailable for this item type.</div>}
        </div>
      )})}
      {mappedLayers.length>0 && (
        <div style={{marginTop:16,borderTop:"1px solid #15303a",paddingTop:12}}>
          <div style={{fontSize:9.5,color:"#22d3ee",fontWeight:700,marginBottom:7}}>MAP BUILDER LAYERS ({mappedLayers.length})</div>
          {mappedLayers.map(layer=>{
            const filter = layer.filter
            const fallback = filter.requestedMode!==filter.effectiveMode
            return <div key={layer.id} style={{marginBottom:8,padding:"7px 8px",border:"1px solid #16313a",borderRadius:5,background:"#071018"}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:6,alignItems:"center"}}>
                <span style={{fontSize:9.5,color:layer.color,fontWeight:700}}>{layer.name}</span>
                <button aria-label={`Remove ${layer.name} from map`} onClick={()=>onMapLayerRemove(layer.id)} style={{background:"none",border:"none",color:"#f87171",cursor:"pointer",fontSize:10}}>✕</button>
              </div>
              <div style={{fontSize:8.5,color:"#557",margin:"3px 0 5px"}}>{layer.entryPath.replaceAll("_"," ")} · <a href={layer.originalUrl||layer.url} target="_blank" rel="noopener noreferrer" style={{color:"#668"}}>original service</a></div>
              <select aria-label={`Geography filter for ${layer.name}`} value={layer.filterMode||MAP_BUILDER_FILTER_MODES.UNFILTERED} onChange={event=>onMapLayerFilterChange(layer.id,event.target.value)} disabled={!filter.supported} title={!filter.supported?"Geography filtering is available only for queryable Feature Layers":"Applied after Add to Map"} style={{width:"100%",background:"#0d1117",border:"1px solid #22d3ee33",borderRadius:4,padding:"4px 6px",color:filter.supported?"#9de7f3":"#445",fontFamily:"inherit",fontSize:9}}>
                {Object.entries(MAP_BUILDER_FILTER_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}
              </select>
              <div style={{marginTop:4,fontSize:8.5,color:layer.filterLoading||fallback?"#facc15":"#667"}}>{layer.filterLoading?`Loading up to 500 features in ${MAP_BUILDER_FILTER_LABELS[layer.filterMode]}…`:layer.filterError?`Filtered query failed (${layer.filterError.replaceAll("_"," ")}); showing last successful result.`:fallback?`Filter unavailable (${filter.reason.replaceAll("_"," ")}); displaying unfiltered.`:filter.effectiveMode===MAP_BUILDER_FILTER_MODES.UNFILTERED?`${filter.outputCount} features · unfiltered`:`${filter.outputCount} of ${filter.inputCount} features · ${MAP_BUILDER_FILTER_LABELS[filter.effectiveMode]}`}</div>
            </div>
          })}
        </div>
      )}
      {esriItems.length>0 && (
        <div style={{marginTop:16,borderTop:"1px solid #111820",paddingTop:12}}>
          <div style={{fontSize:9.5,color:"#a78bfa",fontWeight:700,marginBottom:6}}>{esriItems.length} layer(s) in KB:</div>
          {esriItems.map((item,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <span style={{fontSize:9.5,color:"#a78bfa",background:"#a78bfa12",padding:"2px 8px",borderRadius:10,border:"1px solid #a78bfa33"}}>{item.name.substring(0,40)}</span>
              <button onClick={()=>onRemove(i)} style={{background:"none",border:"none",color:"#f87171",cursor:"pointer",fontSize:10}}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Settings Panel ────────────────────────────────────────────────────────────
function FeatureTable({ rows, setRows, color }) {
  return (
    <div>
      {rows.map((f, i) => (
        <div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 2fr auto",gap:4,marginBottom:4,alignItems:"center"}}>
          <input value={f.name||""} onChange={e=>{const n=[...rows];n[i]={...n[i],name:e.target.value};setRows(n)}} placeholder="Name"
            style={{background:"#0d1117",border:"1px solid #1a1e28",borderRadius:3,padding:"3px 6px",color:"#e0e0e8",fontFamily:"monospace",fontSize:10,outline:"none"}}/>
          <input value={f.lat||""} onChange={e=>{const n=[...rows];n[i]={...n[i],lat:parseFloat(e.target.value)||0};setRows(n)}} placeholder="Lat" type="number" step="0.0001"
            style={{background:"#0d1117",border:"1px solid #1a1e28",borderRadius:3,padding:"3px 6px",color:"#e0e0e8",fontFamily:"monospace",fontSize:10,outline:"none"}}/>
          <input value={f.lng||""} onChange={e=>{const n=[...rows];n[i]={...n[i],lng:parseFloat(e.target.value)||0};setRows(n)}} placeholder="Lng" type="number" step="0.0001"
            style={{background:"#0d1117",border:"1px solid #1a1e28",borderRadius:3,padding:"3px 6px",color:"#e0e0e8",fontFamily:"monospace",fontSize:10,outline:"none"}}/>
          <input value={f.note||""} onChange={e=>{const n=[...rows];n[i]={...n[i],note:e.target.value};setRows(n)}} placeholder="Note"
            style={{background:"#0d1117",border:"1px solid #1a1e28",borderRadius:3,padding:"3px 6px",color:"#e0e0e8",fontFamily:"monospace",fontSize:10,outline:"none"}}/>
          <button onClick={()=>setRows(rows.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"#f87171",cursor:"pointer",fontSize:12,padding:"0 4px"}}>✕</button>
        </div>
      ))}
      <button onClick={()=>setRows([...rows,{name:"",lat:0,lng:0,note:""}])}
        style={{marginTop:4,padding:"3px 10px",borderRadius:4,fontSize:9,border:`1px solid ${color}44`,background:"transparent",color,cursor:"pointer",fontFamily:"monospace"}}>
        + Add row
      </button>
    </div>
  )
}

function SettingsPanel({ localConfig, nycOpenDataToken, onSave, onSaveNycToken, onReset }) {
  const lc = localConfig || {}
  const lj = lc.jurisdiction || {}
  const lkb = lc.kb || {}
  const lml = lc.mapLayers || {}

  // Section visibility
  const [section, setSection] = useState("jurisdiction")

  // Jurisdiction form state
  const [jName,     setJName]     = useState(lj.name      || _J.name      || "New York City")
  const [jShort,    setJShort]    = useState(lj.shortName || _J.short_name || "NYC")
  const [jState,    setJState]    = useState(lj.state     || _J.state     || "NY")
  const [jLat,      setJLat]      = useState(lj.center?.[0] ?? (_J.center?.[0] ?? 40.7128))
  const [jLng,      setJLng]      = useState(lj.center?.[1] ?? (_J.center?.[1] ?? -74.006))
  const [jZoom,     setJZoom]     = useState(lj.zoom      ?? (_J.zoom     ?? 10))
  const [jOffice,   setJOffice]   = useState(lj.nwsOffice || _NWS.office  || "OKX")
  const [jGX,       setJGX]       = useState(lj.nwsGridX  ?? (_NWS.grid_x ?? 33))
  const [jGY,       setJGY]       = useState(lj.nwsGridY  ?? (_NWS.grid_y ?? 37))
  const [jSocrata,  setJSocrata]  = useState(lj.socrataDomain || _SOC.domain || "data.cityofnewyork.us")
  const [jSocrataToken, setJSocrataToken] = useState(nycOpenDataToken || "")
  const [discovering, setDiscovering] = useState(false)
  const [discoverMsg, setDiscoverMsg] = useState("")

  // KB form state
  const [kbFlood,    setKbFlood]    = useState(lkb.floodZones             || _KB.floodZones?.data             || DEFAULT_KB_TEXT.floodZones)
  const [kbEvac,     setKbEvac]     = useState(lkb.evacZones              || _KB.evacZones?.data              || DEFAULT_KB_TEXT.evacZones)
  const [kbInfra,    setKbInfra]    = useState(lkb.criticalInfrastructure || _KB.criticalInfrastructure?.data  || DEFAULT_KB_TEXT.criticalInfrastructure)
  const [kbHazard,   setKbHazard]   = useState(lkb.hazardProfiles         || _KB.hazardProfiles?.data         || DEFAULT_KB_TEXT.hazardProfiles)
  const [kbResources,setKbResources]= useState(lkb.resources              || _KB.resources?.data              || DEFAULT_KB_TEXT.resources)

  // Map points state — editable table per category
  const defaultFeatures = (key) => ((_ML[key]?.features || DEFAULT_MAP_LAYERS[key]?.features || []).map(f => ({...f})))
  const [mpHospitals, setMpHospitals] = useState(lml.hospitals?.features  || defaultFeatures("hospitals"))
  const [mpShelters,  setMpShelters]  = useState(lml.shelters?.features   || defaultFeatures("shelters"))
  const [mpGauges,    setMpGauges]    = useState(lml.gauges?.features     || defaultFeatures("gauges"))
  const [mpEoc,       setMpEoc]       = useState(lml.eoc?.features        || defaultFeatures("eoc"))
  const [mpFlood,     setMpFlood]     = useState(lml.floodRisk?.features  || defaultFeatures("floodRisk"))

  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    onSave({
      jurisdiction: { name:jName, shortName:jShort, state:jState.toUpperCase(), center:[parseFloat(jLat),parseFloat(jLng)], zoom:parseInt(jZoom), nwsOffice:jOffice.toUpperCase(), nwsGridX:parseInt(jGX), nwsGridY:parseInt(jGY), socrataDomain:jSocrata },
      kb: { floodZones:kbFlood, evacZones:kbEvac, criticalInfrastructure:kbInfra, hazardProfiles:kbHazard, resources:kbResources },
      mapLayers: {
        hospitals: { label:"Trauma Centers", color:"#f87171", icon:"🏥", features:mpHospitals },
        shelters:  { label:"Evac Shelters",   color:"#60a5fa", icon:"🏫", features:mpShelters  },
        gauges:    { label:"Stream Gauges",   color:"#4ade80", icon:"📡", features:mpGauges    },
        eoc:       { label:"EOC / Command",   color:"#facc15", icon:"🏛", features:mpEoc       },
        floodRisk: { label:"Flood Risk",      color:"#fb923c", icon:"💧", features:mpFlood     },
      }
    })
    onSaveNycToken(jSocrataToken)
    setSaved(true)
    setTimeout(() => setSaved(false), 1200)
  }

  const discoverNWS = async () => {
    setDiscovering(true)
    setDiscoverMsg("Querying NWS API…")
    try {
      const r = await fetch(`https://api.weather.gov/points/${jLat},${jLng}`, { headers:{"User-Agent":"EMBER/1.0"} })
      const d = await r.json()
      const p = d.properties || {}
      setJOffice(p.cwa || jOffice)
      setJGX(p.gridX || jGX)
      setJGY(p.gridY || jGY)
      setDiscoverMsg(`✓ Found: ${p.cwa} grid (${p.gridX},${p.gridY})`)
    } catch(e) {
      setDiscoverMsg("✗ Could not reach NWS API. Enter values manually.")
    }
    setDiscovering(false)
  }

  const inp = (val, set, type="text", placeholder="") => (
    <input value={val} type={type} placeholder={placeholder}
      onChange={e => set(type==="number" ? parseFloat(e.target.value)||0 : e.target.value)}
      style={{background:"#0d1117",border:"1px solid #1a1e28",borderRadius:4,padding:"5px 8px",color:"#e0e0e8",fontFamily:"monospace",fontSize:11,outline:"none",width:"100%"}} />
  )
  const ta = (val, set, rows=4) => (
    <textarea value={val} rows={rows} onChange={e=>set(e.target.value)}
      style={{background:"#0d1117",border:"1px solid #1a1e28",borderRadius:4,padding:"6px 8px",color:"#e0e0e8",fontFamily:"monospace",fontSize:10,outline:"none",width:"100%",resize:"vertical",lineHeight:1.5}} />
  )
  const label = (text) => <div style={{fontSize:9,color:"#556",fontWeight:700,letterSpacing:"0.06em",marginBottom:3,marginTop:8}}>{text}</div>
  const sectionBtn = (id, lbl) => (
    <button onClick={()=>setSection(id)} style={{padding:"5px 12px",borderRadius:4,fontSize:9.5,fontWeight:700,border:`1px solid ${section===id?"#4ade8066":"#1a1e28"}`,background:section===id?"#4ade8015":"transparent",color:section===id?"#4ade80":"#556",cursor:"pointer",fontFamily:"inherit"}}>{lbl}</button>
  )

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0}}>
      {/* Section nav */}
      <div style={{flexShrink:0,padding:"10px 18px 8px",borderBottom:"1px solid #111820",display:"flex",gap:6,flexWrap:"wrap"}}>
        {sectionBtn("jurisdiction","📍 Jurisdiction")}
        {sectionBtn("nws","🌩 NWS")}
        {sectionBtn("kb","📚 Knowledge Base")}
        {sectionBtn("mappoints","📍 Map Points")}
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"14px 18px"}}>

        {/* Jurisdiction */}
        {section==="jurisdiction" && (
          <div>
            <div style={{color:"#4ade80",fontWeight:700,marginBottom:10}}>📍 Jurisdiction Configuration</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div>{label("JURISDICTION NAME")}{inp(jName,setJName,"text","e.g. Virginia Beach")}</div>
              <div>{label("SHORT NAME")}{inp(jShort,setJShort,"text","e.g. VB")}</div>
              <div>{label("STATE CODE (2-letter)")}{inp(jState,setJState,"text","e.g. VA")}</div>
              <div>{label("MAP ZOOM (8-15)")}{inp(jZoom,setJZoom,"number")}</div>
              <div>{label("CENTER LATITUDE")}{inp(jLat,setJLat,"number","e.g. 36.8529")}</div>
              <div>{label("CENTER LONGITUDE")}{inp(jLng,setJLng,"number","e.g. -75.9780")}</div>
            </div>
            {label("SOCRATA OPEN DATA DOMAIN")}
            {inp(jSocrata, setJSocrata, "text", "e.g. data.virginiabeach.gov")}
            <div style={{fontSize:9,color:"#446",marginTop:3}}>Find your city's domain at <a href="https://opendatanetwork.com" target="_blank" rel="noopener noreferrer" style={{color:"#60a5fa"}}>opendatanetwork.com</a></div>
            {label("NYC OPEN DATA APP TOKEN (OPTIONAL)")}
            {inp(jSocrataToken, setJSocrataToken, "password", "Used for Phase 4 Socrata requests")}
            <div style={{fontSize:9,color:"#446",marginTop:3}}>Stored only for this browser session and sent as the Socrata X-App-Token header.</div>
          </div>
        )}

        {/* NWS */}
        {section==="nws" && (
          <div>
            <div style={{color:"#60a5fa",fontWeight:700,marginBottom:10}}>🌩 National Weather Service</div>
            <div style={{marginBottom:10}}>
              <button onClick={discoverNWS} disabled={discovering}
                style={{padding:"5px 14px",borderRadius:4,fontSize:10,border:"1px solid #60a5fa44",background:"transparent",color:"#60a5fa",cursor:"pointer",fontFamily:"monospace",opacity:discovering?0.5:1}}>
                {discovering?"…":"🔍 Auto-discover from coordinates"}
              </button>
              {discoverMsg && <span style={{marginLeft:8,fontSize:9.5,color:discoverMsg.startsWith("✓")?"#4ade80":"#f87171"}}>{discoverMsg}</span>}
              <div style={{fontSize:9,color:"#446",marginTop:4}}>Uses the lat/lng from the Jurisdiction tab to find your NWS office and grid coordinates automatically.</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              <div>{label("NWS OFFICE (e.g. AKQ, OKX, LWX)")}{inp(jOffice,setJOffice,"text","e.g. AKQ")}</div>
              <div>{label("GRID X")}{inp(jGX,setJGX,"number")}</div>
              <div>{label("GRID Y")}{inp(jGY,setJGY,"number")}</div>
            </div>
            <div style={{marginTop:8,padding:"8px 10px",background:"#0d1117",borderRadius:6,border:"1px solid #1a1e28",fontSize:9.5,color:"#556"}}>
              Preview URLs that will be used:
              <div style={{color:"#4ade8088",marginTop:4,wordBreak:"break-all"}}>
                {`https://api.weather.gov/alerts/active?area=${jState.toUpperCase()}`}<br/>
                {`https://api.weather.gov/gridpoints/${jOffice}/${jGX},${jGY}/forecast`}
              </div>
            </div>
          </div>
        )}

        {/* Knowledge Base */}
        {section==="kb" && (
          <div>
            <div style={{color:"#a78bfa",fontWeight:700,marginBottom:6}}>📚 Knowledge Base Text</div>
            <div style={{fontSize:9.5,color:"#556",marginBottom:10}}>This text is injected into the AI system prompt. Be specific — include actual zone names, street names, and operational details.</div>
            {[
              ["FLOOD ZONES", kbFlood, setKbFlood, "Zone A: ...\nZone AE: ...\nList your FEMA flood zones and key affected areas"],
              ["EVACUATION ZONES", kbEvac, setKbEvac, "Zone 1: ...\nDescribe your evacuation zone system"],
              ["CRITICAL INFRASTRUCTURE", kbInfra, setKbInfra, "Hospitals: ...\nPower: ...\nSubway/Transit: ..."],
              ["HAZARD PROFILES", kbHazard, setKbHazard, "HURRICANES: ...\nFLOODING: ...\nEXTREME HEAT: ..."],
              ["CONTACTS & RESOURCES", kbResources, setKbResources, "Emergency Management: 555-1234\nFire: 911 | Police: 911\n..."],
            ].map(([lbl, val, set, ph]) => (
              <div key={lbl} style={{marginBottom:10}}>
                {label(lbl)}
                <textarea value={val} rows={5} onChange={e=>set(e.target.value)} placeholder={ph}
                  style={{background:"#0d1117",border:"1px solid #1a1e28",borderRadius:4,padding:"6px 8px",color:"#e0e0e8",fontFamily:"monospace",fontSize:10,outline:"none",width:"100%",resize:"vertical",lineHeight:1.6,boxSizing:"border-box"}} />
              </div>
            ))}
          </div>
        )}

        {/* Map Points */}
        {section==="mappoints" && (
          <div>
            <div style={{color:"#fb923c",fontWeight:700,marginBottom:6}}>📍 Map Points</div>
            <div style={{fontSize:9.5,color:"#556",marginBottom:10}}>Edit the markers that appear on the operational map. Columns: Name · Latitude · Longitude · Note</div>
            {[
              ["🏥 TRAUMA CENTERS", mpHospitals, setMpHospitals, "#f87171"],
              ["🏫 EVACUATION SHELTERS", mpShelters, setMpShelters, "#60a5fa"],
              ["📡 STREAM GAUGES", mpGauges, setMpGauges, "#4ade80"],
              ["🏛 EOC / COMMAND POSTS", mpEoc, setMpEoc, "#facc15"],
              ["💧 FLOOD RISK AREAS", mpFlood, setMpFlood, "#fb923c"],
            ].map(([lbl, rows, setRows, color]) => (
              <div key={lbl} style={{marginBottom:14}}>
                <div style={{fontSize:9,color,fontWeight:700,letterSpacing:"0.06em",marginBottom:5}}>{lbl}</div>
                <FeatureTable rows={rows} setRows={setRows} color={color} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save bar */}
      <div style={{flexShrink:0,padding:"10px 18px",borderTop:"1px solid #111820",background:"#090c12",display:"flex",gap:8,alignItems:"center"}}>
        <button onClick={handleSave}
          style={{padding:"7px 20px",borderRadius:5,background:saved?"#4ade80":"#e8372c",border:"none",color:"#fff",fontFamily:"monospace",fontSize:11,fontWeight:700,cursor:"pointer",transition:"background 0.2s"}}>
          {saved?"✓ Saved — reloading…":"💾 Save & Apply"}
        </button>
        <button onClick={onReset}
          style={{padding:"7px 14px",borderRadius:5,background:"transparent",border:"1px solid #1a1e28",color:"#556",fontFamily:"monospace",fontSize:10,cursor:"pointer"}}>
          Reset to defaults
        </button>
        <span style={{fontSize:9,color:"#334",marginLeft:4}}>Configuration saved locally · App token stays in session storage</span>
      </div>
    </div>
  )
}
