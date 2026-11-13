"""One inference worker per chat turn, independent of Streamlit script reruns.

Workers never call Streamlit or mutate session state. UI code copies locked
snapshots into its own session state, so reruns cannot cancel or replay a turn.
"""
from copy import deepcopy
from time import monotonic
from threading import Lock, Thread

from chat_state import finish_chat_response, update_chat_response
from ollama_provider import stream_chat


class ChatJob:
    def __init__(self, messages, config, assistant_index, stream_factory=stream_chat, evidence_ms=0):
        self.assistant_index = assistant_index
        self.request_mode = 'hybrid' if isinstance(messages,dict) else 'legacy'
        self._messages = deepcopy(messages)
        self._config = dict(config)
        self._stream_factory = stream_factory
        self._lock = Lock()
        self._thread = None
        self._state = {"content": "", "provider": None, "response": None, "error": None,
                       "timing": {"evidence_ms": evidence_ms},
                       "answer_received_at": None, "done": False, "phase": "Connecting / processing prompt…"}

    def start(self):
        """Idempotent across full-app and fragment reruns."""
        with self._lock:
            if self._thread is not None:
                return
            self._thread = Thread(target=self._run, name="openember-chat", daemon=True)
            self._thread.start()

    def snapshot(self):
        with self._lock:
            return deepcopy(self._state)

    def wait(self, timeout=None):
        """Bounded wait for tests; UI must use snapshots instead."""
        thread = self._thread
        if thread is not None:
            thread.join(timeout)

    def _run(self):
        started = monotonic()
        thinking_at = answer_at = None
        complete = False
        iterator = None
        try:
            iterator = self._stream_factory(self._messages, self._config)
            for frame in iterator:
                now = monotonic()
                with self._lock:
                    timing = self._state["timing"]
                    timing["request_ms"] = (now - started) * 1000
                    if frame.get('response'):
                        self._state['response'] = deepcopy(frame['response'])
                    if frame.get("provider"):
                        self._state["provider"] = deepcopy(frame["provider"])
                        self._state["phase"] = "Waiting for the answer…"
                    if frame.get("error"):
                        self._state["error"] = deepcopy(frame["error"])
                        self._state["content"] += "\n\n⚠ " + frame["error"]["message"]
                    message = frame.get("message", {})
                    if message.get("thinking"):
                        if thinking_at is None:
                            thinking_at = now
                        self._state["phase"] = "Thinking…"
                    if message.get("content"):
                        if answer_at is None:
                            answer_at = now
                            self._state["answer_received_at"] = now
                        self._state["content"] += message["content"]
                        self._state["phase"] = "Answering…"
                    timing.update({
                        "first_output_ms": ((thinking_at if thinking_at is not None else answer_at if answer_at is not None else now) - started) * 1000,
                        "thinking_ms": ((answer_at if answer_at is not None else now) - thinking_at) * 1000 if thinking_at is not None else 0,
                        "answer_ms": (now - answer_at) * 1000 if answer_at is not None else 0,
                    })
                    if (self._state.get('response') or {}).get('execution_mode')=='local_query':
                        timing.pop('thinking_ms',None)
                    for key in ("total_duration", "load_duration", "prompt_eval_duration", "eval_duration", "prompt_eval_count", "eval_count"):
                        value = frame.get(key)
                        if type(value) in (int, float) and value >= 0:
                            timing[key] = value
                    if frame.get("done"):
                        complete = True
                        break
            if not complete:
                self._fail("interrupted", "Ollama stream ended before completion. Please retry.")
        except Exception:
            self._fail("worker_error", "Chat response interrupted. Please retry.")
        finally:
            if iterator is not None and hasattr(iterator, "close"):
                try:
                    iterator.close()
                except Exception:
                    pass
            with self._lock:
                self._state["done"] = True
                self._state["phase"] = "Response interrupted" if self._state["error"] else "Complete"
                self._config.clear()  # Credentials are needed only for this request.
                self._messages.clear()

    def _fail(self, code, message):
        with self._lock:
            self._state["error"] = {"code": code, "message": message}
            self._state["content"] += "\n\n⚠ " + message


def sync_chat_job(state):
    """Called only by the UI thread. Returns True once a turn is finalized."""
    job = state.get("chat_job")
    if job is None:
        return False
    state.pop("pending_query", None)
    state.pop("chat_preparation_index", None)
    job.start()
    snapshot = job.snapshot()
    index = job.assistant_index
    # Message helpers replace the dictionary; retain the first handoff before that.
    previous = state["messages"][index].get("timing", {})
    if snapshot["done"]:
        finish_chat_response(state["messages"], index, snapshot["content"])
    else:
        update_chat_response(state["messages"], index, snapshot["content"])
    timing = snapshot["timing"]
    if "ui_delivery_ms" in previous:
        timing["ui_delivery_ms"] = previous["ui_delivery_ms"]
    elif snapshot["answer_received_at"] is not None:
        timing["ui_delivery_ms"] = max(0, (monotonic() - snapshot["answer_received_at"]) * 1000)
    state["messages"][index]["timing"] = timing
    state['messages'][index]['request_mode']=getattr(job,'request_mode','legacy')
    if snapshot.get('response'):
        state['messages'][index]['response'] = snapshot['response']
    if snapshot["provider"]:
        state["messages"][index]["provider"] = snapshot["provider"]
        state["ollama_provider"] = snapshot["provider"]
    if snapshot["error"]:
        state["ollama_error"] = snapshot["error"]
    state["chat_response_pending"] = not snapshot["done"]
    if snapshot["done"]:
        del state["chat_job"]
    return snapshot["done"]


def timing_label(timing):
    parts = [f"{label} {timing.get(key, 0) / 1000:.1f}s" for label, key in
             (("Evidence", "evidence_ms"), ("First output", "first_output_ms"),
              ("Thinking", "thinking_ms"), ("Answer", "answer_ms"))]
    if "ui_delivery_ms" in timing:
        parts.append(f"UI sync {timing['ui_delivery_ms'] / 1000:.1f}s")
    for label, key in (("Prompt", "prompt_eval_duration"), ("Load", "load_duration")):
        if key in timing:
            parts.append(f"{label} {timing[key] / 1e9:.1f}s")
    return " · ".join(parts)


def response_label(response):
    if response['execution_mode']=='local_query': return 'Local data query · '+response['answer_status']
    if response['execution_mode']=='llm_grounded': return f"Grounded AI · {'Local' if response['provider']=='local' else 'Cloud'} · {response['model']}"
    return 'Rule-based fallback'
