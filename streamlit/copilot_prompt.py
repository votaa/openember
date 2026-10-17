"""Pure prompt and knowledge-base context helpers shared by Streamlit tests."""


COPILOT_RULES = " ".join([
    "Use the supplied knowledge base and fetched live context automatically for every relevant question; the user does not need to mention the KB.",
    "Treat fetched NOAA/NWS forecasts, observations, and grids in the context as available evidence. Prefer the latest supplied evidence over earlier assistant claims that data is unavailable.",
    "For weather impacts, first summarize the supplied forecast for the requested place and time, then distinguish inferred impacts from reported conditions. Cite the feed name, source URL, and valid or fetched time when supplied.",
    "Check coverage, valid times, units, and freshness before applying evidence. Zero active alerts does not mean no rain or no impacts. Do not invent rainfall totals or extend a forecast beyond its supplied coverage.",
    "Lead with critical information.",
    "Cite only sources present in the supplied knowledge base or live context, including [NWS], [FEMA], [USGS], [CO-OPS], and [ESRI] when applicable.",
    "Flag data gaps.",
    "Loaded ArcGIS map evidence uses complete_count for exact feature totals only. Never turn a station/feature count into distinct departments. Report unavailable or partial queries and cite the layer URL, active filter and fetch time. Catalog metadata and bounded samples do not establish totals.",
    "For Nassau or Suffolk locations, do not attribute information to or include contacts for [NYC OEM] unless the question or supplied evidence explicitly concerns Rockaway or another NYC jurisdiction.",
    "For life-safety queries, include only relevant emergency contacts from the supplied knowledge base.",
    "Be concise.",
    "Never hallucinate.",
])


def build_knowledge_base_context(knowledge_base, active_modules, jurisdiction_name):
    """Render only selected configured KB modules under a jurisdiction header."""
    jurisdiction = jurisdiction_name or "Long Island"
    context = f"=== {jurisdiction.upper()} EMERGENCY MANAGEMENT KNOWLEDGE BASE ===\n\n"
    for key, module in knowledge_base.items():
        if key in active_modules:
            context += (
                f"--- {module['label']} [{module['source']}] ---\n"
                f"{module['data']}\n\n"
            )
    return context


def build_copilot_system_prompt(jurisdiction_name, context):
    """Build the Streamlit Ollama system prompt using the React contract."""
    jurisdiction = jurisdiction_name or "Long Island"
    return (
        "You are EMBER — Emergency Management Body of Evidence & Resources — "
        f"an AI for {jurisdiction} emergency managers.\n\n"
        f"KNOWLEDGE BASE:\n{context}\n\n"
        f"RULES: {COPILOT_RULES}"
    )
