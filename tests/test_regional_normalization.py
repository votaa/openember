import json
import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODULE_PATH = ROOT / "streamlit" / "regional_normalization.py"
SPEC = importlib.util.spec_from_file_location("regional_normalization", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)
load_sources = MODULE.load_sources
normalize_rockaway_payload = MODULE.normalize_rockaway_payload
build_rockaway_query_url = MODULE.build_rockaway_query_url
build_rockaway_aggregate_query_url = MODULE.build_rockaway_aggregate_query_url
fetch_rockaway_source = MODULE.fetch_rockaway_source
rockaway_source_card = MODULE.rockaway_source_card
unavailable_rockaway_result = MODULE.unavailable_rockaway_result

FIXTURE = json.loads(
    (ROOT / "fixtures" / "long-island-sources" / "phase-3-rockaway-normalization.json").read_text()
)
SPATIAL_FIXTURE = json.loads(
    (ROOT / "fixtures" / "long-island-sources" / "phase-3-rockaway-spatial-qualification.json").read_text()
)
SOURCES = load_sources()


class RegionalNormalizationTests(unittest.TestCase):
    def test_electric_hazard_classification_includes_non_electric_blockages(self):
        source = SOURCES["nyc_311_electric_hazards_rockaway"]
        rows = [
            {"unique_key": "electric", "created_date": "2026-08-29T12:00:00.000", "agency": "HPD", "complaint_type": "ELECTRIC", "descriptor": "POWER OUTAGE", "status": "Open", "borough": "QUEENS", "community_board": "14 QUEENS", "latitude": "40.60", "longitude": "-73.80"},
            {"unique_key": "tree", "created_date": "2026-08-29T12:01:00.000", "agency": "DPR", "complaint_type": "Dead Tree", "descriptor": "Hitting Power Lines", "status": "Open", "borough": "QUEENS", "community_board": "14 QUEENS", "latitude": "40.61", "longitude": "-73.81"},
            {"unique_key": "flood-blockage", "created_date": "2026-08-29T12:02:00.000", "agency": "DOT", "complaint_type": "Blocked Road", "descriptor": "Flooding", "status": "Open", "borough": "QUEENS", "community_board": "14 QUEENS", "latitude": "40.62", "longitude": "-73.82"},
            {"unique_key": "noise", "created_date": "2026-08-29T12:03:00.000", "agency": "NYPD", "complaint_type": "Noise - Residential", "descriptor": "Loud Music/Party", "status": "Open", "borough": "QUEENS", "community_board": "14 QUEENS", "latitude": "40.63", "longitude": "-73.83"},
        ]
        result = normalize_rockaway_payload(source, rows, FIXTURE["fetched_at"], FIXTURE["evaluated_at"])
        self.assertEqual(result["data_state"], "partial")
        self.assertEqual([record["properties"]["hazard_category_key"] for record in result["records"]], ["direct_electric", "electric_tree_or_wire", "road_blockage"])
        self.assertEqual(result["records"][2]["category"], "Road blockage report")
        self.assertEqual(result["rejected_count"], 1)

    def test_hazard_source_has_full_inventory_aggregate_queries(self):
        source = SOURCES["nyc_311_electric_hazards_rockaway"]
        self.assertEqual(len(source["aggregate_queries"]), 4)
        url = build_rockaway_aggregate_query_url(source, source["aggregate_queries"][0])
        self.assertIn("%24select=count%28%2A%29+as+total", url)
        self.assertNotIn("%24limit", url)

        calls = []
        class Response:
            def raise_for_status(self):
                return None
            def json(self):
                return [{"total": "17"}] if "%24select=count%28%2A%29" in calls[-1] else [{"unique_key": "electric", "created_date": "2026-08-29T12:00:00.000", "agency": "HPD", "complaint_type": "ELECTRIC", "descriptor": "POWER OUTAGE", "status": "Open", "borough": "QUEENS", "community_board": "14 QUEENS", "latitude": "40.60", "longitude": "-73.80"}]
        def request_get(url, **_kwargs):
            calls.append(url)
            return Response()
        result = fetch_rockaway_source(source, request_get, FIXTURE["fetched_at"], sleep_fn=lambda _seconds: None)
        self.assertEqual(result["aggregate_state"], "current")
        self.assertEqual(len(result["aggregate_counts"]), 4)
        self.assertEqual(result["aggregate_counts"][0]["total"], 17)
        self.assertEqual(len(calls), 5)

    def test_socrata_timeout_retries_with_app_token(self):
        attempts = []

        class Response:
            def raise_for_status(self):
                return None

            def json(self):
                return FIXTURE["cases"][0]["rows"]

        def request_get(_url, **kwargs):
            attempts.append(kwargs)
            if len(attempts) < 3:
                raise TimeoutError("timed out")
            return Response()

        result = fetch_rockaway_source(
            SOURCES["nyc_311_rockaway"], request_get, FIXTURE["fetched_at"],
            app_token="test-token", sleep_fn=lambda _seconds: None,
        )

        self.assertEqual(len(attempts), 3)
        self.assertTrue(all(call["headers"]["X-App-Token"] == "test-token" for call in attempts))
        self.assertTrue(result["records"])
        self.assertNotEqual(result["data_state"], "unavailable")

    def test_failed_refresh_preserves_500_last_good_records(self):
        previous = {
            "records": [
                {
                    "source_id": "nyc_311_rockaway",
                    "fetched_at": "2026-08-30T13:00:00.000Z",
                    "data_state": "current",
                    "geometry": {"type": "Point", "coordinates": [-73.8, 40.6]},
                    "properties": {"source_record_id": str(index)},
                }
                for index in range(500)
            ],
            "data_state": "current",
            "reason": None,
            "rejected_count": 0,
            "fetched_at": "2026-08-30T13:00:00.000Z",
        }

        def request_get(_url, **_kwargs):
            raise TimeoutError("timed out")

        result = fetch_rockaway_source(
            SOURCES["nyc_311_rockaway"], request_get, FIXTURE["fetched_at"],
            previous_result=previous, max_retries=0,
        )

        self.assertEqual(result["data_state"], "stale")
        self.assertEqual(len(result["records"]), 500)
        self.assertTrue(all(record["data_state"] == "stale" for record in result["records"]))
        self.assertEqual(result["fetched_at"], previous["fetched_at"])
        self.assertIn("timed out", result["reason"].lower())

    def test_socrata_retries_http_429_and_5xx(self):
        statuses = [429, 503, 200]

        class HttpError(Exception):
            def __init__(self, status):
                super().__init__(f"HTTP {status}")
                self.response = type("ErrorResponse", (), {"status_code": status})()

        class Response:
            def __init__(self, status):
                self.status_code = status

            def raise_for_status(self):
                if self.status_code != 200:
                    raise HttpError(self.status_code)

            def json(self):
                return FIXTURE["cases"][0]["rows"]

        result = fetch_rockaway_source(
            SOURCES["nyc_311_rockaway"], lambda _url, **_kwargs: Response(statuses.pop(0)),
            FIXTURE["fetched_at"], sleep_fn=lambda _seconds: None,
        )

        self.assertEqual(statuses, [])
        self.assertTrue(result["records"])

    def test_socrata_does_not_retry_non_transient_4xx(self):
        calls = []

        class HttpError(Exception):
            def __init__(self):
                super().__init__("HTTP 400")
                self.response = type("ErrorResponse", (), {"status_code": 400})()

        class Response:
            def raise_for_status(self):
                raise HttpError()

        def request_get(_url, **kwargs):
            calls.append(kwargs)
            return Response()

        result = fetch_rockaway_source(
            SOURCES["nyc_311_rockaway"], request_get, FIXTURE["fetched_at"],
            sleep_fn=lambda _seconds: None,
        )

        self.assertEqual(len(calls), 1)
        self.assertEqual(result["data_state"], "unavailable")
        self.assertEqual(result["records"], [])

    def test_valid_311_record_is_current_and_mappable(self):
        case = FIXTURE["cases"][0]
        result = normalize_rockaway_payload(
            SOURCES[case["source_id"]], [case["rows"][0]], FIXTURE["fetched_at"], FIXTURE["evaluated_at"]
        )
        self.assertEqual(result["data_state"], "current")
        self.assertEqual(result["records"][0]["geometry"]["type"], "Point")
        self.assertEqual(result["records"][0]["properties"]["community_board"], "14 QUEENS")

    def test_missing_311_coordinates_are_rejected(self):
        row = dict(FIXTURE["cases"][0]["rows"][0])
        row.pop("latitude")
        result = normalize_rockaway_payload(
            SOURCES["nyc_311_rockaway"], [row], FIXTURE["fetched_at"], FIXTURE["evaluated_at"]
        )
        self.assertEqual(result["data_state"], "partial")
        self.assertEqual(result["records"], [])
        self.assertEqual(result["rejected_count"], 1)

    def test_phase_4_card_and_query_contract(self):
        source = SOURCES["nyc_311_rockaway"]
        case = FIXTURE["cases"][0]
        result = normalize_rockaway_payload(
            source, [case["rows"][0]], FIXTURE["fetched_at"], FIXTURE["evaluated_at"]
        )
        card = rockaway_source_card(source, result)
        self.assertTrue(card["map_capable"])
        self.assertEqual(card["geography"], "Rockaway / Queens CB14")
        query_url = build_rockaway_query_url(source)
        self.assertIn("%24where=", query_url)
        self.assertIn("%24limit=500", query_url)

        qualified = SOURCES["nypd_incidents_rockaway"]
        qualified_card = rockaway_source_card(qualified, unavailable_rockaway_result(qualified))
        self.assertFalse(qualified_card["map_capable"])
        self.assertIn("Historical", qualified_card["note"])

        evacuation = SOURCES["nyc_hurricane_evacuation_centers_rockaway"]
        evacuation_card = rockaway_source_card(evacuation, unavailable_rockaway_result(evacuation))
        self.assertEqual(evacuation_card["activation_state"], "confirmation_required")
        self.assertEqual(evacuation_card["confirmation_phone"], "311")

    def test_spatial_point_and_polygon_qualification(self):
        output = {
            case["source_id"]: normalize_rockaway_payload(
                SOURCES[case["source_id"]], case.get("rows", case.get("payload")),
                SPATIAL_FIXTURE["fetched_at"], SPATIAL_FIXTURE["evaluated_at"],
                SPATIAL_FIXTURE["geography_records"],
            )
            for case in SPATIAL_FIXTURE["cases"]
        }
        self.assertEqual([record["properties"]["source_record_id"] for record in output["nypd_incidents_rockaway"]["records"]], ["spatial-nypd-in"])
        self.assertEqual([record["title"] for record in output["nycha_developments_rockaway"]["records"]], ["HAMMEL"])
        self.assertEqual(output["nycha_developments_rockaway"]["records"][0]["observed_at"], "2026-05-15T15:07:23.000Z")

        evacuation = output["nyc_hurricane_evacuation_centers_rockaway"]
        self.assertEqual([record["title"] for record in evacuation["records"]], ["IN-SCOPE EVACUATION CENTER FIXTURE"])
        self.assertEqual(evacuation["records"][0]["activation_state"], "confirmation_required")

    def test_evacuation_empty_scope_is_not_zero_active_centers(self):
        case = next(item for item in SPATIAL_FIXTURE["cases"] if item["source_id"] == "nyc_hurricane_evacuation_centers_rockaway")
        result = normalize_rockaway_payload(
            SOURCES[case["source_id"]], [case["rows"][1]], SPATIAL_FIXTURE["fetched_at"],
            SPATIAL_FIXTURE["evaluated_at"], SPATIAL_FIXTURE["geography_records"],
        )
        self.assertEqual(result["data_state"], "partial")
        self.assertEqual(result["reason"], "no_local_reference_facilities")
        self.assertEqual(result["scope_state"], "no_local_reference_facilities")
        self.assertEqual(result["activation_state"], "confirmation_required")

    def test_malformed_evacuation_rows_fail_closed(self):
        result = normalize_rockaway_payload(
            SOURCES["nyc_hurricane_evacuation_centers_rockaway"],
            [{"bldg_name": "Missing geometry and identifier"}],
            SPATIAL_FIXTURE["fetched_at"], SPATIAL_FIXTURE["evaluated_at"],
            SPATIAL_FIXTURE["geography_records"],
        )
        self.assertEqual(result["data_state"], "unavailable")
        self.assertEqual(result["reason"], "malformed_records")
        self.assertIsNone(result["scope_state"])

    def test_spatial_qualification_requires_cb14_mask(self):
        case = SPATIAL_FIXTURE["cases"][0]
        result = normalize_rockaway_payload(
            SOURCES[case["source_id"]], case["rows"], SPATIAL_FIXTURE["fetched_at"], SPATIAL_FIXTURE["evaluated_at"]
        )
        self.assertEqual(result["data_state"], "unavailable")
        self.assertEqual(result["reason"], "missing_spatial_mask")


if __name__ == "__main__":
    unittest.main()
