# Phase 3 Rockaway Source Qualification

Status: implementation in progress

Qualification date: 2026-08-28

## First development slice

The shared normalized-record path currently covers NYC 311 records. Its contract is stored in `config/jurisdiction.yaml`, generated into the React configuration, and read directly by the Streamlit normalizer. One bounded fixture drives cross-runtime parity, geography-rejection, stale, malformed, and empty-response tests.

This slice does not add Phase 4 cards or map toggles. Sources remain disabled when their live contract or safe presentation behavior is incomplete.

## Revalidation results

| Source family | Current source | Phase 3 result | Reason / remaining gate |
|---|---|---|---|
| NYC 311 | NYC Open Data `erm2-nwe9` | qualified; normalization implemented | Requires Queens plus Community Board 14 and valid coordinates. Broad Channel remains included by current policy. |
| Active cooling centers | NYC Cool Options Finder | gated | The former candidate `2bnn-yakx` is now a parking-violations dataset. The public finder is authoritative and activation-aware, but no stable documented machine-readable public contract was verified. Do not scrape or substitute last season's report. |
| Hurricane evacuation centers | NYC Open Data `p5md-weyf` | dataset qualified; adapter pending | The current annual dataset has geometry and ZIP fields, but contained no Rockaway-ZIP centers at qualification time. NYCEM says center status must be confirmed with NYC or 311 during an event. Empty-result and activation semantics must be implemented before display. |
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

## Next Phase 3 slice

The authoritative Queens Community Board 14 polygon and shared cross-runtime
spatial-validation foundation were applied to NYPD point records and NYCHA
development polygons on 2026-08-29. Both sources remain disabled until Phase 4
activates their equivalent React and Streamlit cards and map controls. The next
Phase 3 slice is hurricane-center empty/activation handling, followed by the
already approved NOAA, USGS, and DEC adapter work.

## Deferred source

FDNY historical incidents were removed from the active registry, normalization fixture, display set, and fetch path on 2026-08-29. The source should not return unless it is implemented as coverage-aware historical analytics rather than a latest-record card. See `docs/long-island/future-fdny-historical-analytics.md`.
