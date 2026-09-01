import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
MODULE_PATH = ROOT / "streamlit" / "chat_state.py"
SPEC = importlib.util.spec_from_file_location("chat_state", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class ChatStateTests(unittest.TestCase):
    def test_partial_response_is_persisted_before_stream_finishes(self):
        messages = []
        assistant_index = MODULE.begin_chat_response(messages, "What is happening?")
        MODULE.update_chat_response(messages, assistant_index, "Partial answer")

        self.assertEqual(messages[0], {"role": "user", "content": "What is happening?"})
        self.assertEqual(messages[1]["content"], "Partial answer▋")
        self.assertTrue(messages[1]["streaming"])

    def test_finished_response_replaces_streaming_placeholder(self):
        messages = []
        assistant_index = MODULE.begin_chat_response(messages, "Status?")
        MODULE.update_chat_response(messages, assistant_index, "Working")
        MODULE.finish_chat_response(messages, assistant_index, "Complete")

        self.assertEqual(messages[1], {"role": "assistant", "content": "Complete"})

    def test_background_refresh_pauses_only_while_response_is_pending(self):
        self.assertFalse(MODULE.background_refresh_allowed(True))
        self.assertTrue(MODULE.background_refresh_allowed(False))

    def test_interrupted_streaming_placeholder_is_recovered(self):
        messages = [
            {"role": "user", "content": "Status?"},
            {"role": "assistant", "content": "Partial answer▋", "streaming": True},
            {"role": "assistant", "content": "Complete"},
        ]

        self.assertEqual(MODULE.recover_interrupted_responses(messages), 1)
        self.assertEqual(
            messages[1],
            {
                "role": "assistant",
                "content": "Partial answer\n\n⚠ Chat response interrupted before completion. Please retry.",
            },
        )


if __name__ == "__main__":
    unittest.main()
