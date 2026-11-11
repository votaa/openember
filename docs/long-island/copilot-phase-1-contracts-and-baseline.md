# Copilot phase 1: contracts, capability baseline and conformance

Date: November 11, 2026

Implements phase 1 of the [local-query and grounded-context plan](copilot-local-query-and-grounded-context-plan.md). The new modules are not imported by the application entry points. Current chat behavior and provider configuration remain on the existing path. Local handlers, HTTP negotiation, UI integration, context selection and provider-specific message construction belong to subsequent phases.

## Capability inventory before integration

The owning code, rather than the initial benchmark list, defines the compatibility surface:

| Capability / entry point | React ownership and current behavior | Streamlit ownership and current behavior |
| --- | --- | --- |
| Free-form chat | `src/App.jsx:sendQuery`; input Enter, Send and quick questions share this path | `streamlit/App.py:queue_chat_prompt`, quick questions and `pending_query` share `prepare_chat_job` |
| Map feature question | `mapFeatureChatPrompt` in `src/data/mapInteraction.js` formats selected feature name/description into the question | `map_feature_chat_prompt` in `streamlit/map_interaction.py`; selected map record enters the same pending-query path |
| Configured KB | `buildRuntimeKB`, `buildContextRT`; five UI module IDs: floodZones, evacZones, criticalInfrastructure, hazardProfiles, resources; local settings override configured text | `KNOWLEDGE_BASE`, `active_kb`, `build_knowledge_base_context`; configured module keys and labels, with jurisdiction-specific content |
| General synthesis | Every question receives enabled KB automatically, including explanations, comparisons, summaries, drafting, unfamiliar phrasing and mixed evidence | Same model-capable inquiry surface; no intent whitelist |
| Uploads | `ingestFile` uses FileReader text; `buildContextRT` includes the first 4,000 JS string code units of each file | Text/CSV/JSON/GeoJSON/Markdown uploads decoded as UTF-8 with replacement; `build_context` includes first 4,000 Python code points |
| Live API results | `summarizeAPIData`: weather alert examples, point forecast, USGS gauge samples, unavailable/parse-error markers; other successful types currently say received | `summarize_api`: same broad classes plus FEMA disaster and civic complaint summaries |
| NOAA context | Initial NOAA batch and pre-Send refresh of missing/stale alerts, point/hourly forecast and grid; `sendQuery` appends current NOAA summaries with provenance | `auto_fetch_noaa_endpoints`, `refresh_stale_endpoints`; `build_context` appends all retained NOAA text, not only benchmark weather products |
| Tidal evidence | CO-OPS can arrive through NOAA text; no separate structured live-gauge chat section | Additional structured CO-OPS station level, MLLW units, trend, next high/low and fetched time in `build_context` |
| Phase 4 / 311 | Configured source endpoint, filter, report window, every available aggregate including zero, five examples and complaint limitations | Same citation requirements; source registry resolved through `CFG.source` |
| Loaded map layers | `fetchMapLayerEvidence`, `mapLayerContext`: all current visible added layers, complete count distinct from samples, statistics summaries and query scope | `current_map_evidence`, `map_layer_context`: current visible added/operational layers; scoped queries and independent complete counts |
| Catalog | `esriItems` appended separately as catalog metadata | `esri_items` included by `build_context`; Add to KB can also queue a summarization question |
| Geography and visibility | Runtime jurisdiction, configured sources, current geography masks, attribute filters, visible layers and selected-feature question | Configured jurisdiction, current geography filters, operational selection and visible layers; removal must invalidate evidence |
| Recent history | System prompt plus last ten user/assistant messages including this question | Same bounded messages before the pending assistant placeholder; session worker receives an immutable payload |
| Provider and delivery | `lib/chat-handler.js`, `lib/ollama.js`, `src/ollama-client.js`; NDJSON, Stop, partial responses and timing | `streamlit/ollama_provider.py`, `ChatJob`, `sync_chat_job`, fragment renderer; rerun-safe worker and automatic completion |
| Alternate consumers | `src/hooks/useOllama.js` compatibility helper; messages-only benchmarks and scripts | Native provider/worker tests and retained replay scripts |
| Deployment boundary | Local `server.js` supplies native transport; hosted `api/chat.js` forces cloud-only | Existing independent Python runtime; no new service or subprocess bridge |

`src/data/longisland.js` and `src/data/nyc.js` also contain older context builders; they are not the current `sendQuery` context path. The golden capture exercises the actual inline builders rather than substituting those older helpers.

Existing differences are recorded rather than declared equivalent: separate tidal sections, FEMA/civic summaries, NOAA section order, uploaded-file labels and Unicode excerpt boundaries. React's current KB UI constructs five named modules; the generic context builder can render a custom module but the UI does not yet expose arbitrary extra keys. The hybrid contract accepts arbitrary enabled module IDs. Phase 2/3 integration must preserve configured extensions without adding query handlers, and explicitly resolve the UI construction gap. Disabled modules may still appear in old assistant prose today; the new context builder must respect current module/visibility state rather than treating that prose as authoritative evidence.

Streamlit's NOAA `fetched_at` currently contains only `HH:MM:SS`. It cannot establish a dated freshness interval. The phase 1 adapter preserves it, adds a limitation and reports unknown freshness. Before direct answers are enabled, phase 2 must supply dated, offset-qualified fetch times and source-specific refresh decisions. Another existing gap is that React's live-forecast summary supplies URL/fetch time while Streamlit's `summarize_api` forecast branch does not; retained NOAA text supplies additional provenance. These differences must not be lost behind a shared lowest-common-denominator adapter.

## Golden legacy construction baseline

`shared/copilot/fixtures/legacy-input.json` contains only public configured KB/source metadata and synthetic evidence. `legacy-prompts.json` retains the complete system and recent-history messages for each interface independently. Capture precedes any runtime refactor. The test helpers extract the unmodified production builders; no model, browser, network or credentials are needed.

The 11 scenarios per interface cover each of five current KB modules, a synthetic configured extension, whole-KB briefing, mixed document/map/live/KB analysis, disabled modules, implicit KB use and a follow-up. Evidence also includes point forecast, failed alerts, USGS, FEMA, civic data, NOAA tidal/text products, loaded map data, 311 zeros/provenance, catalog metadata and Streamlit's tidal-gauge section. A long extension ends in `LATE-KB-DELTA-19`, beyond the local tuning target. The uploaded text includes `CEDAR-731`, 47 amber cones, an absent commander and a late radio-channel fact beyond the legacy excerpt.

Only React's wall-clock LIVE API heading is normalized to `<request time>`. Everything else, including full KB text, rules, URLs, original offsets, evidence ordering and interface differences, is retained. Tests compare complete message arrays and assert full module retention and exclusion of disabled module text. They deliberately assert that the late upload fact is absent from the legacy prompt; phase 3 retrieval must improve that limitation without losing current excerpts.

These are construction/coverage baselines. They do not prove answer quality, real cloud-model parity, acquisition timing, browser delivery or hybrid request behavior. Live cloud acceptance remains pending separate authorization. Changes to the golden files require an intentional coverage review; do not regenerate them just to make changed builders pass.

## Version 1.0 contract

The single authority is `shared/copilot/contract.schema.json` (JSON Schema 2020-12, definitions selected with `$ref: #/$defs/request`, `evidence`, `plan` or `result`). `policy.json` owns the ordered routing patterns, guards, budget parameters and switch design. JavaScript and Python validators implement only the keywords used by this schema; a reference-validator check also runs when `jsonschema` is available in the test environment. No runtime dependency was added.

| Object | Required meaning |
| --- | --- |
| Request | Version, request ID, complete question, `auto`/`model` answer method, at most ten bounded user/assistant history messages, jurisdiction/timezone, enabled module IDs, current geography/layer/feature/source selection, full typed evidence snapshot and request time |
| Evidence | Stable ID, kind, source name/URL/ID and provenance, original fetch/valid times, geography, filter/where/layer scope, separate availability/freshness/completeness and omission state, structured values and limitations |
| Plan | Original question, `local`/`synthesis`/`clarification` outcome, all operation questions, intent, requested fields, resolved scope, status/reason, enabled modules and provider-specific context policy |
| Result | Execution mode, answer status/text, evidence references, response scope, actual provider/model or null, attempts, request/generated time, per-source states, warnings and timings |

Evidence kinds are forecast, map_layer, reports_311, kb, document, live, catalog and selected_feature. Forecast periods preserve the source dictionaries; map values distinguish complete_count from displayed_subset and samples; 311 includes category aggregates, report window and records. Documents retain full extracted text as a stable initial passage with code-point offsets, preserving text after character 4,000. Passage selection and extraction-size UI disclosures are phase 3 work. Catalog text is explicitly metadata. Generic live/selected-feature payloads retain supported data without forcing every source into the benchmark's named fields.

The initial schema bounds requests at 8 MiB serialized UTF-8, 256 evidence blocks, a 16,000-code-point question, and ten 32,000-code-point history messages. Duplicate evidence IDs, unknown contract versions, system-role history and unknown top-level fields fail validation. Payloads remain extensible within their typed kind. The byte limit is an application design limit, not a claim about hosted request capacity; phase 2 must enforce limits before body parsing at the HTTP boundary and surface an explicit size limitation. Never silently truncate to meet it.

No provider, model, credential, fetch URL or trusted route hint is a client request setting. Source URLs are attribution on user-loaded snapshots, not an allowlist or authority to make server fetches. Phase 2 source acquisition must resolve configured source IDs and validate layer query permissions; it must not turn arbitrary snapshot URLs into server fetch targets. Provenance explicitly distinguishes browser snapshots, server snapshots and configured KB. Current browser selection is user state, not independently verified source truth.

## Pure planners and adapters

Implemented modules:

| Responsibility | JavaScript | Python |
| --- | --- | --- |
| Validation, shared policy, budget estimate, switch/handshake design | `lib/copilot-contract.js` | `streamlit/copilot_contract.py` |
| Pure source snapshot adapters | `lib/copilot-evidence.js` | `streamlit/copilot_evidence.py` |
| Intent and scope planning | `lib/copilot-intent.js` | `streamlit/copilot_intent.py` |

Handlers, context builders and application services retain the proposed phase 2/3 names in the original plan. These new modules have no provider or UI imports. JavaScript currently loads the shared files in the server runtime; optional browser preplanning would need browser-compatible resource loading. Server recomputation remains authoritative.

Order and semantics:

1. Validate the request; treat uploaded/catalog content solely as evidence.
2. Preserve negated/quoted requests on the synthesis path. Resolve a simple temporal follow-up only from the most recent user request if it was a single recognized forecast operation and current geography has not changed.
3. Match whole supported operations using shared anchored patterns and semantic guards. Open-ended place/layer captures cannot absorb another instruction. Compound requests use the local outcome only when every part is supported.
4. Resolve explicit place before selection/configured geography; resolve named/selected layers and source IDs before defaults. Multiple matching sources/layers require clarification. Unknown geography never borrows another forecast.
5. Retain unsupported phrasing, explanations, comparisons, document/KB questions and source types on synthesis, with all enabled module IDs. An explicit `model` preference keeps deterministic operations as future grounding inputs but selects synthesis.

Operation status distinguishes `ready`, `acquire`, `clarify`, `unsupported` and `synthesis`. `local` plus `acquire` means the recognized operation still needs evidence; it is not an answer or proof of availability. The application service must refresh/replan before formatting a direct result. Stale/unavailable sources request refresh; hidden/omitted sources cannot establish facts; incomplete populations cannot establish exact totals. Budget omission requests recovery with `evidence_omitted_by_budget`, distinct from source absence or a hidden selection. No acquisition or provider attempt happens in these pure functions.

The first grammar deliberately recognizes a small set of named point-forecast facts, complete loaded-layer counts and 311 category counts. Forecast interval resolution uses supplied named periods or the first period, preserves original offsets and refuses a nighttime high or an unavailable requested field. The planner does not guess calendar dates from weekday labels. Phase 2 must expand shared fixtures for explicit intervals, relative dates/weekday names, additional common wording and source-specific refresh coverage before claiming the whole initial direct-answer scope. Unmatched questions remain fully synthesis-capable during that expansion.

The conformance corpus covers zero/unknown/partial counts, hidden/removed/omitted layers, source selection, explicit geography, all-local and mixed compounds, negation, quoted instructions, long/Unicode documents, late KB content, disabled modules, DST offset preservation, missing forecast fields, assistant-history injection and model preference. Both runtimes consume the same fixtures and return identical complete objects.

## Token-accounting decision

Phase 1 chooses a dependency-free **estimate**, `utf8_bytes_plus_template_reserve_v1`. Content bytes are divided by one byte per estimated token, then 64 tokens per message and 1,024 template tokens are reserved. Reserve another 2,048 tokens for generation and 1,024 for safety. The explicit allocated local context is required; `default` is not a verifiable capacity.

This intentionally conservative estimate avoids the earlier characters-as-tokens mistake and handles Unicode consistently in both runtimes. It is not an exact Qwen tokenizer, a proven upper bound for every template/model or a measured native input count. It can reject inputs that would fit. No tokenizer download, new model, context allocation or provider option is introduced. The current raw-byte budget and headroom may be revisited only with actual model/template evidence.

`fits_estimate` is preflight information. It never authorizes discarding mandatory KB, question/history or required evidence. Phase 3 must retain full enabled KB, reduce unrelated live products first and explicitly disclose mandatory-evidence overflow. Cloud messages never inherit this local estimate or selected local prompt. The retained full snapshot supports normal cloud acquisition and full context rebuild on permitted pre-stream fallback.

Native `prompt_eval_count` plus runner allocation/truncation logs remain required for local acceptance. A passing estimate does not prove retention; any native input truncation fails acceptance. The 3K–5K target is an experimental actual-input target, not a hard cutoff. Phase 1 makes no inference, retention or latency claim.

## Legacy/hybrid switch and negotiation design

The server-owned setting is `COPILOT_EXECUTION_MODE=legacy|hybrid`, default `legacy` in both runtimes, including hosted. The helper validates this setting but is not connected to startup or Compose in phase 1. Existing environment files are untouched. Setting it today does not enable an unfinished path.

Phase 2 will expose capabilities independently of model status, without `/api/tags` or generation. The helper's proposed payload is `{execution_mode, request_versions, legacy_messages}`: legacy advertises no structured versions; hybrid advertises `1.0`; both keep messages-only support. Do not expose hybrid capability until the HTTP/application path is implemented. Keep the existing model-status endpoint separately usable by old clients. New clients must negotiate capability before choosing the structured path; a negotiation failure uses the unchanged legacy path with an explicit legacy label. Model absence must not disable recognized local operations once hybrid is enabled.

NDJSON retains existing content/provider/error/terminal `done` semantics and gains a distinct response-metadata frame/callback in phase 2. Local answers use null provider/model, never a fake model success. Cancellation never triggers fallback. Existing messages-only requests keep static messages. The single existing provider attempt loop will later accept server-owned per-provider message construction; a local-first cloud attempt must rebuild full cloud context after cloud-required acquisition, and must not replay after the existing first-frame commitment boundary.

Local rollback restores legacy and recreates affected services after integration. Hosted promotion, deployment, cloud spending and configuration changes remain separate decisions. Docker packaging now copies only the shared schema and policy into both runtime images. An isolated-copy test checks imports without repository mounts; actual image/browser acceptance remains a later gate.

## Verification and phase boundary

Run with the existing virtual environment on PATH:

```sh
PATH="$PWD/.venv/bin:$PATH" npm run test:copilot-contract
PATH="$PWD/.venv/bin:$PATH" npm run local-first:gate
```

The conformance suite is part of `local-first:gate`, alongside the existing regional, map, provider, transport, worker, production-build and phase validation checks. Python compilation includes the three new modules. The Node suite also invokes Python as a test-only parity oracle; production never launches another runtime.

Recorded validation: 85 JavaScript conformance checks and 6 Python tests pass, covering 22 adapter snapshots and 57 planning cases, including the full cross-runtime object comparison, reference JSON Schema validation and isolated packaged-resource imports. All existing gate components pass: 73 regional JavaScript, 40 regional Python, 80 Streamlit, 39 provider/transport JavaScript and 25 provider/worker Python checks, configuration/build, phase 3/4 validation, compilation and diff checks. The first gate invocation stopped when the sandbox denied two loopback listeners (`listen EPERM`); the complete provider/transport suite passed when rerun with socket access, and the remaining conformance/compilation/diff steps passed separately. This is not an uninterrupted successful full-gate invocation. No cloud inference, model download, Docker image build or browser acceptance ran in phase 1.

Weekly usage at the phase boundary: 17% remaining, above the plan's 10% pause threshold. Changes are uncommitted for user review.

Phase 1 exit evidence consists of identical plans/scope decisions, independent complete legacy prompt captures, typed adapters/contracts, guarded compatibility behavior, an explicit accounting decision and an inactive switch/negotiation design. No deterministic answer handler, hybrid UI path, local inference benchmark or cloud model acceptance is claimed here.

Suggested commit: `feat(copilot): add phase 1 contracts and cross-runtime conformance`
