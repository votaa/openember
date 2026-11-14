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
