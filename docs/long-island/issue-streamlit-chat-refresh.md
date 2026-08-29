# Issue: Streamlit Chat Response Lost During Background Refresh

Status: fixed locally; verification pending commit

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
