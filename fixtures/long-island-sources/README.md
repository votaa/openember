# Long Island source fixtures

`phase-1-samples.json` contains bounded contract-development fixtures for the candidate source families qualified in Phase 1.

`phase-1-authoritative-samples.json` contains bounded responses captured from accessible public authority endpoints on 2026-08-28. They prove response shape and access at capture time only; they are not current operational data.

Every entry declares its provenance:

- `synthetic_minimal`: a deliberately small payload shaped like the documented source family. It is safe for deterministic tests but must not be treated as a captured observation.
- `gated_stub`: a non-operational placeholder for a source whose access or machine-readable contract is not yet approved.
- `captured_minimal`: a bounded subset of a response retrieved from the stated public endpoint at the recorded time.
- `documentation_sample`: a contract reproduced from the authority's API documentation because live access requires credentials.

Dates, identifiers, coordinates, and values in synthetic fixtures are illustrative. Runtime adapters must retain source timestamps, geographic scope, attribution, and stale/unavailable state from live responses.

`phase-3-regional-geography.json` drives the cross-runtime CB14, NYS county,
and NYS DPS electric-territory contract tests. Its polygons are deliberately
simplified test geometry, not cached runtime boundaries. Runtime adapters query
the configured authoritative sources.

`phase-3-rockaway-spatial-qualification.json` drives the shared NYPD point,
NYCHA multipolygon, and hurricane evacuation-center qualification tests against
a deliberately simplified CB14 mask. It proves in-scope acceptance,
out-of-scope rejection, evacuation activation/empty-scope semantics,
missing-mask failure, and React/Streamlit parity without caching live
operational records.

`phase-3-regional-observations.json` drives shared NOAA CO-OPS, USGS Water
Data, and NYS DEC Active Sites contract tests. It uses synthetic water-level,
gauge-height, cleanup-site, and county-mask records to validate bounded request
construction, latest-observation selection, quality metadata, county geometry,
failure states, and React/Streamlit parity without caching live conditions.

`phase-4-display.json` drives the shared source-card presentation tests for
current, stale/partial, unavailable, activation-dependent, point, and polygon
states. It contains synthetic result summaries only and is not an operational
cache.
