# Long Island Data Integration: Phase 1 Source Catalog

Status: Phase 1 complete; implementation gates recorded

Qualification date: 2026-08-28

Runtime changes in this phase: none

## Phase boundary

Phase 1 inventories the current OpenEmber data dependencies, assigns a disposition to each source, and qualifies candidate sources before adapters or UI layers are implemented. The companion fixture manifest at `fixtures/long-island-sources/phase-1-samples.json` contains one bounded, synthetic sample for every candidate source family. Bounded responses captured from accessible authoritative endpoints are in `fixtures/long-island-sources/phase-1-authoritative-samples.json`. Synthetic fixtures are contract-development aids, not evidence that a feed is currently available.

The geographic contract for later phases is:

- `nassau`: Nassau County only.
- `suffolk`: Suffolk County only.
- `rockaway`: initially implemented with Queens Community Board 14, covering the entire Rockaway Peninsula plus Broad Channel. Peninsula-only filtering is a tracked future enhancement.
- `regional`: a source whose documented coverage spans two or more of those regions.
- A citywide, statewide, or national response must be spatially filtered before it can be described as a Long Island condition.

## Disposition vocabulary

- `retain`: the authority and feed family remain appropriate.
- `replace`: remove the current endpoint or assumption in favor of the qualified source.
- `scope-to-rockaway`: retain only with explicit Queens/Rockaway filtering and labeling.
- `regionalize`: retain the source family but replace NYC/statewide defaults with bounded Long Island queries or stations.
- `retire`: remove from the Long Island runtime unless a later, documented operational need is approved.
- `gate`: do not enable until the listed access, terms, or reliability requirement is resolved.

## Current-source inventory

| Current dependency | Code locations | Current scope | Disposition | Phase 1 finding |
|---|---|---:|---|---|
| NYC static knowledge and map points | `src/data/nyc.js`; fallbacks in `src/App.jsx` and `streamlit/app.py` | NYC-wide | replace / scope-to-rockaway | The active YAML is Long Island-specific, but NYC-wide fallbacks can reappear when configuration is missing. Preserve only explicitly Rockaway-relevant facts. |
| NWS API | `src/data/noaa.js`, `src/App.jsx`, `src/components/MapPanel.jsx`, `streamlit/app.py` | NY/OKX with several NYC grid defaults | regionalize | NWS/OKX remains authoritative. Resolve forecast grids from configured points and use Nassau, Suffolk, and Queens zones/stations rather than labels such as "NYC forecast." |
| NOAA CO-OPS | `src/data/noaa.js`, `src/App.jsx`, `streamlit/app.py`, `streamlit/tidal_gauges.py`, `config/jurisdiction.yaml` | Long Island plus Battery/Sandy Hook references | retain / regionalize | Preserve station ID, datum, units, time zone, observation timestamp, quality flags, and product-specific request limits. Battery and Sandy Hook are references, not Long Island primary stations. |
| NOAA NCEI | `src/data/noaa.js`, `streamlit/app.py` | Central Park/JFK-heavy | regionalize | Retain historical climate authority; prioritize configured Long Island airport stations and bound searches to the regional envelope. |
| USGS instantaneous values | `src/data/nyc.js`, `src/data/longisland.js`, `src/App.jsx`, `streamlit/app.py` | all active New York sites | replace / regionalize | The statewide legacy NWIS query is too broad. Prototype against the current Water Data OGC API with bounded sites/coordinates and explicit parameter codes. |
| FEMA Open API | `src/data/nyc.js`, `src/data/longisland.js`, `src/App.jsx`, `streamlit/app.py` | New York State declarations | retain | Statewide declarations are reference context, not evidence of a local impact. Apply county/designated-area interpretation before regional claims. |
| NYC 311 Socrata | `src/data/nyc.js`, `src/data/longisland.js`; configurable Socrata paths in React and Streamlit | currently unfiltered citywide | scope-to-rockaway | Never request "latest five citywide" for Long Island context. Require Queens plus approved Rockaway community-board, ZIP, or polygon filtering; reject records without usable geography. |
| NYC Open Data catalog/runtime browser | `src/App.jsx`, `streamlit/app.py`, `streamlit/setup_wizard.py` | NYC-wide | scope-to-rockaway | Catalog discovery may remain available, but datasets cannot be enabled regionally without a documented Rockaway use and spatial filter. |
| ArcGIS Online/Living Atlas search and configured public layers | `src/data/esri.js`, `src/App.jsx`, `src/components/ESRIPanel.jsx`, `streamlit/app.py`, `config/jurisdiction.yaml` | global/national | retain / regionalize | Retain discovery and national reference layers. Record item owner, item ID, service URL, update date, extent, layer ID, attribution, and availability before enabling an item. |
| NOAA SPC and SWPC | `src/data/noaa.js`, `src/App.jsx`, `streamlit/app.py` | national/state alert context | retain | These are regional awareness sources; they are not substitutes for locally scoped NWS alerts or observations. |
| Iowa Environmental Mesonet radar tiles | `src/App.jsx`, `src/components/MapPanel.jsx`, `streamlit/app.py` | regional radar mosaic | retain | Keep as a visualization dependency with attribution; do not turn image tiles into asserted incident facts. |
| CARTO/OpenStreetMap basemap | `src/App.jsx`, `src/components/MapPanel.jsx`, `streamlit/app.py` | global | retain | Basemap only. Preserve required attribution. |
| Hard-coded MTA endpoint | `src/data/longisland.js` | LIRR GTFS-RT | retain / move server-side | The existing LIRR URL is still published by MTA and returned HTTP 200 on 2026-08-28. MTA terms prohibit an app from redistributing directly from MTA servers, so later implementation requires a non-MTA proxy/cache, protobuf decoding, and lag disclosure. |

## Candidate-source qualification

| Candidate ID | Authority and endpoint | Geography | Format / access | Qualification | Initial failure policy |
|---|---|---|---|---|---|
| `nyc_311_rockaway` | NYC 311, dataset `erm2-nwe9` via NYC Open Data/Socrata | Rockaway only after filtering | JSON/GeoJSON; anonymous calls are more heavily throttled, app token recommended | qualified for prototype | unavailable if filter cannot be applied; never fall back to citywide rows |
| `nassau_arcgis` | Nassau County GIS REST: `https://gis.nassaucountyny.gov/server/rest/services` | Nassau | ArcGIS MapServer/FeatureServer; public directory exposes JSON and some GeoJSON query support | qualified for discovery and prototype; layer-level attribution/licensing review still required | cache last valid response; label stale/unavailable; no third-party substitute |
| `suffolk_arcgis` | Suffolk County GIS REST: `https://gis.suffolkcountyny.gov/hosted/rest/services` | Suffolk | ArcGIS FeatureServer/MapServer; public JSON REST | qualified for discovery and prototype; approve individual operational layers, not the directory wholesale | cache last valid response; label stale/unavailable |
| `noaa_coops` | NOAA CO-OPS Data API and Metadata API | regional stations | JSON/XML/CSV; no key; product-dependent request limits | qualified with exact active/reference stations | preserve last valid observation with age and quality; never relabel prediction as observation |
| `usgs_waterdata` | USGS Water Data OGC API, `https://api.waterdata.usgs.gov/ogcapi/v0` | regional after county/site filter | OGC API JSON; no key identified | qualified with Nassau and Suffolk sites; no direct Rockaway site selected | stale/unavailable state with observation timestamp; do not show statewide fallback |
| `nys_dec_arcgis` | NYS DEC ArcGIS services, `https://gisservices.dec.ny.gov/arcgis/rest/services` | regional after spatial filter | ArcGIS MapServer; public JSON/GeoJSON on qualifying layers | qualified for prototype; choose layers individually and carry DEC disclaimer | cache static/slow-changing layers; identify service/layer failures separately |
| `nys_gis` | NYS GIS Clearinghouse Search API and current NYS Civil Boundaries FeatureServer | regional | OGC API Records plus ArcGIS FeatureServer; public | qualified for regional boundary geometry and discovery | resolve services through catalog/config; disable retired URLs rather than silently substituting |
| `511ny` | 511NY developer REST API | regional after event geometry filter | JSON/XML; account and developer key; 10 calls/60 seconds; access agreement required | gated pending approved account, key storage, intended-use submission, and terms acceptance | disabled by default; expose `access_required`, never an empty/current state |
| `mta_gtfs_rt` | MTA LIRR GTFS-RT, A/C/E GTFS-RT, and LIRR alerts JSON feeds | LIRR regional; A train/Rockaway for subway | GTFS-RT protobuf and JSON; no key observed for selected feeds; terms apply | qualified for server-side proxy/cache design | non-MTA server retrieval; disclose lag over one minute; stale/unavailable with feed timestamp |
| `nyhops` | Stevens NYHOPS maritime forecast site | candidate regional forecast/reference | Interactive forecast pages; no stable documented public JSON contract or redistribution grant found | gated | disabled by default; link-only reference until machine-readable access and terms are approved |

## Sources not selected as primary live feeds

- Nassau data on the Equator third-party portal remains useful for discovering downloadable GIS formats, but the newly verified Nassau County ArcGIS server is the preferred prototype source. Equator is not an operational fallback.
- A generic ArcGIS Online search result is not automatically authoritative. County, state, federal, or clearly documented owner provenance is required.
- NYC crime and other citywide civic feeds are retired from the Long Island bundle unless a separate Rockaway-specific operational requirement is approved. That approval was subsequently granted for Rockaway-scoped cooling centers, hurricane evacuation centers, NYPD incidents, and NYCHA housing developments. They remain unqualified candidates until Phase 3 verifies their current datasets, fields, geographic filters, freshness, and attribution as documented in `docs/long-island/phase-3-4-approved-scope.md`. FDNY historical incidents were later removed from active scope; a coverage-aware aggregate option is retained only as a future enhancement.

## Access, terms, and freshness notes

- NOAA CO-OPS limits request length by interval; for example, 6-minute data is limited to one month per request. Adapters must request bounded windows.
- NYC Open Data allows public use but disclaims completeness, accuracy, and fitness. Socrata app tokens should be stored outside browser bundles if introduced.
- 511NY requires a registered developer key, throttles at 10 calls per 60 seconds, and requires agreement to NYSDOT's developer terms. The source stays disabled in Phase 1.
- MTA publishes static GTFS and GTFS-RT for subway, rail, and alerts subject to its terms. The current developer page explicitly requires a key for Bus Time, not for the listed subway/rail/alerts feeds; implementation must recheck the exact selected endpoints.
- DEC data is provided as a public service, as-is, and may change. That disclaimer must remain visible in source metadata.
- NYS GIS is migrating services to GeoHub in 2026 and states that service URLs will change. Later source configuration must not hard-code a legacy endpoint without a migration check.
- County ArcGIS directories prove technical availability, not blanket permission or operational reliability. Each selected layer still needs owner, update cadence, attribution, terms, and an outage test.

## Exact Phase 1 source set

The following endpoints and layers are approved for adapter/fixture design. “Prototype-only” means the technical contract is qualified but production enablement is gated.

| Source | Exact endpoint or layer | Selected use | Status |
|---|---|---|---|
| NYC 311 | `https://data.cityofnewyork.us/resource/erm2-nwe9.json` | Rockaway civic incidents using `borough = 'QUEENS'` and `community_board = '14 QUEENS'`, plus valid coordinates | qualified; CB14 intentionally includes Broad Channel for the initial implementation; app token recommended for sustained use |
| Nassau County GIS | `Hosted/My_Nassau/FeatureServer/5` (`Nassau_Town_Cities`) | Nassau town/city boundary polygons | prototype-only; public query works, but layer metadata has blank copyright and no update cadence |
| Suffolk County GIS | `Hosted/FRES_Evacuation_Zones_Final/FeatureServer/0..9` | town-specific evacuation-zone polygons | prototype-only; public query works, but service metadata has blank description/copyright and no update cadence |
| Suffolk County GIS | `Hosted/100YR_Flood/FeatureServer/0` | FEMA-derived flood-zone polygons | prototype-only; preserve `source_cit`, datum, and units; county metadata does not establish a refresh cadence |
| NOAA CO-OPS | station `8516945` Kings Point | primary western/north-shore live water level | qualified and active on 2026-08-28 |
| NOAA CO-OPS | station `8510560` Montauk | primary eastern live water level | qualified and active on 2026-08-28 |
| NOAA CO-OPS | stations `8518750` The Battery and `8531680` Sandy Hook | western/outer-harbor references | qualified references; never label as Long Island stations |
| NOAA CO-OPS | stations `8515186` Fire Island and `8515102` Bay Shore | current app requests | retire as live-water-level endpoints; both returned no current water-level product and were absent from the active regional station inventory on 2026-08-28 |
| USGS Water Data | `USGS-01309500`, Massapequa Creek at Massapequa | Nassau water level (`00065`) | qualified; recent provisional observations verified |
| USGS Water Data | `USGS-01304500`, Peconic River at Riverhead | Suffolk water level (`00065`) | qualified; recent provisional observations verified |
| USGS Water Data | `USGS-01311810`, Conselyeas Pond Tributary at Rosedale | Queens/Nassau-border reference | qualified reference only; it is not on the Rockaway Peninsula |
| NYS DEC | `dil/dil_clean_up/MapServer/2` (`Active Sites`) | active environmental cleanup sites filtered to Nassau/Suffolk | qualified; carry DEC as-is disclaimer and detail URL |
| NYS GIS | catalog item `074d3456e5664f5e85d0fb251d05cc5b`, `NYS_Civil_Boundaries/FeatureServer/2` | Nassau, Suffolk, and Queens county polygons | qualified; March 2026 publication, public service, NYS ITS attribution/disclaimer required |
| 511NY | `https://www.511ny.org/api/getevents?key={key}&format=json` | traffic incidents, roadwork, closures | gated pending approved key and access agreement; filter `CountyName` and coordinates |
| MTA | `.../lirr%2Fgtfs-lirr` | LIRR realtime | qualified for non-MTA proxy/cache |
| MTA | `.../nyct%2Fgtfs-ace` | A train/Rockaway realtime | qualified for non-MTA proxy/cache and route/stop filtering |
| MTA | `.../camsys%2Flirr-alerts.json` | LIRR alerts | qualified for non-MTA proxy/cache; public JSON contract captured |
| NYHOPS | interactive maritime forecast site only | forecast/reference | gated; no approved stable machine-readable contract |

Detailed source-to-normalized-field mappings are documented in `docs/long-island/phase-1-field-mappings.md`.

## Tracked future enhancements

- Add an authoritative Rockaway Peninsula boundary polygon and exclude Broad Channel from NYC 311 results through a point-in-polygon check. The initial implementation intentionally accepts all valid Queens Community Board 14 records so peninsula-wide coverage can ship without a premature custom boundary.

## Evidence links

- [Nassau County ArcGIS REST directory](https://gis.nassaucountyny.gov/server/rest/services)
- [Suffolk County ArcGIS REST directory](https://gis.suffolkcountyny.gov/hosted/rest/services)
- [NOAA CO-OPS web services](https://tidesandcurrents.noaa.gov/web_services_info.html)
- [NOAA CO-OPS Data API](https://api.tidesandcurrents.noaa.gov/api/dev)
- [USGS Water Data continuous-values API](https://api.waterdata.usgs.gov/ogcapi/v0/collections/continuous?f=html)
- [NYS DEC ArcGIS REST directory](https://gisservices.dec.ny.gov/arcgis/rest/services)
- [DECinfo Locator terms summary](https://gisservices.dec.ny.gov/gis/dil/m_site/content.html)
- [NYS GIS Clearinghouse Search API](https://data.gis.ny.gov/api/search/definition/)
- [NYS ShareGIS](https://gis.ny.gov/shareGIS/)
- [NYS GIS service migration notice](https://gis.ny.gov/migration-web-services)
- [511NY API documentation](https://www.511ny.org/developers/help)
- [511NY Developer Access Agreement](https://www.511ny.org/developers/daa)
- [MTA developer resources](https://www.mta.info/developers)
- [MTA data-feed terms](https://www.mta.info/developers/terms-and-conditions)
- [NYC Open Data terms overview](https://opendata.cityofnewyork.us/overview/)
- [NYHOPS forecast site](https://hudson.dl.stevens-tech.edu/maritimeforecast/maincontrol.shtml)

## Phase 1 exit checklist

- [x] Existing runtime and static sources inventoried.
- [x] Each current source assigned a disposition.
- [x] Nassau, Suffolk, Rockaway, and regional candidates separated geographically.
- [x] Access, credentials, throttling, attribution, and known migration risks recorded.
- [x] One bounded fixture entry created for every candidate source family.
- [x] Accessible authoritative endpoints sampled and exact field mappings recorded.
- [x] 511NY and NYHOPS remain gated; no secrets or unapproved live calls added.
- [x] County attribution review performed; blank Nassau/Suffolk layer metadata is recorded as a production gate rather than inferred permission.
- [x] Active and non-operational NOAA station assumptions verified.
- [x] Exact MTA feeds and redistribution requirements verified.
