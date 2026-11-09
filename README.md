# EMBER — Emergency Management Body of Evidence & Resources

AI-powered situational awareness for emergency managers across Nassau County, Suffolk County, and the Rockaway / Queens Community Board 14 operating area. EMBER combines configured knowledge-base content, live weather and water data, regional source feeds, ArcGIS/Living Atlas layers, map visualization, and advisory chat.

**Backend:** native Ollama locally, with optional Ollama Cloud fallback. Vercel
always uses cloud-only routing. See the [local-first setup and implementation
record](docs/long-island/local-first-ollama-implementation.md) for the configuration
contract, Docker instructions, troubleshooting, decisions, and test results.

## Local quickstart

Install Node 20+ and native [Ollama](https://ollama.com/download), then:

```bash
ollama pull qwen3:8b
npm ci
npm run dev
# Open http://localhost:3000
```

Start the Ollama macOS application (or `ollama serve` in another terminal) first.
Chat uses the installed model without an API key. Local-first fallback needs an
optional **server-side** `OLLAMA_API_KEY`. Set `OLLAMA_MODE=local-only` to prohibit
cloud requests. Copy `.env.example` to `.env.local` only if that file does not
already exist; otherwise merge the documented settings without overwriting it.
Never put an Ollama key in a `VITE_*` variable.

For Python/Streamlit, Docker, hosted configuration, and validation, use the
[setup guide](docs/long-island/local-first-ollama-implementation.md#startup).

---

## Architecture

```
openember/
├── api/chat.js                 # Vercel serverless proxy for Ollama
├── config/
│   └── jurisdiction.yaml       # Active Long Island and source configuration
├── scripts/build-config.js     # Generates src/config/jurisdiction.js from YAML
├── src/                        # React/Vite app (→ Vercel)
│   ├── App.jsx                 # Map, chat, sources, and settings UI
│   ├── components/             # Leaflet, chat, NOAA, and ESRI panels
│   ├── config/jurisdiction.js  # Generated build-time configuration
│   ├── data/regional/          # Regional source adapters and normalization
│   ├── data/esriLayers.js      # ArcGIS FeatureServer discovery and loading
│   └── data/mapBuilderFilters.js # Geography filtering for map layers
├── streamlit/                  # Python/Streamlit app (→ Streamlit Cloud)
│   ├── app.py                  # Main map, chat, source, and setup application
│   ├── phase4_sources.py       # Regional source bundle and display contracts
│   ├── regional_*.py           # Shared geography and observation logic
│   └── requirements.txt
├── tests/                      # JavaScript and Python focused tests
├── vercel.json
└── README.md
```

---

## Features

### Knowledge Base (Long Island regional configuration)
| Module | Contents |
|--------|----------|
| Flood Zones | FEMA and locally configured coastal flood-zone context |
| Evacuation Zones | Configured local evacuation zones, shelters, and routes |
| Critical Infrastructure | Hospitals, utilities, transportation, and other configured assets |
| Hazard Profiles | Hurricanes, heat, flooding, winter storms, and locally configured hazards |
| Contacts & Resources | Nassau OEM, Suffolk OEM, Rockaway/NYC OEM, NWS, utilities, and other configured contacts |

### Live API Feeds (free, no key needed)
| Feed | Source |
|------|--------|
| Weather alerts, forecasts, and observations | NWS api.weather.gov |
| Water levels and tidal predictions | NOAA CO-OPS |
| Stream gauge observations | USGS WaterServices |
| Disaster declarations | FEMA OpenData |
| Rockaway service requests | NYC Open Data / NYC 311 |
| Regional geography and environmental observations | ArcGIS, NYS DEC, and configured regional sources |

Some configured sources remain prototype-only, access-required, stale, or
unavailable until their endpoint, ownership, attribution, reuse, and update
cadence requirements are satisfied. See the regional source catalog for details.

### Map Layers
- 🏥 Trauma Centers (Level 1)
- 🏫 Hurricane Evacuation Shelters
- 📡 USGS/NOAA Stream & Tidal Gauges
- 🏛 EOC / Command Posts
- 💧 High Flood Risk Areas (Zone AE/VE)

### Document Ingestion
Drag and drop `.txt`, `.csv`, `.json`, `.geojson`, or `.md` files in either the
React or Streamlit application. Files are read as text and injected into the
chat context. JSON and GeoJSON are not automatically validated or rendered as
map layers. Each file contributes up to 4,000 characters to the model context.
PDF ingestion and OCR are not currently supported.

### Current limitations

- Uploaded documents are held in the current browser or Streamlit session.
- The full selected document context is resent with each chat query; there is no
  retrieval, chunking, or document indexing layer.
- Larger documents can increase input-token usage, response latency, and the
  risk of exceeding the model context window.
- Uploaded content is capped at 4,000 characters per file before it is sent to
  the model.
- EMBER is an advisory tool and does not replace official emergency-management
  procedures, source verification, or operational judgment.

---

## Extending EMBER

**New regional data source** → add the source contract to `config/jurisdiction.yaml`,
regenerate the build-time config, and add or update the corresponding regional
adapter/normalizer in `src/data/regional/` and `streamlit/` when required.

For a simple legacy live endpoint, update `LIVE_ENDPOINTS` in `src/data/nyc.js`
and add its summarizer case.

**New configured map layer** → add the layer definition to
`config/jurisdiction.yaml` and regenerate the build-time config. Simple local
map-point edits can also be made through the in-app Settings panel.

**Different model** → change `OLLAMA_MODEL` for the server-side deployment, or
`VITE_OLLAMA_MODEL` for a browser-configured local build. Available cloud models:
```
gpt-oss:120b-cloud
gpt-oss:70b-cloud
```
See full list: https://ollama.com/search?c=cloud

### Regional implementation notes

- [Phase 1 source catalog](docs/long-island/phase-1-source-catalog.md)
- [Phase 3–4 approved scope](docs/long-island/phase-3-4-approved-scope.md)
- [Phase 3 completion](docs/long-island/phase-3-completion.md)
- [How-to and deployment guide](howto.md)

### Validation

```bash
npm run build
npm run test:regional
npm run test:streamlit
npm run local-first:gate
```

---

## Environment Variables

All Ollama settings are server-only. See the [configuration contract](docs/long-island/local-first-ollama-implementation.md#configuration-contract)
and `.env.example`. Defaults are local-first, `qwen3:8b` locally, and
`gpt-oss:120b-cloud` in cloud. Vercel forces cloud-only.

React's optional `VITE_NYC_OPEN_DATA_APP_TOKEN` (Socrata) and `VITE_CARTO_API_KEY`
(basemap) remain browser-visible build-time settings. They are unrelated to
Ollama credentials. Never use `VITE_OLLAMA_API_KEY`.

---

## License
MIT
