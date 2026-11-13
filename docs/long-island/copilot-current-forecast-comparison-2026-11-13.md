# Current-forecast local/cloud comparison

Date: November 13, 2026 (America/New_York).

The focused local `qwen3:8b` precipitation check passes on the freshly acquired configured NWS forecast. The cloud comparison is pending the user's run. No cloud request was submitted.

## Source and question

Fetched at **10:32:00 AM EST** (`2026-11-13T15:32:00.616Z`), from [https://api.weather.gov/gridpoints/OKX/62,50/forecast](https://api.weather.gov/gridpoints/OKX/62,50/forecast). Source `updateTime`: `2026-11-13T10:44:40+00:00`.

Tonight is **November 13, 6 PM through November 14, 6 AM EST** (`2026-11-13T18:00:00-05:00` → `2026-11-14T06:00:00-05:00`). The structured probability is **52%**; the detailed forecast says **50%**, with a chance of rain before 10 PM. Both representations occur in this source. A cloud answer citing the narrative's rounded 50% must not be failed merely for differing from the structured value.

Copy this same question into the cloud model:

> What is the probability of precipitation in tonight’s supplied forecast? State the percentage, forecast period, and source URL. Distinguish a missing value from 0%. Explain whether that percentage establishes that no rain is expected.

Refresh the hosted app's NWS forecast and confirm the same source URL, period and source update time. If its feed has changed, use the [frozen forecast evidence](copilot-current-forecast-evidence-2026-11-13.txt) as the supplied evidence in both comparisons instead of comparing different revisions. The hosted configuration, enabled sources and system prompt were not independently inspected; this aligns the forecast record and question, not necessarily the entire prompt.

## Local result

The probability of precipitation in tonight’s supplied forecast is 52%. This forecast applies to the period from 2026-11-13T18:00:00-05:00 to 2026-11-14T06:00:00-05:00. The source URL is [https://api.weather.gov/gridpoints/OKX/62,50/forecast](https://api.weather.gov/gridpoints/OKX/62,50/forecast).

A nonzero probability (52%) does not establish that no rain is expected. The forecast indicates a chance of rain before 10pm, followed by mostly cloudy conditions. Therefore, rainfall is possible, though not certain. The 52% probability reflects the likelihood of precipitation during the forecast period, not the absence of rain.

A missing value would indicate that the probability of precipitation was not provided in the forecast data, which is not the case here. The supplied forecast explicitly includes a nonzero probability of precipitation.

First answer: **48.3 s**. Completion: **75.6 s**. Native input: **3,653 tokens**, no cached input, 32,768 context and explicit no truncation. One local generation, natural stop, `llm_grounded` mode. The model was forced with `answer_method=model`; a deterministic handler was not substituted.

The request keeps the five configured KB modules, uses current request/fetch timestamps and omits the previous synthetic upload, selected facility, map layer and old grid evidence. This focused precipitation question differs from the earlier mixed-source workload. Its success cannot establish that fresh data alone corrected the earlier commander/precipitation errors or that mixed-source grounding is solved.

Full snapshot, actual messages, answer, metrics, memory samples and manual review: [results artifact](copilot-current-forecast-results-2026-11-13.json).

## Repeat the test with a fresh forecast

```sh
node scripts/benchmark-copilot-current-forecast.js /private/tmp/openember-current-forecast
```

Defaults to the installed `qwen3:8b`, local-only, thinking off, 32K context and automatic unloading. `OLLAMA_LOCAL_MODEL` can select another already-installed model. The runner never reads `.env`, calls cloud or downloads a model. It refuses inference when another model is loaded. `--prepare-only` captures the current source and request without inference. Every run writes its source snapshot, expected period/value, exact question, actual local messages and answer separately from the fixed historical regression corpus.

Validation: Node syntax check, one real current-source inference, request/model/source checks, correct value/period/URL review and native retention/transport checks passed. No application-runtime change, default-mode change, environment-file edit, hosted deployment, commit or push was performed. No full regression gate was repeated for this standalone runner.

The first startup attempt stopped before a network or model request because Node 20.1 lacks `AbortSignal.any`; the runner now uses a compatible fetch-deadline controller. Only one inference was submitted.

Suggested commit: `test(copilot): add current-forecast local comparison`.
