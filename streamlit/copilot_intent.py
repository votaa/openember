"""Conservative whole-request planning; no inference, discovery or fetching."""
import re
from copilot_contract import POLICY, validate_contract


def _clean(text):
    return re.sub(r"[?.!]+$", "", text.lower().strip()).strip()


def _base_scope(request):
    return dict(geography=request["selection"]["geography"] if request["selection"]["geography"] is not None else request["jurisdiction"]["name"],
                timezone=request["jurisdiction"]["timezone"], period=None, interval=None, layer_ids=[],
                feature_ids=list(request["selection"]["feature_ids"]), source_ids=[], fields=[])


def _operation(question, request):
    text, scope = _clean(question), _base_scope(request)
    def synthesis():
        return dict(intent="synthesis", question=question, scope=_base_scope(request), status="synthesis", reason="unmatched_or_analytical")
    if re.search(POLICY["guards"], text, re.I | re.ASCII):
        return synthesis()
    for rule in POLICY["rules"]:
        for pattern, capture in zip(rule["patterns"], rule["captures"]):
            match = re.fullmatch(pattern, text, re.I | re.ASCII)
            if not match:
                continue
            name = match[capture.get("place", capture.get("layer"))] if capture.get("place", capture.get("layer")) else ""
            if re.search(r'\b(?:and|but|then|also|or)\b|[;"]', name or "", re.I | re.ASCII):
                return synthesis()
            op = dict(intent=rule["intent"], question=question, scope=scope, status="acquire", reason="required_evidence_missing")
            if capture.get("place") and match[capture["place"]]:
                scope["geography"] = match[capture["place"]]
            if capture.get("period"):
                scope["period"] = match[capture["period"]]
            scope["fields"] = [match[index] for index in capture["fields"] if match[index]] if "fields" in capture else ["complete_count" if rule["intent"] == "map_count" else "aggregate_counts"]
            kind = dict(forecast_facts="forecast", map_count="map_layer", reports_311="reports_311")[rule["intent"]]
            candidates = [b for b in request["evidence"] if b["kind"] == kind]
            if request["selection"]["source_ids"]:
                candidates = [b for b in candidates if b["source"]["id"] in request["selection"]["source_ids"]]
            if rule["intent"] == "map_count":
                target = re.sub(r"^the ", "", _clean(match[capture["layer"]]))
                if target in ("this layer", "loaded layer", "selected layer"):
                    candidates = [b for b in candidates if b["scope"]["layer_id"] in request["selection"]["layer_ids"]]
                elif target in ("each loaded layer", "each visible layer"):
                    candidates = [b for b in candidates if b["state"]["availability"] != "hidden"]
                else:
                    candidates = [b for b in candidates if any(name and _clean(name) == target for name in (b["source"]["name"], b["scope"]["layer_id"]))]
                    if not candidates and not re.search(r"\blayer\b", target, re.ASCII):
                        return synthesis()
                if not candidates or (len(candidates) > 1 and not target.startswith("each ")):
                    return {**op, "status": "clarify", "reason": "layer_selection_ambiguous_or_missing"}
                scope["layer_ids"] = [b["scope"]["layer_id"] for b in candidates]
            else:
                candidates = [b for b in candidates if b["geography"] and _clean(b["geography"]) == _clean(scope["geography"])]
                if len(candidates) > 1:
                    return {**op, "status": "clarify", "reason": "source_selection_ambiguous"}
            scope["source_ids"] = [b["source"]["id"] for b in candidates]
            if not candidates:
                return op
            if any(b["state"]["availability"] == "omitted" and b["state"]["omission_reason"] == "budget" for b in candidates):
                return {**op, "reason": "evidence_omitted_by_budget"}
            if any(b["state"]["availability"] in ("hidden", "omitted") for b in candidates):
                return {**op, "status": "unsupported", "reason": "evidence_not_visible"}
            if any(b["state"]["availability"] == "unavailable" or b["state"]["freshness"] != "current" for b in candidates):
                return {**op, "reason": "refresh_required"}
            if any(b["state"]["completeness"] != "complete" for b in candidates):
                return {**op, "status": "unsupported", "reason": "population_incomplete"}
            if rule["intent"] == "forecast_facts":
                periods = candidates[0]["values"]["periods"]
                selected = periods[:1] if scope["period"] == "first period" else [p for p in periods if _clean(p.get("name", "")) == scope["period"]]
                if len(selected) != 1:
                    return {**op, "status": "clarify", "reason": "forecast_period_ambiguous_or_uncovered"}
                period = selected[0]
                scope["interval"] = dict(start=period["startTime"], end=period["endTime"], timezone=scope["timezone"]) if period.get("startTime") and period.get("endTime") else None
                if not scope["interval"] or ("low" in scope["fields"] and period.get("isDaytime") is not False) or ("high" in scope["fields"] and period.get("isDaytime") is not True):
                    return {**op, "status": "unsupported", "reason": "requested_forecast_fields_unavailable"}
                def missing(field):
                    if field in ("low", "high", "temperature"):
                        return type(period.get("temperature")) not in (int, float) or not period.get("temperatureUnit")
                    if field == "wind":
                        return not period.get("windSpeed") or not period.get("windDirection")
                    if field == "conditions":
                        return not (period.get("detailedForecast") or period.get("shortForecast"))
                    return (period.get("probabilityOfPrecipitation") or {}).get("value") is None
                if any(missing(field) for field in scope["fields"]):
                    return {**op, "status": "unsupported", "reason": "requested_forecast_fields_unavailable"}
            if rule["intent"] == "reports_311":
                scope["interval"] = candidates[0]["values"]["report_window"]
            return {**op, "status": "ready", "reason": None}
    return synthesis()


def plan_request(request):
    validate_contract("request", request)
    question = request["question"]
    follow = re.fullmatch(r"what about (tonight|today|tomorrow)\??", question.strip(), re.I | re.ASCII)
    if re.search(r'\b(?:not|never|instead|without)\b|["“”]', question, re.I | re.ASCII):
        operations = [dict(intent="synthesis", question=question, scope=_base_scope(request), status="synthesis", reason="unmatched_or_analytical")]
    elif follow:
        users = [m for m in request["history"] if m["role"] == "user"]
        previous = users[-1] if users else None
        prior = _operation(previous["content"], request) if previous else None
        if prior and prior["intent"] == "forecast_facts" and (not request["selection"]["geography"] or _clean(prior["scope"]["geography"]) == _clean(request["selection"]["geography"])):
            resolved = re.sub(r"\b(tonight|today|tomorrow|first period)\b", follow[1], previous["content"], count=1, flags=re.I | re.ASCII)
            operations = [{**_operation(resolved, request), "question": question}]
        else:
            operations = [dict(intent="synthesis", question=question, scope=_base_scope(request), status="clarify", reason="follow_up_scope_ambiguous")]
    else:
        operations = [_operation(part, request) for part in re.split(POLICY["compound_separator"], question, flags=re.I | re.ASCII)]
    outcome = "synthesis" if any(op["status"] == "synthesis" for op in operations) else "clarification" if any(op["status"] == "clarify" for op in operations) else "local"
    reason = dict(synthesis="entire_request_requires_synthesis", clarification="scope_requires_clarification", local="supported_operations_only")[outcome]
    if request["answer_method"] == "model":
        outcome, reason = "synthesis", "explicit_model_preference"
    return validate_contract("plan", dict(contract_version="1.0", question=question, outcome=outcome, reason=reason, operations=operations,
                                         enabled_kb_modules=list(request["jurisdiction"]["enabled_kb_modules"]), context_policy="provider_specific"))
