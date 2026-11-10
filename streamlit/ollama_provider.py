"""Ollama routing independent of Streamlit, with injected HTTP for offline tests."""
import json
import os
import requests


class ProviderError(Exception):
    def __init__(self, code, message, provider=None):
        super().__init__(message)
        self.code, self.provider = code, provider

    def as_dict(self):
        return {"code": self.code, "message": str(self), "provider": self.provider}


def configuration(setting=None):
    setting = setting or (lambda key, default="": os.environ.get(key, default))
    mode = setting("OLLAMA_MODE", "local-first")
    if mode not in ("local-first", "local-only", "cloud-only"):
        raise ProviderError("invalid_config", "OLLAMA_MODE must be local-first, local-only or cloud-only.")
    def seconds(key, default):
        try:
            value = float(setting(key, str(default))) / 1000
            if not 0 < value < float("inf"):
                raise ValueError()
            return value
        except ValueError:
            raise ProviderError("invalid_config", "Invalid " + key)
    local_think = setting("OLLAMA_LOCAL_THINK", "default")
    if local_think not in ("default", "true", "false"):
        raise ProviderError("invalid_config", "OLLAMA_LOCAL_THINK must be default, true or false.")
    from urllib.parse import urlsplit
    host = setting("OLLAMA_LOCAL_HOST", "http://127.0.0.1:11434").rstrip("/")
    url = urlsplit("http://127.0.0.1:11434" if mode == "cloud-only" else host)
    if url.scheme not in ("http", "https") or not url.netloc or url.username or url.password or url.query or url.fragment:
        raise ProviderError("invalid_config", "Invalid OLLAMA_LOCAL_HOST.")
    return {"mode": mode, "local_host": host, "local_think": local_think,
            "local_model": setting("OLLAMA_LOCAL_MODEL", "qwen3:8b"),
            "cloud_model": setting("OLLAMA_CLOUD_MODEL", setting("OLLAMA_MODEL", "gpt-oss:120b-cloud")),
            "api_key": setting("OLLAMA_API_KEY"),
            "probe_timeout": seconds("OLLAMA_PROBE_TIMEOUT_MS", 3000),
            "stream_timeout": seconds("OLLAMA_STREAM_TIMEOUT_MS", 90000)}


def normalize(exc, provider):
    if isinstance(exc, ProviderError):
        exc.provider = exc.provider or provider
        return exc
    return ProviderError("timeout" if isinstance(exc, requests.exceptions.Timeout) else "unreachable",
                         provider + " Ollama connection failed or timed out.", provider)


def check_http(response, provider):
    status = response.status_code
    if 200 <= status < 300:
        return
    code = "authentication" if status in (401, 403) else "model_missing" if status == 404 else "rate_limit" if status == 429 else "upstream_error"
    raise ProviderError(code, f"{provider} Ollama request failed (HTTP {status}).", provider)


def probe_local(cfg, http=requests):
    model = cfg["local_model"]
    if "-cloud" in model.lower() or ":cloud" in model.lower():
        raise ProviderError("model_not_local", "Local model must be an installed, non-cloud model.", "local")
    with http.get(cfg["local_host"] + "/api/tags", timeout=cfg["probe_timeout"], allow_redirects=False) as response:
        check_http(response, "local")
        models = response.json().get("models", [])
    match = next((m for m in models if (m.get("name") or m.get("model")) in (model, model + ":latest")), None)
    if not match:
        raise ProviderError("model_missing", "Install the local model with: ollama pull " + model, "local")
    if match.get("remote_host") or match.get("remote_model") or match.get("details", {}).get("remote_host"):
        raise ProviderError("model_not_local", "Configured local model is cloud-backed.", "local")
    return {"provider": "local", "model": model}


def provider_status(cfg, http=requests):
    local = None
    if cfg["mode"] != "cloud-only":
        try:
            local = {"available": True, **probe_local(cfg, http)}
        except Exception as exc:
            local = {"available": False, "error": normalize(exc, "local").as_dict()}
    provider = "local" if local and local["available"] else "cloud" if cfg["mode"] != "local-only" and cfg["api_key"] else None
    return {"mode": cfg["mode"], "provider": provider, "available": bool(provider),
            "model": cfg["local_model"] if provider == "local" else cfg["cloud_model"] if provider else None,
            "local": local, "cloud": {"configured": bool(cfg["api_key"]), "verified": False},
            "message": "Local model installed" if provider == "local" else "Cloud configured; connectivity checked on send" if provider else
            "No provider available. Start Ollama and install the configured model, or configure OLLAMA_API_KEY when cloud routing is allowed."}


def provider_label(status):
    if not status.get("provider"):
        return status.get("message", "No provider available")
    return f"{status['provider'].title()} · {status['model']} · {status['mode']}" + (" · fallback" if status.get("fallback") else "")


def stream_chat(messages, cfg, http=requests):
    """Yield provider metadata, native Ollama frames, or normalized error frames.

    First valid upstream frame commits the provider, even without answer text.
    Generator close (including Streamlit reruns) closes the HTTP response.
    """
    providers = ["local", "cloud"] if cfg["mode"] == "local-first" else ["local" if cfg["mode"] == "local-only" else "cloud"]
    attempts = []
    for provider in providers:
        started = False
        model = cfg["local_model"] if provider == "local" else cfg["cloud_model"]
        try:
            if provider == "local":
                probe_local(cfg, http)
            elif not cfg["api_key"]:
                raise ProviderError("missing_key", "Cloud requires server-side OLLAMA_API_KEY.", "cloud")
            headers = {"Content-Type": "application/json"}
            if provider == "cloud":
                headers["Authorization"] = "Bearer " + cfg["api_key"]
            host = cfg["local_host"] if provider == "local" else "https://ollama.com"
            payload = {"model": model, "messages": messages, "stream": True}
            if provider == "local" and cfg.get("local_think", "default") != "default":
                payload["think"] = cfg["local_think"] == "true"
            with http.post(host + "/api/chat", json=payload,
                           headers=headers, stream=True, timeout=(cfg["probe_timeout"], cfg["stream_timeout"]),
                           allow_redirects=False) as response:
                check_http(response, provider)
                for line in response.iter_lines(chunk_size=1):
                    if not line:
                        continue
                    try:
                        frame = json.loads(line)
                        if not isinstance(frame, dict):
                            raise ValueError()
                    except (ValueError, TypeError):
                        raise ProviderError("invalid_stream", "Ollama returned malformed NDJSON.", provider)
                    if frame.get("error"):
                        raise ProviderError("upstream_error", "Ollama reported a streaming error.", provider)
                    if not frame.get("message") and frame.get("done") is not True:
                        raise ProviderError("invalid_stream", "Ollama returned an invalid frame.", provider)
                    if not started:
                        started = True
                        yield {"provider": {"mode": cfg["mode"], "provider": provider, "model": model,
                                            "fallback": bool(attempts), "attempts": list(attempts)}}
                    yield frame
                    if frame.get("done"):
                        return
                raise ProviderError("interrupted", "Ollama stream ended before completion.", provider)
        except Exception as exc:
            error = normalize(exc, provider).as_dict()
            attempts.append(error)
            if started:
                yield {"error": {**error, "partial": True}, "done": True}
                return
    yield {"error": {"code": "no_provider", "message": "No provider available. Check local Ollama/model or server-side cloud credentials.",
                     "attempts": attempts}, "done": True}
