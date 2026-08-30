# Long Island Data Integration: Phase 3 Completion

Status: passed on 2026-08-30

Phase 3 now provides shared React and Streamlit contracts for Rockaway sources,
regional polygons, NOAA CO-OPS water levels, USGS gauge height, and NYS DEC
Active Sites. Phase 4 may begin display activation without creating a second
normalization or geography path.

## Final adapter qualification

### NOAA CO-OPS

- Approved primary stations: Kings Point `8516945` and Montauk `8510560`.
- Approved references: The Battery `8518750` and Sandy Hook `8531680`.
- Requests are bounded to six hours and explicitly specify `water_level`, MLLW,
  GMT, English units, JSON, and the `EMBER` application identifier.
- The adapter retains the newest valid observation, station geometry, value,
  uncertainty, flags, preliminary/quality code, datum, units, role, observation
  time, retrieval time, and expiry time.
- Observations older than 20 minutes are stale. Predictions are not accepted as
  observations.
- Live validation returned observations for all four stations on 2026-08-30.

### USGS Water Data

- Approved primary sites: Massapequa Creek `USGS-01309500` and Peconic River
  `USGS-01304500`.
- Approved reference: Rosedale `USGS-01311810`; it is not Rockaway coverage.
- Each request includes the exact monitoring location, parameter `00065`, a
  rolling 12-hour RFC 3339 interval, JSON format, and a 100-record limit.
- The adapter selects the newest valid observation and preserves point geometry,
  value, unit, provisional/approval status, qualifier, last-modified timestamp,
  source role, and distinct observation/retrieval/expiry timestamps.
- Live validation returned 45 observations per selected site in the bounded
  window and reached the newest published timestamp.

### NYS DEC Active Sites

- The adapter requests Nassau and Suffolk records only and keeps the published
  DEC fields, detail URL, attribution, and as-is/change-without-notice disclaimer.
- Every point must intersect the authoritative polygon for its claimed county.
- The live layer returned 242 records on 2026-08-30: 147 labeled Nassau and 95
  labeled Suffolk. Spatial validation accepted 241 and rejected the published
  `Old Bethpage Landfill` point because it did not intersect its claimed Nassau
  polygon. The source correctly reports `partial` rather than hiding the
  inconsistency.
- The service limit is 1,000 records, so the bounded result was not truncated.

## Completion-gate result

Run:

```text
npm run phase3:gate
```

The gate verifies:

- five Rockaway source dispositions, including the deliberately gated cooling
  center source;
- shared React/Streamlit fixture parity and source failure states;
- CB14, county, utility, NYPD, NYCHA, evacuation-center, NOAA, USGS, and DEC
  contracts;
- continued disablement of 511NY, MTA, and NYHOPS;
- absence of credential fields from the browser-facing source registry;
- generated configuration parity, Streamlit regression tests, production build,
  Python syntax, and clean diff formatting.

## Phase 4 handoff

Phase 4 should activate equivalent cards and map controls in React and
Streamlit using these records. It must fetch required geometry masks before
spatially dependent sources, preserve reference-versus-primary roles, expose
stale/partial/unavailable states, and retain the existing operational-versus-
PSEG Map Builder geography modes. Cooling centers remain gated until a stable
machine-readable activation contract is verified.
