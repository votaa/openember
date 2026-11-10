# Local model performance and grounding acceptance — November 9, 2026

**Decision: not ready to merge as an accepted local-model experience.** Real
native inference and both Docker transports work. Thinking can be disabled and
progress is useful, but full application prompts lose evidence at the active
context limit and produce incorrect answers. Reducing thinking alone does not
resolve answer quality.

Tested application commit: `a6cec13` on `feature/local-first-ollama`. Native
Ollama API reported version `0.40.15`; model `qwen3:8b` (Q4_K_M). Both local
Docker services were rebuilt at that commit and exercised through the browser.
They used `local-only`, an empty cloud key, and native macOS Ollama through
`host.docker.internal:11434`. No model download, cloud inference, deployment,
production setting change, commit, push, or merge was performed.

## Latency measurements

These are individual observations, not percentiles or a controlled hardware
benchmark. Inference requests ran sequentially. Other existing applications and
containers remained running. Cold means the selected model was explicitly
unloaded first; warm means loaded, not necessarily an exact prompt-cache hit.
Changing thinking mode can invalidate prompt-cache reuse. No sampling options,
context size, prompt budget, or model template were changed.

The weather replay uses the exact messages captured from a real React browser
POST: 26,432 content characters, live public NOAA/NWS evidence, the default KB,
and the normal system rules/history. Private prompt captures remain outside Git.

| Path / setting | Request | First output | Thinking | Answer | Native prompt processing | Native load | Evaluated prompt tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| React Docker browser, default thinking, initially unloaded | ~86.3 s* | 30.6 s | 42.4 s | 13.3 s | 22.9 s | 7.0 s | 2,050 |
| Native JS replay, thinking off, cold | 44.15 s | 30.06 s | 0 | 14.09 s | 23.35 s | 6.54 s | 2,050 |
| Native JS replay, thinking off, immediate repeat | 15.75 s | 0.30 s | 0 | 15.45 s | 0.18 s | 0.016 s | 2,050 |
| Native JS replay, default thinking, model warm | 102.96 s | 23.23 s | 66.30 s | 13.43 s | 22.69 s | 0.015 s | 2,050 |
| React Docker browser, thinking off, document + visible map | ~50.0 s* | 36.2 s | 0 | 13.8 s | 35.4 s | 0.0 s rounded | 2,050 |
| React Docker browser, thinking off, hidden map | ~31.0 s* | 28.5 s | 0 | 2.5 s | 27.9 s | 0.0 s rounded | 2,050 |
| Streamlit Docker browser, thinking off, weather + document | ~48.8 s* | 33.7 s | 0 | 15.1 s | 33.0 s | 0.0 s rounded | 2,050 |
| Streamlit Docker browser, thinking off, visible map | ~47.7 s* | 46.2 s | 0 | 1.5 s | 25.4 s | 0.0 s rounded | 2,050 |
| Streamlit Docker browser, thinking off, hidden map | ~33.7 s* | 33.7 s | 0 | 0.0 s rounded | 25.1 s | 0.0 s rounded | 2,050 |
| Native diagnostic, relevant evidence only, thinking off | 76.06 s | 50.58 s | 0 | 25.48 s | 50.23 s | 0.018 s | **2,845, retained** |

\* Browser totals are sums of rounded observed phases, not independent precise
wall-clock measurements. Evidence preparation was 0.0 s rounded except the
React document/map request (0.5 s) and Streamlit visible-map request (6.3 s),
additional to the request phases.

Raw replay metrics and observed test answers are in
[local-performance-results-2026-11-09.json](local-performance-results-2026-11-09.json).
Native timing includes model-internal work; observed phase timings include
transport/buffering. Do not add native prompt/load/generation durations again to
the observed phases. The cache-hit result is not a general 15-second guarantee. Streamlit’s map
request showed a much later observed first output (46.2 s) than native prompt
processing alone (25.4 s); transport buffering/scheduling and display behavior
need separate investigation before treating that phase as pure model time.
The retained diagnostic prompt processes more tokens and is slower than a
silently truncated prompt; correctness must be evaluated alongside latency.

## Context and answer-quality findings

Native logs reported `n_ctx_slot = 4096`. Full prompts exceeding that window
were reduced to 2,050 input tokens. Examples in native logs: React weather
14,187 → 2,050; React document/map 15,394 → 2,050; Streamlit weather/document
17,002 → 2,050; Streamlit visible map 18,309 → 2,050. The model's advertised maximum context is
not the context actually allocated to this runner. In the same tests, the
smaller 2,845-token diagnostic fit without the input-truncation warning.

| Case | Evidence and expected result | Observed result | Outcome |
| --- | --- | --- | --- |
| React weather, default and off | Supplied point forecast: tonight mostly clear, 37°F, west wind 6–9 mph, forecast URL and valid interval | Answers substituted SPC convective outlook and claimed forecast details were absent; off-mode answers also converted the outlook end time incorrectly | Fail |
| React uploaded document + visible map, off | Synthetic fixture explicitly says `CEDAR-731`, 47 amber cones; loaded USGS Fire/EMS evidence says `complete_count: 380`, `operational`, real service URL | Denied the document facts, denied visible feature evidence, and invented `https://example.com/usgs-layer` | Fail |
| React hidden map, off | Hide layer; captured system context must omit its layer ID, and current count must be unavailable | Layer ID was absent from current system context; answer said current evidence did not establish a count | Pass for this case |
| Missing document fact, both interfaces | Commander is deliberately absent from synthetic fixture | Reported unknown | Pass for this case |
| Streamlit weather + uploaded document, off | Same document facts and a detailed supplied forecast | Correctly returned `CEDAR-731`, 47 cones, and unknown commander; weather still used SPC outlook instead of the requested point forecast | Document pass; weather fail |
| Streamlit visible map, off | Loaded Fire/EMS evidence: 380 features, operational filter, actual service URL; not a distinct department count | Returned 380, operational, the real URL, and explicitly distinguished stations from departments | Pass for this case |
| Streamlit hidden map, off | Uncheck layer visibility, then ask for current count without reusing history | Reported the current count unavailable because the layer was hidden and absent from loaded evidence; did not reuse 380 | Pass for this case |
| Relevant-evidence-only diagnostic, off | Actual captured point forecast, synthetic document, and exact map metadata; normal system rules; 2,845 input tokens | Correct forecast details and URL, `CEDAR-731`, 47 cones, 380 features, operational filter, actual service URL, unknown commander; used fetched time rather than the requested forecast valid interval | Core factual grounding restored; time-format requirement incomplete |

The synthetic document is explicitly labeled an acceptance fixture, not an
operational plan. The real service used for map testing was
`https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Structures_Medical_Emergency_Response_v1/FeatureServer/2`.
The 380 result was a dated operational-geography query, not a permanent inventory
or a count of distinct fire departments.

React places uploaded documents and map evidence before NOAA material, while
Streamlit appends uploaded documents after NOAA and then appends map evidence.
This ordering difference is consistent with different facts surviving truncation;
it is not a reason to accept either oversized prompt.

The diagnostic removed unrelated KB/feed material and browse samples, retaining
relevant original evidence and normal system rules. This supports evidence loss
as a major failure mechanism; a single successful replay does not establish a
production budget algorithm or prove every failure is caused by truncation.

## UI and transport acceptance

- React rendered processing, thinking, and answering phases with actual native
  inference, and retained completed timing summaries in chat.
- React Stop was exercised after visible answer text arrived. The partial
  answer remained, Send was re-enabled, and native logs confirmed task
  cancellation and an idle runner. No completed timing summary was invented.
- Streamlit rendered progress and retained its final answer/timing summary after
  a deliberate provider-status refresh during inference. Native logs showed one
  chat request for that turn; no replay or cloud fallback was observed.
- Both interfaces passed the hidden-layer stale-count case in this run.
- Both Docker runtimes completed real native Qwen requests. Docker versus native
  latency differences are confounded by cache and differing application prompts;
  this run does not isolate Docker overhead.
- Streamlit startup after restart took several minutes before chat controls were
  ready. A bounded independent live AppTest subsequently completed without an
  exception. Startup/feed/UI initialization is separate from the inference
  timings above and needs its own measurement if it remains slow.

## Reproduce local-only replay

The new [benchmark script](../../scripts/benchmark-ollama-local.js) accepts a JSON
file containing `{ "messages": [{ "role": "system", "content": "..." },
{ "role": "user", "content": "..." }] }`. Use an actual application capture
for full-context acceptance. Captures/results may contain uploaded content;
keep private captures outside Git. It validates the installed local model,
forces local-only with no cloud key, never downloads a model, and bounds each
request to 180 seconds. Raw thinking text is not saved. Results include answer
text, native counts/timings, observed phase timings, completion and errors.

```bash
OLLAMA_LOCAL_THINK=false node scripts/benchmark-ollama-local.js \
  /private/tmp/prompt.json /private/tmp/off-cold.json --cold
OLLAMA_LOCAL_THINK=false node scripts/benchmark-ollama-local.js \
  /private/tmp/prompt.json /private/tmp/off-warm.json
OLLAMA_LOCAL_THINK=default node scripts/benchmark-ollama-local.js \
  /private/tmp/prompt.json /private/tmp/default-warm.json
```

`--cold` evicts only the selected installed local model before the request.
Inspect native Ollama logs for truncation: `prompt_eval_count` alone does not
reveal the original prompt size. Look for `truncating input prompt`, not just
`truncated = 0` at the end of a runner task; the latter can follow earlier input
truncation and is not proof the full prompt was retained.

## Recommended next implementation and release gates

1. Implement request-aware evidence budgeting shared in intent across React and
   Streamlit: preserve system rules and user question, prioritize relevant dated
   weather/map/document evidence, bound browse samples, and report omitted
   evidence. Verify uploaded facts and visible-layer metadata survive the budget.
2. Make local context allocation explicit and hardware-tested. Establish a safe
   input budget with generation headroom; do not rely on the advertised model
   maximum or silently enlarge context without memory/latency validation.
3. Repeat cold and exact warm benchmarks, multiple samples per mode, using the
   same retained prompt and a fixed acceptance rubric. Decide the thinking
   default only after quality passes. Today's faster off-mode is not sufficient.
4. Require forecast facts/valid times/URLs, document facts/absent-fact uncertainty,
   visible/hidden map counts and citations to pass in both browser interfaces.
5. Re-run the full gate and final diff/security review before recommending merge.
   Cloud-credit testing, hosted deployment and production configuration still
   require separate explicit authorization. User retains commit/merge ownership.


## Validation of the testing changes

`node --check scripts/benchmark-ollama-local.js`, JSON parsing, and
`git diff --check` passed. Provider regressions passed 33 JavaScript tests
(including real HTTP transport) and 19 Python tests (including the real
Streamlit fragment rerun case), with no skips. The full application gate was
not repeated because this follow-up changes only the benchmark and reports;
the application build/gate was already passed at the tested commit.

The complete default-thinking document/map quality matrix is deferred until the
context-loss defect is corrected. Existing failures already block readiness;
additional repetitions of known over-budget prompts cannot establish acceptance.


## Local test cleanup

Both local Docker services were restored to their pre-test configuration:
`local-only`, `OLLAMA_LOCAL_THINK=default`, and no cloud key. The native macOS
Ollama server was left running. Browser uploads and map additions were confined
to the test browser sessions; no layer configuration was saved to YAML. Browser
captures were moved to `/private/tmp/openember-performance-browser-20261109`.
Only the plan, report, result JSON, and benchmark script are proposed changes.
