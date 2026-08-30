"""Emit Streamlit Map Builder filter results for the shared parity fixture."""

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "streamlit"))

from map_builder_filters import FILTER_MODES, evaluate_map_builder_filter  # noqa: E402


def main(path: str) -> None:
    fixture = json.loads(Path(path).read_text())
    output = {}
    for entry_path in fixture["entry_paths"]:
        output[entry_path] = {}
        for filter_mode in FILTER_MODES:
            result = evaluate_map_builder_filter({
                "type": "Feature Layer",
                "source_type": "Feature Layer",
                "url": "https://example.test/FeatureServer/0",
                "entry_path": entry_path,
                "filter_mode": filter_mode,
                "features": fixture["features"],
            }, fixture["geography_records"])
            output[entry_path][filter_mode] = [feature["id"] for feature in result["features"]]
    print(json.dumps(output, sort_keys=True))


if __name__ == "__main__":
    main(sys.argv[1])
