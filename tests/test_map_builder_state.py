import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "map_builder_state", ROOT / "streamlit" / "map_builder_state.py"
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class MapBuilderStateTests(unittest.TestCase):
    def test_configured_layers_are_seeded_once(self):
        configured = [{"name": "Roads", "url": "https://example.test/FeatureServer/2"}]
        layers, initialized = MODULE.initialize_map_builder_layers([], configured, False)
        self.assertTrue(initialized)
        self.assertEqual(layers[0]["name"], "Roads")
        self.assertEqual(layers[0]["opacity"], 1.0)

    def test_intentionally_empty_layers_are_not_reseeded(self):
        configured = [{"name": "Roads", "url": "https://example.test/FeatureServer/2"}]
        layers, initialized = MODULE.initialize_map_builder_layers([], configured, True)
        self.assertTrue(initialized)
        self.assertEqual(layers, [])


if __name__ == "__main__":
    unittest.main()
