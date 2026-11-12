# Copilot phase 2: local queries in both interfaces

Date: November 12, 2026

Phase 2 of the [implementation plan](copilot-local-query-and-grounded-context-plan.md) is implemented behind `COPILOT_EXECUTION_MODE=hybrid`. The default remains `legacy`. React and Streamlit can answer supported forecast facts, complete loaded-layer counts and NYC 311 category counts without provider discovery or inference. No hosted deployment, production configuration change, model download or paid inference was performed.

## Behavior and scope

| Request | Hybrid behavior |
| --- | --- |
| Tonight's low and wind; a named weekday/period; first-period facts | Read validated point-forecast periods directly. Preserve temperature units, high/low distinction, full wind range/direction, conditions or precipitation probability when requested, original valid times and offsets, source URL and fetch time. |
| Facts over an explicit offset-qualified ISO interval | Require coverage across the complete requested interval, reject gaps and return the full relevant source periods separately. Do not interpolate subperiod values. |
| Counts in a named/selected loaded layer, or each visible loaded layer | Use only a complete scoped query count. Preserve layer identity, filter, where clause, geography, source and fetch time. Never substitute browse/sample size, distinct departments or an unsupported combined/deduplicated total. |
| Configured NYC 311 hazard categories | Require complete validated total/direct electrical/tree-or-wire/road-blockage aggregates, including zero categories and the reporting window/timezone. Retain configured endpoint/filter and complaint-versus-confirmed-outage limitations. |
| Ambiguous, hidden, partial, stale, unavailable or missing required evidence | Clarify, refresh only the required sources where possible, or report a specific local limitation. Unknown is never converted to zero. |
| Explanations, impacts, KB/document questions, unfamiliar phrasing and mixed requests | Use the full existing synthesis path. A local match cannot swallow an analytical or unmatched part of a compound request. |

The grammar is deliberately conservative; an unmatched phrasing remains eligible for synthesis. There is no classification-model call. Calendar resolution uses the configured jurisdiction timezone and request date, including DST. Original forecast offsets remain unchanged. A nighttime low is never relabeled as a daytime high. An uncovered interval is not filled by extrapolation. The retained DST fixture now asks explicitly for the first period, rather than calling a historical period “tonight.”

The local response label is **Local data query**, with an explicit answered/clarification/unsupported status. Synthesis uses **Grounded AI**, the actual committed local/cloud provider and model. Messages-only responses remain identifiable as legacy. Local answers carry null provider/model and emit no fake provider frame or model thinking/load metrics. Source acquisition and local execution timings are displayed separately. A direct success does not mark an unavailable model available; explicit provider-status refresh remains available independently.

## Runtime ownership

| Responsibility | JavaScript | Python |
| --- | --- | --- |
| Shared validation/planning/adaptation implementation | `lib/copilot-*-core.js`, with filesystem-resource wrappers in the existing module paths | Existing `copilot_contract.py`, `copilot_intent.py`, `copilot_evidence.py` |
| Forecast calendar/interval selection | `lib/copilot-forecast.js` | `streamlit/copilot_forecast.py` |
| Exact local answer formatting | `lib/copilot-local-queries.js` | `streamlit/copilot_local_queries.py` |
| Application orchestration and response metadata | `lib/copilot-service.js` | `streamlit/copilot_service.py` |
| UI-owned snapshots and required-source acquisition | `src/data/copilotSnapshot.js`, `copilotAcquisition.js`, `App.jsx` | `streamlit/copilot_snapshot.py`, `app.py` |

The browser loads the same policy/schema and pure JavaScript core through Vite JSON imports; it does not bundle Node filesystem or provider code. The Node coordinator independently validates and replans every structured request. It also downgrades stale or implausibly future-dated client evidence rather than accepting a client `current` flag alone. Point forecast freshness is limited to one hour, map/report snapshots to five minutes; stale/failed source states are never upgraded just because their fetch time is recent.

Snapshots retain browser/server provenance. A source URL is attribution, not permission for a server fetch. Server orchestration never follows arbitrary snapshot URLs. React acquisition remains in the browser using its configured endpoints/current loaded layers; Python acquisition uses the existing configured source owners. No credentials, model choice or provider policy are accepted from the request.

React caches successful complete map counts for 60 seconds, keyed by the layer URL, visibility, filters, geometry and current geography records. Hiding/removing/changing a layer invalidates reuse. Python retains the existing scoped 60-second map-evidence cache. Both interfaces refresh only the needed forecast, map or 311 source for local requests. A 311-only refresh updates only that source and cannot overwrite unrelated cached source results. Existing source-specific deadlines/retries remain in force. React Stop aborts request-owned evidence work and returns controls promptly; cancellation does not initiate synthesis or fallback.

Streamlit now stores dated, offset-qualified NOAA fetch timestamps. Legacy refresh logic parses these timestamps rather than inventing today's date from a time of day. Streamlit defers broad NOAA initialization until synthesis in hybrid mode and skips unrelated pending-turn wind/gauge/map refreshes. React retains background loading, but direct queries do not wait for its initial batch. Full synthesis still performs the normal NOAA acquisition/refresh. Local results enter the existing session-owned `ChatJob`; no second worker or direct renderer bypass was introduced. Response metadata survives polling, completion and full-app reruns, and the first UI handoff metric remains preserved.

Configured KB extensions are retained by React's runtime KB construction and rendered as module toggles, without new query handlers. Current configured timezone is carried into planning in both interfaces.

## HTTP contract and synthesis compatibility

Local Node/Vite servers expose:

- `GET /api/chat?capabilities`: execution mode, supported request versions and messages-only compatibility, without model probing.
- `POST /api/chat?plan` with `{request: ...}`: validate/recompute the plan without inference or acquisition.
- `POST /api/chat` with `{request: ...}`: the versioned structured path in hybrid mode.
- Existing GET provider status and POST `{messages: ...}`: preserved for legacy consumers and benchmarks.

The Node adapter preserves query parameters. Both the Node adapter and Web Request handler enforce the 8 MiB request limit before JSON parsing. Invalid versions, client provider controls, malformed data or missing full synthesis context return explicit request errors before streaming. NDJSON retains content, provider, error and terminal `done` frames and adds an independent `response` frame consumed by React's `onResponse` callback and Streamlit's worker. Every local answer has one terminal completion.

For phase 2 synthesis, the existing UI evidence/context builder remains the source of the **complete legacy context**. A typed `live` evidence block with ID `legacy_context` retains that text; the server constructs the normal grounded system prompt and bounded recent history from it. A synthesis stream requires this bridge block. Plan-only requests and local answers do not. This transitional representation preserves all current evidence sections and uploaded excerpts; it is not selective retrieval or a reduced local prompt.

Both local and cloud attempts currently receive that full context through the unchanged provider attempt loop. There is no local budget to leak into cloud fallback. The existing commitment boundary is preserved: errors after output retain the partial answer and do not replay into another provider; metadata records partial/failed status. Legacy messages-only requests retain static-message behavior.

Phase 3 still owns typed per-source context construction, full-upload retrieval, provider-specific reduced local context, model-answer preference UI, and full-context reconstruction after a reduced local attempt. This phase does not claim those optimizations, broad live cloud answer parity, or completion of the overall cloud compatibility gate.

`api/chat.js` continues to use its existing hosted cloud-only legacy handler. Hybrid coordinator injection is local to `server.js` and the Vite plugin. No hosted routing/configuration was changed. Docker packaging includes the shared schema/policy and the grounded prompt module required by the Node coordinator.

## Local use and rollback

The flag is documented in `.env.example` and passed to both Compose services with a `legacy` default. Existing environment files are untouched. For a local-only native React session:

```sh
COPILOT_EXECUTION_MODE=hybrid OLLAMA_MODE=local-only OLLAMA_API_KEY= npm run dev
```

For native Streamlit, using the existing virtual environment:

```sh
COPILOT_EXECUTION_MODE=hybrid OLLAMA_MODE=local-only OLLAMA_API_KEY= \
  .venv/bin/streamlit run streamlit/app.py
```

The existing Streamlit settings precedence still applies if secrets are configured. Keep local-only provider policy for unpaid local acceptance. Inference is not required for supported local operations. General synthesis still requires an available provider under the configured policy.

For local Docker review:

```sh
COPILOT_EXECUTION_MODE=hybrid OLLAMA_MODE=local-only OLLAMA_API_KEY= \
  docker compose --profile streamlit up --build -d
```

Return to legacy by restoring `COPILOT_EXECUTION_MODE=legacy` and restarting/recreating the affected services. No data migration is involved. Hosted promotion and live paid cloud testing require separate authorization.

## Verification

`npm run test:copilot-local` is included in `local-first:gate`, alongside the phase 1 conformance suite. Validation uses the existing `.venv` on PATH.

- All 85 JavaScript and 6 Python phase 1 conformance checks pass after extracting the browser-safe core. Both runtimes still produce identical complete plans/scope decisions and adapted evidence.
- The new **56-check JavaScript suite and 4 Python tests** pass. The JavaScript suite covers every retained local/clarification case, exact facts/citations, browser transport metadata, no provider/probe calls, configured-but-unused cloud routes, stale client flags, request bounds, cancellation, full-context fallback, partial-output commitment, temporal wording and interval selection, and the real HTTP structured adapter.
- Python tests exercise local bypass and the existing worker. The production preparation and renderer are extracted into AppTest with forbidden unrelated-source/provider stubs, a forced full-app rerun and a single application stream: automatic completion, retained metadata, one request and enabled controls pass.
- New temporal fixtures cover named weekdays, tomorrow/day-versus-night, common low-temperature/wind-speed wording, UTC `Z` and offset-qualified multi-period intervals, and incomplete coverage. Plans and deterministic answer text match across JavaScript/Python.
- Structured synthesis reconstructs all **22 complete retained legacy prompt scenarios** exactly, independently for React and Streamlit. A larger-than-local-target cloud fallback fixture retains the late KB fact. These are construction/coverage checks, not live cloud answer-quality acceptance.
- The existing regional, map, configuration, forecast/citation, provider/transport, partial-response and worker regression suites, production build, phase 3/4 validators, Python compilation and diff checks pass. Loopback HTTP tests require socket access.
- Both Docker images build. The isolated React container advertises hybrid capability and completes a synthetic local query over real HTTP with an empty cloud key and deliberately unavailable model host. The Python image loads the packaged contracts/services and completes the retained synthetic query without bind mounts or provider configuration.
- Real browser checks of both native interfaces, in hybrid/local-only mode, delivered a live NWS point-forecast answer automatically with the full wind range, correct low, exact URL and original valid times. The answer label identifies a local query and inputs remain usable. The observed November 12 fixture was 43°F low, 14–18 mph NE, valid November 12 18:00 to November 13 06:00 at `-05:00`; this is dated test evidence, not current advice. An unrelated external cooling-center request returned HTTP 503 during React startup; it did not block the local answer.

A controlled React browser check also stalled the initial hourly NOAA request while supplying the retained point-forecast fixture: the local answer completed in 344 ms with that hourly request still blocked. This verifies acquisition independence, not real-world latency.

No native model inference or live cloud inference was needed. These browser checks establish delivery for the forecast path; the broader map/311 browser matrix, physical devices, full Docker browser flows, live model quality and comparative performance matrix remain later acceptance work. No general latency improvement is claimed from these functional checks.

At the checkpoint, weekly usage is 93% remaining, above the 10% pause threshold. Temporary native test servers, the isolated test browser and the test container were stopped. Generated build artifacts were restored; source changes remain uncommitted for user review.

Suggested commit: `feat(copilot): integrate local data queries in React and Streamlit`

## Smoke-test correction — loaded-layer filter metadata

The November 12 user smoke test exposed `evidence.scope.filter: invalid type` immediately after adding the Fire/EMS preset. The React layer includes an evaluated `filter` object (requested/effective modes, records and display counts), while the evidence contract requires a string filter name. The adapter incorrectly passed the UI object into that field, failing before the count query or inference.

Both adapters now distinguish evaluated UI objects from normalized query-result filter strings, preserving explicit `filterMode`/`filter_mode` or the evaluated requested mode. The schema remains strict. Shared fixtures cover both naming conventions; an integration regression runs the actual React filter evaluator, snapshot adapter, scoped complete-count acquisition and HTTP local-answer service for unfiltered, operational and PSEG territory modes. It checks geometry/where constraints, complete counts instead of browse size, and provider bypass.

The complete `local-first:gate` passes after the fix (87 JavaScript contract checks, 6 Python contract tests, 57 JavaScript local-query checks, 4 Python local-query tests, plus all existing gate components). A real browser run added **USA Fire/EMS Stations (USGS) — Fire_Stations_EMS_Stations** through the preset and asked “How many features are in this layer?” The response was **52,010 features**, **unfiltered**, where **1=1**, labeled **Local data query · answered**; the layer browse displayed 500. This was the unfiltered source inventory, not a Long Island-only or distinct-department count. The request recorded 0.24 seconds evidence acquisition and 0.04 seconds local transport/execution; these are single functional observations, not a benchmark.

Rebuild the local Docker images and refresh the pages before repeating the user smoke test. No hosted deployment, paid inference or environment-file change was performed. Suggested fix commit: `fix(copilot): normalize loaded-layer filter metadata`.
