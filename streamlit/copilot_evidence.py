"""Pure snapshot adapters; URLs remain attribution, never server fetch authority."""
import copy
import re
from copilot_contract import validate_contract

_REPORT_KEYS = ("all_reported_hazards", "direct_electric", "electric_tree_or_wire", "road_blockage")


def _valid_count(value):
    return type(value) is int and 0 <= value <= 9007199254740991


def adapt_evidence(kind, raw, metadata):
    fetched = raw.get("fetched_at", raw.get("fetchedAt"))
    dated = bool(fetched and re.fullmatch(r"\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)", fetched))
    filter_name = raw.get("filter", metadata.get("filter"))
    if kind == "map_layer" and not isinstance(filter_name, str):
        evaluated = raw.get("filter") if isinstance(raw.get("filter"), dict) else {}
        filter_name = next((value for value in (raw.get("filterMode"), raw.get("filter_mode"),
                           evaluated.get("requestedMode"), metadata.get("filter")) if value is not None), None)
    block = dict(id=metadata["id"], kind=kind, source=copy.deepcopy(metadata["source"]), fetched_at=fetched,
                 valid_interval=copy.deepcopy(metadata.get("valid_interval")), geography=metadata.get("geography"),
                 scope=dict(filter=filter_name, where=raw.get("where", metadata.get("where")),
                            description=raw.get("scope", metadata.get("description")), layer_id=metadata.get("layer_id")),
                 state=dict(availability=metadata.get("availability", "available"), freshness=metadata.get("freshness", "unknown") if dated else "unknown",
                            completeness="unknown", omission_reason=metadata.get("omission_reason")),
                 values={}, limitations=list(metadata.get("limitations", [])))
    if fetched and not dated:
        block["limitations"].append("Fetch time has no date or UTC offset; refresh before treating it as current.")
    if raw.get("success") is False or raw.get("ok") is False or raw.get("state") == "unavailable" or raw.get("data_state") == "unavailable":
        block["state"]["availability"] = "unavailable"
    if raw.get("data_state") == "stale":
        block["state"]["freshness"] = "stale"
    if raw.get("visible") is False or raw.get("state") == "hidden":
        block["state"]["availability"] = "hidden"
    if raw.get("error"):
        block["limitations"].append(str(raw["error"]))
    if kind == "forecast":
        data = raw.get("data", raw)
        block["values"] = dict(periods=copy.deepcopy(data.get("properties", {}).get("periods", [])), raw=copy.deepcopy(data))
        block["state"]["completeness"] = "complete" if block["values"]["periods"] else "unknown"
    elif kind == "map_layer":
        complete = raw.get("state") == "complete" and _valid_count(raw.get("complete_count")) and block["state"]["availability"] == "available"
        block["state"]["completeness"] = "complete" if complete else "partial"
        block["values"] = dict(complete_count=raw["complete_count"] if complete else None, samples=copy.deepcopy(raw.get("samples", [])),
                               summary=copy.deepcopy(raw.get("summary", {})), displayed_subset=raw.get("displayed_subset"), unit=raw.get("unit"))
    elif kind == "reports_311":
        rows = copy.deepcopy(raw.get("aggregate_counts", []))
        complete = raw.get("aggregate_state") == "current" and all(sum(row.get("key") == key and _valid_count(row.get("total")) for row in rows) == 1 for key in _REPORT_KEYS)
        block["state"]["completeness"] = "complete" if complete else "partial"
        block["values"] = dict(aggregate_counts=rows, report_window=copy.deepcopy(raw.get("report_window")), records=copy.deepcopy(raw.get("records", [])))
        block["limitations"].append("Reported NYC 311 complaints, not utility-confirmed outages.")
    elif kind == "kb":
        block["values"] = dict(module_id=raw["module_id"], content=raw.get("content", raw.get("data", "")))
        block["state"]["completeness"] = "complete"
    elif kind == "document":
        text = raw.get("content") or ""
        block["values"] = dict(filename=raw["name"], passages=[dict(id=f"{metadata['id']}:0", text=text, start=0, end=len(text))])
        block["state"]["completeness"] = "partial" if raw.get("extraction_partial") else "complete"
        if raw.get("extraction_partial"):
            block["limitations"].append("Upload extraction is partial.")
    elif kind == "catalog":
        block["values"] = dict(content=raw.get("content") or "")
        block["limitations"].append("Catalog metadata, not loaded feature records.")
    else:
        block["values"] = copy.deepcopy(raw)
    return validate_contract("evidence", block)
