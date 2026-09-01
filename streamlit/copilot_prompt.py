"""Pure prompt and knowledge-base context helpers shared by Streamlit tests."""


COPILOT_RULES = " ".join([
    "Lead with critical information.",
    "Cite only sources present in the supplied knowledge base or live context, including [NWS], [FEMA], [USGS], [CO-OPS], and [ESRI] when applicable.",
    "Flag data gaps.",
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
