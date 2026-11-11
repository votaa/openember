# Local-first Ollama implementation

## Scope and phases

Preserve prompts, evidence grounding, streaming and partial response persistence,
maps, document ingestion, and the Vercel deployment. Do not deploy, change hosted
configuration, or call paid cloud inference during implementation.

1. Inspect React/Vite, Vercel and Streamlit; run baseline gates; record plan.
2. Extract testable JavaScript/Python routing and streaming; add mocked tests.
3. Wire provider status into both interfaces; add local Vite API transport.
4. Package OpenEmber for Docker on macOS, document configuration and startup.
5. Run all gates, review security/diff, commit implementation together with plan.

## Decisions

- 2026-11-09: Local-first is the local default; local-only prohibits cloud;
  cloud-only prohibits local. Vercel forcibly uses cloud-only.
- Local default: `qwen3:8b` (provisional). Cloud default:
  `gpt-oss:120b-cloud`. Both configurable server-side.
- Probe installed local models; never pull automatically or select cloud-backed
  model aliases as a local model. Fall back only before upstream streaming begins.
- Any first valid upstream frame commits provider selection, including thinking
  frames. Errors after that preserve partial text and never replay in cloud.
- Docker contains OpenEmber only; native macOS Ollama is reached through
  `host.docker.internal:11434`. Keys remain server-side runtime secrets.
- Keep cloud model compatibility through `OLLAMA_MODEL`; cloud endpoint is fixed
  to `https://ollama.com` to prevent sending credentials to an arbitrary host.

## Configuration contract

All Ollama settings are **server-side**. No `VITE_*` Ollama settings are read.

| Setting | Default | Meaning |
| --- | --- | --- |
| `OLLAMA_MODE` | `local-first` | `local-first`, `local-only`, or `cloud-only` |
| `OLLAMA_LOCAL_HOST` | `http://127.0.0.1:11434` | Native Ollama base URL; Compose sets `http://host.docker.internal:11434` |
| `OLLAMA_LOCAL_MODEL` | `qwen3:8b` | Installed local model; provisional until hardware acceptance |
| `OLLAMA_LOCAL_THINK` | `default` | Local thinking: `default`, `true`, or `false`; never forwarded to cloud |
| `OLLAMA_CLOUD_MODEL` | `gpt-oss:120b-cloud` | Ollama Cloud model |
| `OLLAMA_API_KEY` | empty | Optional cloud credential; runtime secret only |
| `OLLAMA_PROBE_TIMEOUT_MS` | `3000` | Local model discovery/connect deadline |
| `OLLAMA_STREAM_TIMEOUT_MS` | `90000` | Cloud response-header wait and stream inactivity limit |
| `OLLAMA_LOCAL_STREAM_TIMEOUT_MS` | `900000` | Local response-header wait and stream inactivity limit (15 minutes) |

`OLLAMA_MODEL` remains a legacy cloud-model alias; explicit `OLLAMA_CLOUD_MODEL`
wins. Legacy `OLLAMA_HOST`, `VITE_OLLAMA_HOST`, `VITE_OLLAMA_MODEL`,
`VITE_OLLAMA_API_KEY`, browser session keys, and `x-ollama-key` are no longer used.
Move any old browser key to server-side `OLLAMA_API_KEY` and remove the old
`VITE_*` setting yourself. Existing ignored local files are preserved.
Cloud requests only target `https://ollama.com`; redirects are rejected.
Streamlit reads secrets.toml first, then environment variables. Vite reads its
normal env files plus process env (process env wins). The standalone Node server
and Python do not load dotenv files automatically: export variables first.
Compose supports `--env-file .env.local` for runtime interpolation.

| Mode | Behavior |
| --- | --- |
| local-first | Probe configured installed model; try local; fall back to cloud only before first valid upstream frame |
| local-only | No cloud connection or credential needed; unavailable model is a visible error |
| cloud-only | No local probe/request; requires cloud key |
| Vercel | Forces cloud-only regardless of env or request body |

Cloud status means **configured**, not verified. GET status never calls cloud
inference or spends credits. Cloud auth/connectivity is verified only on send.
Local failure reasons travel in fallback metadata and terminal error attempts.
No request body can override server mode, endpoint, model, or credentials.

## Startup

### React/Vite on macOS

Prerequisites: Node 20+; native Ollama application installed and running.
From the repository root:

```bash
ollama pull qwen3:8b
npm ci
npm run dev
# http://localhost:3000
```

Ollama must already be running. Use `ollama serve` in a separate terminal if
using the CLI rather than the macOS app. Do not start two Ollama servers.
For local-only development: `OLLAMA_MODE=local-only npm run dev`.
Optional cloud fallback: set `OLLAMA_API_KEY` in ignored `.env.local` or export
it in the shell before starting. Restart Vite after changing settings.

The built local app also has an API server:

```bash
npm run build
OLLAMA_MODE=local-only npm start
# http://localhost:3000
```

`npm start` reads exported env only. `npm run preview` and plain static hosting
have no local chat API. The standalone server binds loopback by default.

### Streamlit on macOS

Use Python 3.11+ (the existing code requires at least Python 3.10):

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r streamlit/requirements.txt
ollama pull qwen3:8b
OLLAMA_MODE=local-only python -m streamlit run streamlit/app.py
# http://localhost:8501
```

For local-first, change `OLLAMA_MODE=local-first`; export `OLLAMA_API_KEY` only
if cloud fallback is desired. `.env.local` is not read by Streamlit. Secrets may
instead go in ignored `.streamlit/secrets.toml`. UI status is cached for 30
seconds; Refresh provider status clears the cache. Requests always probe afresh.

### Docker Desktop on macOS

Dockerize OpenEmber only; leave native Ollama running on the Mac.

```bash
ollama pull qwen3:8b
OLLAMA_MODE=local-only docker compose up --build react
# http://localhost:3000

# Optional Streamlit service (separate terminal):
OLLAMA_MODE=local-only docker compose --profile streamlit up --build streamlit
# http://localhost:8501

# Stop/remove these OpenEmber containers:
docker compose --profile streamlit down
```

Compose sets `OLLAMA_LOCAL_HOST=http://host.docker.internal:11434` for both
services, regardless of host dotenv values. Ports publish only on loopback.
To use local-first with optional cloud fallback, export the runtime settings or
use `docker compose --env-file .env.local up --build react`. Do not pass keys as
build arguments. Both images run as non-root users. `.dockerignore` excludes
dotenv files, Streamlit secrets, Git metadata, dependencies and local artifacts.

If the container cannot reach native Ollama, check Docker Desktop host access
and Ollama's listen address. If necessary, stop the native app and run
`OLLAMA_HOST=0.0.0.0:11434 ollama serve` on the host, using the macOS firewall to
restrict access. This exposes Ollama beyond loopback; restore its default bind
when finished. OpenEmber itself never starts or containerizes Ollama.
No `OLLAMA_ORIGINS` change is needed because requests are server-to-server.

### Hosted behavior

Vercel keeps the existing Vite build, rewrites, and Edge API entry point. Keep
`OLLAMA_API_KEY` server-side and optionally set `OLLAMA_CLOUD_MODEL`. Existing
`OLLAMA_MODEL` is supported. No hosted settings are changed by this work.
On Streamlit Cloud, explicitly set `OLLAMA_MODE="cloud-only"` in secrets alongside
`OLLAMA_API_KEY` and optional `OLLAMA_CLOUD_MODEL`; hosted Streamlit cannot reach
the user's computer either. Do not deploy until separately authorized.

## Transport and module boundaries

- `lib/ollama.js`: config, local discovery, strict streaming parser, routing.
- `lib/chat-handler.js`: GET status, POST validation, NDJSON response.
- `api/chat.js`: force-cloud Vercel entry point.
- `vite-plugin-ollama.js` + `lib/node-handler.js`: local same-origin API adapter.
- `server.js`: built static frontend and streaming API for local/Docker use.
- `src/ollama-client.js`: browser transport and status formatting, no secrets.
  The legacy `src/hooks/useOllama.js` delegates here rather than retaining a
  browser key or alternate cloud transport.
- `streamlit/ollama_provider.py`: equivalent Python routing with injected HTTP.

UI layers continue constructing the same grounded system prompt and recent
message history, gathering the same map/source/document evidence, and persisting
partial answers. Thinking frames commit routing but are not displayed as answer
text. Provider metadata is stored with responses and displayed in current/last
provider status. No change to map or ingestion logic.

GET `/api/chat` returns `{mode, provider, model, available, local, cloud, message}`.
POST accepts `{messages: [{role, content}]}` and streams NDJSON:

```json
{"provider":{"mode":"local-first","provider":"local","model":"qwen3:8b","fallback":false,"attempts":[]}}
{"message":{"content":"Grounded answer"},"done":false}
{"done":true}
```

Errors are `{error: {code, message, provider?, partial?, attempts?}, done: true}`.
Codes include `invalid_config`, `invalid_request`, `missing_key`, `authentication`,
`model_missing`, `model_not_local`, `rate_limit`, `upstream_error`, `unreachable`,
`timeout`, `invalid_stream`, `interrupted`, and terminal `no_provider` (with
per-attempt errors). Invalid requests/configuration use JSON HTTP errors.
Upstream error bodies, credentials, and exception URLs are never returned.
An HTTP 200 stream may contain a terminal error frame; clients must inspect it.
Readers are canceled/closed on completion, abort, or generator close.

## Validation and status

Implementation phases 1–5 complete on `feature/local-first-ollama`.
The plan was the first repository change and is committed with implementation.

Final validation (2026-11-09):

| Check | Result |
| --- | --- |
| `npm run local-first:gate` | Pass: includes both existing phase gates, configuration validation, production build, Python compilation, whitespace check, and new provider tests |
| `node --test tests/*.test.js` | 98 passed; no skips |
| `python3 -m unittest discover -s tests -p 'test_*.py'` | 90 passed; no skips with Python 3.11 and full requirements installed |
| New provider suite | 31 JS (including real HTTP transport) and 10 Python tests; Ollama mocked |
| Docker React + Streamlit builds | Pass; Compose configuration valid |
| Container smoke checks | Health, mock local streaming in both runtimes, non-root UID 1000, no dotenv/Streamlit secret files |
| React browser smoke | Local provider/model visible; streamed mock answer retained after completion |
| Vite unavailable-provider smoke | GET status reports unavailable; POST emits normalized `no_provider` |
| Optional integration script | Verified against temporary local mock; actual native Ollama inference not run because daemon was not running |
| Credential review | Known ignored local Ollama credentials absent from built assets and changed files; browser credential path removed; keys not passed to image builds |
| Dependency audit | Existing unchanged lockfile: 5 advisories (4 high, 1 moderate), see below |

Baseline used system Python 3.9: 67 JS and 40 regional Python tests passed,
then existing Streamlit type annotations prevented the rest of the gate. Final
validation used an isolated Python 3.11 environment with the full application
requirements, resolving all five initial optional-runtime skips.

Security review: no new dependencies; `package-lock.json` unchanged. The existing
npm audit reports advisories for `js-yaml`, `nanoid`, `source-map-js`, `vite`
(high), and `esbuild` (moderate). Dependency remediation is separate from this
routing change; some fixes require a major Vite upgrade. This work does not
claim a clean dependency audit. Development services remain loopback-only by
default. Docker secrets are runtime-only; dotenv and Streamlit secret files are
excluded from the build context. Cloud hosts are fixed and redirects rejected.

No deployment, merge, push, production environment change, or paid cloud
inference was performed. Original `.DS_Store` and `src/.DS_Store` changes were
preserved and excluded from the implementation commit. The tracked `dist/`
assets were regenerated to match the implementation; generated Vite dependency
cache changes from smoke testing were restored.

```bash
# Use a Python 3.11+ environment with streamlit/requirements.txt installed.
npm run local-first:gate
# Optional: real LOCAL ONLY inference; never calls cloud or pulls models:
RUN_OLLAMA_LOCAL_TEST=1 npm run test:ollama:local
```

The default test run is entirely mocked for Ollama. The opt-in integration
requires the configured local model to be installed. No paid cloud calls are
part of validation. Model download and hardware sizing are operator steps.

## Limitations and troubleshooting

- `qwen3:8b` quality, memory usage, and long-context grounding need hardware
  acceptance; prompts are preserved, but model capabilities differ from cloud.
- Ollama must report the model as installed. Cloud-tagged models and reported
  remote aliases are rejected locally. Use trusted native Ollama; for a strict
  daemon-level no-cloud policy also set `OLLAMA_NO_CLOUD=1` on Ollama itself.
- Local-first can send the complete prompt/evidence to cloud on pre-stream
  failure when a key is configured. Choose local-only to prohibit that.
- Feed/map requests still use the internet; local-only refers to AI routing.
- After any upstream frame, a timeout/EOF/error keeps partial text and reports
  interruption; retry is manual. Thinking output can delay visible answer text.
- The 90-second timeout is an idle-read deadline, not a total generation limit.
- Local servers have no new authentication layer. Keep loopback bindings and
  do not publish the development API to an untrusted network.
- No automatic model install, background pull, provider switching UI, or cloud
  connectivity probe. Change server configuration and restart instead.

## References

Protocol checked against official [chat API](https://docs.ollama.com/api/chat)
and [installed models API](https://docs.ollama.com/api/tags). Native server
binding and daemon cloud-disable settings are documented in the
[Ollama FAQ](https://docs.ollama.com/faq).


## Streamlit rerun follow-up — November 9, 2026

Docker testing with native Qwen revealed that script reruns could interrupt the
synchronous model generator despite the existing refresh guards. Inference now
uses a session-owned worker (`streamlit/chat_job.py`) with no Streamlit calls
from the background thread. A polling chat fragment persists its snapshots and
shows connection/thinking/answer progress. A rerun reuses the same job and never
replays the provider request. Prompt/evidence construction and routing contracts
remain unchanged. Seven additional regression tests cover job lifecycle and the
production fragment under real Streamlit AppTest widget reruns.

Validation: `npm run local-first:gate` passed; full discovery passed 99 JavaScript
and 97 Python tests, with no skips. Docker Streamlit was rebuilt and restarted
in its original `local-only` mode. Its status confirmed native `qwen3:8b`, with
no cloud key configured. In the browser, a real local connectivity request
survived a deliberate full-page provider-status refresh, displayed Thinking,
and retained its final `OK` answer. The single native `/api/chat` request
completed successfully in about 70 seconds, beyond the 60-second refresh window.

Performance/quality finding (separate follow-up): native Ollama logged 16,769
input tokens, truncated to 2,050 for its 4,096-token context window. Prompt
processing took about 24 seconds and generation about 40 seconds (334 tokens,
roughly 8.3 tokens/second), plus model loading. Evidence budgeting/context sizing
and optional thinking controls need acceptance before relying on long-context
answers. This rerun fix does not change prompt content, model settings, or
provider fallback behavior. No paid cloud inference or hosted deployment was
performed.
See [the issue record](issue-streamlit-chat-refresh.md) for lifecycle limits.

## Local optimization — November 9, 2026

The first optimization increment adds timing instrumentation and configurable
local thinking. `OLLAMA_LOCAL_THINK=default|true|false` is server-side and passed
through Compose. `default` omits `think`, preserving the installed model's
behavior. `false` sends a boolean to local requests only; cloud requests and
fallbacks never receive this setting. Restart local services after changing it.
Support depends on the installed model; this was tested with `qwen3:8b`.
See Ollama's [thinking controls](https://docs.ollama.com/capabilities/thinking).

Both interfaces retain response timing metadata and display a compact summary.
React also shows gathering evidence, connecting/processing, thinking, and
answering progress. Streamlit's existing background worker retains those phases
across reruns. Raw thinking content is not added to chat history.

Timing definitions:

- Evidence: per-request evidence/context construction. React includes awaiting
  initial weather and refreshing stale weather. Streamlit includes context/map
  gathering inside preparation; feed refreshes earlier in the script run are
  excluded. These values are not directly comparable across interfaces.
- First output: request start to first observed thinking or answer chunk. Includes
  routing, discovery, transport, loading and prompt evaluation; it is not a pure
  model-processing measurement.
- Thinking: first thinking chunk to first answer chunk (or completion).
- Answer: first answer chunk to completion. Chunk arrival measurements include
  transport and buffering, and are estimates rather than model-internal phases.
- Native `load_duration`, `prompt_eval_duration`, `eval_duration`, total duration,
  and prompt/generated token counts are captured from Ollama's final frame.
  Durations remain nanoseconds in stored metadata; displayed values use seconds.
  Native generation duration includes thinking and answer generation; it overlaps
  the observed phases and must not be added to them. Interrupted React responses
  retain partial answer text but do not receive a completed timing summary.

Native local-only smoke results (one short request per setting, sequential,
no model pull or cloud request):

| Setting | Total | Load | Prompt processing | Generation | Input / generated tokens |
| --- | --- | --- | --- | --- | --- |
| `false` | 3.802 s | 0.098 s | 3.108 s | 0.120 s | 23 / 2 |
| `default` | 16.291 s | 0.021 s | 1.188 s | 15.055 s | 17 / 115 |

Both produced a nonempty answer. This is a connectivity/control smoke test,
not a quality benchmark or a general speedup claim. Different token counts,
cache state, and model templates affect comparison.

Validation: `npm run local-first:gate` passed using `.venv` Python 3.11,
including production build, provider tests (33 JavaScript and 19 Python, no
skips), deterministic worker timing boundaries, local-only thinking controls,
cloud fallback isolation, and real Streamlit fragment rerun coverage.
Docker images rebuilt successfully. Existing running services were preserved;
one-off React/Node and Streamlit/Python containers both successfully completed
local-only native `qwen3:8b` requests through `host.docker.internal`, with
`OLLAMA_LOCAL_THINK=false`, no fallback, and final native metrics. These transport
checks do not establish UI or grounded-answer quality.

Remaining acceptance before merge readiness:

1. Use the new measurements on representative full prompts, including cold and
   warm runs with thinking enabled/disabled. Inspect token counts and native logs
   for truncation; the earlier 16,769-token prompt exceeding the active context
   window remains unresolved. Choose evidence budgeting/context sizing separately.
2. Verify answers in **both React and Streamlit** for current weather with source
   time/attribution, visible versus hidden map-layer evidence, and an uploaded
   document containing a unique verifiable fact. Check absent evidence produces
   uncertainty rather than invented facts. Repeat with thinking disabled.
3. Exercise progress, cancellation, completed timing display, and retained partial
   answers in the browser with actual native inference. Streamlit rerun persistence
   has regression coverage; this increment has no new manual browser acceptance.
4. Review the final diff and existing dependency advisories, then decide readiness.
   No merge, commit, push, deployment, hosted configuration change, or paid cloud
   inference is authorized by these local checks.

## Performance acceptance follow-up — November 9, 2026

Testing of committed instrumentation (`a6cec13`) is recorded in
[the performance and grounding report](local-performance-testing-2026-11-09.md)
and [raw replay results](local-performance-results-2026-11-09.json).
Actual native Ollama inference was exercised through both Docker interfaces;
cloud credentials were empty and routing was local-only throughout.

The context-limit issue is reproduced, not resolved: full React and Streamlit
prompts were truncated to 2,050 input tokens in a 4,096-token runner. Weather
answers failed grounding in both interfaces, and React lost supplied uploaded
facts and visible map counts. A smaller retained-evidence diagnostic recovered
those factual answers. Thinking disabled reduced generation delay but did not
resolve full-prompt quality. Cache reuse strongly affected latency.

The next implementation priority is request-aware evidence budgeting plus an
explicit, hardware-tested local context allocation with output headroom. Keep
merge readiness open until the same weather, document, map, missing-evidence,
and time/citation acceptance cases pass without silent truncation. See the
report for passing UI/transport behavior, measured timings, and remaining gates.

## November 10: full-context local baseline

Before evidence optimization, local inference now allows 15 minutes waiting for
response headers or the next stream chunk. This is an inactivity limit, not a
15-minute total request cap: an actively streaming response may run longer. A 600-second Streamlit test reached
its wait limit at the end of prompt processing, so the baseline allowance was
raised to 900 seconds before retesting.
Model discovery and Python TCP connection establishment retain their short
`OLLAMA_PROBE_TIMEOUT_MS` limit. Cloud retains its existing 90-second setting.

Set `OLLAMA_LOCAL_STREAM_TIMEOUT_MS=900000` and restart local processes or
recreate Compose services. The local setting is separate from existing
`OLLAMA_STREAM_TIMEOUT_MS` overrides, so a previous 90000 value does not shorten
local inference. No prompt, evidence budget, context allocation, model or
thinking-default changes accompany this baseline. Keep Ollama's 32K setting
for comparison and inspect native logs for input truncation.

The Node/Vite local transport uses Node HTTP streaming with routing-controlled
abort and idle timers, avoiding native fetch's independent header-wait limit.
Vercel and cloud transport retain native fetch. Local-only timeout errors identify
whether the model had emitted a valid frame; they no longer display only
“No provider available.” Streamed Python read timeouts are normalized even when
Requests wraps them in a connection error.

React retains its Stop button and partial answer behavior, including cancellation
before the first output. Streamlit retains its rerun-safe worker and progress
phases; it does not currently provide a per-turn Stop button. Local waiting
should therefore be bounded even during baseline tests.

The replay benchmark uses the same local transport and a separate 20-minute
total safety deadline. Private prompt captures belong outside Git.
