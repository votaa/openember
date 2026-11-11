# Local answer delivery and grounding fixes — November 10, 2026

This follows the failures recorded in [the full-context baseline](local-baseline-2026-11-10.md). Model, context allocation, thinking defaults, timeout settings, and evidence volume are unchanged. Docker now requests post-turn model unloading to let the VM recover memory; this sacrifices warm model residency rather than reducing evidence or changing generation. No cloud inference, hosted deployment, commit, push, or merge was performed.

## Changes

- Streamlit polls its existing session-owned worker on the server while a turn is active. It sends changed answer/progress snapshots through one replaceable container, stores the completed turn, and reruns to restore controls. It no longer depends on a browser fragment timer to notice worker output. Full-app reruns continue to resume one worker. This addresses a fragile delivery path; the small original renderer test already updated automatically, so browser timer failure was not independently established as the sole baseline root cause.
- `UI sync` measures the interval from first answer text received by the worker to its first copy into script/session state. It is **not browser paint latency**, and it does not measure time spent upstream before Python receives a frame. Native Ollama timings and worker first-output timing remain separate.
- Both forecast serializers identify period numbers, daily highs versus nighttime lows, and original start/end timestamps. Hourly temperatures remain temperatures. Shared rules require the first-period answer to preserve that period's full wind range and timezone offsets and avoid importing a high from a later period.
- Weather observations with a scalar wind measurement no longer enter the forecast-grid summarizer and lose their observation content.
- React's 311 request context previously included counts but omitted the authoritative source URL. Both request builders now include the configured endpoint, source name, fetch time, report-window boundaries/timezone, and configured filter alongside existing states, counts and complaint limitations. Shared citation rules require exact supplied URLs and explicit unavailable-source gaps.

## Automated verification

The request-builder tests exercise the production React and Streamlit context functions with the configured 311 registry, not merely prompt-string rules. Forecast fixtures distinguish tonight's 44°F low and 7–10 mph west wind from the following day's 60°F high. They verify serializer parity, original UTC offsets, hourly labeling and observation routing.

The real Streamlit AppTest uses the production renderer with a delayed fake stream. It has no browser timer, deliberately forces a full-app rerun after partial text, and asserts automatic completion, enabled input and exactly one inference request. Separate worker tests cover partial output, errors, timing, and the worker-to-script handoff metric.

Browser acceptance results and final validation are recorded below. Deterministic fixture checks establish evidence construction; they do not establish general local-model answer accuracy.

## Native/Docker diagnosis and initial Streamlit acceptance

A full Streamlit request on the initial server-polling patch retained all normal KB/NOAA evidence (17,851 native prompt tokens, 32K allocated context). Native prompt evaluation took 359.236 seconds; generation took 176.069 seconds / 713 tokens; native total was 535.305 seconds and HTTP completed in about nine minutes. No input truncation was logged. The UI still showed connecting after native completion, so browser fragment scheduling cannot explain the whole delay.

A separate Docker `exec` that requested the public NWS first two periods also remained pending for minutes. Browser control timed out on both page operations and inventory while the native request ran. macOS reported 745,036 wired 16K pages (about 11.4 GiB). After native completion and confirmation that the runner was idle, `ollama stop qwen3:8b` was used strictly as a diagnosis/cleanup action. Wired pages fell to 139,175 (about 2.1 GiB), the Docker command returned, browser access recovered, and Streamlit automatically rendered the stored completed answer without menu Rerun. This strongly supports native-model memory pressure interfering with Docker/app delivery, although it is a single uncontrolled observation and not proof that every delayed frame has the same cause.

The answer correctly used tonight's 44°F **low**, **7 to 10 mph west** wind, `2026-11-10T18:00:00-05:00` through `2026-11-11T06:00:00-05:00`, and `https://api.weather.gov/gridpoints/OKX/62,50/forecast`. It did not import the following day's 60°F high. An independent public NWS fetch returned these same first two periods. Stored timings were first output 629.1 seconds, thinking 4.8 seconds, answer 0.1 seconds, UI sync 0.7 seconds, prompt 359.2 seconds, load 11.1 seconds. The initial image labeled the handoff metric `UI delivery`; the final label is `UI sync` to make its limits explicit.

## Post-turn memory cleanup

The local API payload supports `keep_alive: 0`, which requests unloading after completion ([official Ollama API schema](https://github.com/ollama/ollama/blob/main/docs/openapi.yaml)). `OLLAMA_LOCAL_KEEP_ALIVE=0|default` is server-side and validated in both providers. Compose defaults it to `0`; outside Compose the default remains `default` (no override). Cloud requests never receive this field. No separate stop command is sent during a request, and no memory/context/model-global configuration is changed.

This targets completed-answer delivery, not faster inference. It can increase subsequent-turn latency by reloading the model and losing prompt-cache residency. Progress during active high-memory inference may still be delayed; repeated quality, hidden-map, and performance acceptance remain separate gates.

## React full-context acceptance with automatic cleanup

With the final containers, default thinking, 32K allocated context, normal KB/NOAA evidence and the 311 electric-hazard layer visible, the live React request completed locally. Native input was 15,139 tokens; native prompt evaluation took 371.384 seconds and generation 240.032 seconds / 736 tokens (611.416 seconds total; HTTP about 10m20s). The browser's retained timings were first output 629.3 seconds, thinking 0.4 seconds, answer 0.1 seconds, prompt 371.4 seconds and load 10.2 seconds. No manual model unload, page reload, or retry was used to deliver this answer. Send re-enabled automatically. The next request started a new native runner with an empty prompt cache, consistent with automatic post-turn model unloading.

The answer preserved all tested source facts: **3 total reports**, **0 direct electrical**, **1 tree/wire**, **2 road blockages**; reporting window `2026-11-03T19:42:33` through `2026-11-10T19:42:33`, `America/New_York` / UTC−5; fetched `2026-11-11T00:42:33.854Z`; exact source `https://data.cityofnewyork.us/resource/erm2-nwe9.json`. It explicitly described complaints, not confirmed utility outages. This passes the earlier generic-URL failure for this case.

Inference and browser responsiveness are still slow under memory pressure. Automatic post-turn cleanup recovered final delivery; it did not establish token-by-token progress, a controlled latency improvement, or universal model grounding. No prompt budgeting, context reduction or thinking/sampling optimization has been performed.

## Final Streamlit full-context acceptance

The final image (changed-snapshot server polling plus automatic post-turn cleanup) was tested in a fresh Streamlit session with normal KB/NOAA evidence and default thinking. The prompt retained 17,812 tokens at 32K context. Native prompt evaluation took 682.412 seconds; generation took 106.082 seconds / 348 tokens; native total was 788.494 seconds and HTTP completed in about 13m10s. The browser displayed the completed answer **without menu Rerun, reload, retry, or manual model unload**. Chat input and Clear Chat were separately verified enabled afterward. `ollama ps` was empty after completion, and both local Docker containers were healthy.

The answer matched the independent NWS fetch at November 10, 20:14 EST: Tonight, **44°F low**, **7 to 10 mph West**, `2026-11-10T18:00:00-05:00` through `2026-11-11T06:00:00-05:00`, and the exact `https://api.weather.gov/gridpoints/OKX/62,50/forecast` URL. No 60°F high was imported from the next period. Retained app timings were evidence 0.0 seconds, first output 805.3 seconds, thinking 0.3 seconds, answer 0.1 seconds, **UI sync 0.8 seconds**, prompt 682.4 seconds and load 10.1 seconds. Coalesced application thinking/answer phases do not measure native generation duration.

| Requested case | Local result |
| --- | --- |
| Streamlit first-period forecast facts, wind range, timezone and citation | Pass in the tested full-context requests |
| React 311 map counts, window, limitations and exact source citation | Pass in the tested full-context request |
| Streamlit completed-answer delivery and re-enabled controls | Pass with final polling and automatic cleanup; no manual recovery |

The final `local-first:gate` passed using `.venv` Python: 73 regional JavaScript, 40 regional Python, 80 Streamlit Python, 38 provider/transport JavaScript and 23 provider/worker Python checks; configuration, production build, Phase 3/4 validators, compilation and diff checks passed. The independent grounding suite passed all eight tests. The temporary port-8510 renderer server was stopped; the real local containers remain running with local-only and an empty cloud key. Generated build artifacts were restored so the review diff contains source, tests and documentation.

These tested failures are addressed locally. **Performance tuning remains deferred.** Active inference still causes memory pressure and delayed live progress; completed answers now recover automatically. Model unloading can make subsequent requests cold. Repeated cold/warm quality/performance measurements and the broader hidden-layer matrix remain open; this is not general local-model or production-release acceptance.
