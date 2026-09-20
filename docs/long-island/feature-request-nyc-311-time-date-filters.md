# Feature Request: Time and Date Filters for NYC 311 Layers

Status: proposed; requirements clarified; implementation pending approval

Requested: 2026-09-20

## Summary

Add time- and date-based filtering to the Rockaway-scoped NYC 311 data layers so operators can examine complaints within an explicit observation window instead of relying only on the newest-record browse limit.

The request applies initially to:

- `nyc_311_rockaway` — general Rockaway / Queens Community Board 14 service requests.
- `nyc_311_electric_hazards_rockaway` — reported electrical hazards, tree/wire reports, and road-blockage reports.

The design should remain reusable for later Rockaway-scoped NYC 311 layers.

## User need

During an incident or restoration effort, an operator may need to answer questions such as:

- What 311 reports were created during the storm window?
- Which electric-hazard or road-blockage reports arrived after a specified time?
- How did the number of reports change between two dates?

The current layers are limited to newest-record browsing and do not expose a user-controlled time window.

## Proposed behavior

### Filter field

Use the NYC 311 `created_date` field as the initial time dimension and preserve the source timestamp timezone, `America/New_York`.

Date-only end values include the end of that calendar day in local time. An
explicitly entered timestamp is respected as entered, after validation and
normalization to the shared source timezone.

### Query behavior

- Apply the selected time window to the server-side Socrata `$where` clause.
- Preserve the existing Queens Community Board 14 geography filter and valid-coordinate requirement for map records.
- Keep the map browse cap bounded at 500 records after the date and geography filters are applied.
- Apply the same time window to full-inventory aggregate queries for the electric-hazard layer.
- Never calculate period totals from the 500-record map-browse subset.
- Preserve `observed_at`, `fetched_at`, freshness, stale, partial, unavailable, and rejected-record semantics.
- Treat the start and end boundaries consistently across React and Streamlit.
- Use one shared period filter for all active NYC 311 layers.
- Default to the rolling last 72 hours (3 days).
- If the selected period returns no records, show a clear empty-period message
  that distinguishes valid zero results from unavailable or failed data.

### UI direction

Add a shared date/time filter control to the NYC 311 layer controls with:

- Start date/time.
- End date/time.
- Clear/reset action.
- Visible indication that the filter applies to the displayed layer and related aggregate totals.
- Validation for an invalid range, missing boundary, and unsupported future date.
- Presets for `Last 24 hours`, `Last 72 hours` (default), and `Last 7 days`.
- A custom option where the user enters the period manually.
- Persistence across in-app refreshes, but not across a full browser reload or a
  newly opened tab or browser.

The filter should not silently broaden the query to Queens-wide or citywide data when the filtered request fails.

### Data and chat presentation

- Show the active period in the source card and relevant map-layer state.
- Include the selected period and source timestamp field in Copilot context.
- Label results as NYC 311 reported complaints, not utility-confirmed outages or verified restoration constraints.
- Distinguish an empty result for a valid period from unavailable, stale, malformed, or failed upstream data.

## Acceptance criteria

- React and Streamlit expose equivalent time/date filtering behavior.
- A valid date-only range produces the same inclusive/exclusive boundary behavior in both runtimes.
- A date-time range is translated into a bounded Socrata query using `created_date`.
- The general 311 map layer and electric-hazard layer both honor the active period.
- Electric-hazard aggregate counts use the selected period and complete matching inventory.
- Map results remain capped at 500 records after filtering.
- The active filter, period, record count, mapped count, and aggregate period are visible to the operator.
- Invalid ranges fail locally with an actionable message and do not issue a broadened request.
- Timeout, rate-limit, empty, stale, and unavailable behavior remains explicit.
- Cross-runtime tests cover query construction, boundary semantics, aggregate filtering, reset behavior, and parity.
- Documentation and source contracts identify `created_date` and the selected timezone.

## Confirmed requirements

- One shared period filter applies to all active NYC 311 layers.
- The default period is the rolling last 72 hours / 3 days.
- Presets are `Last 24 hours`, `Last 72 hours`, and `Last 7 days`, plus custom user-entered dates/times.
- Date-only end values include the local end of day; explicit timestamps are respected.
- The period constrains map records, source cards, full-inventory aggregates, and Copilot context.
- An empty valid period receives explicit empty-result messaging.
- The selection persists across in-app refreshes but resets on full browser reload and new tab/browser sessions.

## Implementation notes for the approved follow-up

- Extend the shared Rockaway/Socrata query contract rather than adding separate runtime-specific filtering logic.
- Keep query values parameterized/encoded through the existing URL builders.
- Use the same normalized filter metadata in React, Streamlit, source cards, map layers, and Copilot context.
- Add the feature only after the open requirements above are resolved; this document is a request record, not implementation authorization.
