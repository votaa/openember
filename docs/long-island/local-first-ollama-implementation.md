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
| `OLLAMA_CLOUD_MODEL` | `gpt-oss:120b-cloud` | Ollama Cloud model |
| `OLLAMA_API_KEY` | empty | Optional cloud credential; runtime secret only |
| `OLLAMA_PROBE_TIMEOUT_MS` | `3000` | Local model discovery/connect deadline |
| `OLLAMA_STREAM_TIMEOUT_MS` | `90000` | Chat connection/idle-read timeout |

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
