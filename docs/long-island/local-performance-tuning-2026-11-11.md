# Local performance tuning — November 11, 2026

## Scope and controls

The passing [forecast, citation and automatic delivery fixes](local-quality-fixes-2026-11-10.md) remain regression gates. This tuning pass keeps evidence, request builders, model, sampling, timeouts, and delivery logic intact. It measures context allocation and the existing thinking control with fixed messages. The real-request delivery check also exposed an existing UI timing-retention bug; the first handoff metric is now preserved across polls and finalization. All inference is local `qwen3:8b` Q4_K_M; each measured replay starts cold and requests automatic unloading afterward. No cloud inference or hosted deployment is involved.

The native Ollama service had restarted with a 4096-token default. Its model has no saved `num_ctx` override. Relying on that default would reintroduce the truncation documented in the November 9 tests. Both local providers now accept `OLLAMA_LOCAL_NUM_CTX=default|4096..131072` (integer), forwarded only to local requests as `options.num_ctx`. `default` omits the option; Compose explicitly pins 32768 to preserve the accepted allocation across native restarts. This changes no machine-global Ollama settings. Larger values still require model/hardware validation.

Ollama documents [context memory requirements and allocation inspection](https://docs.ollama.com/context-length) and [per-request options, thinking and automatic unloading](https://docs.ollama.com/api/chat). The local installed API and native runner logs independently confirm these controls in this test.

The replay script records the messages SHA-256, requested context, thinking/residency controls, timestamp, native cached token count and completion reason. A generation stopped by its length limit fails the replay instead of counting as a complete answer. These fields improve comparisons; the hash does not prove that the model retained the input. Native logs must establish allocated context and absence of input truncation.

## Fixed workload

The production Streamlit `build_context` and shared system-prompt builder generate the replay from all five configured KB modules, a full point forecast, 48 hourly periods, the supplied grid summaries, the dated 311 acceptance counts/window/endpoint, and the synthetic uploaded fixture. No evidence selection, truncation, or prompt budgeting is added. Current loaded map evidence is empty, so the Fire/EMS count must be unavailable.

The point forecast and 311 facts deliberately reuse the November 10 acceptance snapshot; the hourly/grid evidence was fetched November 11. This mixed-date workload is a fixed regression fixture, **not current operational advice**. The question explicitly requests the dated evidence. It is not a replay of the earlier browser sessions: those inputs contained roughly 15K–18K tokens; this workload contains 12,317 native input tokens / 23,630 JavaScript content characters. Results cannot be directly compared with the old wall-clock observations as a controlled improvement.

Native metrics, public/synthetic answers and the acceptance results are retained in [the results JSON](local-performance-results-2026-11-11.json).

Input hash: `8a9992bf54b379a08e19c9ff0fad54923573588d6dfe62d3b160b3b59562056a`. The full input capture and test harnesses stay under `/private/tmp/openember-tuning/`; the results JSON retains the public/synthetic answers.

The answer rubric checks Tonight's **44°F low**, **7–10 mph west** wind, original `-05:00` start/end timestamps, exact NWS forecast URL, no next-period high, `CEDAR-731` / **47 amber cones** / absent commander, **3** complaints (**0** direct electrical, **1** tree/wire, **2** road blockages), the original report window / America/New_York / fetch time, exact configured Socrata endpoint, complaint-versus-outage limits, and unavailable hidden map count. Literal checks supplement manual review; they do not establish general grounding.

Replay a retained application capture (captures may contain private uploaded text; keep those outside Git):

```sh
OLLAMA_LOCAL_NUM_CTX=32768 OLLAMA_LOCAL_THINK=default OLLAMA_LOCAL_KEEP_ALIVE=0 \
  node scripts/benchmark-ollama-local.js /private/tmp/openember-tuning/prompt.json /private/tmp/reference.json --cold
OLLAMA_LOCAL_NUM_CTX=24576 OLLAMA_LOCAL_THINK=false OLLAMA_LOCAL_KEEP_ALIVE=0 \
  node scripts/benchmark-ollama-local.js /private/tmp/openember-tuning/prompt.json /private/tmp/candidate.json --cold
```

## Measurements

All rows use identical fixed messages, sequential requests, and cold models.

| Context / thinking | Request | First answer | Native prompt | Native generation | Native input tokens | Quality |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 32768 / default | 318.1 s | 255.7 s | 178.0 s | 129.5 s | 12,317 | Pass |
| 24576 / default | 350.5 s | 286.8 s | 220.2 s | 122.7 s | 12,317 | Incomplete: omitted requested zero electrical-report category |
| 24576 / thinking off, cold 1 | 298.8 s | 239.8 s | 234.6 s | 59.0 s | 12,323 | Pass |
| 24576 / thinking off, cold 2 | 334.1 s | 265.8 s | 263.1 s | 68.3 s | 12,323 | Pass |

The initial literal rubric checked 311 provenance but did not explicitly assert every category count. Manual review caught the missing zero; the checker was strengthened and the second result correctly fails. No acceptance criterion was relaxed.

`/api/ps` measured 9,930,161,520 bytes at 32768 versus 8,680,248,442 bytes at 24576, both entirely in GPU memory: a 12.6% model-memory reduction. Smaller context did not improve prompt speed in this pair. These are single observations with uncontrolled desktop activity and possible thermal/system variation; no general latency claim follows. There are no Docker application services running during native replay; Docker/browser acceptance is a separate environment and must not be inferred from these timings.

The two thinking-off runs average 316.4 seconds versus the single 318.1-second 32K baseline. This does **not** establish a reliable overall latency improvement. Generation fell to 59.0–68.3 seconds versus 122.7 seconds in the 24K thinking-on run, but prompt processing varied and offset that saving. The six additional input tokens in thinking-off requests come from the control template; messages hashes are identical and native logs retain the full inputs. Every replay records zero cached input tokens and stops naturally.

## Opt-in local profile

`compose.performance.yaml` provides the candidate 24576-token, thinking-off profile. It explicitly forces local-only, an empty cloud key and post-turn unloading in both services. The candidate passes the fixed-fixture grounding and headless production-renderer delivery checks below. Keep the base defaults for general use until the broader Docker/browser and larger-input matrix is repeated. A smaller context is not a universal input budget: future uploads or history may exceed it, and no tokenizer-based preflight is implemented here.

```sh
docker compose -f compose.yaml -f compose.performance.yaml --profile streamlit up --build -d
```

This is a local opt-in command, not a hosted deployment. Return to the base profile by recreating the services using only `compose.yaml` and the desired existing local-only environment.

## Verification

The full `local-first:gate` passes with `.venv` Python: 73 regional JavaScript, 40 regional Python, 80 Streamlit Python, 39 provider/transport JavaScript and 25 provider/worker Python checks; configuration, production build, Phase 3/4 validators, compilation and diff checks pass. This includes production forecast/citation builders, HTTP cancellation/timeouts, and the real Streamlit renderer with a delayed fake stream and a forced full-app rerun: one request, automatic completion and re-enabled input. The initial sandboxed transport run could not bind loopback sockets; the full gate passed with socket access. Generated build artifacts were restored afterward.

## Real local Streamlit delivery and timing correction

A real local Qwen request ran through `ChatJob` and the production Streamlit renderer extracted into AppTest, using the same full messages and the 24576/thinking-off/automatic-unload profile. It completed in 305.4 seconds (native prompt 254.0 seconds, generation 48.9 seconds, 12,323 input tokens). The harness deliberately triggered one full-app rerun after partial text. Exactly one inference request completed, the final answer arrived automatically, Send re-enabled, all answer checks passed, and `/api/ps` was empty afterward. This is a headless renderer check, not a browser paint or full Docker application acceptance.

The retained `UI sync` value was 48.9 seconds. Inspection exposed an existing metric bug: `sync_chat_job` read the previous timing **after** `update_chat_response` / `finish_chat_response` replaced the message dictionary. Each poll therefore discarded the first handoff value and recomputed elapsed time since first output. The 48.9-second value does **not** establish an actual first-handoff delay. The fix captures the previous timing before replacing the message. A regression checks distinct partial snapshots and final completion at later clock times while requiring the initial value to stay fixed; the new regression also fails against the prior implementation, and the full gate exercises forced reruns and automatic delivery. Real inference was not repeated after this timing-only correction, so no corrected native handoff latency is claimed.

The measured benefit is reduced model memory. Reliable end-to-end latency improvement, token-by-token browser responsiveness, the broader visible/hidden map matrix, full Docker/browser acceptance and larger/history-heavy prompts remain open. Request-aware evidence budgeting is a subsequent tuning direction; this pass intentionally retained the complete evidence for comparison. No model or production setting was changed. User retains commit and merge ownership.

Final usage check: 22% weekly remaining, above the user's 10%-remaining pause threshold. The model is unloaded, native replay and renderer harnesses have exited, and local Docker application services remain in their initial stopped state. Source changes are uncommitted and ready for review.
