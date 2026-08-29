# Future Enhancement: FDNY Historical Analytics for Rockaway

Status: deferred; not in the active source registry or user interfaces

Decision date: 2026-08-29

## Why it was removed

The FDNY source is historical dispatch data rather than a real-time incident feed and does not publish approved point geometry. A card containing the latest 50 records could only answer questions such as "how many structure fires are present among these 50 records." It could not support a claim about the total number of structure fires during the past year.

The FDNY source, fixture rows, fetch behavior, source card, and React/Streamlit controls were therefore removed from the active implementation.

## Potential useful implementation

Reconsider the source only as coverage-aware historical analytics. Use separate bounded server-side Socrata queries for:

- Counts grouped by incident classification or classification group.
- Counts grouped by approved Rockaway ZIP.
- Counts grouped by month for an explicit calendar or rolling-date period.
- A small latest-record sample for examples, kept separate from aggregate totals.

The upstream service should calculate aggregates across all matching records. Do not calculate period totals from a latest-50 sample or ask the LLM to extrapolate from it.

## Knowledge-base option

If restored, inject compact aggregate results into both the React and Streamlit chat contexts rather than injecting a raw record dump. Context must include:

- The requested start and end dates.
- The latest observation date actually published by the dataset.
- Total matching records and grouped counts.
- NYC Open Data / FDNY attribution.
- A prominent label that the source is historical and not a live incident feed.
- A partial-coverage warning whenever the published data does not span the entire requested period.

The LLM may summarize returned counts, but it must not infer missing dates, extrapolate totals, turn alarm-box text into exact coordinates, or describe historical records as current incidents.

## Re-entry criteria

- Verify the current authoritative FDNY dataset and update cadence.
- Define exact period semantics, such as prior calendar year versus rolling 365 days.
- Verify the source's incident classification values used for questions such as structure-fire totals.
- Implement and test Rockaway filtering for Queens, Community District 414, and approved ZIP codes.
- Add coverage metadata and partial-period behavior to the shared React/Streamlit contract.
- Add deterministic aggregate-query tests before exposing the results to chat.
