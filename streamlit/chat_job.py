"""One inference worker per chat turn, independent of Streamlit script reruns.

Workers never call Streamlit or mutate session state. UI code copies locked
snapshots into its own session state, so reruns cannot cancel or replay a turn.
"""
from copy import deepcopy
from threading import Lock, Thread

from chat_state import finish_chat_response, update_chat_response
from ollama_provider import stream_chat


class ChatJob:
    def __init__(self, messages, config, assistant_index, stream_factory=stream_chat):
        self.assistant_index = assistant_index
        self._messages = deepcopy(messages)
        self._config = dict(config)
        self._stream_factory = stream_factory
        self._lock = Lock()
        self._thread = None
        self._state = {"content": "", "provider": None, "error": None,
                       "done": False, "phase": "Connecting to Ollama…"}

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
        complete = False
        iterator = None
        try:
            iterator = self._stream_factory(self._messages, self._config)
            for frame in iterator:
                with self._lock:
                    if frame.get("provider"):
                        self._state["provider"] = deepcopy(frame["provider"])
                        self._state["phase"] = "Waiting for the answer…"
                    if frame.get("error"):
                        self._state["error"] = deepcopy(frame["error"])
                        self._state["content"] += "\n\n⚠ " + frame["error"]["message"]
                    message = frame.get("message", {})
                    if message.get("thinking"):
                        self._state["phase"] = "Thinking…"
                    if message.get("content"):
                        self._state["content"] += message["content"]
                        self._state["phase"] = "Answering…"
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
    if snapshot["done"]:
        finish_chat_response(state["messages"], index, snapshot["content"])
    else:
        update_chat_response(state["messages"], index, snapshot["content"])
    if snapshot["provider"]:
        state["messages"][index]["provider"] = snapshot["provider"]
        state["ollama_provider"] = snapshot["provider"]
    if snapshot["error"]:
        state["ollama_error"] = snapshot["error"]
    state["chat_response_pending"] = not snapshot["done"]
    if snapshot["done"]:
        del state["chat_job"]
    return snapshot["done"]
