# Future Enhancement: NYC 311 Electric-Hazard Intelligence

Status: proposed; not implemented

Logged: 2026-08-29

## Proposed operational use

Use structured NYC 311 complaint fields to produce a Rockaway-scoped view of reported electricity-related hazards for situational awareness. Candidate `complaint_type` values are:

- `Power Outage`
- `Electric`
- `Blocked Road`

`Power Outage` and `Electric` are candidates for direct inclusion after their current dataset semantics are verified. `Blocked Road` is not electricity-specific by itself and must be included only when `descriptor` or another verified field identifies a downed wire, utility line, electrical obstruction, or equivalent condition.

This view could support EOC awareness of clustered outage reports, downed-wire hazards, and utility-related road obstructions. NYC 311 reports are public complaints, not confirmation from an electric utility or emergency responder, so the interface and LLM must describe them as reports rather than verified outages.

## Geography and map behavior

- Apply the existing Queens and Community Board 14 filter plus valid coordinates.
- Continue to include Broad Channel until an authoritative peninsula polygon is approved.
- Apply the future peninsula point-in-polygon filter when available.
- Use the shared 500-most-recent-record window for map browsing only.
- Preserve complaint creation time, retrieval time, status, descriptor, ZIP, and NYC 311 attribution.

## Aggregate and chat behavior

Historical or period totals require separate server-side Socrata aggregate queries across the complete requested period. Potential groupings include complaint type, verified electric-hazard subtype, ZIP, status, day, and month.

Chat context should receive compact aggregate results and a small set of recent examples, with:

- The exact query period and latest published observation time.
- The complaint-type and descriptor rules used.
- Counts of included and rejected `Blocked Road` records.
- Source coverage and partial-period warnings.
- A warning that NYC 311 reports are not utility-confirmed outage totals.

The LLM must not calculate historical totals from the 500-record map window or infer an electric hazard from `Blocked Road` without a qualifying field value.

## Validation before implementation

- Profile current Rockaway values for `complaint_type`, `descriptor`, agency, and status.
- Confirm that the candidate complaint-type labels are current and identify the responsible agencies and workflows.
- Create and test an explicit allowlist of electric-related descriptors; do not rely on unconstrained keyword matching.
- Test false positives such as blocked roads caused by construction, trees, vehicles, flooding, or other non-electric conditions.
- Compare sample results with authoritative utility or emergency information where feasible.
- Add shared React/Streamlit classification, aggregation, freshness, and geography tests.
