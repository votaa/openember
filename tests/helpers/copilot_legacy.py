"""Capture the production Streamlit request builders without executing the app."""
import ast
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "streamlit"))
from copilot_prompt import build_copilot_system_prompt, build_knowledge_base_context
from report_window import report_window_message
from weather_context import summarize_weather
from map_layer_evidence import map_layer_context


def legacy_streamlit(data, scenario):
    class Config:
        name = data["jurisdiction"]
        def source(self, source_id):
            return next((s for s in data["sources"] if s["id"] == source_id), None)
    namespace = dict(CFG=Config(), KNOWLEDGE_BASE=data["kb"], json=json,
                     build_knowledge_base_context=build_knowledge_base_context,
                     report_window_message=report_window_message, summarize_weather=summarize_weather)
    tree = ast.parse((ROOT / "streamlit" / "app.py").read_text())
    nodes = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in ("summarize_api", "build_context")]
    exec(compile(ast.Module(body=nodes, type_ignores=[]), "<production request builders>", "exec"), namespace)
    context = namespace["build_context"](data["files"], data["api_results"], scenario["enabled_modules"],
                                          data["esri_items"], data["noaa_items"], data["gauge_data"], data["phase4_results"])
    context += map_layer_context(data["map_evidence"])
    return [dict(role="system", content=build_copilot_system_prompt(data["jurisdiction"], context))] + (data["history"] + [dict(role="user", content=scenario["question"])])[-10:]


if __name__ == "__main__":
    data = json.load(sys.stdin)
    print(json.dumps({s["id"]: legacy_streamlit(data, s) for s in data["scenarios"]}, ensure_ascii=False))
