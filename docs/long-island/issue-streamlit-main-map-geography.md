# Streamlit main-map geography regression

Status: fixed locally; commit and hosted acceptance pending.

## Reproduction and cause

A Fire/EMS layer was quick-added in Map Builder, then added separately to the main operational map through ESRI search. Selecting PSEG or operational geography in Map Builder did not constrain the main map. With other layers hidden, the main map showed points outside the selected territory.

The two maps stored separate layer objects. Builder presets and ESRI search also used different item identifiers for the same service sublayer. The main map always queried `where=1=1` without geometry and capped the nationwide response at 500 features. Filtering or counting that capped sample cannot represent the selected local inventory.

## Fix

- Share geography by resolved service sublayer URL across both map states, independently of preset aliases and portal item IDs. Adding the same source to the main map inherits its Builder selection; changing either geography selector updates both maps and their chat evidence.
- Apply widget changes in callbacks before main-map rendering and chat context assembly. Add a visible **Main map geography** selector and scope/status label above the operational map.
- Submit the authoritative WGS84 polygon/intersects parameters upstream before the 500-record browse cap. GeoJSON-to-ArcGIS-JSON fallback preserves the entire query scope. Refresh when the scope changes and revalidate periodically or on manual refresh.
- Check returned geometries against the authoritative masks. Reject an upstream response that ignores the scope; never silently display an unfiltered national sample under a local filter label.
- On failure, retain last-good records only for the exact same query and label them stale. Withhold records from a different geography. Failed main-map refreshes also make that map path's chat evidence unavailable.
- Preserve metadata-driven labels, valid empty results, and explicit browse-subset status. Native ArcGIS geometries are normalized once, eliminating the old duplicate conversion loop.

The unfiltered option remains explicit. Inventories larger than 500 matching features are labeled as a browse subset; exact chat totals continue to use independent uncapped count queries.

## Validation

- Regression tests cover preset/search identifier differences, both geography modes, source query construction and format fallback, changing/resetting filters, missing or stale masks, source responses outside the masks, same-scope failures, valid zero, the actual main-map add action, duplicate adds, callback timing, and cache invalidation.
- Live public-source validation on 2026-10-17 returned **366 PSEG Fire/EMS features** and **380 operational-geography Fire/EMS features**. Each browse matched its independent full-inventory count; zero returned points fell outside its selected authoritative boundary.
- `npm run phase4:gate` passed: 64 JavaScript tests, regional and Streamlit Python suites, production build, Python compilation, and Phase 3/4 contract checks. The two AppTest cases are skipped by the system Python (which lacks Streamlit) and were separately executed successfully with the installed application runtime.
- Actual Streamlit widget tests verify changes from either map, resetting to unfiltered, and adding a main-map widget after a Builder filter was selected. Empty/stale widget values do not replace the shared geography.
- Local browser checks confirmed that adding the main-map layer inherited PSEG and displayed 366 mapped features; selecting operational geography on the main map displayed 380. The deployed application has not been changed by this fix.

## Hosted acceptance

After the fix is committed and deployed to the production Streamlit app on `main`, repeat the user's isolated-layer view. Select PSEG in Map Builder, add Fire/EMS to the main map, and confirm 366 in-boundary features. Change to operational geography and confirm 380 in-boundary features. Change geography from the main map and verify Builder/chat follow. Exercise a failed query and confirm prior-scope points never appear beneath the new selection.
