# Phase 3 Rockaway Source Qualification

Status: complete as part of the Phase 3 completion gate on 2026-08-30

Qualification date: 2026-08-28

## First development slice

The shared normalized-record path currently covers NYC 311 records. Its contract is stored in `config/jurisdiction.yaml`, generated into the React configuration, and read directly by the Streamlit normalizer. One bounded fixture drives cross-runtime parity, geography-rejection, stale, malformed, and empty-response tests.

This slice does not add Phase 4 cards or map toggles. Sources remain disabled when their live contract or safe presentation behavior is incomplete.

## Revalidation results

| Source family | Current source | Phase 3 result | Reason / remaining gate |
|---|---|---|---|
| NYC 311 | NYC Open Data `erm2-nwe9` | qualified; normalization implemented | Requires Queens plus Community Board 14 and valid coordinates. Broad Channel remains included by current policy. |
| Active cooling centers | NYC Cool Options Finder | gated | The former candidate `2bnn-yakx` is now a parking-violations dataset. The public finder is authoritative and activation-aware, but no stable documented machine-readable public contract was verified. Do not scrape or substitute last season's report. |
| Hurricane evacuation centers | NYC Open Data `p5md-weyf` | qualified; normalization implemented | The adapter verifies the healthy Queens inventory and applies the authoritative CB14 point-in-polygon rule. The current result contains no CB14 reference facilities and is explicitly `no_local_reference_facilities` plus `confirmation_required`, never “zero active centers.” |
| NYPD incidents | NYC Open Data `5uac-w243` | qualified; normalization implemented | The bounded query retrieves the newest 500 geocoded Queens complaints in the CB14 bounding box. The shared adapter then rejects every point outside the authoritative CB14 polygon; precinct is retained only as an audit field, never as the final geography rule. |
| NYCHA developments | NYC Open Data `phvi-damg` | qualified; normalization implemented | The bounded query retrieves the Queens development multipolygons. The shared adapter retains only polygons intersecting authoritative CB14 geometry; no development-name or TDS allowlist is used. |

## Historical ID disposition

- `2bnn-yakx`: currently identifies Parking Violations Issued - Fiscal Year 2017; it must never be used for cooling centers.
- `uqnk-2pcv`: no longer resolves as the hurricane evacuation-center dataset.
- `43nn-pn8y`: not the current NYPD YTD complaint dataset.
- `5uac-w243`: currently identifies NYPD Complaint Data Current (Year To Date), not NYCHA developments.

## Implemented normalized behavior

- Registry-owned identity, owner, endpoint, attribution, freshness, and source timestamp timezone are never inferred from payload text.
- NYC 311 rows outside Queens Community Board 14 or without valid coordinates are rejected.
- Observation, retrieval, and expiration timestamps remain separate.
- A valid payload containing rejected rows is `partial`; an empty valid array is also `partial`; malformed payloads are `unavailable`; expired results are `stale`.
- React and Streamlit are compared directly against the same bounded fixture.
- NYPD and NYCHA spatial qualification fails closed when the normalized CB14 mask is unavailable.
- NYPD point and NYCHA multipolygon records use the same cross-runtime intersection predicate as the regional geography foundation.
- Qualification-time live validation found five NYCHA developments intersecting CB14: Beach 41st Street–Beach Channel Drive, Carleton Manor, Hammel, Ocean Bay Apartments (Oceanside), and Redfern. This is an observation, not a hard-coded allowlist.
- Hurricane evacuation-center inventory and operational activation are separate concepts. The dataset has no open/closed field; every accepted facility remains `Activation unconfirmed`, with the NYC Hurricane Evacuation Zone Finder and 311 retained as the required confirmation channels.
- A healthy Queens inventory with no CB14 intersection is `partial` with `no_local_reference_facilities`; a completely empty upstream inventory is separately labeled `empty_upstream_inventory`; a missing CB14 mask is `unavailable`.

## Phase 3 disposition

The authoritative Queens Community Board 14 polygon and shared cross-runtime
spatial-validation foundation were applied to NYPD point records and NYCHA
development polygons on 2026-08-29. Hurricane evacuation-center empty-scope
and activation-confirmation semantics were implemented in the following slice.
These sources remain disabled until Phase 4 activates their equivalent React
and Streamlit cards and map controls. NOAA CO-OPS, USGS Water Data, and NYS DEC
adapter qualification is complete; the full Phase 3 gate is recorded in
`docs/long-island/phase-3-completion.md`.

## Deferred source

FDNY historical incidents were removed from the active registry, normalization fixture, display set, and fetch path on 2026-08-29. The source should not return unless it is implemented as coverage-aware historical analytics rather than a latest-record card. See `docs/long-island/future-fdny-historical-analytics.md`.
