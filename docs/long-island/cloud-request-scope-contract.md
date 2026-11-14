# Hosted Copilot request-time and window contract

Implemented November 14, 2026 on `codex/cloud-upload-coverage`, in `/private/tmp/openember-cloud-upload`. This checkout owns the hosted upload/grounding preview. The separate `feature/local-first-ollama` checkout and its commit `7a88e73` were left untouched; that commit was not cherry-picked here.

## Request path

React snapshots the submission time and relevant raw NOAA weather fields separately from the existing full KB, complete uploads and source summaries. Before Send, configured endpoints with missing/stale evidence or missing requested coverage are refreshed under their existing deadlines. The browser sends versioned `scope_input` with those snapshots. Observation scalar winds are not misidentified as grid series.

The Edge proxy snapshots its receipt time once. It recomputes scope using server-owned jurisdiction/timezone/reference settings; browser clock, timezone, center and provider hints do not control the result. Source snapshots remain client-supplied evidence, explicitly labelled as such. Metadata is validated, source age is reevaluated, and neither source nor document URLs cause a server fetch. The received question and complete upload data are retained. Request byte and combined prompt limits are rechecked after scope construction; overflow produces an explicit error before inference, rather than truncating evidence.

Streamlit snapshots its timezone-aware UTC submission instant once and builds the equivalent scope after refreshing configured sources. NOAA fetch stamps now include the complete UTC date and offset, removing the old time-of-day cache ambiguity around midnight. Both provider paths include versioned Request scope and WINDOW MATCHES blocks; recording-provider tests exercise the actual Edge handler and actual Streamlit streaming function without paid inference.

## Temporal grammar and ambiguity

The shared policy is `shared/request-scope-policy.json`; implementations are `src/data/requestScope.js` and `streamlit/request_scope.py`. Expected cases are shared in `tests/fixtures/scope/request-windows.json`.

- Today/tomorrow, day after tomorrow/two days from now, and next working day use jurisdiction-local calendar arithmetic. Every calendar day is eligible, including weekends and holidays. A local day may have 23 or 25 elapsed hours across DST.
- This afternoon and other dayparts use explicit application boundaries: AM 00:00–12:00, morning 06:00–12:00, afternoon 12:00–18:00, evening 18:00–24:00. Later today means the remaining local calendar day. Assumptions are emitted with the resolved interval.
- An unqualified named weekday means the next occurrence including today. “Next Friday” is deliberately clarified. Conflicting dates/weekdays, ambiguous numeric dates and unsupported “next week” require an explicit date/interval. This is a bounded parser, not universal natural-language understanding.
- ISO dates, full English month/day/year (or explicitly labelled request-year inference), date-to-date ranges, local dated clock ranges, same-date clock ranges and offset-bearing timestamp ranges are supported. Calendar ranges include the final date; timestamp intervals are half-open. Local clocks in a DST gap or fold require explicit offsets. Same-date clock ranges with an end before the start are clarified rather than silently advancing a day.
- Tonight is the supplied night period beginning on the requested local date; evening-start periods are distinguished from a just-after-midnight residual period using noon as the date-language separator. No 18:00–06:00 endpoints are imposed. Early-morning overnight can select the currently overlapping night. At/after its expiry, an old period cannot be reused as tonight. Missing or conflicting point-period intervals trigger clarification. Explicit historical nights remain usable and are labelled historical.

The request's current question determines temporal scope; old assistant dates never do. A response may answer other supported parts while clarifying the unresolved window.

## Operational periods

An explicit user clock interval overrides the analysis window without rewriting the IAP. Otherwise an applicable, explicitly defined next period from a current approved IAP precedes a configured incident schedule. Incident ambiguity, conflicting/stale schedules, missing approval/applicability fields or timezone-free period endpoints require clarification.

Text IAP extraction is deliberately conservative. It requires an IAP/Incident Action Plan marker and labelled fields such as:

```text
IAP
Incident: CEDAR-731
Revision: 2 approved 2026-11-14
Approved: yes by Planning
Current operational period: 2026-11-14T06:00:00-05:00 to 2026-11-14T18:00:00-05:00
Next operational period: 2026-11-14T18:00:00-05:00 to 2026-11-15T08:00:00-05:00
```

The question must identify the applicable incident. The current interval must contain request time, and the supplied next interval must follow it. Source document, incident, revision, approval and period text are retained as references. A current-only IAP does not establish a repeating schedule. Arbitrary document dates are not extracted as operational periods. This does not add PDF/DOCX ingestion or promise extraction from every ICS layout; ambiguous supported-text layouts require explicit fields.

If no authoritative next interval is available, the configured fallback uses the next eligible sunrise after request time (or the requested planning date), at the configured Long Island regional reference: the jurisdiction center, currently 40.7891, -73.1350. It adds **57,600 elapsed seconds**, including breaks. All days remain eligible. Both local endpoints retain their applicable Eastern UTC offsets. The interval is labelled **assumed, application planning fallback**, never an official ICS definition or command-approved schedule. Its end is the assessment horizon; operations continue around the clock.

The offline sunrise estimate implements NOAA's published fractional-year/equation-of-time approximation, with a 90.833-degree zenith and minute rounding. It is an approximate planning reference, not an observed solar event or an individual facility's location. Invalid/unavailable sunrise yields a gap. [NOAA equations](https://gml.noaa.gov/grad/solcalc/solareqns.PDF) define the algorithm used; actual sunrise can vary with atmospheric conditions. [NOAA calculation notes](https://gml.noaa.gov/grad/solcalc/calcdetails.html).

## Evidence and grounding

WINDOW MATCHES selects point/hourly periods and grid rows by timestamp overlap, independently for each source. Original units, source URLs, intervals, offsets and nulls survive. Stale/unavailable sources and other jurisdictions cannot establish window facts. Point location/area labels remain attached; jurisdiction membership does not imply representation of an unspecified facility. Independent grid evidence remains usable even if point coverage ends earlier.

Coverage is reported per source and grid field. Gaps/nulls cannot establish full-window maxima, totals or absence of hazards. No grid maximum/total is computed by this slice. Full source summaries remain available as reference/history alongside the scoped views; they cannot establish requested-window facts outside matching validity.

Both base prompts carry the same rules: facts require evidence, impacts are conditional, recommendations are suggestions unless an applicable supplied SOP requires them, unspecified remains unknown, inventory is not deployment/operating status, and channel names do not establish authorization or reliability. Low precipitation probability/light winds/zero alerts do not establish safety or hazard absence. Genuine supplied procedures remain answerable with attribution. Complete KB/upload retention and explicit overflow behavior remain covered.

## Validation and preview acceptance

The complete `phase4:gate` passed, including regional/Streamlit suites, configuration validators, production build, upload checks and the shared request-scope suite. Extended focused suites also passed: 58 JavaScript request-scope checks, 2 Python scope tests covering the shared cases, and 5 Python upload/provider tests. Recording tests assert actual provider delivery, one streaming request, full document/KB retention, scope recomputation despite hostile clock/timezone hints, source offsets, stale-source handling, malformed metadata rejection, and unchanged output reserve. No cloud generation was performed.

The 49 fixed temporal fixtures cover the reported November 14 request-time failure, nonstandard source night boundaries, missing/expired/failed/stale evidence, early-morning language, dayparts, dates/clock ranges, local midnight, DST calendar arithmetic/gaps/folds, historical requests, IAP precedence/current-only/conflicting/stale/timezone-free plans, configured schedules, weekend/holiday operation and fixed-sunrise 16-hour fallback. Source/grid and positive supplied-SOP cases supplement those fixtures.

After the user's normal review → commit/push workflow, validate the branch's Vercel preview with the same mixed-source question, upload, enabled KB and captured weather evidence. Record actual provider/model, complete request/messages and whole answers. Verify the concrete interval and assumed/supplied status, reject unsupported assignments/actions/reassurance, and check each requested part. Hosted model answer acceptance remains open; transport tests and literal checks cannot close GROUND-001/002/003.

Suggested commit: `fix(copilot): ground hosted answers in shared request windows`.
