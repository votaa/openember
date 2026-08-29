"""Session-safe helpers for preserving streamed EMBER chat responses."""


def background_refresh_allowed(chat_response_pending: bool) -> bool:
    """Pause full-app timer reruns while a chat response is streaming."""
    return not bool(chat_response_pending)


def begin_chat_response(messages: list[dict], prompt: str) -> int:
    """Persist the user turn and an assistant placeholder before streaming."""
    messages.append({"role": "user", "content": prompt})
    messages.append({"role": "assistant", "content": "▋", "streaming": True})
    return len(messages) - 1


def update_chat_response(messages: list[dict], assistant_index: int, content: str) -> None:
    """Persist partial output so an unexpected rerun cannot erase it."""
    messages[assistant_index] = {
        "role": "assistant",
        "content": f"{content}▋",
        "streaming": True,
    }


def finish_chat_response(messages: list[dict], assistant_index: int, content: str) -> None:
    """Replace the streaming placeholder with the durable final response."""
    messages[assistant_index] = {"role": "assistant", "content": content}
