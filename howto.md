# How to Fork and Deploy EMBER for Your Municipality

**EMBER** (Emergency Management Body of Evidence & Resources) is an open-source AI situational awareness tool for emergency managers. It connects live NOAA weather feeds, tidal gauges, FEMA data, USGS stream gauges, and your local open data portal to a conversational AI interface — all on a dark operational map. It is designed to be forked and configured for any municipality in under 30 minutes.

This guide walks you through forking the repository, configuring it for your jurisdiction, and deploying it live on Vercel (free) and Streamlit Cloud (free).

---

## What You Will End Up With

- A live web app at `your-city.vercel.app` with:
  - An interactive Leaflet map centered on your jurisdiction
  - Live NOAA weather alerts, forecasts, and tidal gauges for your area
  - An AI chat interface that knows your flood zones, evacuation routes, and emergency contacts
  - A Settings panel where non-technical users can update the jurisdiction config directly in the browser
- A Streamlit version at `your-app.streamlit.app` with the full feature set including a guided Setup Wizard

---

## Prerequisites

You will need:

- A **GitHub account** — [github.com/signup](https://github.com/signup)
- A **Vercel account** — [vercel.com/signup](https://vercel.com/signup) (free, sign in with GitHub)
- A **Streamlit Cloud account** — [share.streamlit.io](https://share.streamlit.io) (free, sign in with GitHub)
- An **Ollama Cloud API key** — [ollama.com/settings/keys](https://ollama.com/settings/keys) (free)
- **Git** installed on your computer — [git-scm.com](https://git-scm.com)
- **Node.js 18+** installed — [nodejs.org](https://nodejs.org) (only needed if running locally)

---

## Part 1 — Fork the Repository

### Step 1: Fork on GitHub

1. Go to **[github.com/rmkenv/openember](https://github.com/rmkenv/openember)**
2. Click the **Fork** button in the top-right corner
3. Under "Owner," select your GitHub account
4. Leave the repository name as `openember` (or rename it to something like `ember-yourtown`)
5. Click **Create fork**

You now have your own copy of the repository at `github.com/YOUR_USERNAME/openember`.

### Step 2: Clone It to Your Computer

Open a terminal and run:

```bash
git clone https://github.com/YOUR_USERNAME/openember.git
cd openember
```

Replace `YOUR_USERNAME` with your actual GitHub username.

### Step 3: Install Dependencies

```bash
npm install
```

This installs the React/Vite build tools. It takes about 30 seconds.

---

## Part 2 — Get Your Ollama Cloud API Key

1. Go to **[ollama.com/settings/keys](https://ollama.com/settings/keys)**
2. Sign in or create a free account
3. Click **Generate new key**
4. Copy the key — it starts with `sk-` and looks like `sk-abc123...`

Keep this key private. You will add it to Vercel and Streamlit Cloud as an environment variable — never paste it directly into code files.

---

## Part 3 — Configure for Your Jurisdiction

There are two ways to configure EMBER for your city: editing the YAML file directly, or using the in-app Settings panel after deployment. Start with the YAML for the initial setup.

### Option A: Edit `config/jurisdiction.yaml`

Open `config/jurisdiction.yaml` in any text editor. Change these fields:

```yaml
jurisdiction:
  name: "City of Virginia Beach"    # Your jurisdiction's full name
  short_name: "VB"                  # Abbreviation used in headers
  state: "VA"                       # Two-letter state code
  center_lat: 36.8529               # Map center latitude
  center_lng: -75.9780              # Map center longitude
  zoom_default: 11                  # Map zoom level (8=regional, 12=neighborhood)
```

**Find your coordinates:**
Go to [maps.google.com](https://maps.google.com), right-click your city center, and click the coordinates at the top of the context menu. The first number is latitude, the second is longitude.

**NWS configuration** — run this in your terminal to auto-discover your NWS office:

```bash
curl "https://api.weather.gov/points/36.8529,-75.9780"
```

Replace the coordinates with your city center. Look for `cwa`, `gridX`, and `gridY` in the response. Then update the YAML:

```yaml
nws:
  office: "AKQ"          # The "cwa" value from the API response
  grid_x: 57             # The "gridX" value
  grid_y: 29             # The "gridY" value
```

**CO-OPS tidal gauges** — find your nearest stations at [tidesandcurrents.noaa.gov/map](https://tidesandcurrents.noaa.gov/map/). Click a station to get its ID (a 7-digit number). Update the YAML:

```yaml
coops_stations:
  - id: "8638610"
    name: "Sewells Point"
    lat: 36.9467
    lng: -76.3300
    is_primary: true
    flood_thresholds:
      action: 4.0
      minor: 4.5
      moderate: 5.5
      major: 7.0
```

**Knowledge base text** — replace the NYC-specific text with your jurisdiction's information:

```yaml
knowledge_base:
  flood_zones: |
    Zone AE: Chesapeake Bay shoreline, oceanfront, Back Bay watershed.
    Zone VE: Oceanfront with wave action — Atlantic Ave corridor.
    Major events: Hurricane Isabel 2003 (8ft surge).

  evac_zones: |
    Zone A: Mandatory evacuation for all tropical storms.
    Zone B: Evacuation advised for Category 1+.
    Primary shelters: Kempsville High School, Green Run High School.

  critical_infrastructure: |
    Hospitals: Sentara Virginia Beach General (Level 2), Sentara Princess Anne.
    Power: Dominion Energy Oceana and Courthouse substations.

  hazard_profiles: |
    HURRICANES: Primary threat. City is highly exposed to storm surge.
    NOR'EASTERS: Regular flooding in Resort Area and Chic's Beach.
    EXTREME HEAT: Heat index regularly exceeds 100°F in summer.

  resources: |
    VB Emergency Management: 757-385-1952 | vbgov.com/emergency
    FDNY: 911 | VB Police: 757-385-5000
    NWS Wakefield (AKQ): 757-899-4200
```

**Map points** — replace the NYC hospitals, shelters, and EOC locations with your own:

```yaml
map_points:
  hospitals:
    color: "#f87171"
    icon: "🏥"
    label: "Hospitals"
    features:
      - name: "Sentara Virginia Beach General"
        lat: 36.8012
        lng: -76.0099
        note: "Level 2 Trauma | 276 beds"
      - name: "Sentara Princess Anne Hospital"
        lat: 36.7285
        lng: -76.0600
        note: "176 beds | Southern VB"
```

**Open data portal** — find your city's Socrata open data domain. Most US cities use a standard domain format:

```yaml
socrata:
  domain: "data.virginiabeach.gov"
```

If you are not sure whether your city has a Socrata portal, search at [opendatanetwork.com](https://opendatanetwork.com).

**Branding** — customize the app title and accent color:

```yaml
branding:
  app_title: "EMBER"
  jurisdiction_line: "VIRGINIA BEACH JURISDICTION"
  primary_color: "#1d4e89"     # Hex color for accent elements
  logo_emoji: "🚨"
```

### Option B: Use the In-App Settings Panel

If you prefer not to edit files, deploy the app first (Part 4), then open it in a browser and click the **⚙️ Settings** tab. All the same fields are available through a graphical interface. Changes are saved to your browser's localStorage and apply immediately without any redeploy.

---

## Part 4 — Deploy to Vercel (React App)

Vercel is a free hosting platform that auto-deploys from GitHub. Every time you push code changes, Vercel rebuilds and redeploys automatically.

### Step 1: Connect GitHub to Vercel

1. Go to **[vercel.com](https://vercel.com)** and sign in with GitHub
2. Click **Add New → Project**
3. Find `openember` in the repository list and click **Import**
4. Vercel will auto-detect it as a Vite project
5. Leave all settings at their defaults
6. Click **Deploy** — this first deploy will show only the map (no AI yet, because the API key is not set yet)

### Step 2: Add Environment Variables

1. In the Vercel dashboard, click your project
2. Go to **Settings → Environment Variables**
3. Add each of these three variables:

| Name | Value |
|------|-------|
| `OLLAMA_API_KEY` | `sk-your_key_here` |
| `OLLAMA_HOST` | `https://ollama.com` |
| `OLLAMA_MODEL` | `gpt-oss:120b-cloud` |

4. Click **Save** on each one

### Step 3: Redeploy

1. Go to **Deployments** tab in your Vercel project
2. Click the three dots `...` next to the latest deployment
3. Click **Redeploy**

Your app is now live at `https://openember-YOUR_USERNAME.vercel.app`. The URL will be shown at the top of the Vercel dashboard.

### Step 4: Push Your Config Changes

If you edited `config/jurisdiction.yaml` in Step 3, push the changes to GitHub so Vercel picks them up:

```bash
git add config/jurisdiction.yaml
git commit -m "Configure for Virginia Beach jurisdiction"
git push origin main
```

Vercel detects the push and automatically rebuilds. You can watch the build progress in the Vercel dashboard under Deployments.

---

## Part 5 — Deploy to Streamlit Cloud (Python App)

The Streamlit version has more features: tidal gauges with flood stage indicators, the full 23-endpoint NOAA stack, NYC Open Data integration, ESRI Living Atlas search, the Map Builder, and the full Setup Wizard.

### Step 1: Go to Streamlit Cloud

1. Go to **[share.streamlit.io](https://share.streamlit.io)**
2. Sign in with GitHub
3. Click **New app**

### Step 2: Connect Your Repository

Fill in the form:

- **Repository:** `YOUR_USERNAME/openember`
- **Branch:** `main`
- **Main file path:** `streamlit/app.py`

### Step 3: Add Secrets

Click **Advanced settings** before deploying. In the **Secrets** section, paste:

```toml
OLLAMA_API_KEY = "sk-your_key_here"
OLLAMA_HOST    = "https://ollama.com"
OLLAMA_MODEL   = "gpt-oss:120b-cloud"
CARTO_API_KEY  = "your_carto_key_here"
```

Click **Save**, then **Deploy**.

Streamlit Cloud builds the environment, installs dependencies from `streamlit/requirements.txt`, and starts the app. The first build takes 2–3 minutes.

### Step 4: Use the Setup Wizard

Once deployed, open your Streamlit app and click the **⚙️ Setup** tab. The wizard guides you through:

1. **Basic Info** — name, state, coordinates
2. **NWS** — click "Auto-Discover" and it queries the NWS API to fill in your office code and grid coordinates
3. **CO-OPS** — click "Auto-Discover" and it fetches all tidal gauges in your bounding box
4. **Knowledge Base** — paste in your jurisdiction's flood zones, evacuation routes, contacts
5. **Map Points** — add hospitals, shelters, EOC locations, flood risk areas
6. **Open Data** — set your Socrata domain
7. **Branding** — set title, color, and emoji

Click **Save Configuration** and the app reloads with your jurisdiction active.

---

## Part 6 — Updating Your Deployment

### Updating the Jurisdiction Config

**On Vercel:** Edit `config/jurisdiction.yaml`, commit, and push. Vercel rebuilds automatically in about 60 seconds.

**On Streamlit Cloud:** Use the ⚙️ Setup Wizard — changes take effect immediately on save.

**In the browser (Vercel app):** Use the ⚙️ Settings tab — saves to localStorage, no redeploy needed.

### Updating the Code

When the upstream repository (`rmkenv/openember`) receives updates, you can pull them into your fork:

```bash
# Add the upstream remote (one-time setup)
git remote add upstream https://github.com/rmkenv/openember.git

# Pull updates from upstream
git fetch upstream
git merge upstream/main

# Push to your fork
git push origin main
```

Vercel and Streamlit Cloud will auto-deploy the updated code.

---

## Troubleshooting

### "Failed to fetch" when sending a query on Vercel
The `OLLAMA_API_KEY` environment variable is not set. Go to Vercel → Settings → Environment Variables and add it, then redeploy.

### Black screen on Vercel
Open the browser console (F12 → Console). Copy the red error message and check whether it mentions a specific file or import. Usually caused by a bad config value in `jurisdiction.yaml` — check that all required fields are present.

### "ModuleNotFoundError: No module named 'yaml'" on Streamlit
`pyyaml` is missing. Open `streamlit/requirements.txt` and verify `pyyaml>=6.0` is listed. If not, add it, commit, and push.

### "StreamlitDuplicateElementKey" on Streamlit
Two widgets share the same key. This is a bug in older versions of the code — make sure you have the latest version by pulling from upstream.

### NWS auto-discover returns no results
The `api.weather.gov/points/` endpoint occasionally returns 500 errors. Wait 60 seconds and try again. Alternatively, find your values manually at [https://api.weather.gov/points/YOUR_LAT,YOUR_LNG](https://api.weather.gov/points/).

### No tidal gauges appear on the Streamlit map
The CO-OPS API may not have stations in your bounding box, or the stations lack lat/lng coordinates in the metadata. Try widening your bounding box in `jurisdiction.yaml` (increase bbox_north and bbox_south by 0.5 degrees each).

---

## Repository Structure

```
openember/
├── api/
│   └── chat.js                  # Vercel serverless proxy for Ollama (fixes CORS)
├── config/
│   ├── jurisdiction.yaml        # Active jurisdiction config — edit this
│   └── jurisdiction.example.yaml # Blank template with all fields documented
├── scripts/
│   └── build-config.js          # Converts jurisdiction.yaml → src/config/jurisdiction.js
├── src/                         # React/Vite app (→ Vercel)
│   ├── App.jsx                  # Main app — all components inline, no import cascade
│   ├── config/
│   │   └── jurisdiction.js      # Auto-generated from YAML at build time
│   └── main.jsx                 # Entry point with ErrorBoundary
├── streamlit/                   # Python/Streamlit app (→ Streamlit Cloud)
│   ├── app.py                   # Main Streamlit app (~2200 lines)
│   ├── config_loader.py         # Reads jurisdiction.yaml, provides typed accessors
│   ├── setup_wizard.py          # 7-step configuration UI
│   ├── tidal_gauges.py          # CO-OPS live gauge client
│   └── requirements.txt         # Python dependencies
├── vite.config.js               # Vite config — runs build-config.js before every build
├── vercel.json                  # Vercel build and routing config
└── package.json                 # npm scripts including prebuild hook
```

---

## Data Sources

All data sources used by EMBER are free and require no API key:

| Source | What It Provides |
|--------|-----------------|
| [NWS api.weather.gov](https://api.weather.gov) | Active alerts, 7-day forecast, hourly forecast, surface observations, gridpoint wind and precipitation |
| [NOAA CO-OPS](https://tidesandcurrents.noaa.gov/api/) | Real-time water levels, tidal predictions, wind at gauge stations |
| [USGS WaterServices](https://waterservices.usgs.gov) | Stream gauge heights across all US states |
| [FEMA OpenData](https://www.fema.gov/about/openfema/data-sets) | Disaster declarations, NFIP claims |
| [SPC](https://www.spc.noaa.gov) | Tornado and severe thunderstorm watches, convective outlook |
| [SWPC](https://services.swpc.noaa.gov) | Space weather alerts, Kp index |
| [Iowa State MESONET](https://mesonet.agron.iastate.edu) | NEXRAD radar tiles |
| [ArcGIS Online](https://www.arcgis.com) | Public feature layers, Living Atlas datasets |
| [Socrata SODA API](https://dev.socrata.com) | City-specific open data (311, incidents, facilities) |

The AI backend uses **Ollama Cloud** (`gpt-oss:120b-cloud`). A free account includes sufficient quota for typical emergency management use. See [ollama.com/pricing](https://ollama.com/pricing) for details.

---

## License

MIT — fork freely, adapt for your jurisdiction, and if you build something useful, consider opening a pull request back to the upstream repository.
