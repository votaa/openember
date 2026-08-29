# Phase 3 Rockaway Source Qualification

Status: implementation started

Qualification date: 2026-08-28

## First development slice

The shared normalized-record path now covers NYC 311 and FDNY dispatch records. Its contract is stored in `config/jurisdiction.yaml`, generated into the React configuration, and read directly by the Streamlit normalizer. One bounded fixture drives cross-runtime parity, geography-rejection, stale, malformed, and empty-response tests.

This slice does not add Phase 4 cards or map toggles. Sources remain disabled when their live contract or safe presentation behavior is incomplete.

## Revalidation results

| Source family | Current source | Phase 3 result | Reason / remaining gate |
|---|---|---|---|
| NYC 311 | NYC Open Data `erm2-nwe9` | qualified; normalization implemented | Requires Queens plus Community Board 14 and valid coordinates. Broad Channel remains included by current policy. |
| FDNY incidents | NYC Open Data `8m42-w767` | qualified; normalization implemented | The source is historical dispatch data updated annually, not a real-time incident feed. It publishes no point geometry, so Phase 4 must use a non-mappable card treatment and disclose cadence. |
| Active cooling centers | NYC Cool Options Finder | gated | The former candidate `2bnn-yakx` is now a parking-violations dataset. The public finder is authoritative and activation-aware, but no stable documented machine-readable public contract was verified. Do not scrape or substitute last season's report. |
| Hurricane evacuation centers | NYC Open Data `p5md-weyf` | dataset qualified; adapter pending | The current annual dataset has geometry and ZIP fields, but contained no Rockaway-ZIP centers at qualification time. NYCEM says center status must be confirmed with NYC or 311 during an event. Empty-result and activation semantics must be implemented before display. |
| NYPD incidents | NYC Open Data `5uac-w243` | gated | Current YTD complaints provide coordinates and precinct, but no Community Board or ZIP. Precinct-only filtering is not accepted as the approved Rockaway geography rule; an authoritative CB14 point-in-polygon filter is required. |
| NYCHA developments | NYC Open Data `phvi-damg` | gated | The current source provides development multipolygons and borough only. It needs authoritative CB14 polygon intersection or a spatially verified stable TDS allowlist before records can be labeled Rockaway. |

## Historical ID disposition

- `nuhi-jiwk`: not the current FDNY incident dataset.
- `2bnn-yakx`: currently identifies Parking Violations Issued - Fiscal Year 2017; it must never be used for cooling centers.
- `uqnk-2pcv`: no longer resolves as the hurricane evacuation-center dataset.
- `43nn-pn8y`: not the current NYPD YTD complaint dataset.
- `5uac-w243`: currently identifies NYPD Complaint Data Current (Year To Date), not NYCHA developments.

## Implemented normalized behavior

- Registry-owned identity, owner, endpoint, attribution, freshness, and source timestamp timezone are never inferred from payload text.
- NYC 311 rows outside Queens Community Board 14 or without valid coordinates are rejected.
- FDNY rows must match Queens, Community District 414, and an approved Rockaway ZIP. Because the source intentionally omits exact coordinates, normalization preserves `geometry: null` instead of inventing a map point.
- Observation, retrieval, and expiration timestamps remain separate.
- A valid payload containing rejected rows is `partial`; an empty valid array is also `partial`; malformed payloads are `unavailable`; expired results are `stale`.
- React and Streamlit are compared directly against the same bounded fixture.

## Next Phase 3 slice

Add the authoritative Queens Community Board 14 polygon and a shared point/polygon intersection implementation. That unlocks safe qualification of NYPD incidents and NYCHA developments, and provides the future path for excluding Broad Channel when the project adopts a peninsula-only boundary. Then implement hurricane-center empty/activation handling and continue the already approved NOAA, USGS, DEC, and civil-boundary adapter work.
