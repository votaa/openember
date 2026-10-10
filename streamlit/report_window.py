"""Seven-day Socrata window, matching the React reportWindow contract."""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo


def report_window(source, evaluated_at):
    if not source.get("rolling_window_days"):
        return None
    end = datetime.fromisoformat(evaluated_at.replace("Z", "+00:00")).astimezone(timezone.utc)
    start = end - timedelta(days=source["rolling_window_days"])
    zone = ZoneInfo(source["source_timestamp_timezone"])
    return {"start": start.astimezone(zone).isoformat(timespec="seconds")[:19],
            "end": end.astimezone(zone).isoformat(timespec="seconds")[:19],
            "timezone": source["source_timestamp_timezone"]}


def windowed_source(source, evaluated_at):
    window = report_window(source, evaluated_at)
    if not window:
        return source
    clause = f"created_date >= '{window['start']}' AND created_date <= '{window['end']}'"
    return {**source, "required_filter": f"({source['required_filter']}) AND {clause}",
            "aggregate_queries": [{**query, "required_filter": f"({query['required_filter']}) AND {clause}"}
                                  for query in source.get("aggregate_queries", [])]}


def restrict_report_window(source, result, evaluated_at):
    window = report_window(source, evaluated_at)
    if not window:
        return result
    def in_window(record):
        try:
            observed = datetime.fromisoformat(record["observed_at"].replace("Z", "+00:00")).replace(tzinfo=None)
            return datetime.fromisoformat(window["start"]) <= observed <= datetime.fromisoformat(window["end"])
        except (KeyError, TypeError, ValueError):
            return False
    records = [record for record in result.get("records", []) if in_window(record)]
    result = {**result, "records": records, "report_window": window}
    if result.get("data_state") == "stale":
        result.update(aggregate_counts=[{**item, "total": None} for item in result.get("aggregate_counts", [])],
                      aggregate_state="partial", aggregate_reason="refresh_failed")
    return result


def report_window_message(source, result):
    if not source.get("rolling_window_days"):
        return None
    total = next((item.get("total") for item in result.get("aggregate_counts", [])
                  if item["key"] == "all_reported_hazards"), None)
    if result.get("data_state") == "current" and result.get("aggregate_state") == "current" and total == 0:
        return "No recent data in the last 7 days."
    return "Past 7 days only · NYC 311 created_date · America/New_York"
