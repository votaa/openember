import importlib.util
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "streamlit" / "config_loader.py"
try:
    import yaml as _yaml  # noqa: F401
except ModuleNotFoundError:
    yaml_stub = types.ModuleType("yaml")

    class YAMLUnavailableError(Exception):
        pass

    yaml_stub.YAMLError = YAMLUnavailableError
    yaml_stub.safe_load = lambda _stream: (_ for _ in ()).throw(YAMLUnavailableError())
    sys.modules["yaml"] = yaml_stub

SPEC = importlib.util.spec_from_file_location("config_loader", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class ConfigLoaderFallbackTests(unittest.TestCase):
    def test_missing_custom_config_uses_repository_long_island_config(self):
        with mock.patch.object(
            MODULE.yaml,
            "safe_load",
            return_value=MODULE._LONG_ISLAND_FALLBACK,
        ):
            config = MODULE.load_config(
                ROOT / "config" / "missing-jurisdiction.yaml"
            )
        self.assertEqual(config.name, "Long Island")
        self.assertIn("Montauk", config.knowledge_base["flood_zones"]["data"])

    def test_unavailable_repository_config_uses_bundled_long_island_minimum(self):
        missing_root = Path(tempfile.gettempdir()) / "openember-missing-config.yaml"
        with mock.patch.object(MODULE, "_DEFAULT_CFG", missing_root):
            config = MODULE.load_config(missing_root)
        self.assertEqual(config.name, "Long Island")
        self.assertIn("Montauk Point", config.knowledge_base["flood_zones"]["data"])
        self.assertIn("Suffolk OEM", config.knowledge_base["resources"]["data"])
        self.assertNotIn("NYC OEM", config.knowledge_base["resources"]["data"])


if __name__ == "__main__":
    unittest.main()
