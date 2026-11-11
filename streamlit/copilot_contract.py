"""Phase 1 contracts only; no provider, HTTP or Streamlit imports."""
import json
import math
from pathlib import Path

_SHARED = Path(__file__).resolve().parents[1] / "shared" / "copilot"
CONTRACT = json.loads((_SHARED / "contract.schema.json").read_text())
POLICY = json.loads((_SHARED / "policy.json").read_text())


def _check(value, schema, path):
    if "$ref" in schema:
        return _check(value, CONTRACT["$defs"][schema["$ref"].split("/")[-1]], path)
    def fail(message):
        raise ValueError(f"{path}: {message}")
    if "oneOf" in schema:
        matches = 0
        for branch in schema["oneOf"]:
            try:
                _check(value, branch, path)
                matches += 1
            except ValueError:
                pass
        if matches != 1:
            fail("expected exactly one payload shape")
    if "const" in schema and value != schema["const"]:
        fail("invalid constant")
    if "enum" in schema and value not in schema["enum"]:
        fail("invalid enum")
    types = dict(null=value is None, array=isinstance(value, list), object=isinstance(value, dict),
                 string=isinstance(value, str), integer=type(value) is int and abs(value) <= 9007199254740991,
                 number=type(value) in (int, float) and math.isfinite(value), boolean=type(value) is bool)
    requested = schema.get("type", [])
    if requested and not any(types[t] for t in ([requested] if isinstance(requested, str) else requested)):
        fail("invalid type")
    if types["string"] and any(0xD800 <= ord(char) <= 0xDFFF for char in value):
        fail("unpaired Unicode surrogate")
    if types["string"] and not schema.get("minLength", 0) <= len(value) <= schema.get("maxLength", math.inf):
        fail("invalid string length")
    if types["number"] and not schema.get("minimum", -math.inf) <= value <= schema.get("maximum", math.inf):
        fail("outside numeric bounds")
    if types["array"]:
        if len(value) > schema.get("maxItems", math.inf):
            fail("too many items")
        if "items" in schema:
            for i, item in enumerate(value):
                _check(item, schema["items"], f"{path}[{i}]")
    if types["object"]:
        for key in schema.get("required", []):
            if key not in value:
                fail(f"missing {key}")
        for key, item in value.items():
            child = schema.get("properties", {}).get(key)
            additional = schema.get("additionalProperties", True)
            if child is not None:
                _check(item, child, f"{path}.{key}")
            elif additional is False:
                fail(f"unknown field {key}")
            elif isinstance(additional, dict):
                _check(item, additional, f"{path}.{key}")


def validate_contract(kind, value):
    if kind not in CONTRACT["$defs"]:
        raise ValueError("unknown contract")
    _check(value, CONTRACT["$defs"][kind], kind)
    if kind == "request":
        if not value["question"].strip():
            raise ValueError("empty question")
        if len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()) > POLICY["limits"]["request_bytes"]:
            raise ValueError("request too large")
        ids = [block["id"] for block in value["evidence"]]
        if len(set(ids)) != len(ids):
            raise ValueError("duplicate evidence ID")
    if kind == "result" and value["execution_mode"] == "local_query" and (value["provider"] is not None or value["model"] is not None):
        raise ValueError("local queries cannot claim a provider")
    if kind == "result" and value["execution_mode"] == "llm_grounded" and (not value["provider"] or not value["model"]):
        raise ValueError("grounded responses require the committed provider and model")
    if kind == "result" and value["execution_mode"] == "rule_based_fallback" and (value["provider"] is not None or value["model"] is not None):
        raise ValueError("fallback cannot claim a successful provider")
    return value


def execution_mode(env=None):
    mode = (env or {}).get(POLICY["switch"]["environment"], POLICY["switch"]["default"])
    if mode not in POLICY["switch"]["values"]:
        raise ValueError("invalid Copilot execution mode")
    return mode


def capabilities(mode="legacy"):
    if mode not in POLICY["switch"]["values"]:
        raise ValueError("invalid Copilot execution mode")
    return dict(execution_mode=mode, request_versions=["1.0"] if mode == "hybrid" else [], legacy_messages=True)


def input_estimate(messages, allocated_context):
    if type(allocated_context) is not int or not 4096 <= allocated_context <= 131072:
        raise ValueError("explicit local context allocation required")
    p = POLICY["token_accounting"]
    content_bytes = sum(len(m["content"].encode()) for m in messages)
    estimated = math.ceil(content_bytes / p["bytes_per_estimated_token"]) + len(messages) * p["per_message_reserve"] + p["template_reserve"]
    return dict(method=p["method"], exact=False, content_bytes=content_bytes, estimated_input_tokens=estimated,
                generation_reserve=p["generation_reserve"], safety_reserve=p["safety_reserve"], allocated_context=allocated_context,
                fits_estimate=estimated + p["generation_reserve"] + p["safety_reserve"] <= allocated_context,
                requires_native_retention_check=True)
