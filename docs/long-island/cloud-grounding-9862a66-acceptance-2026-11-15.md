# Corrective hosted acceptance — 9862a66 — November 15, 2026

**Disposition: FAIL. GROUND-001/002/003 remain open.** The 15-run corrected acceptance matrix completed with observed provider-bound requests and complete answers. All 15 model responses conformed to the envelope, and the original invented tide/cone triggers did not recur. Whole-answer review still found an operational-reference bypass, omission of available current observations, and a substantial answer-relevance/length regression. Schema compliance and source-copy fidelity do not close those failures.

## Verified deployment and evidence

Commit: `9862a6667b3bee0655c09b2fed317b67529b3fbf`, branch `codex/cloud-upload-coverage`, project `openember`, team `ember-li`.

- Original Git preview: `dpl_NDzPTmsB4Gxfbk1y1m1cGQcXwrNA`, [immutable original preview](https://openember-67gss3t63-ember-li.vercel.app/), verified READY.
- Acceptance deployment: `dpl_3e3gsFLNVypsSzkaijuedMMxmK7H`, [same-commit audit preview](https://openember-2dicylzwd-ember-li.vercel.app/), verified READY. Rebuilt the same Git commit with a temporary branch-specific preview audit variable; no runtime code was changed.
- After acceptance: the temporary project variable and local token/transport files were removed. A [same-commit preview without that project variable](https://openember-av8fwkrcr-ember-li.vercel.app/), `dpl_9uQZUDhAuA71dozcKgUW6WisLWCs`, is READY for ordinary review. Immutable deployments retain their build-time environment; deleting a project variable does not retroactively alter the audited build. Its token is not retained in the artifacts.

The [corrected session](acceptance/corrective-9862a66-2026-11-15-normalized/matrix.json) contains the predetermined matrix, shared raw source snapshots and their hashes, each actual client request/messages, observed provider request/response, full displayed Markdown, emitted application metadata, model, timing, integrity checks and a section-by-section `manual-review.json` for every run. Actual observed provider URL is `https://ollama.com/api/chat`; every response reported `gpt-oss:120b-cloud` and naturally stopped. Credential headers and provider thinking are excluded.

Transport uses the production React streaming parser from Node against the hosted Edge proxy, authenticated with the existing Vercel CLI. This is live cloud inference, **not a hosted browser-rendering or live Streamlit test**. The earlier local gate/browser checks are retained separately and do not certify these answers.

Public NWS and CO-OPS sources were captured once at approximately **09:39:49 EST / 14:39:49Z**. The session retains all eleven exact response bodies, including the unavailable Battery wind product. Forecast/grid revisions differ from previous days' captures. No causal latency comparison or byte-identical replay of the November 14 test is claimed.

The unchanged original mixed-source question and full synthetic upload were used for the three missing-evidence runs. Supplied and conflicting scenarios keep that question and use explicit synthetic exercise documents. Positive fixture validity endpoints were moved to the newly resolved source-defined night, **November 15 18:00−05:00 to November 16 06:00−05:00 / 23:00Z–11:00Z**; this is a disclosed fixture update, not a source weather revision. The synthetic water threshold is a test value, not operational guidance.

## Capture-harness error retained separately

The [initial session](acceptance/corrective-9862a66-2026-11-15/session-disposition.json) used Python fetch timestamps with six fractional digits. The production browser/request contract uses milliseconds; the Edge rejected those timestamps as stale. Six complete generations were captured before the batch was stopped, plus one interrupted HTTP attempt whose provider completion is unobserved. These are retained and **not scored as fresh-source acceptance**. This was a harness error, not evidence of model failure to interpret fresh weather.

The corrected session projects the same retained fetch instants to browser-compatible millisecond serialization; the [metadata projection](acceptance/corrective-9862a66-2026-11-15-normalized/sources/metadata-projection.json) records every before/after value. Raw response bytes are unchanged and original attempts are not overwritten. The capture/preparation scripts now emit/check the production timestamp contract before model calls. There were **21 complete captured generations in total: six harness-invalid plus fifteen corrected**, and one interrupted attempt. No unfavorable answer was dropped to obtain a pass.

## Whole-answer findings

### Blocking: unvalidated operational text bypasses the typed record gate

In [supplied-03](acceptance/corrective-9862a66-2026-11-15-normalized/supplied-03/answer.md), the model selects all KB reference IDs. The application then prints complete raw KB paragraphs containing blanket mandatory evacuation/category directives and a numeric heat-index protocol. [rolling-24h](acceptance/corrective-9862a66-2026-11-15-normalized/rolling-24h/answer.md) and [missing-sources](acceptance/corrective-9862a66-2026-11-15-normalized/missing-sources/answer.md) also print the heat protocol through the reference path.

These passages have broad module labels, without the validated issuer/reference, applicability, validity and conditions required for the controlled operational records. They are not attributed to the supplied exercise plan, but still appear in the assistant's answer outside the operational gate. The subsequent “reference excerpt only” qualifier does not establish applicability or validate the mandate. This review does not determine whether those external policies are currently correct; it establishes that the new enforcement boundary did not control them.

Owning path: `buildOperationalEvidence` builds unrestricted paragraph references, the model selects reference IDs, and `renderOperationalAnswer` prints their complete text. Exact-source ID validation proves where the text came from; it does not verify operational applicability. Fix this output channel in code rather than adding another prompt rule or a prose-certifying regex.

### Blocking: an ordinary current-conditions request loses available observations

[current-conditions](acceptance/corrective-9862a66-2026-11-15-normalized/current-conditions/answer.md) asks for “current measured conditions.” The scope remains `unspecified`, prints unresolved endpoints without a focused clarification, and drops the supplied JFK observation. The exact retained observation is **14:00Z, 8°C, wind 25.92 km/h**, with coordinates and field units; it is under the one-hour age policy at receipt. No observation or new source needs to be invented to answer this part.

The current-request recognizer handles “current conditions” but misses the inserted word “measured.” The selected-weather path then requires a resolved scope. This is an application parsing/selection failure, not a model hallucination or an actual observation outage. CO-OPS background remains visible, making the unsupported loss of JFK particularly clear.

### Blocking acceptance quality: preserved inputs become excessive answer text

All fifteen answers include an irrelevant source heading and/or duplicate complete source paragraphs. Many reproduce the full roughly 5.5 KiB synthetic filler paragraph. Corrected answers are **1,092–1,894 whitespace-delimited words / 8,716–15,366 UTF-8 bytes**, with machine-oriented grid field names, repetitive qualifications and sometimes unrelated contact/KB modules. Identical supporting facts are repeated in Facts, references and gaps. A current-measurement or named-station question also receives the generic cone-impact paragraph.

This fails the concise, relevant facts/gaps requirement. Preserving complete KB/uploads in the request must remain separate from selecting bounded, relevant answer content. In the positive fixture, verification/impact wording should distinguish supplied deployment/specification details from the actually missing rated-stability evidence.

## What improved in the repeated runs

- All three original mixed-source runs preserve the exact incident/count/channel source statements and source-specific missing commander. No missing name becomes confirmed vacancy or an appointment instruction; inventory does not automatically become deployed equipment.
- Independent projection from raw hourly evidence gives twelve eligible night hours, minimum **35°F**, winds **NW 7 / NW 6 / N 5 mph**, and 1% precipitation probabilities. The answer labels the hourly minimum correctly. It does not call it the published point-period nighttime low or infer zero precipitation/flood risk from probability.
- Only the **23:31Z / 18:31 EST Battery astronomical prediction, 0.952 ft MLLW**, falls inside the selected night. Earlier morning/afternoon tides are excluded. Current observations remain explicitly current background; no surge magnitude or site flood likelihood is inferred. Prediction-event samples are not continuous coverage; the captured feed contains no next-morning event despite its configured “48h” name.
- All three supplied runs retain Casey Example, 12 deployed cones/35 stored, ballast/placement, authorized Gate A radio use, conditional succession, the explicitly supplied synthetic threshold and exact procedure. Their typed record validity covers the resolved night. This is positive preservation evidence, not a blanket refusal to use supplied facts.
- All three conflicting runs surface conflicting commanders/succession statements and block promotion of conflicting typed thresholds/procedures. Shared non-conflicting inventory/deployment facts survive.
- The named-station case excludes unrelated CO-OPS stations from factual water evidence. Missing Kings Point future predictions stay a gap rather than borrowing Battery predictions. Rolling and later-date source-family selection is retained; deliberately missing/stale source variants do not turn into invented fresh weather.

These gains do not repair the reference-channel bypass or the current-observation omission.

## Matrix disposition

Each answer's lead/scope, Facts, Possible impacts, Source references, Gaps, Suggestions and any closing/table content were reviewed; there were no model-authored tables or blanket “all facts verified” conclusions. [Per-section review summary](acceptance/corrective-9862a66-2026-11-15-normalized/manual-review-summary.json) retains pass/limit/fail reasons and section hashes. Integrity checks match all fifteen actual provider-message arrays and all fifteen complete rendered answers to the deployed-commit code; those checks are explicitly **not semantic correctness verdicts**.

| Scenario | Completed runs | Result |
| --- | --- | --- |
| Original missing evidence | 3 | Known failure transformations contained in these samples; answer-source dumping/relevance fails. |
| Supplied evidence | 3 | Supported facts/procedures preserved; third run exposes unchecked mandatory/threshold reference text. |
| Conflicting evidence | 3 | Typed conflicts preserved/blocked; verbose and duplicative raw reference path remains. |
| Rolling 24 hours | 1 | Elapsed window/source selection retained; unchecked heat protocol appears through references. |
| Explicit later date | 1 | Point/grid selection retained; answer utility/length fails. |
| Named station | 1 | CO-OPS station selection retained; unrelated answer content fails relevance. |
| Current measured conditions | 1 | FAIL: unresolved scope drops fresh JFK evidence. |
| Missing sources | 1 | Source gaps/clarification preserved; unchecked heat protocol still appears via KB reference. |
| Stale sources | 1 | Stale values withheld; answer-source dumping/relevance fails. |

## Timing and disposition

Corrected runs completed between **14:43:14Z and 14:44:49Z**. CLI-wrapper/parser total durations were **2.231–5.168 seconds**, median **4.291 seconds**. Reported provider total durations were **0.971–3.839 seconds**. [Run summary](acceptance/corrective-9862a66-2026-11-15-normalized/run-summary.json) retains each run's curl/header/provider timings. CLI transport buffers delivery, so these are not browser-visible first-answer measurements or isolation of enforcement overhead.

Keep acceptance **FAIL** and all three grounding issues open. The next bounded correction needs to close the raw-reference operational bypass across every displayed section, support the observed current-measured phrase without losing valid observations, and bound/relevance-filter answer content while retaining full input sources and positive evidence. Use these exact captured cases as regressions. Do not certify arbitrary copied/generated prose with a regex, and do not force legitimately supplied facts/procedures to unknown to remove the failures.

Runtime code remains unchanged from committed `9862a66` during this acceptance session. New capture/review helpers and evidence/report artifacts are uncommitted. No production promotion, source commit or push was performed.

Recommended evidence commit: `test(copilot): record repeated corrective preview acceptance failures`.
