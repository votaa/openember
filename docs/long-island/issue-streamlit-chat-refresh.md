# Issue: Streamlit Chat Response Lost During Background Refresh

Status: implemented and included in `main`

Logged: 2026-08-29

## Reported behavior

An EMBER chat response can sometimes disappear while it is streaming or shortly after it appears. The behavior resembles an unrelated Streamlit background refresh replacing the active chat render.

## Reproduction and root cause

Streamlit schedules a full-app rerun every 60 seconds to refresh weather, gauge, and source state. Ollama chat requests may stream for up to 90 seconds. Previously, the user message was stored immediately, but the assistant response existed only in a local `full` variable until the stream completed. A timer-driven rerun during that window could discard the in-progress assistant text before it was appended to `st.session_state.messages`.

The race is timing-dependent: short responses usually complete before the next refresh, while longer responses can cross the 60-second boundary.

## Resolution

- Persist an assistant placeholder before starting the Ollama request.
- Update the session-state assistant message after every streamed token.
- Pause the global full-app auto-refresh while a chat response is pending.
- Restore background refresh after the final response is durably stored.
- Route typed prompts through a submit callback so the pending flag is set before the next full script run begins.
- Preserve a partial response if another unexpected rerun interrupts streaming.

## React/Vercel comparison

The React implementation does not have the same race. It writes the assistant response into React message state on every streamed token, and its source/feed refreshes do not trigger a full-page application rerun. A browser reload or new deployment can still clear the in-memory conversation because chat history is not persisted across page sessions, but that is a separate future persistence concern.

## Regression coverage

`tests/test_chat_state.py` verifies that partial text is stored before completion, final text replaces the streaming placeholder, and background refresh is allowed only when no chat response is pending.


## Local Ollama / Docker follow-up — November 9, 2026

Real `qwen3:8b` testing exposed repeated blank responses replaced by
“Chat response interrupted before completion. Please retry.” The Docker service
was healthy, local model discovery succeeded, and no provider exception appeared
in its logs. That exact warning is emitted by placeholder recovery when a
Streamlit rerun finds an unfinished synchronous chat turn. Pausing the refresh
timer and map events reduced reruns but did not make inference independent of
the script lifecycle; queued component events and other widgets can still rerun
the app during long local thinking/generation.

The model stream now runs in one session-owned `ChatJob` worker. The worker
never calls Streamlit or writes Session State. A short-lived chat fragment
copies thread-safe snapshots into the existing partial-response persistence
helpers every 0.5 seconds. Full-page reruns reconnect to the same job, rather
than closing or replaying its provider request. Provider metadata and normalized
errors are preserved. Thinking progress is visible while answer text is pending.
On completion, the fragment triggers an app rerun to restore normal controls and
feed refresh. Abandoned placeholders without a live job still use recovery.

The prepared prompt remains identical. No cloud fallback rules, provider
configuration, map behavior, document ingestion, or React behavior change.
Jobs survive page reruns within a session, but not a process/container restart
or an entirely new browser session. Requests retain provider idle timeouts; an
active job may finish after a browser disconnects. Clear Chat remains disabled
while a turn is active.

Regression coverage: repeated reruns produce one provider request, partial text
and metadata survive, thinking is reported, provider errors and early EOF retain
partial answers, worker errors are sanitized, sessions are isolated, and the
actual production chat fragment survives full-page widget reruns in AppTest.
Local validation and real-model Docker acceptance are recorded in the local-first
implementation guide.


Verified locally: 99 JS / 97 Python tests pass with no skips, including seven
new worker/fragment regressions. The rebuilt local-only Docker service returned
a real native-Qwen answer after a deliberately triggered provider-status page
rerun; final text remained in the transcript. Ollama logged one successful
70-second chat request. No cloud inference or hosted deployment was used.
