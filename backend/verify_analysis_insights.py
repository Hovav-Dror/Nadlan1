"""Regression checks for analysis population, missing-value filters and summaries."""
import json
import unittest

import pandas as pd

from backend.services.analysis_deals import build_analysis_deals_response
from backend.services.analysis_insights import build_analysis_insights
from backend.services.calculations import apply_common_filters, price_used


class Store:
    def __init__(self, frame):
        self.frame = frame

    def load_cities(self, cities):
        return self.frame.copy()


def transactions():
    return pd.DataFrame({
        "city": ["test"] * 6, "street": ["one"] * 6, "Gush": [1] * 6,
        "date": pd.to_datetime(["2020-01-01"] * 4 + ["2022-01-01", "2022-03-01"]),
        "deal year": [2020] * 4 + [2022] * 2,
        "price_millions": [1, 2, 3, 4, 5, 6], "area": [50] * 6,
        "rooms": [2, 999, None, 4, 2, 3], "floor": [1, 999, None, 4, 2, 3],
        "build_floors": [4, 999, None, 6, 7, 8],
        "build_year": [2000, 0, None, 2001, 2002, 2003],
        "building age": [20, 999, None, 19, 18, 17],
    })


class AnalysisInsightsTests(unittest.TestCase):
    def test_unknowns_are_never_room_denominators(self):
        frame = transactions()
        result = price_used(frame, "Price / Room")
        self.assertEqual(result.iloc[0], 0.5)
        self.assertTrue(result.iloc[1:3].isna().all())
        self.assertIsNone(price_used(frame.iloc[1], "Price / Room"))
        for denominator in [0, -1, float("inf"), None]:
            row = {"price_millions": 2, "area": denominator, "rooms": denominator}
            for metric in ["Price / m²", "Price / Room"]:
                self.assertIsNone(price_used(row, metric))
                self.assertTrue(pd.isna(price_used(pd.DataFrame([row]), metric).iloc[0]))

    def test_unknown_toggles_work_without_ranges(self):
        frame = transactions()
        self.assertEqual(len(apply_common_filters(frame, {})), 6)
        for field in ["rooms", "floor", "building_floors", "built_year", "building_age"]:
            with self.subTest(field=field):
                filtered = apply_common_filters(frame, {"include_unknown": {field: False}})
                self.assertEqual(filtered.index.tolist(), [0, 3, 4, 5])
        self.assertEqual(apply_common_filters(frame, {"rooms": [999], "include_unknown": {"rooms": False}}).shape[0], 0)

    def test_style_and_sample_do_not_change_statistics_or_membership(self):
        store = Store(transactions())
        payload = {"city": "test", "remove_price_outliers": False, "limit": 100}
        base = build_analysis_deals_response(store, payload)
        for field in ["rooms", "floor", "build_floors", "price_millions"]:
            response = build_analysis_deals_response(store, {**payload, "facet_var": field})
            self.assertEqual(response["summary"], base["summary"])
            self.assertEqual(response["counts"], base["counts"])
            self.assertEqual(response["insights"], base["insights"])
            self.assertEqual([p["id"] for p in response["points"]], [p["id"] for p in base["points"]])
            if field == "floor":
                self.assertEqual([p["facet"] for p in response["points"]].count(None), 2)
        for seed in [1, 11]:
            response = build_analysis_deals_response(store, {**payload, "limit": 2, "sample_seed": seed})
            self.assertEqual(len(response["points"]), 2)
            self.assertEqual(response["insights"], base["insights"])

    def test_known_quantiles_missing_years_and_volume_population(self):
        response = build_analysis_deals_response(Store(transactions()), {"city": "test", "remove_price_outliers": False})
        insights = response["insights"]
        self.assertEqual(insights["median"], 3.5)
        self.assertEqual(insights["p25"], 2.25)
        self.assertEqual(insights["p75"], 4.75)
        annual = insights["annual"]
        self.assertEqual([row["year"] for row in annual], [2020, 2021, 2022])
        self.assertEqual(annual[0]["median"], 2.5)
        self.assertEqual(annual[0]["p25"], 1.75)
        self.assertEqual(annual[0]["p75"], 3.25)
        self.assertEqual(annual[1]["deals"], 0)
        self.assertIsNone(annual[1]["median"])
        per_room = build_analysis_deals_response(Store(transactions()), {"city": "test", "remove_price_outliers": False, "price_type": "Price / Room"})
        self.assertEqual(per_room["insights"]["matching_deals"], 6)
        self.assertEqual(per_room["insights"]["valid_price_deals"], 4)
        self.assertEqual(per_room["insights"]["missing_price_deals"], 2)
        self.assertEqual(sum(row["deals"] for row in per_room["insights"]["annual"]), 6)

    def test_empty_constant_invalid_and_large_selections(self):
        for values in [[], [3] * 12, [None, float("inf"), -float("inf")], [0, 1, 2, 1000000], list(range(10000))]:
            frame = pd.DataFrame({"PriceUsed": values, "deal year": [2024] * len(values)})
            insights = build_analysis_insights(frame)
            self.assertEqual(sum(row["count"] for row in insights["distribution"]), insights["valid_price_deals"])
            self.assertLessEqual(len(insights["distribution"]), 30)
            json.dumps(insights, allow_nan=False)
        frame = pd.DataFrame({"PriceUsed": [1, 2, 3, 4], "deal year": [None, float("inf"), 2020.5, 999999]})
        insights = build_analysis_insights(frame)
        self.assertEqual(insights["annual"], [])
        self.assertEqual(insights["undated_deals"], 4)
        self.assertEqual(insights["valid_price_deals"], 4)

    def test_all_missing_ratios_still_have_activity(self):
        frame = transactions()
        frame["rooms"] = 999
        response = build_analysis_deals_response(Store(frame), {"city": "test", "price_type": "Price / Room", "remove_price_outliers": False})
        self.assertEqual(response["points"], [])
        self.assertEqual(response["insights"]["matching_deals"], 6)
        self.assertEqual(sum(row["deals"] for row in response["insights"]["annual"]), 6)
        self.assertNotIn("No matching transactions were found.", response["warnings"])

    def test_999_is_retained_for_non_sentinel_fields(self):
        frame = transactions()
        frame["area"] = 999
        response = build_analysis_deals_response(Store(frame), {"city": "test", "facet_var": "area", "remove_price_outliers": False})
        self.assertEqual(response["summary"]["deals"], 6)
        self.assertEqual({row["facet"] for row in response["points"]}, {"999"})


if __name__ == "__main__":
    unittest.main()
