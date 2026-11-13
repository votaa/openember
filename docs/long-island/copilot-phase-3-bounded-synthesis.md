# Phase 3 — bounded grounded synthesis

Implemented November 12, 2026 behind `COPILOT_EXECUTION_MODE=hybrid`. Default execution remains `legacy`. No hosted deployment or environment-file changes are included.

## Behavior

Both interfaces supply versioned, typed source snapshots for synthesis. The local context builder keeps every enabled KB module in full, the complete question, retained conversation, selected feature and available deterministic subquery results. It selects optional evidence by question, preserves provenance, units, timestamps and scope, and reports exclusions. Prior assistant prose associated with a different KB/source selection is excluded. “Use AI analysis” requests model synthesis even for a supported exact lookup; it does not change provider permissions.

Local synthesis acquires relevant configured NOAA endpoints rather than waiting for the complete initial NOAA batch. KB-only inquiries do not request forecast refreshes; forecast, grid, water, map and 311 acquisition follows the question. Existing map/background startup fetches still run independently; this is not a claim that application startup performs no network work. Source coverage distinguishes missing/failed/stale/hidden data from evidence omitted for processing limits. Sample records never establish complete inventory counts. Grid-series requested-window coverage remains explicitly unverified, so supplied intervals cannot establish a full-window maximum or total without further coverage evidence.

Uploads retain full text for local lexical retrieval within **1 MiB per file / 2 MiB total**. Retrieval uses 800-code-point chunks, ranked matches with neighboring chunks, stable source/span references, and explicit selected-passage coverage. Oversized uploads retain the existing opening excerpt with a processing-limit warning. Lexical retrieval is not semantic search and can miss synonyms or indirect references; omission does not establish that a document lacks a fact. Local optional context is limited to 7,000 code points per source and 16,000 total; raw optional source transfer is capped at 256 KiB per source with explicit disclosure. Full source data remains retained by the interface for the cloud adapter.

The shared estimator labels its result as an estimate and reserves output plus conservative headroom. Mandatory evidence is never truncated to fit. Missing enabled KB or mandatory overflow produces an explicit processing-limit response without probing/invoking a model or automatically using cloud. The local allocation comes from `OLLAMA_LOCAL_NUM_CTX`; the estimate is not native token accounting or proof of input retention.

## Provider and compatibility boundaries

The existing provider loops accept a narrow per-provider message-construction callback. Local inference uses bounded context. Cloud-only and permitted pre-first-native-frame fallback rebuild the full existing cloud context through the original context builders. Cloud retains the existing opening-upload-excerpt policy, with a disclosure; local upload retrieval and budgets are not applied to it. Legacy messages-only and phase 2 structured requests retain their original prompt behavior. The hosted `api/chat.js` route is unchanged.

React obtains UI-owned full cloud context through a request-scoped rendezvous while the original inference stream remains open: one acquisition request, one attempt per provider, no generation replay. Tokens expire after two minutes, reject changed question/history/selection, and are deleted on cancellation/completion. Streamlit captures immutable inputs and performs full-context acquisition through the existing request-owned worker, without worker access to session state. Neither path requests cloud context after a native first frame. Local-only still cannot escape to cloud.

## Verification

- The complete `local-first:gate` passes: regional/configuration/map suites, existing prompt baselines, provider/worker suites, contract/local-query conformance, production build, validators, Python compilation and diff checks.
- New context suite: 21 JavaScript checks and 4 Python tests, including 11 retained shared scenarios. JavaScript/Python selected evidence, messages, coverage and accounting agree. Cases cover full/large enabled KB, late upload passages, Unicode offsets, compound queries, selected features, unknown phrasing, gust grids, forced synthesis, changed selection and mandatory overflow.
- Mocked provider tests verify pre-stream local failure rebuilds full cloud context, preserves a late cloud-only sentinel beyond local limits, and makes one attempt per provider. Further checks cover rendezvous expiry/cancellation/scope validation, no replay after native first frame, snapshot immutability and upload/transfer disclosures. No paid cloud call is used.
- Both local Docker images build with packaged shared schema/policy and new runtime modules. An isolated browser check uses a synthetic local provider, empty cloud key and separate ports, leaving the user's running containers untouched. React delivers a grounded KB-only response and the captured model request contains all five enabled KB modules. Streamlit also delivers the grounded response automatically, shows Source coverage, and restores its enabled text input. Its captured request also contains all five enabled KB modules. The browser checks used synthetic provider output, not native-model answer quality.

These are construction, regression and delivery checks. **Native input-retention/truncation acceptance, repeated comparative performance samples, live model answer quality and live cloud acceptance have not been established by this phase.** The feature remains opt-in; the broader phase 4/5 acceptance matrix is still required before promotion.

## Local smoke test

Rebuild both interfaces using the existing Compose configuration:

```sh
COPILOT_EXECUTION_MODE=hybrid OLLAMA_MODE=local-only OLLAMA_API_KEY= \
  docker compose --profile streamlit up --build --force-recreate -d
```

Refresh both pages. Try “Explain the KB flood zones”; upload a supported text document and ask about a distinctive passage beyond its opening 4,000 characters; enable “Use AI analysis” and ask “What is tonight’s low and wind?” Inspect the Grounded AI label and Source coverage details. An ordinary supported forecast lookup with the checkbox off should still return a Local data query response. Native responses may take time; this command does not authorize cloud inference.

Suggested commit: `feat(copilot): add bounded grounded synthesis for local models`
