# EMBER — Emergency Management Body of Evidence & Resources

AI-powered situational awareness for NYC emergency managers. Natural language queries across flood zones, evacuation plans, critical infrastructure, live weather/flood feeds, and uploaded documents — with an interactive operational map.

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
git clone https://github.com/YOUR_USERNAME/ember-nyc.git
cd ember-nyc
npm install
cp .env.example .env.local
# Edit .env.local — add your VITE_OLLAMA_API_KEY
npm run dev
# → http://localhost:3000
```

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
| `VITE_OLLAMA_API_KEY` | `your_key_here` |
| `VITE_OLLAMA_HOST` | `https://ollama.com` |
| `VITE_OLLAMA_MODEL` | `gpt-oss:120b-cloud` |
| `VITE_NYC_OPEN_DATA_APP_TOKEN` | `your_socrata_app_token` |

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
ember-nyc/
├── src/                        # React/Vite (→ Vercel)
│   ├── App.jsx                 # Split-panel: map (left) + chat (right), draggable divider
│   ├── components/
│   │   ├── MapPanel.jsx        # Leaflet dark map — 5 togglable marker layers
│   │   └── ChatPanel.jsx       # Streaming token-by-token chat UI
│   ├── data/nyc.js             # NYC KB, map points, live API endpoints, context builder
│   └── hooks/useOllama.js      # Ollama Cloud streaming client
├── streamlit/
│   ├── app.py                  # Full Python version (Folium map + streaming chat)
│   └── requirements.txt
├── .env.example                # Copy to .env.local, add your API key
├── vercel.json
└── README.md
```

---

## Features

### Knowledge Base (NYC pre-loaded)
| Module | Contents |
|--------|----------|
| Flood Zones | FEMA Zone A/AE/VE/X with post-Sandy context |
| Evacuation Zones | All 6 zones, shelter locations, contraflow routes |
| Critical Infrastructure | Trauma centers, ConEd substations, subway flood exposure, water/wastewater |
| Hazard Profiles | Hurricanes, heat, flooding, winter storms, earthquake, CBRN, pandemic |
| Emergency Contacts | NYC OEM, FDNY, NYPD, NWS OKX, ConEd, National Grid, FEMA Region 2 |

### Live API Feeds (free, no key needed)
| Feed | Source |
|------|--------|
| Active weather alerts | NWS api.weather.gov |
| 7-day forecast NYC | NWS OKX gridpoint |
| Stream gauge heights | USGS WaterServices |
| Disaster declarations | FEMA OpenData |
| Recent 311 reports | NYC Open Data |

### Map Layers
- 🏥 Trauma Centers (Level 1)
- 🏫 Hurricane Evacuation Shelters
- 📡 USGS/NOAA Stream & Tidal Gauges
- 🏛 EOC / Command Posts
- 💧 High Flood Risk Areas (Zone AE/VE)

### Document Ingestion
Drag & drop TXT, CSV, JSON, GeoJSON, MD — ingested immediately into LLM context.

---

## Extending EMBER

**New data source** → add to `LIVE_ENDPOINTS` in `src/data/nyc.js` + summarizer case.

**New map layer** → add to `MAP_LAYERS` in `src/data/nyc.js` with lat/lng/name/note.

**Different model** → change `VITE_OLLAMA_MODEL`. Available cloud models:
```
gpt-oss:120b-cloud
gpt-oss:70b-cloud
```
See full list: https://ollama.com/search?c=cloud

---

## Environment Variables

### React/Vite (.env.local)
| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_OLLAMA_API_KEY` | — | **Required.** Ollama Cloud API key |
| `VITE_OLLAMA_HOST` | `https://ollama.com` | Ollama Cloud base URL |
| `VITE_OLLAMA_MODEL` | `gpt-oss:120b-cloud` | Model name |
| `VITE_NYC_OPEN_DATA_APP_TOKEN` | — | Optional browser-visible Socrata app token for Phase 4 NYC Open Data requests |

### Streamlit (secrets or env)
Use `OLLAMA_API_KEY`, `OLLAMA_HOST`, `OLLAMA_MODEL`, and `CARTO_API_KEY`. The
Streamlit map falls back to OpenStreetMap when `CARTO_API_KEY` is not set.
The optional NYC Open Data app token is entered in the NYC Open Data tab and
is kept only in the current Streamlit session.

---

## License
MIT
