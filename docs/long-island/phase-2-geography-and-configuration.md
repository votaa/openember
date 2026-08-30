# Long Island Data Integration: Phase 2 Geography and Configuration

Status: implemented on the Long Island data-sources branch

Runtime scope: configuration and correction of existing source assumptions only

## Delivered contract

`config/jurisdiction.yaml` is the source of truth for three explicit operational geographies:

- `nassau`: Nassau County, FIPS `36059`.
- `suffolk`: Suffolk County, FIPS `36103`.
- `rockaway`: Queens Community Board 14, intentionally including Broad Channel in the initial implementation.

The regional bounding boxes are query and validation hints. County membership must ultimately be tested against the configured NYS Civil Boundaries polygons. The Rockaway filter uses the NYC 311 borough and community-board fields until a future authoritative peninsula polygon is approved.

## Source registry

The shared `source_registry` records each selected source's owner, geography, family, endpoint, format, qualification, enablement, refresh/freshness policy, attribution, and failure state. It contains no credential values.

The generated React configuration exports `REGIONS` and `SOURCE_REGISTRY`. The Streamlit configuration loader exposes the same values through `CFG.regions`, `CFG.source_registry`, `CFG.source(id)`, and `CFG.enabled_sources`.

The following controls are deliberate:

- Nassau and Suffolk county layers remain disabled and `prototype_only`.
- 511NY remains disabled and `access_required`.
- MTA feeds remain disabled until an OpenEmber server-side proxy/cache exists.
- NYHOPS remains disabled and link-only.
- Fire Island `8515186` and Bay Shore `8515102` are absent from live CO-OPS configuration.
- Kings Point and Montauk are the selected live Long Island stations; The Battery and Sandy Hook are references.
- NYC 311 is configured only for Queens Community Board 14 records with valid coordinates.
- USGS configuration identifies the selected Massapequa Creek, Peconic River, and Rosedale reference sites instead of the former statewide query. Phase 3 now supplies bounded datetime requests and normalized stale/error handling; display activation remains Phase 4 work.
- Phase 3 implemented the DEC county-spatial adapter and the NYS Civil Boundaries adapter. DEC display remains disabled until Phase 4; the boundary source is active as shared filtering infrastructure.

## Phase boundary

Phase 2 does not implement normalized adapters, shared request caching, new map overlays, transportation feeds, or assistant grounding. Those remain Phase 3 and later work. Existing direct runtime catalogs were corrected where they contradicted Phase 1, but the new source registry becomes the complete runtime authority only when adapters consume it.

The approved Phase 3 qualification and Phase 4 display scope, including the additional Rockaway operational datasets, is recorded in `docs/long-island/phase-3-4-approved-scope.md`.

## Validation

Run:

```text
npm run validate-config
npm run build
python3 -m py_compile streamlit/config_loader.py streamlit/setup_wizard.py streamlit/app.py streamlit/tidal_gauges.py
git diff --check
```

The configuration validator checks region IDs, unique source IDs, allowed geography/status values, disabled gates, the Rockaway CB14 rule, active/retired CO-OPS station membership, and YAML-to-React generated parity.
