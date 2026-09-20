# Future Enhancement: NYC 311 Electric-Hazard Intelligence

Status: implemented in the Rockaway Phase 4 source view

Logged: 2026-08-29

## Proposed operational use

Use structured NYC 311 complaint fields to produce a Rockaway-scoped view of reported electricity-related hazards and road blockages for situational awareness. The view is a 500-record, newest-first map browse backed by separate full-inventory Socrata aggregates.

Included classifications are:

- Direct electrical reports: HPD `ELECTRIC`/`Electric` with `POWER OUTAGE`/`Power Outage`, and DOB `Electrical` with `Electrical Wiring Defective` or `Electrical Wiring Exposed`.
- Tree/wire reports: DPR descriptors `Hitting Power Lines`, `Hitting Power/Phone Lines`, or `Hitting Phone/Cable Lines`.
- Road blockage reports: any scoped `Blocking Street` or `Blocked Road` complaint, plus DOT `Street Condition` records with a `Blocked - ...` descriptor. This intentionally includes tree, flooding, construction, and other blockage causes even when no electrical association is present because access constraints may affect restoration work.

The source stores the selected classification on each normalized record as `hazard_category_key` and `hazard_category`. NYC 311 reports remain complaint reports, not utility-confirmed outages, confirmed hazards, or confirmed restoration constraints.

This view could support EOC awareness of clustered outage reports, downed-wire hazards, and utility-related road obstructions. NYC 311 reports are public complaints, not confirmation from an electric utility or emergency responder, so the interface and LLM must describe them as reports rather than verified outages.

## Geography and map behavior

- Apply the existing Queens and Community Board 14 filter plus valid coordinates.
- Continue to include Broad Channel until an authoritative peninsula polygon is approved.
- Apply the future peninsula point-in-polygon filter when available.
- Use the shared 500-most-recent-record window for map browsing only.
- Preserve complaint creation time, retrieval time, status, descriptor, ZIP, and NYC 311 attribution.

## Aggregate and chat behavior

The source issues separate server-side Socrata `count(*)` queries across the complete available inventory for all included reports, direct electrical reports, tree/wire reports, and road blockage reports. These totals are never calculated from the 500-record map window. The UI labels them as full-inventory reports and shows unavailable aggregate results separately from map data.

Chat context should receive compact aggregate results and a small set of recent examples, with:

- The exact query period and latest published observation time.
- The complaint-type and descriptor rules used.
- Counts of included road-blockage records, including non-electric causes such as trees, flooding, construction, and other reported blockage issues.
- Source coverage and partial-period warnings.
- A warning that NYC 311 reports are not utility-confirmed outage totals.

The LLM must not calculate historical totals from the 500-record map window or infer an electric hazard from `Blocked Road` without a qualifying field value.

## Validation and operational boundaries

- The map query remains limited to Queens Community Board 14, valid coordinates, and the newest 500 matching records; Broad Channel remains included under the existing CB14 policy.
- Aggregate queries use the same CB14 geography but do not require coordinates, so records without map geometry still contribute to full-inventory totals.
- Classification uses explicit agency/field/value rules rather than unconstrained keyword matching.
- React and Streamlit share the classification, aggregate-result, freshness, and geography contract.
- The view must continue to distinguish reported complaints from utility, emergency-responder, or restoration-system confirmation.
