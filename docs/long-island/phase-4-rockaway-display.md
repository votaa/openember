# Phase 4 Rockaway Display

Status: first display slice implemented

Implementation date: 2026-08-28

## Delivered in both interfaces

React/Vercel and Streamlit now expose the same five active Rockaway source cards:

1. NYC 311 service requests.
2. Active cooling centers.
3. Hurricane evacuation centers.
4. NYPD complaint incidents.
5. NYCHA public housing developments.

Each card identifies the owner, Rockaway/Queens Community Board 14 scope, data state, record count, latest observation time, retrieval time, attribution, source kind, and qualification or operational note. The current scope still includes Broad Channel.

NYC 311 uses a bounded live Socrata request for the 500 most recent qualifying records and the Phase 3 normalizer. React and Streamlit use the same limit for map browsing, and the point records have an independent map toggle. The other four cards remain visibly unavailable with their qualification gate; Phase 4 does not disguise an unresolved source as an empty or current result. FDNY historical incidents are intentionally absent; their deferred analytics option is documented in `docs/long-island/future-fdny-historical-analytics.md`.

## State and map rules

- `current`, `stale`, `partial`, `unavailable`, and `access_required` remain visibly distinct.
- Empty, malformed, and geography-rejected payloads never appear as a current zero-event condition.
- Only normalized GeoJSON point records enter the Rockaway map layer.
- Disabled or non-mappable controls show their reason rather than silently disappearing.
- Map popups use normalized title, description/category, source, observation time, and attribution fields.
- React and Streamlit source-card models are compared directly against the same fixture.

## User smoke test

React:

1. Run `npm run dev` and open the local Vite URL.
2. Confirm the `311 ROCKAWAY` control is visible in the top `MAP` control rail and toggles the points off and on.
3. Select the `ROCKAWAY` tab in the right panel.
4. Confirm all five active cards are present and that only qualified sources attempt a fetch.
5. Confirm the NYC 311 card also offers explicit `Hide from map` / `Show on map` controls and its popup identifies the source and observation time.
6. Confirm cooling centers and evacuation centers show their explicit unavailable/gate reason; activate and verify the qualified NYPD and NYCHA controls.

Streamlit:

1. Activate the OpenEmber environment and run `streamlit run streamlit/app.py` from the repository root.
2. Confirm the tidal gauges and operational map appear before any Rockaway source cards.
3. Select the `NYC Open Data` tab and confirm the five active Rockaway cards appear there.
4. Confirm unavailable or non-mappable sources have disabled `Not map-ready` controls.
5. Add or remove NYC 311 from the map and verify its marker count and popup information agree with React after both interfaces refresh.

## Remaining Phase 4 work

The CB14 boundary/spatial adapter and shared NYPD/NYCHA normalization contracts are implemented. Phase 4 must fetch the CB14 mask before those sources, pass the normalized mask into their adapters, and activate equivalent cards and map controls in React and Streamlit. Cooling centers still require a stable machine-readable activation contract. Hurricane evacuation centers still require approved empty-result and activation semantics.

Regional boundary infrastructure also remains incomplete. Phase 3 must activate
and validate the configured NYS Civil Boundaries adapter for Nassau, Suffolk,
and Queens and qualify the NYS DPS electric-utility territory dataset before
Phase 4 exposes county and utility-responsibility overlays. Map Builder will
then provide **Limit to operational geography** and **Limit to PSEG Long Island
territory** modes for supported Feature Layers. The shared filter applies after
**Add to Map** to layers added through ESRI/Living Atlas search, Living Atlas
quick-adds, or pasted Feature Service URLs; it does not narrow catalog search
results or generically clip Map Services, imagery, or vector tiles. The broader
operational mode must retain hospitals, fire/EMS stations, and other assets in
Freeport, Rockville Centre, Greenport, and Fishers Island, while the PSEG mode
may exclude them as non-PSEG territory. The authoritative source contract,
work split, acceptance criteria, and Queens-versus-Rockaway caveat are maintained in
`docs/long-island/phase-3-4-approved-scope.md`.

Rockaway 311 historical totals and electricity-hazard classification remain future enhancements. Questions such as incident counts by complaint type, ZIP, month, or date range must use separate server-side aggregate Socrata queries across the complete requested period. The application must disclose source coverage and must never derive historical totals from the 500-record map-browsing window. The proposed electricity-focused classification and validation rules are tracked in `docs/long-island/future-nyc-311-electric-hazards.md`.
