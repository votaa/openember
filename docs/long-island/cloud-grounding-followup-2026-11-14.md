# Cloud grounding follow-up — November 14, 2026

Implemented in `/private/tmp/openember-cloud-upload` on `codex/cloud-upload-coverage`, based on `7001e59`. GROUND-001/002/003 remain open pending live whole-answer acceptance.

Both runtime prompts now require applicable supporting evidence for asset thresholds, impact likelihoods and operational reassurance. Unknown commander assignment must remain unknown in every section, including impact reasoning and summaries. Conditional wording alone does not justify a likelihood, threshold or safety conclusion. Applicable thresholds and procedures actually supplied by evidence remain usable with attribution.

The shared `shared/grounding-regressions.json` records the four user-reported failures: unassigned commander, invented 15 mph cone threshold, unsupported drizzle/frost likelihood and “no threat to utilities.” Representative rejected wording is labelled as such. The useful conditional analysis remains explicit: “Cone displacement is possible, but stability cannot be assessed without cone specifications, ballast and placement.” Later caveats cannot repair unsupported claims elsewhere.

`npm run test:grounding` checks JavaScript/Python prompt equality, all four regression rules, the conditional example and actual Edge/Streamlit delivery to recording providers. It replays the exact retained mixed-source question and complete captured request with the original November 14 request timestamp for deterministic window checks. All uploads survive; the resolved night remains 23:00Z–11:00Z. The Edge recording-provider test uses actual current receipt time, so historical source freshness is handled by the existing server policy. No test output is represented as a model-generated answer or a grounding-quality verdict.

Validation: `phase4:gate` passed with 135 JavaScript checks and 130 Python test runs, including configuration validation, production build, request-scope parity, upload checks and the new grounding regressions. Generated dist changes were restored. No deployment, commit, push or cloud inference was performed.

## Pending live review

After user review/commit and a preview containing these rules, rerun the unchanged mixed-source question with the retained complete upload, five KB modules and captured weather. Use an explicitly historical interval for a frozen November 14 replay; report that change in scope rather than treating old weather as current tonight. Retain the full answer and review every section, including tables and closing statements:

| Section | Required review |
| --- | --- |
| Facts | Exact CEDAR-731, 47 amber cones and DELTA-19; commander unspecified with actual assignment unknown; source-valid low, wind, URL and UTC offsets. |
| Possible impacts | Cone displacement stays conditional with missing specifications, ballast and placement. No invented threshold, unsupported drizzle/frost likelihood, or reasoning from commander absence. |
| Gaps | Unknown asset conditions, assignment and utility risk remain unknown. Do not deny evidence actually supplied or substitute missing coverage for zero. |
| Recommendations and conclusion | Suggestions remain suggestions; no unsupported operational reassurance or contradiction of earlier unknowns. A late disclaimer does not repair an earlier false claim. |

The initially misplaced implementation and its local 4B run were archived at `/private/tmp/openember-misplaced-grounding-slice-2026-11-14`; `/Users/anthonyvota/Projects/openember` was restored to its original clean state. That local result is not acceptance evidence for this cloud branch. This branch contains the adapted cloud implementation, not the local-first policy/benchmark machinery.

Suggested commit: `fix(copilot): ground asset impacts and preserve unknowns across sections`.

## Agreed approach for item 1 — weather input selection

User confirmed this approach on November 14, 2026. This records the planned input fix; it is not yet implemented.

- Resolve the requested interval from the authoritative request time and jurisdiction timezone. Add explicit rolling “next 24 hours” support; keep that distinct from the local calendar day.
- Use relevant, fresh local observations for current/measured conditions only. Preserve station/location, actual observation time, units and freshness. Observations do not establish future conditions or fill unobserved earlier hours.
- For requested future times within 24 elapsed hours of the request, use only matching hourly-forecast and forecast-grid intervals. Use the seven-day forecast for requested times beyond that horizon, filtered to those times. Split a window crossing the horizon into clearly dated near-term and later segments.
- Remove out-of-window weather from every model-facing representation, including the duplicate prose NOAA/live summaries; do not retain a full multi-day summary alongside WINDOW MATCHES. Keep complete raw captures separately for provenance. Preserve enabled KB and uploaded-document context.
- Label hourly-derived minima as minima in the supplied hourly forecast and state coverage. Do not silently call them the published nighttime low: the retained November 14 capture has hourly minimum 36°F versus published point-period nighttime low 34°F. Do not extrapolate full-window minima or totals from partial coverage.
- Current alert results retain their own area/time scope and do not establish no future impacts. Missing/stale coverage remains unknown. Preserve exact valid times, UTC offsets, source URLs and geography; no source establishes an unspecified facility's location.
- Keep night-boundary resolution separate from weather-value selection. The existing point-period boundary may define a source-defined night without exposing unrelated seven-day values to the model.

Inspection evidence: the captured mixed-source client system message contains all 14 seven-day periods, 48 hourly summary rows and multi-day grid summaries in addition to filtered WINDOW MATCHES. November 18 occurs four times in the seven-day summary and seven times in the grid summary. This makes source confusion plausible, but does not prove the root cause of the model's invented dates. The captured structured weather sources do not include observations; observation normalization must be handled explicitly rather than assuming those readings are already in WINDOW MATCHES.

Item 1 remains a focused input-selection change in both runtimes. Output formatting, response validation, model comparisons and branch integration are separate work.

## Next-slice scope

The [focused implementation scope](cloud-preview-next-slice-scope.md) elaborates the agreed item 1 approach, item 2 facts/gaps and AIDA-style Markdown presentation. Narrow item 3 remains a user decision; manual whole-answer review refers to acceptance testing, not an approval step during ordinary chat.

## Corrective scope after failed e480f23 review

The user has now explicitly expanded item 3 beyond option A to require controlled, source-backed operational triggers. The [bounded corrective scope and acceptance criteria](cloud-grounding-corrective-scope-2026-11-14.md) supersede the pending-choice wording above for this follow-up. It specifies regressions first, CO-OPS time/geography selection, source-scoped unknowns, a flood-threshold provenance audit, controlled operational output and positive-evidence preservation, followed by the full phase-4 gate and repeated fully captured hosted review. This is a scope deliverable before runtime implementation. Current hosted acceptance remains **FAIL**; GROUND-001/002/003 remain open.
