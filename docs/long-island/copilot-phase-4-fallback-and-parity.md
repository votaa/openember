# Phase 4 — fallback and parity

Implemented November 12, 2026 behind `COPILOT_EXECUTION_MODE=hybrid`. Default execution remains `legacy`.

## Behavior

When every permitted provider fails before its first native frame, both application services now return a `rule_based_fallback` result through the normal response/content/done transport. It contains only planner-approved deterministic results for supported parts of the request, including source URLs, fetched times, geography, filters, units and reporting intervals. Zero counts remain facts. Hidden, stale, unavailable and incomplete evidence cannot supply exact fallback facts. General KB/document questions remain synthesis requests; if inference fails, the fallback explicitly says analysis was not produced rather than declaring the question unsupported.

Fallback has no successful provider/model identity. Attempts retain provider and normalized error code; upstream error bodies and credentials are not copied into the answer. Results with deterministic facts are `partial`; results without supported facts are `failed`. Source coverage identifies only evidence actually used for those facts. Shared policy text supplies the same explanation and limitations in both runtimes. Local mandatory-context limits use the same fallback formatter while retaining their processing-limit explanation and making zero provider calls.

The provider router remains the sole owner of local-first/local-only/cloud-only attempts. Cloud fallback can occur only under existing permissions and before the first native frame, using the existing full cloud-context adapter. A first frame containing only thinking still commits the provider. Later errors retain partial answer text and the grounded response mode, with `partial` or `failed` labels; they never replace the response with deterministic prose or replay generation. React Stop records `cancelled` when response metadata exists. Aborted requests and closed Python generators do not trigger fallback, and the Python application service explicitly closes its upstream iterator.

Both interfaces show `Rule-based fallback · partial/failed` and label fallback timing separately from local data queries. Fallback/direct responses emit no fake provider frame or thinking metrics and do not mark inference available. The Streamlit worker still owns one immutable request across reruns and clears pending state on completion.

## Verification

- Full `local-first:gate` passed using the existing `.venv` dependencies. This includes regional/configuration/map checks, legacy prompt baselines, provider/worker tests, contract/local/context conformance, production build, validators, compilation and diff checks. The new `test:copilot-fallback` suite is part of that gate.
- The final fallback suite has 13 JavaScript checks and 2 Python tests. Ten retained shared scenarios cover local-only with a configured key, all permitted providers failing, cloud-only without a key, general synthesis, hidden and stale facts, malformed initial output, thinking-only commitment, partial output failure, and zero-valued 311 categories. JavaScript and Python agree on answer text, citations, scope, evidence IDs, attempts, source coverage, status and labels. Transport tests check one terminal completion; worker tests check one worker and restored pending state. Separate checks cover abort before discovery, abort after commitment, processing-limit cancellation, and Python generator closure.
- Both Docker targets build. The packaged React service passes the failure/commitment matrix with networking disabled; the packaged Streamlit image passes the retained fallback/worker matrix with networking disabled. Only fixtures/tests are mounted for these checks; runtime services and shared schema/policy load from each image. The isolated-copy packaging test now imports the Python application service as well as its contracts.
- Isolated browser checks on ports 3044 and 8544 use local-only, an unavailable inference endpoint, an empty cloud key and 32768 context allocation. Both deliver the fallback automatically for “Explain the KB flood zones,” show its label and source coverage, and restore an enabled text input. Browser review caught and corrected fallback timing initially saying “local query.” Existing user containers are not recreated by these checks.

These checks establish fallback construction, routing boundaries, packaged resources and UI delivery. They do not establish native model input retention, synthesis quality or comparative performance, or live paid cloud answer parity. Phase 5 acceptance and promotion remain separate; hosted configuration and environment files are unchanged.

Suggested commit: `feat(copilot): add rule-based fallback and runtime parity`
