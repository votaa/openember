# Hosted preview next slice: weather evidence, known gaps and Markdown

**Follow-up status:** this document records the earlier slice and option A implementation. After the failed e480f23 hosted review, the user authorized controlled enforcement beyond A. See the [November 14 corrective scope and acceptance contract](cloud-grounding-corrective-scope-2026-11-14.md) for the next implementation. The earlier choices below are historical, not a pending authorization request. Current hosted acceptance remains **FAIL**.

Scope recorded November 14, 2026. Implementation target: `/private/tmp/openember-cloud-upload`, branch `codex/cloud-upload-coverage`. This is a scoped proposal, not implemented behavior. Items 1 and 2 and AIDA-style Markdown are scoped here; narrow item 3 remains a user decision. The previous item 1 decision is recorded in `cloud-grounding-followup-2026-11-14.md`.

## Outcome

Provide one request-scoped weather evidence view, a concise source-backed facts/gaps summary, and readable streamed Markdown. Preserve free-form questions, complete enabled KB and uploaded documents. Target the cloud React/Edge path and equivalent Streamlit behavior. Keep unrelated local-first branch integration separate.

## Item 1: select weather input by requested time

Resolve the actual requested interval first using server receipt time and the configured jurisdiction timezone. Implement rolling next 24 hours separately from local-calendar today/tomorrow and existing night/daypart/operational-period resolution.

| Requested time | Evidence selection |
| --- | --- |
| Current or measured past conditions | Applicable fresh observations with station, geography, observation time, units and availability; disclose missing historical observations. |
| Future valid times before request + 24 elapsed hours | Only overlapping hourly forecast and relevant forecast-grid intervals. |
| Future valid times at/after request + 24 elapsed hours | Only matching seven-day point periods and relevant grid fields for the requested time. |
| Window crossing the cutoff | Split the evidence into near-term and later segments; keep source and temporal granularity explicit. |

Use a half-open near-term boundary, ending at request time plus exactly 24 elapsed hours. The source is selected by each requested valid time, not merely its calendar-day label. A whole calendar day may contain observed/past, near-term and later portions; label each part rather than replacing today with a rolling 24 hours. Preserve original source intervals even where only part overlaps, and disclose coverage.

Remove duplicate out-of-window forecast values from every model-facing path: NOAA prose, ordinary live API summaries and structured request-window evidence. Preserve full raw snapshots in their source cache/acceptance capture for provenance. Keep enabled KB, uploads, map evidence, relevant alerts and unrelated requested sources available. An explicit broad forecast request still receives its requested days; no supported-question whitelist.

Normalize observations explicitly. Current structured weather snapshots omit observations, and the last mixed-source capture contained no observation feed. Use actual observation timestamp and station coordinates/area; fetch time and jurisdiction label do not establish applicability. A stale/unavailable observation remains a gap and is not replaced with a forecast presented as measured conditions. This slice uses configured existing observation sources; it does not infer a facility location or build a new station-discovery service.

Keep source-defined night-boundary resolution separate from value selection. A matching point period may define tonight's endpoints without supplying unrelated seven-day values. Use only eligible selected sources for factual calculations. Label minima as minimum in the supplied hourly forecast, with interval and coverage; do not rename them published nighttime lows. The captured example is 36°F hourly versus 34°F point-period nighttime low. No complete-window aggregate from partial/null coverage. Current alerts retain their own area and time scope, separate from future hazard likelihood.

Expected owning code: `src/data/requestScope.js`, `src/data/weatherContext.js`, `src/data/cloudRequestScope.js`, React context assembly in `src/App.jsx`, and Python equivalents in `streamlit/request_scope.py`, `streamlit/weather_context.py`, `streamlit/app.py`. Shared policy and fixtures keep JS/Python selection aligned. The Edge path must not reintroduce the unfiltered client summaries.

## Item 2: carry source-backed facts and known gaps into synthesis

Build a concise request-scoped evidence summary containing fact/value, unit, source ID/URL, original valid interval or observation timestamp, area, freshness, coverage and limitations. Keep it alongside the full enabled KB and document content; it is a navigation/grounding aid, not a replacement or summary truncation of those sources.

Represent supplied, not provided, stale, partial and conflicting information distinctly. Relevant examples: commander not named in this plan, cone specifications/ballast/placement not supplied, facility coordinates unknown, authorized radio-use scope unspecified. Scope the gap to the source: a missing name in one plan does not prove no assignment exists anywhere. An inability to extract information means extraction/coverage uncertainty, not evidence of absence.

Weather facts and gaps are derived from normalized source fields. Document facts need explicit supporting text and source references before being promoted into the summary. Use existing supported text uploads and conservative extraction; complex general document understanding is not promised. Do not hardcode CEDAR-731 or synthetic phrases into production logic. Ambiguous extraction remains unverified and full text stays available. Supplied applicable SOPs, assignments and equipment specifications remain answerable with attribution; do not permanently force fields to unknown when evidence exists.

Keep recommendations as suggestions unless an applicable source establishes a requirement. Supply the fact/gap summary consistently in React/Edge and Streamlit. A source reference alone is not proof that a model's interpretation is supported.

## AIDA-style Markdown presentation

Use the AIDA pattern already inspected in `ai-dispatch-advisor`: common prompt formatting instructions plus application-side Markdown rendering. Request a brief answer with relevant Facts, Possible impacts, Gaps and Suggestions; omit empty sections, avoid repetitions and use simple tables only where useful. Broad questions can still receive appropriate longer responses.

React currently displays answer text with pre-wrap; introduce Markdown rendering for assistant replies, including GFM tables, readable heading levels, horizontal table scrolling, safe links and disabled raw HTML. Preserve progressive text streaming, Stop behavior, copied answer text and readable incomplete Markdown during generation. User messages remain ordinary text. Streamlit already uses Markdown: align the response contract and presentation rather than adding a redundant renderer. Do not load model-supplied HTML or remote images automatically.

Application-owned request scope and source timestamps should be displayed from authoritative metadata where exposed, separate from model-authored narrative. Clearly label that provenance; metadata does not certify the whole answer. This scope does not promise a full code-generated briefing for arbitrary inquiries.

No provider-enforced JSON schema or second model call is needed. AIDA currently requests ordinary Markdown from the cloud model, then renders it and separately supplies application metadata. Presentation formatting does not verify factual correctness.

## Narrow item 3: choices pending user decision

The previous phrase “retain manual whole-answer review during acceptance” means a development/release test. After implementation and deployment to a verified preview, run the representative questions, save the complete answers, and have the user/agent reviewer compare every section with captured evidence. Mark each case pass/fail with reasons; keep failed cases open. It does not add a human approval step to ordinary user questions, run another model, or delay normal chat responses. Findings can lead to another implementation change; there is no automatic guarantee that every later answer is correct.

| Choice | Scope and timing effect |
| --- | --- |
| A: acceptance review only (recommended initial choice) | Run source/prompt/UI checks and manual whole-answer review before considering the slice accepted. No new per-answer validation gate or model call; keep streaming. |
| B: A plus validation of app-owned fields | Validate resolved endpoints, selected source IDs, units, source URLs and coverage metadata before emission; display app metadata from these checked values. These are code checks, not parsing arbitrary model prose. Measure added latency; no extra inference is required. These checks do not catch a contradictory sentence written by the model. |
| C: full generated-answer validation | Buffer the answer, interpret factual/semantic claims, then display or reject it. This can defer visible prose until generation completes and adds substantial verification complexity. A model reviewer adds another inference step. Defer this option for this slice. |

Simple text/regex diagnostics may support acceptance review but cannot establish correctness and must not silently rewrite, suppress or certify responses. Choice A/B does not promise to catch hallucinated operational thresholds or likelihoods in every response.

## Validation and completion criteria

- Shared JS/Python fixtures: current observation, tonight, rolling 24 hours, local calendar day, tomorrow crossing the cutoff, exactly 24-hour boundary, later day, mixed near/later request, stale/missing/partial sources, midnight and DST. Preserve full requested KB/upload content and raw captures. The generic tonight prompt must not receive November 18 values merely because they appear in an available seven-day/grid source.
- Known-gap fixtures include missing and explicitly supplied commander, cone specifications, location and radio authority, conflicting sources and uncertain extraction. Missing values stay source-scoped unknown; explicit supported facts and procedures remain usable.
- Recording-provider tests check actual complete messages in both runtimes and the Edge request path, not only formatter helper output. Assert that ordinary live summaries cannot bypass selection.
- Presentation checks: headings/lists/tables, long table scrolling, links, disabled raw HTML, partial Markdown while streaming, Stop and retained history. No extra model call for formatting.
- Run the branch's complete phase-4 gate, followed by hosted acceptance on a verified deployment commit. Capture public weather once per test session, full enabled KB/upload, actual client request, whole visible answer, provider/model and timing. Treat reconstructed provider egress as reconstructed, not observed. Include original mixed-source, near-term, later-day and explicit missing-data/positive-evidence cases. Record source changes when comparing runs; no causal or exact-replay claim for different weather revisions.
- Acceptance review checks every section, table, recommendation and conclusion: dates/geography, source-faithful values, uncertainty, no invented thresholds/likelihoods or operational authority. Full model answer compliance remains a measured gate rather than something deterministic prompt tests prove.

Implementation order: item 1 selection and conformance; item 2 facts/gaps; Markdown presentation; approved narrow item 3 option; existing gate and hosted review. No model change, broad branch merge, deployment policy change, automatic prose rewriting or production promotion is included. Follow the user's review/commit ownership.

## Implementation status — November 14, 2026

Implemented locally with user-selected narrow item 3 **A**. See [implementation and local acceptance](cloud-preview-next-slice-implementation.md). The local gate and deterministic browser checks pass; hosted whole-answer acceptance remains pending user review/commit and a verified preview.
