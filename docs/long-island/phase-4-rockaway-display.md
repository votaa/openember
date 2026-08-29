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
6. Confirm cooling centers, evacuation centers, NYPD, and NYCHA show their explicit unavailable/gate reason.

Streamlit:

1. Activate the OpenEmber environment and run `streamlit run streamlit/app.py` from the repository root.
2. Confirm the tidal gauges and operational map appear before any Rockaway source cards.
3. Select the `NYC Open Data` tab and confirm the five active Rockaway cards appear there.
4. Confirm unavailable or non-mappable sources have disabled `Not map-ready` controls.
5. Add or remove NYC 311 from the map and verify its marker count and popup information agree with React after both interfaces refresh.

## Remaining Phase 4 work

The CB14 boundary/spatial adapter is still required before NYPD and NYCHA can become mappable. Cooling centers require a stable machine-readable activation contract. Hurricane evacuation centers require approved empty-result and activation semantics. Once those Phase 3 gates are resolved, their existing Phase 4 cards and controls can consume the newly normalized records without a separate interface-specific contract.

Rockaway 311 historical totals remain a future enhancement. Questions such as incident counts by complaint type, ZIP, month, or date range must use separate server-side aggregate Socrata queries across the complete requested period. The application must disclose source coverage and must never derive historical totals from the 500-record map-browsing window.
