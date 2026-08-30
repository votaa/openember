# Phase 4 Rockaway and Regional Display

Status: source display activation implemented; Map Builder geography-mode parity remains

Implementation date: 2026-08-30

## Delivered in both interfaces

React/Vercel and Streamlit now expose the same five Rockaway source
dispositions:

1. NYC 311 service requests.
2. Cooling centers, visibly gated pending a stable machine-readable contract.
3. Hurricane evacuation centers.
4. NYPD complaint incidents.
5. NYCHA public housing developments.

Each card identifies the owner, Rockaway/Queens Community Board 14 scope, data
state, record and mapped counts, latest observation time, retrieval time,
attribution, source kind, rejection count, and qualification or operational
note. The current scope still includes Broad Channel.

NYC 311 and NYPD each use bounded 500-record map-browsing requests. NYCHA,
hurricane evacuation centers, NOAA CO-OPS, USGS gauge height, NYS DEC Active
Sites, CB14, county boundaries, and electric-utility responsibility territories
are active through the shared Phase 4 coordinator. It fetches authoritative
geometry masks before spatially dependent records. Cooling centers remain
visibly gated. FDNY historical incidents are intentionally absent; their
deferred analytics option is documented in
`docs/long-island/future-fdny-historical-analytics.md`.

React provides a single `SOURCES` panel grouped into Rockaway, regional
observations/inventories, and operational boundaries. Streamlit keeps Rockaway
cards under `NYC Open Data`, after the tidal gauges and operational map, and
provides the other cards under `Regional Sources`.

## State and map rules

- `current`, `stale`, `partial`, `unavailable`, and `access_required` remain
  visibly distinct.
- Empty, malformed, stale, and geography-rejected payloads never appear as a
  current zero-event condition.
- Normalized point, line, polygon, and multipolygon records render without
  inventing missing locations.
- Disabled or non-mappable controls show their reason rather than silently
  disappearing.
- Map popups use normalized title, description/category, source, observation or
  retrieval time, and attribution fields.
- React and Streamlit source-card models are compared directly against the same
  fixture.

## Live validation

The 2026-08-30 validation returned:

- 500 Rockaway NYC 311 records and 500 Rockaway NYPD records.
- Five in-scope NYCHA development polygons; 16 citywide features were rejected.
- No published CB14 hurricane evacuation-center reference facilities. The card
  reports `partial` and `confirmation_required`, not zero active centers.
- One current observation from each of the four NOAA stations.
- One observation from each USGS site. All three were visibly stale at the
  validation instant rather than being hidden.
- 241 validated DEC sites with one spatially inconsistent feature rejected.
- One CB14 boundary, three county boundaries, and five electric-utility
  territories.

## User smoke test

React:

1. Run `npm run dev` and open the local Vite URL.
2. Confirm the `311 ROCKAWAY` control toggles its points.
3. Select the `SOURCES` tab.
4. Confirm the four active Rockaway sources and one gated cooling-center card
   are followed by regional observations and boundary overlays.
5. Add and remove NYPD and NYCHA to verify point and polygon rendering.
6. Add one NOAA/USGS/DEC source and one boundary overlay. Confirm the button
   changes between `Show on map` and `Hide from map`.

Streamlit:

1. Activate the OpenEmber environment and run
   `streamlit run streamlit/app.py` from the repository root.
2. Confirm tidal gauges and the operational map appear before Rockaway cards.
3. Select `NYC Open Data` and confirm the five Rockaway source dispositions.
4. Confirm unavailable or non-mappable sources have disabled `Not map-ready`
   controls.
5. Select `Regional Sources`; add one point source and one boundary source.
6. Confirm the corresponding controls change to `Remove from Map` and the
   popups agree with React after both interfaces refresh.

## Completion gate

Run:

```text
npm run phase4:gate
```

The gate includes Phase 3 qualification checks, React/Streamlit card parity,
mask-before-dependent-source orchestration, state and map presentation
contracts, Streamlit regression tests, a production build, Python compilation,
and diff-format checks.

## Remaining Phase 4 work

The remaining Map Builder slice must provide **Limit to operational geography**
and **Limit to PSEG Long Island territory** modes for supported Feature Layers.
The shared filter applies after **Add to Map** to layers added through
ESRI/Living Atlas search, Living Atlas quick-adds, or pasted Feature Service
URLs; it does not narrow catalog search results or generically clip Map
Services, imagery, or vector tiles.

React Living Atlas search still needs `Add to Map` parity with Streamlit as part
of that remaining slice. The broader operational mode must retain hospitals,
fire/EMS stations, and other assets in Freeport, Rockville Centre, Greenport,
and Fishers Island, while the PSEG mode may exclude them as non-PSEG territory.
The authoritative source contract, acceptance criteria, and
Queens-versus-Rockaway caveat remain in
`docs/long-island/phase-3-4-approved-scope.md`.

Rockaway 311 historical totals and electricity-hazard classification remain
future enhancements. Questions such as incident counts by complaint type, ZIP,
month, or date range must use separate server-side aggregate Socrata queries
across the complete requested period. The application must never derive
historical totals from the 500-record map-browsing window. The proposed rules
are tracked in `docs/long-island/future-nyc-311-electric-hazards.md`.
