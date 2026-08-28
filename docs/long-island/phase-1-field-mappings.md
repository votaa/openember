# Long Island Phase 1 Field Mappings

Qualification date: 2026-08-28

These mappings define the minimum inputs for the normalized regional record planned for Phase 3. They do not implement an adapter.

## Normalized record target

| Normalized field | Requirement |
|---|---|
| `source_id`, `source_name`, `owner` | Fixed from source registry; never inferred from payload text |
| `geography` | One of `nassau`, `suffolk`, `rockaway`, `regional`, or `reference`; validated from approved geometry/filter |
| `observed_at`, `fetched_at`, `expires_at` | Keep source timestamp separate from retrieval and expiry timestamps |
| `geometry` | GeoJSON in WGS84; preserve original spatial reference in properties |
| `category`, `severity`, `status` | Source-specific mapping; unknown values remain unknown |
| `title`, `description` | Human-readable source fields without invented detail |
| `properties` | Unmapped source fields required for auditability |
| `source_url`, `attribution` | Exact endpoint/item and required owner/disclaimer |
| `data_state` | `current`, `stale`, `partial`, `unavailable`, or `access_required` |

## NYC 311: Rockaway

Endpoint: `https://data.cityofnewyork.us/resource/erm2-nwe9.json`

Required server query:

```text
borough = 'QUEENS'
AND community_board = '14 QUEENS'
AND latitude IS NOT NULL
AND longitude IS NOT NULL
```

| Source field | Normalized field / rule |
|---|---|
| `unique_key` | `properties.source_record_id` |
| `created_date` | `observed_at` |
| `agency` | `owner` detail; registry owner remains NYC 311 |
| `complaint_type` | `category` and `title` |
| `descriptor` | `description` |
| `status` | `status` |
| `borough`, `community_board`, `incident_zip` | geography audit properties |
| `latitude`, `longitude` | GeoJSON point after numeric validation |

Reject rows that fail the approved geography test. Never relax to unfiltered Queens or citywide results after an API error.

Initial scope decision: Community Board 14 covers the full Rockaway Peninsula and Broad Channel. Broad Channel is intentionally included in the first implementation. A future enhancement will add an authoritative peninsula polygon and exclude Broad Channel with a point-in-polygon check.

## Nassau County GIS: town/city boundaries

Layer: `https://gis.nassaucountyny.gov/server/rest/services/Hosted/My_Nassau/FeatureServer/5`

Service item: `e8d03b6297164b1bb543330e67a55230`

Geometry: polygon

Formats: JSON, GeoJSON, PBF

Limit: 2,000 records

| Source field | Normalized field / rule |
|---|---|
| `objectid` | `properties.source_record_id` |
| `town` | `title` and `properties.municipality` |
| `ncid` | `properties.nassau_county_id` |
| service geometry | WGS84 GeoJSON polygon; `geography = nassau` only after county-boundary validation |

The layer publishes no copyright text, description, or update cadence. Attribute it as “Nassau County GIS” for prototype display based on the official host, but require written/posted county terms before production enablement.

## Suffolk County GIS: evacuation zones

Service: `https://gis.suffolkcountyny.gov/hosted/rest/services/Hosted/FRES_Evacuation_Zones_Final/FeatureServer`

Service item: `6441f281938541089ea76fda36e040c8`

Layers `0..9`: Babylon, Islip, Brookhaven, Huntington, Southampton, East Hampton, Southold, Riverhead, Shelter Island, and Smithtown

Geometry: polygon

Formats: JSON, GeoJSON, PBF

Limit: 2,000 records per layer

| Source field | Normalized field / rule |
|---|---|
| `objectid` | `properties.source_record_id` |
| `name` | `properties.municipality` and title prefix |
| `fips` | `properties.fips` |
| `zone` | `category = evacuation_zone`; retain source zone verbatim |
| `vxcount` | `properties.vertex_count`; not population or severity |
| service geometry | WGS84 GeoJSON polygon; `geography = suffolk` after boundary validation |

The service publishes no description, copyright text, or update cadence. It is prototype-only until Suffolk County confirms ownership, meaning, currency, and attribution.

## Suffolk County GIS: 100-year flood

Layer: `https://gis.suffolkcountyny.gov/hosted/rest/services/Hosted/100YR_Flood/FeatureServer/0`

Service item: `c768a42525be4a1fa0974848ccbcb3b3`

Geometry: polygon

| Source field | Normalized field / rule |
|---|---|
| `fid` | `properties.source_record_id` |
| `dfirm_id` | `properties.dfirm_id` |
| `fld_zone`, `zone_subty` | `category = flood_zone`; source zone/subtype in properties and title |
| `sfha_tf` | `properties.special_flood_hazard_area` |
| `static_bfe` | `properties.base_flood_elevation`; never omit unit/datum |
| `v_datum`, `len_unit` | datum/unit metadata |
| `source_cit` | source citation and provenance property |

The public layer is suitable for a prototype overlay, not for asserting current flood conditions. County metadata does not document its update cadence or usage terms.

## NOAA CO-OPS

Selected live stations: Kings Point `8516945`, Montauk `8510560`

Reference stations: The Battery `8518750`, Sandy Hook `8531680`

| Source field/request | Normalized field / rule |
|---|---|
| request `station` | `properties.station_id` |
| request `product`, `datum`, `time_zone`, `units` | mandatory audit properties |
| `metadata.name`, `lat`, `lon` | title and point geometry |
| `data[].t` | `observed_at` |
| `data[].v` | numeric observation value after validation |
| `data[].s`, `f`, `q` | uncertainty/flags/quality properties |

Fire Island `8515186` and Bay Shore `8515102` are not approved for live water levels. On 2026-08-28 both returned “No data was found. This product may not be offered,” and neither appeared in NOAA's active regional water-level station list.

## USGS Water Data OGC API

Collection: `https://api.waterdata.usgs.gov/ogcapi/v0/collections/continuous/items`

Selected sites:

- Nassau: `USGS-01309500`, Massapequa Creek at Massapequa.
- Suffolk: `USGS-01304500`, Peconic River at Riverhead.
- Queens reference: `USGS-01311810`, Conselyeas Pond Tributary at Rosedale; not Rockaway Peninsula coverage.

Required filters include `monitoring_location_id`, `parameter_code=00065`, an explicit RFC 3339 `datetime` interval, and a bounded `limit`.

| Source field | Normalized field / rule |
|---|---|
| `id` | observation record ID |
| `geometry` | point geometry |
| `monitoring_location_id` | station ID |
| `parameter_code` | measured parameter; `00065` is gauge height |
| `time` | `observed_at` |
| `value`, `unit_of_measure` | numeric value and mandatory unit |
| `approval_status`, `qualifier` | quality/provisional properties |
| `last_modified` | source revision timestamp; not observation time |

Do not reintroduce the existing all-New-York legacy NWIS query as fallback.

## NYS DEC Active Sites

Layer: `https://gisservices.dec.ny.gov/arcgis/rest/services/dil/dil_clean_up/MapServer/2`

Filter: `COUNTY IN ('Nassau','Suffolk')`

| Source field | Normalized field / rule |
|---|---|
| `OBJECTID`, `SITECODE` | source record identifiers |
| `SITENAME` | `title` |
| `PROGRAM` | `category` detail |
| `SITECLASS` | source classification; do not invent severity |
| `COUNTY`, `TOWN`, `LOCALITY`, `ZIPCODE` | geography validation/properties |
| `DETAIL_URL` | `source_url` for the record |
| geometry | point geometry transformed to WGS84 |

Carry NYS DEC attribution and its as-is/change-without-notice disclaimer.

## NYS Civil Boundaries

Catalog item: `074d3456e5664f5e85d0fb251d05cc5b`

Layer: `https://services6.arcgis.com/EbVsqZ18sv1kVJ3k/arcgis/rest/services/NYS_Civil_Boundaries/FeatureServer/2`

| Source field | Normalized field / rule |
|---|---|
| `OBJECTID` | source record ID |
| `NAME` | county name and geography key |
| `FIPS_CODE` | canonical county FIPS (`36059`, `36103`, `36081`) |
| `NYC` | distinguishes Queens/NYC from Nassau/Suffolk |
| `DATEMOD` | source modification property |
| geometry | authoritative regional county polygon |

Required attribution: NYS Office of Information Technology Services Geospatial Data Services. Preserve the published as-is/no-warranty disclaimer and publication date.

## 511NY events

Endpoint: `https://www.511ny.org/api/getevents?key={key}&format=json`

This source remains `access_required`. The developer key must remain server-side and calls must stay within 10 requests per 60 seconds.

| Source field | Normalized field / rule |
|---|---|
| `ID` | source record ID |
| `RegionName`, `CountyName` | regional filter/audit properties |
| `Severity`, `EventType`, `EventSubType` | severity/category |
| `RoadwayName`, `DirectionOfTravel`, `Description`, `Location` | title/description/properties |
| `Latitude`, `Longitude`, `MapEncodedPolyline` | point/line geometry after validation |
| `LastUpdated`, `Reported`, `StartDate`, `PlannedEndDate` | source timestamps |

## MTA realtime and alerts

Selected endpoints:

- `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr`
- `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace`
- `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Flirr-alerts.json`

GTFS-RT protobuf fields map through the standard feed header, entity ID, trip update/vehicle/alert entities, informed entities, active periods, and translated text. Preserve MTA extensions rather than dropping them during decoding.

MTA's terms require the application to download and store feeds on a non-MTA server rather than expose MTA's server directly to users. If redistributed realtime data lags by more than one minute, the UI must warn that it may not be realtime. Data remains as-is and must not be represented as complete or timely.

## NYHOPS

No field mapping is approved. Keep `data_state = unavailable` or `access_required` and provide only the reference link until stable machine-readable access, cadence, attribution, and redistribution terms are documented.
