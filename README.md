# EMBER — Emergency Management Body of Evidence & Resources

AI-powered situational awareness for emergency managers across Nassau County, Suffolk County, and the Rockaway / Queens Community Board 14 operating area. EMBER combines configured knowledge-base content, live weather and water data, regional source feeds, ArcGIS/Living Atlas layers, map visualization, and advisory chat.

**Backend:** [Ollama Cloud](https://docs.ollama.com/cloud) — fully hosted, no local GPU needed.

---

## Quickstart (2 steps)

### 1. Get an Ollama Cloud API key
Create a free account and generate a key at:
**https://ollama.com/settings/keys**

### 2. Pull the cloud model
```bash
ollama signin
ollama pull gpt-oss:120b-cloud
```

---

## Option A — React/Vite → Vercel

### Local dev
```bash
git clone https://github.com/votaa/openember.git
cd openember
npm install
npm run dev
# → http://localhost:3000
```

The React development server runs on port `3000`. The repository does not
currently include an `.env.example` file; configure deployment secrets through
the hosting provider or use the in-app session key field for a local chat smoke
test.

### Deploy to Vercel
```bash
npm i -g vercel
vercel login
vercel --prod
```

Or: connect the GitHub repo at **vercel.com** → it auto-detects Vite.

**Add env vars in Vercel dashboard** (Settings → Environment Variables):
| Key | Value |
|-----|-------|
| `OLLAMA_API_KEY` | `your_key_here` |
| `OLLAMA_HOST` | `https://ollama.com` |
| `OLLAMA_MODEL` | `gpt-oss:120b-cloud` |
| `VITE_NYC_OPEN_DATA_APP_TOKEN` | `your_socrata_app_token` |
| `VITE_CARTO_API_KEY` | `your_carto_key_here` |

Keep `OLLAMA_API_KEY` server-side in Vercel. `VITE_*` variables are
browser-visible build-time values and should not be used for production
secrets.

---

## Option B — Streamlit → Streamlit Cloud

### Local dev
```bash
cd streamlit/
pip install -r requirements.txt
export OLLAMA_API_KEY=your_key_here
streamlit run app.py
# → http://localhost:8501
```

The Ollama key is optional for a local map/data smoke test. If no
`secrets.toml` or `OLLAMA_API_KEY` is configured, the app launches and marks
chat as unavailable until a key is provided.

### Deploy to Streamlit Cloud
1. Push repo to GitHub
2. Go to **https://share.streamlit.io** → New app
3. Set **Main file path**: `streamlit/app.py`
4. **Settings → Secrets** — add:
```toml
OLLAMA_API_KEY = "your_key_here"
OLLAMA_HOST    = "https://ollama.com"
OLLAMA_MODEL   = "gpt-oss:120b-cloud"
CARTO_API_KEY  = "your_carto_key_here"
```
5. Deploy — no server management, free tier available.

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
npm run phase4:gate
```

---

## Environment Variables

### React/Vite (.env.local)
| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_OLLAMA_API_KEY` | — | Optional browser-visible Ollama key for local/session use; prefer server-side `OLLAMA_API_KEY` in Vercel |
| `VITE_OLLAMA_HOST` | `https://ollama.com` | Ollama Cloud base URL |
| `VITE_OLLAMA_MODEL` | `gpt-oss:120b-cloud` | Model name |
| `VITE_NYC_OPEN_DATA_APP_TOKEN` | — | Optional browser-visible Socrata app token for Phase 4 NYC Open Data requests |
| `VITE_CARTO_API_KEY` | — | Optional browser-visible CARTO basemap key; OpenStreetMap fallback is used when absent |

For Vercel deployments, prefer the server-side `OLLAMA_API_KEY`, `OLLAMA_HOST`,
and `OLLAMA_MODEL` variables used by `api/chat.js`. A `VITE_OLLAMA_API_KEY`
value is browser-visible and should not be treated as a production secret.

### Streamlit (secrets or env)
Same keys without the `VITE_` prefix: `OLLAMA_API_KEY`, `OLLAMA_HOST`, `OLLAMA_MODEL`.

---

## License
MIT
