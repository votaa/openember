import ast
import sys
import unittest
from pathlib import Path
from threading import Event

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "streamlit"))
from chat_job import ChatJob, sync_chat_job, timing_label
from chat_state import begin_chat_response, recover_interrupted_responses

PROVIDER = {"mode": "local-only", "provider": "local", "model": "qwen3:8b", "fallback": False}


class ChatJobTests(unittest.TestCase):
    def state(self, factory):
        state = {"messages": [], "pending_query": "Question", "chat_response_pending": True}
        index = begin_chat_response(state["messages"], "Question")
        state["chat_job"] = ChatJob([{"role": "user", "content": "Question"}], {}, index, factory)
        return state

    def test_timing_boundaries_and_metrics_survive_completion(self):
        from unittest.mock import patch
        def frames(*_):
            yield {"message": {"thinking": "hidden"}}
            yield {"message": {"content": "Answer"}}
            yield {"done": True, "prompt_eval_duration": 500000000, "eval_count": 3}
        state = self.state(frames)
        job = state["chat_job"]
        with patch("chat_job.monotonic", side_effect=[10, 12, 15, 19]):
            job._run()
        timing = job.snapshot()["timing"]
        self.assertEqual(timing["first_output_ms"], 2000)
        self.assertEqual(timing["thinking_ms"], 3000)
        self.assertEqual(timing["answer_ms"], 4000)
        self.assertEqual(timing["request_ms"], 9000)
        self.assertEqual(timing["prompt_eval_duration"], 500000000)
        self.assertNotIn("hidden", str(job.snapshot()))

    def test_repeated_reruns_preserve_partial_without_replaying_request(self):
        release, partial = Event(), Event()
        calls = []
        def frames(messages, cfg):
            calls.append(messages)
            yield {"provider": PROVIDER}
            yield {"message": {"content": "Partial "}}
            partial.set()
            release.wait(3)
            yield {"message": {"content": "answer"}, "done": True}
        state = self.state(frames); job = state["chat_job"]
        try:
            sync_chat_job(state)
            self.assertTrue(partial.wait(1))
            for _ in range(20):
                self.assertFalse(sync_chat_job(state))
                self.assertEqual(state["messages"][1]["content"], "Partial ▋")
                self.assertTrue(state["chat_response_pending"])
                self.assertNotIn("pending_query", state)
            release.set(); job.wait(1)
            self.assertTrue(sync_chat_job(state))
            self.assertEqual(state["messages"][1]["content"], "Partial answer")
            self.assertEqual(state["messages"][1]["provider"], PROVIDER)
            self.assertFalse(state["chat_response_pending"])
            self.assertEqual(len(calls), 1)
            self.assertNotIn("chat_job", state)
            self.assertEqual(recover_interrupted_responses(state["messages"]), 0)
        finally:
            release.set(); job.wait(1)

    def test_thinking_is_reported_while_answer_is_pending(self):
        release, thinking = Event(), Event()
        def frames(*_):
            yield {"message": {"thinking": "hidden"}}
            thinking.set(); release.wait(3)
            yield {"message": {"content": "Answer"}, "done": True}
        state = self.state(frames); job = state["chat_job"]
        try:
            sync_chat_job(state); self.assertTrue(thinking.wait(1))
            self.assertEqual(job.snapshot()["phase"], "Thinking…")
            self.assertEqual(job.snapshot()["content"], "")
        finally:
            release.set(); job.wait(1)

    def test_provider_error_keeps_partial_without_retry(self):
        calls = []
        def frames(*_):
            calls.append(1)
            yield {"provider": PROVIDER}
            yield {"message": {"content": "Partial"}}
            yield {"error": {"code": "timeout", "message": "Timed out", "partial": True}, "done": True}
        state = self.state(frames); job = state["chat_job"]
        sync_chat_job(state); job.wait(1); sync_chat_job(state)
        self.assertIn("Partial", state["messages"][1]["content"])
        self.assertIn("Timed out", state["messages"][1]["content"])
        self.assertEqual(state["ollama_error"]["code"], "timeout")
        self.assertEqual(len(calls), 1)

    def test_worker_failure_is_sanitized_and_generator_closed(self):
        closed = []
        def frames(*_):
            try:
                yield {"message": {"content": "Partial"}}
                raise RuntimeError("private credential URL")
            finally:
                closed.append(True)
        state = self.state(frames); job = state["chat_job"]
        sync_chat_job(state); job.wait(1); sync_chat_job(state)
        self.assertEqual(closed, [True])
        self.assertNotIn("private", state["messages"][1]["content"])
        self.assertEqual(state["ollama_error"]["code"], "worker_error")

    def test_eof_without_done_is_not_reported_as_success(self):
        state = self.state(lambda *_: iter([{"message": {"content": "Partial"}}]))
        job = state["chat_job"]
        sync_chat_job(state); job.wait(1); sync_chat_job(state)
        self.assertEqual(state["ollama_error"]["code"], "interrupted")

    def test_snapshots_are_independent_and_sessions_do_not_share_workers(self):
        def frames(*_):
            yield {"provider": PROVIDER}
            yield {"message": {"content": "Answer"}, "done": True}
        first, second = self.state(frames), self.state(frames)
        first_job, second_job = first["chat_job"], second["chat_job"]
        self.assertIsNot(first_job, second_job)
        first_job.start(); first_job.wait(1)
        snapshot = first_job.snapshot(); snapshot["provider"]["model"] = "changed"
        self.assertEqual(first_job.snapshot()["provider"]["model"], "qwen3:8b")
        self.assertFalse(second_job.snapshot()["done"])
        self.assertEqual(second_job.snapshot()["content"], "")

    def test_real_streamlit_fragment_survives_full_page_widget_rerun(self):
        try:
            from streamlit.testing.v1 import AppTest
        except ImportError:
            self.skipTest("Requires Streamlit AppTest runtime")
        tree = ast.parse((ROOT / "streamlit/app.py").read_text())
        render = next(node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef) and node.name == "render_chat_messages")
        script = f'''import sys
sys.path.insert(0, {str(ROOT / 'streamlit')!r})
import streamlit as st
from threading import Event
from chat_job import ChatJob, sync_chat_job, timing_label
from chat_state import begin_chat_response
from ollama_provider import provider_label
if 'messages' not in st.session_state:
 st.session_state.messages=[]
 st.session_state.release=Event()
 st.session_state.partial=Event()
 st.session_state.calls=[]
 release, partial, calls=st.session_state.release, st.session_state.partial, st.session_state.calls
 def frames(*_):
  calls.append(1)
  yield {{'message':{{'content':'Partial '}}}}
  partial.set()
  release.wait(5)
  yield {{'message':{{'content':'answer'}}, 'done':True}}
 index=begin_chat_response(st.session_state.messages,'Question')
 st.session_state.chat_job=ChatJob([],{{}},index,frames)
 st.session_state.chat_response_pending=True
 st.session_state.chat_job.start()
st.button('Rerun page')
{ast.unparse(render)}
render_chat_messages()
'''
        app = AppTest.from_string(script).run()
        job = app.session_state.chat_job
        try:
            self.assertTrue(app.session_state.partial.wait(1))
            app.button[0].click().run()
            self.assertFalse(app.exception)
            self.assertEqual(app.session_state.messages[1]["content"], "Partial ▋")
            app.button[0].click().run()
            self.assertEqual(app.session_state.calls, [1])
            app.session_state.release.set(); job.wait(1); app.run()
            self.assertFalse(app.exception)
            self.assertEqual(app.session_state.messages[1]["content"], "Partial answer")
            self.assertFalse(app.session_state.chat_response_pending)
        finally:
            app.session_state.release.set(); job.wait(1)


if __name__ == "__main__": unittest.main()
