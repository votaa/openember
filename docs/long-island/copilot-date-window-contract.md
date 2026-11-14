# Copilot date/window contract

Implemented November 14, 2026 (America/New_York).

`lib/copilot-window.js` and `streamlit/copilot_window.py` implement the same pure contract. Shared expected cases live in `shared/copilot/fixtures/date-windows.json`. Resolution uses `requested_at` and the jurisdiction timezone, independently of source labels, fetch times and forecast availability.

## Supported windows

- `today` and `tomorrow`: local midnight through the following midnight. Calendar arithmetic preserves 23-hour and 25-hour days across DST.
- `tonight`, `tomorrow night`, and named weekday nights: 18:00 local through 06:00 the following day. These are application selection windows; original source intervals and offsets remain intact.
- Named weekdays: the next occurrence including the request's local date. Source labels cannot substitute an older weekday's forecast.
- ISO calendar dates (`YYYY-MM-DD`) and `date to date`: complete local dates, including the final date in a calendar-date range.
- Offset-bearing ISO timestamp ranges (`start to end`): explicit instants, start inclusive and end exclusive. Invalid, reversed, empty or offset-free timestamp ranges are rejected by the resolver.

This is a bounded grammar, not a general natural-language date parser. Natural-language date ranges, modifiers such as “next week,” ambiguous numeric dates and inferred years remain outside its contract. Direct-query grammar remains conservative; adding an ISO date to a free-form question does not make it a new direct-query intent.

A new explicit follow-up date overrides prior user scope. A dateless “what about” follow-up may inherit date tokens from the latest user message only; assistant prose never establishes dates. With no recognized date, synthesis retains the supplied temporal evidence rather than inventing a window.

## Evidence selection and coverage

Direct forecast facts select the requested local date and day/night field semantics from source timestamps and `isDaytime`. Explicit direct timestamp intervals still require continuous source coverage. The first-period operation retains its existing source-order behavior.

Synthesis selects point periods overlapping the resolved windows. This can include a period labelled “Tonight” whose timestamps overlap tomorrow after midnight. Point-period values and UTC offsets are copied intact. The projection includes `requested_windows`; missing coverage or internal gaps mark point evidence partial and disclose that uncovered times are unknown.

Grid series use the independently resolved request windows, including when there is no point forecast or its coverage has expired. Intervals ending exactly at the window start or starting exactly at its end are excluded. Malformed, zero-duration and offset-free grid intervals cannot establish overlap. Matching null values remain null. Existing grid coverage warnings and caps still prohibit full-window maxima or totals from incomplete intervals; this slice does not implement grid aggregation or infer zero from missing values.

Both base system prompts carry identical date/window and unknown-versus-absent guidance. They prohibit turning missing precipitation, alerts, operating status or assignments into zero, no alerts, operational status or an unassigned role. Conditional impacts and source-supported absence claims remain required. The historical legacy prompt fixtures are retained unchanged; regression comparisons allow the current rule text while preserving the fixture's evidence and history verbatim.

## Validation

The full local-first gate components passed: 337 JavaScript checks and 166 Python tests, regional validators, production build, portable packaging imports, compilation and diff checks. The first sandbox run could not bind localhost for mocked transport tests; those suites passed with loopback access. Generated `dist` output was restored to its initial state.

Regression coverage includes DST days/nights, local dates around UTC midnight, leap days, weekday labels disagreeing with timestamps, exclusive boundaries, coverage gaps, date overrides, grid-only evidence, null values, malformed timestamps, source immutability and complete JavaScript/Python projection equality. The date/window tests are part of `npm run test:copilot-contract`, and therefore `npm run local-first:gate`.

These deterministic checks do not establish native answer quality. Hybrid remains experimental with legacy as the default, and the previously failed native grounding promotion gate remains open. Native inference and browser/Docker runs were not repeated for this slice.

Suggested commit: `fix(copilot): share date windows and align grounding rules`.
