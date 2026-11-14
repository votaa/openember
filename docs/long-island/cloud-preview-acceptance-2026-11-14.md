# Hosted mixed-source acceptance — November 14, 2026

**Decision: FAIL. Keep GROUND-001, GROUND-002 and GROUND-003 open.** One real cloud answer was reviewed in full. Correct document retrieval and basic weather facts do not outweigh contradictory assignments, unsupported operational reassurance or invalid source-window use.

Target: `codex/cloud-upload-coverage`, deployed commit `7bdb1f723df99c7cb23a10420ccdf28861757f6a`, [immutable Vercel preview](https://openember-nmymjfogq-ember-li.vercel.app/). Configured upstream `https://ollama.com`; configured and response-reported model `gpt-oss:120b-cloud`. Host/model configuration was checked read-only without retrieving an API key. The response terminated naturally with `done_reason: stop`.

## What was actually tested

The exact original mixed-source question:

> Using the uploaded plan and enabled KB, explain tonight's weather impacts on this facility. Include CEDAR-731, amber cones, radio channel and incident commander. Give the low, wind and exact forecast URL; distinguish facts from possible impacts.

The exact complete repository upload, `synthetic-plan.txt`, was included: 5,672 UTF-8 bytes, SHA-256 `501c71d84e729164c7264960330518bc6e12ff97bb9b08d69e336da39d65252a`. All five configured KB modules were enabled and retained in full: flood zones, evacuation zones, critical infrastructure, hazards, and resources/contacts. No private upload, personal chat history, credentials or environment-file contents were sent.

A single fixed set of public NWS point, hourly, grid and NY alert responses was captured at 09:50:20 EST / 14:50:20 UTC. Point/hourly/grid `updateTime` is `2026-11-14T07:03:15+00:00`. Those captured bodies were reused without refetching or substituting another revision during the live request. Selection was a clean-start initialization message with no loaded ArcGIS evidence or prior analytical answer.

**Comparison limit:** the original user-tested hosted run did not retain its raw weather, complete history or runtime KB overrides. This is a new fixed-snapshot acceptance run using the original question/upload and five configured KB modules, not a proved byte-identical replay of the earlier hosted request. It must not be presented as an exact before/after forecast comparison.

The production React streaming function and context builder were invoked from Node against the actual hosted Edge proxy. The first unauthenticated attempt hit Vercel Authentication, not the app/provider. The official cached Vercel CLI then used the user's existing authentication to submit the request, without changing deployment protection. Exactly **one authenticated model answer** completed. This is hosted API/model acceptance, not a browser rendering, Stop, or Send-to-paint test.

## Request/message provenance

- [Actual client wire request](acceptance/cloud-preview-2026-11-14/client-request.json): 228,069 bytes; includes all submitted messages, full upload manifest/text and raw supported weather fields. The complete client messages total 30,000 UTF-8 bytes.
- [Actual client messages](acceptance/cloud-preview-2026-11-14/client-messages.json), [full context](acceptance/cloud-preview-2026-11-14/context.txt), [enabled KB](acceptance/cloud-preview-2026-11-14/enabled-kb.json), [upload](acceptance/cloud-preview-2026-11-14/upload.txt), and [fixed weather capture](acceptance/cloud-preview-2026-11-14/weather-capture.json).
- [Whole visible answer](acceptance/cloud-preview-2026-11-14/answer.md), [captured response frames](acceptance/cloud-preview-2026-11-14/response.ndjson), and [run metadata](acceptance/cloud-preview-2026-11-14/run.json). The saved stream retains visible content and terminal/provider metadata; internal provider thinking fields were omitted. Concatenating its visible content reproduces the complete answer file.
- [Provider request reconstruction](acceptance/cloud-preview-2026-11-14/provider-request-RECONSTRUCTED.json) and [scope reconstruction](acceptance/cloud-preview-2026-11-14/scope-RECONSTRUCTED.json) are explicitly **not observed server egress**. They use deployed-commit code and an estimated server receipt time. This preview exposes neither the exact server clock nor the final provider-bound message array. Therefore the requirement to record the actual complete provider-bound request remains unmet; it cannot honestly be replaced with a reconstruction. Preview-only, opt-in request auditing would be needed for that evidence.

The observed server request reference is `iad1::iad1::cdfzl-1794668186665-f30840aa4727`; HTTP 200, one terminal frame. All retained capture files have file-byte digests in [SHA256SUMS.json](acceptance/cloud-preview-2026-11-14/SHA256SUMS.json).

## Full-answer review

| Requested part / rule | Result | Evidence |
|---|---|---|
| CEDAR-731 | Pass | Identifier retained. |
| Amber cones | Partial | Correct count 47. Later stability/continuity conclusions lack cone, placement and site evidence. |
| Radio channel | Partial | DELTA-19 retained. Authorized use, reliability and interference are not established. |
| Incident commander | **Fail** | Starts with “Not supplied,” then says “no incident commander is assigned” and repeats “no incident commander assigned.” The initial qualification does not repair the contradiction. |
| Nighttime low | Pass | 33°F matches the captured point period. |
| Sustained wind | Pass | Around 10 mph NW matches the point period. |
| Exact forecast URL | Pass | Correctly copies `https://api.weather.gov/gridpoints/OKX/62,50/forecast`. |
| Concrete interval and supplied/assumed status | Partial | The answer gives November 14 18:00–November 15 06:00 EST, UTC−05:00, labelled source-defined. Those are the correct supplied point-period endpoints, equivalent to 23:00Z–11:00Z. However, application scope actually resolves to `clarify`, not that interval. |
| Hourly/grid source-window alignment | **Fail** | Applies a daytime UTC gust to tonight and shifts grid rows into the wrong local hours. |
| Probability and QPF | Partial | Initially retains 6%. The captured grid does contain zero-valued QPF blocks overlapping the requested night; zero was not manufactured solely from probability. But the answer then infers no flooding/traction concerns and introduces “light drizzle,” absent from Tonight's narrative. |
| Alert fact | Pass for the factual count | The NY alert capture has zero features. Zero alerts at fetch time is supported; treating it as proof of safe operations is not. |
| Fact / impact / recommendation distinction | **Fail** | Headings separate categories, but the complete answer contains categorical unsupported claims under impacts and summary. |
| Actions, assignments and reassurance | **Fail** | Claims no ice-related hazards, no significant flooding risk, good radio propagation and normal activities continuing as planned. Facility conditions, authorized activities and operating status are unknown. |
| SOP/succession | Limited improvement | Does not invent the previous supervisor-takeover/“Standard SOP”; labels the final recommendation a suggestion. This answer does not test the separate positive supplied-SOP case. |
| Facility location | Partial | Acknowledges micro-site uncertainty but does not establish facility coordinates or applicability of the selected forecast point. |

Specific rejected claims include:

- “No freezing temperatures are forecast, so **no ice-related hazards** are expected.” A point air-temperature forecast does not establish all surface/equipment conditions or hazard absence.
- “**No significant wet-ground or flooding risk** for the site.” Neither low probability nor forecast-zero QPF establishes the site's vulnerability, runoff, tidal or infrastructure conditions.
- “**No incident commander is assigned**.” The document establishes only that no commander was supplied.
- “Standard night-shift activities ... **can continue as planned**.” The upload supplies an identifier, inventory count and named channel, not an approved activity plan or safe operating envelope.
- “Radio propagation **should be fine**.” A named channel and weather feed do not establish equipment, channel authorization, propagation path or reliability.

These are whole-answer failures even though the opening facts table is substantially correct. A later gap paragraph does not repair an earlier unsupported claim.

## Date contract failure reproduced in both runtimes

[Scope diagnostic](acceptance/cloud-preview-2026-11-14/scope-diagnostic.json) reproduces the same error in JavaScript and Python:

1. With the point forecast alone, Tonight resolves correctly to November 14 18:00–November 15 06:00 EST.
2. With the actual point **and hourly** snapshots, scope becomes `clarify`, with no interval and no WINDOW MATCHES.
3. `matchingPeriod()` in `src/data/requestScope.js` and `matching_period()` in `streamlit/request_scope.py` treat all `properties.periods` as full-night candidates. Hourly records also have `isDaytime: false`; their subdivisions make the supposedly unique night ambiguous.

The live answer ignores that clarification and builds a night assessment from the unscoped reference summaries. Correct top-level dates therefore do not demonstrate a working application date contract.

An independent raw-source check confirms the grid error. The rounded **40.7 km/h** gust is actually **40.744 km/h** at `2026-11-14T18:00:00+00:00/PT1H`: **13:00–14:00 EST**, five hours before the expected 18:00 EST night start. The answer writes “18:00 UTC (22:00 EST)” and applies that value to tonight. At **18:00 EST / 23:00 UTC**, the captured grid value is **29.632 km/h**, not 40.7. The selected overlapping raw rows are retained in [expected-source-evidence.json](acceptance/cloud-preview-2026-11-14/expected-source-evidence.json). This is a direct timestamp/value comparison, not a model-derived weather conclusion.

This realistic point-plus-hourly interaction was absent from the previous fixed fixtures. A passing fixture gate did not establish hosted acceptance.

## Timing and scope limits

Authenticated curl recorded 2.10 s to response headers and 9.46 s total HTTP transfer. The upstream terminal frame reports 7.73 s total model duration, 11,728 prompt tokens, 48 cached prompt tokens, and 3,142 generated tokens. Generated tokens may include internal thinking. The CLI-authenticated wrapper took 11.80 s end to end, including authentication/process overhead and buffered delivery to the local parser. None of these is a browser-visible first-answer measurement.

The natural stop and complete visible stream demonstrate completion of this answer, not operational readiness, full provider-input retention, or stochastic reliability. No repeated live trials or favorable cherry-picked retry was used. The original tonight question does not invoke the sunrise fallback; earlier deterministic fallback checks are not live model acceptance for that separate case.

## Required next work

Keep all three issues open and this branch unpromoted. Distinguish point-period candidates from hourly records, add this captured multi-source case to shared JS/Python regressions, preserve correct per-source UTC/local interval alignment, and retain the whole-answer unknown-versus-absent/operational-reassurance rubric. Add opt-in preview provenance capture if actual provider-bound message recording is required. Revalidate the same frozen inputs after a corrective commit; do not replace them with a different forecast or a narrower question.

Only validation scripts, captured public/synthetic evidence, this report and tracker status were changed. No production runtime fix, deployment configuration, API key, commit, push or promotion was performed during this validation.

Recommended validation commit: `test(copilot): record hosted mixed-source grounding failures`.
