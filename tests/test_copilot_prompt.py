import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "streamlit" / "copilot_prompt.py"
SPEC = importlib.util.spec_from_file_location("copilot_prompt", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class CopilotPromptTests(unittest.TestCase):
    def test_context_uses_configured_long_island_modules(self):
        knowledge_base = {
            "flood_zones": {
                "label": "Flood Zones",
                "source": "FEMA / Local",
                "data": "Montauk Point is Zone VE in Suffolk County.",
            },
            "resources": {
                "label": "Contacts & Resources",
                "source": "Local OEM",
                "data": "Suffolk OEM: 631-852-4900",
            },
        }
        context = MODULE.build_knowledge_base_context(
            knowledge_base,
            ["flood_zones", "resources"],
            "Long Island",
        )
        self.assertIn("=== LONG ISLAND EMERGENCY MANAGEMENT KNOWLEDGE BASE ===", context)
        self.assertIn("Montauk Point is Zone VE in Suffolk County.", context)
        self.assertIn("Suffolk OEM: 631-852-4900", context)
        self.assertNotIn("=== NYC EMERGENCY MANAGEMENT KNOWLEDGE BASE ===", context)

    def test_system_prompt_matches_grounded_source_contract(self):
        prompt = MODULE.build_copilot_system_prompt(
            "Long Island", "configured context",
        )
        self.assertIn("an AI for Long Island emergency managers", prompt)
        self.assertIn("[ESRI]", prompt)
        self.assertIn("include only relevant emergency contacts", prompt)
        self.assertIn(
            "do not attribute information to or include contacts for [NYC OEM]",
            prompt,
        )
        self.assertNotIn("an AI for NYC emergency managers", prompt)


if __name__ == "__main__":
    unittest.main()
