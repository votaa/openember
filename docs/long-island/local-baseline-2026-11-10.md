# Full-context local inference baseline — November 10, 2026

Follow-up: [answer delivery and grounding fixes, diagnosis and final local acceptance](local-quality-fixes-2026-11-10.md). The historical failures below are retained as baseline evidence.

## Purpose and implementation

Establish completion and grounding before optimizing local prompts. The new
`OLLAMA_LOCAL_STREAM_TIMEOUT_MS` defaults to 900000 (15 minutes) in JavaScript, Python, and
Compose. It bounds waiting for response headers and stream inactivity, not
whole-turn duration. Cloud retains `OLLAMA_STREAM_TIMEOUT_MS=90000`.
Discovery/TCP connection establishment remain short. No evidence budgeting,
context-size, sampling, model, or thinking-default change was made.

Node/Vite local requests use streaming Node HTTP transport so a separate native
fetch header-wait deadline cannot interrupt the configured allowance. The
Vercel entry point and cloud transport retain native fetch. Local timeout errors
identify discovery, initial processing, or waiting for further output; Requests'
wrapped streamed read timeouts are recognized in Python. With local-first and
no cloud key, the local timeout is preserved as the final actionable error.

## React Docker browser: completed baseline

Configuration: local-only, no cloud key, native macOS `qwen3:8b`, default
thinking, 32768 allocated context. Normal KB and automatically loaded public
feeds remained enabled. Uploaded `acceptance-fixture.txt` was explicitly
synthetic and contained incident `CEDAR-731`, exactly 47 amber cones, and no
commander. Added the live NYC 311 electric-hazard/road-blockage source to the map.
Its visible card and markers showed three reports: one tree/wire and two road
blockages, within the past seven days.

The combined question asked for the first point forecast's facts, valid times,
and URL; document facts and absent commander; and the map report count, reporting
window, source URL, and complaint-versus-outage distinction.

Native logs for the single request:

- Allocated `n_ctx_slot=32768`; `task.n_tokens=14445`.
- Prompt processing: 253.907 seconds / 14445 tokens.
- Generation (thinking plus answer): 144.949 seconds / 650 tokens.
- Model load: approximately 13.8 seconds; HTTP completion approximately 6m50s.
- No input-truncation warning appeared for this request. Native prompt evaluation
  processed the full logged input token count.

Browser completion summary: first output **463.4 seconds**, thinking **0.8 seconds**,
answer **0.0 seconds rounded**, prompt **253.9 seconds**, load **13.8 seconds**.
The browser/native timing discrepancy and nearly simultaneous delivery of
thinking and answer indicate a buffering/display/scheduling issue to investigate;
these browser phases do not establish the model's true thinking duration.
Browser control was intermittently unresponsive during inference. This was one
observation, not a latency distribution or controlled hardware benchmark.

Observed answer:

- Tonight, 2026-11-10 18:00 through November 11 06:00, UTC offset -05:00;
  44°F, west wind 7–10 mph, with the exact NWS point-forecast URL. These match the
  contemporaneously fetched public NWS forecast.
- `CEDAR-731`; 47 amber cones; no commander named. All match the fixture.
- Three reports, one tree/wire and two road blockages, past seven days;
  correctly described as complaints rather than confirmed outages.
- **Citation failure:** supplied a generic `https://311.nyc.gov/data` link instead
  of the configured source endpoint. Correct facts do not establish full citation
  acceptance.

A subsequent live React Stop test was canceled during processing. Send was
re-enabled; native logs confirmed cancellation of task 679 and an idle runner.
The stop test did not replay to cloud. Automated regressions also cover
cancellation before headers and after partial output.

## Streamlit Docker browser: 10-minute boundary failure

The first Streamlit request used the original 600000 setting, the full KB and
NOAA evidence, the same synthetic document, and a visible Map Builder USGS
Fire/EMS layer. The layer evidence reported 52010 unfiltered features and its
actual FeatureServer sublayer URL. This was a national, unfiltered inventory,
not an operational Long Island count or a count of distinct departments.

Native logs recorded 18361 prompt tokens at 32768 allocated context. Of these,
272 tokens were cached; native prompt evaluation processed the remaining 18089
in 589.697 seconds. Generation took 159.690 seconds for 566 tokens; native HTTP
completion was approximately 12m40s. No input truncation was logged.

**The application did not receive a successful answer.** After a page rerun,
Streamlit displayed the normalized local timeout before first output, with its
600-second response wait limit and 3-second connection limit. Native server
completion occurred after the application stopped waiting; HTTP 200 in Ollama's
logs alone is not proof of application success. Browser progress had remained
at initial processing; using Streamlit's menu Rerun exposed the stored error
and re-enabled the chat without replaying inference.

This test showed that 10 minutes left insufficient headroom for the measured
full Streamlit prompt. The local default was raised to **900000 (15 minutes)**
for the follow-up, while keeping cloud at 90 seconds. The original React result
above remains a successful 10-minute-limit observation.

## Streamlit Docker browser: 15-minute retest delivered an answer

Both local containers were rebuilt with `local-only`, no cloud key, 900-second
local response/inactivity waits and unchanged 90-second cloud waits. The retest
kept the normal KB, all automatically fetched NOAA evidence, default thinking,
and the same synthetic document. The Map Builder layer was set to operational
geography; the visible evidence card verified 380 features and the actual
FeatureServer sublayer URL before submitting. This is a different selected
geography from the failed national-count test, not a controlled latency A/B.
No prompt budgeting or model/context/sampling changes were introduced.

Native logs: 18330 input tokens at 32768 allocated context, all 18330 evaluated;
384.154 seconds prompt processing, 215.106 seconds generation / 611 tokens;
599.260 seconds native total, approximately 10m00s HTTP completion. No input
truncation was logged. The runner had unloaded between requests, so this test
also included approximately 9.8 seconds model loading. Existing background
applications/containers remained running; throughput varied materially.

The app's completed answer was recovered through Streamlit menu **Rerun** and
chat inputs became available. It did not replay inference. Stored app timings:
evidence 4.4 seconds; first output **849.7 seconds**, thinking **2.5 seconds**,
answer **0.1 seconds**, native prompt **384.2 seconds**, native load **9.8 seconds**.
This substantial native/app discrepancy and delayed progress remain unresolved;
these observed thinking/answer phases cannot be treated as native generation
measurements. Native HTTP success alone had not established browser delivery;
the final answer was separately inspected in the browser.

| Check | Result |
| --- | --- |
| Document | Pass: `CEDAR-731`, 47 amber cones, no named commander. |
| Visible map | Pass: 380 features, `operational`, exact real service URL, and explicit feature-versus-department distinction. |
| Forecast temperature | Fail: correctly included tonight's 44°F low, but added a 60°F high from another period to the first-period answer. |
| Forecast wind | Incomplete: returned 7 mph W instead of the supplied 7–10 mph W range. |
| Forecast interval/citation | Returned the correct night interval and exact point-forecast URL, but omitted a timezone label/offset. |
| Automatic delivery/progress | Fail: remained at initial processing; a menu Rerun was needed to display the stored completed answer. |

A temporary guard that stopped Map Builder rendering during a pending chat was
trialed after native completion; it did not establish a fix and was removed
from the workspace and local container. The final patch preserves existing map
and Setup flows. Diagnose worker scheduling/transport and page/fragment refresh
with explicit boundary instrumentation before claiming this issue is fixed.

**Decision:** extended waiting is implemented and a full Streamlit answer is now
observable, but local-model acceptance is still blocked by forecast quality and
UI delivery/progress defects. Next work should address those failures before
performance optimization. Hidden-layer acceptance at 32K and repeated cold/warm
measurements remain open.

## Validation and limits

The full `local-first:gate` passed using the project's `.venv` Python: 68 regional
JavaScript tests, 40 regional Python tests, 80 Streamlit Python tests, 37 provider/
transport JavaScript tests, and 21 provider/worker Python tests. Configuration,
production build, phase validators, compilation, and diff checks passed. The full gate included the refined local timeout messages and real HTTP tests
for slow local headers, cancellation, and stalled Python reads. After the final
local default was raised from 600 to 900 seconds, all 37 JavaScript and 21 Python
provider tests passed again and both Docker images rebuilt successfully. The
full `local-first:gate` then passed once more against the final 15-minute patch
after the temporary UI guard was removed; `git diff --check` also passed. Initial runs with system Python failed because its Python 3.9
runtime/dependencies do not meet this project; use `.venv`.

Real cloud inference, hosted settings, deployment, merge, commit, and push were
not performed. Local Compose services use local-only with an empty cloud key.
Existing ignored environment files were preserved. Test documents and live map
additions were confined to temporary browser sessions; no map YAML was saved.

This baseline proves that a formerly timed-out full React request can complete
and recover the tested factual grounding. It does not establish general local
model readiness. Exact source citations, hidden-layer behavior at 32K, repeated
cold/warm timings, forecast accuracy, and automatic Streamlit delivery remain
release gates. The Streamlit retest above establishes only its stated results.
