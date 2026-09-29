"""Regression checks for the 29 September 2026 backend review fixes."""
import math
import unittest

import pandas as pd

from backend.services.analysis_deals import build_analysis_deals_response
from backend.services.calculations import CalculationServiceError, apply_transaction_filters, price_used, remove_metric_outliers, remove_price_outliers_by_year


class Store:
    def __init__(self, frame):
        self.frame = frame

    def load_cities(self, cities):
        return self.frame.copy()


def city():
    rows = 40
    return pd.DataFrame({
        "city": ["test"] * rows, "street": ["main"] * 4 + ["other"] * (rows - 4), "Gush": [1] * rows,
        "FULLADRESS": ["main 1"] * 4 + ["other 2"] * (rows - 4),
        "date": ["2020-01-01"] * rows, "deal year": [2020.0] * rows,
        "price_millions": [1.0 + i / 100 for i in range(rows)], "area": [80.0] * rows, "rooms": [3.0] * rows,
    })


class ReviewFixTests(unittest.TestCase):
    def test_outlier_removal_keeps_rows_it_cannot_judge(self):
        frame = pd.DataFrame({"deal year": [2020.0] * 12 + [None, 2020.0], "price_millions": [1.0] * 12 + [1.0, None]})
        self.assertEqual(len(remove_price_outliers_by_year(frame)), 14)

    def test_choice_filters_reject_lists(self):
        for key in ["sale_portion", "location_basis", "data_completeness"]:
            with self.assertRaises(CalculationServiceError):
                apply_transaction_filters(city(), {key: ["full"]})

    def test_non_finite_limits_and_seeds_do_not_crash(self):
        store = Store(city())
        for extra in [{"limit": math.inf}, {"limit": 1, "sample_seed": -1}, {"limit": 1, "sample_seed": 2**40}]:
            response = build_analysis_deals_response(store, {"city": "test", **extra})
            self.assertGreaterEqual(len(response["points"]), 1)

    def test_city_overlay_ignores_the_address_search(self):
        store = Store(city())
        payload = {"city": "test", "show_city_comparison": True, "remove_price_outliers": False}
        whole = build_analysis_deals_response(store, payload)["overlays"]["city_comparison"]
        searched = build_analysis_deals_response(store, {**payload, "filters": {"address": "main"}})
        self.assertEqual(searched["counts"]["filtered_rows"], 4)
        self.assertEqual(searched["overlays"]["city_comparison"], whole)

    def test_placeholder_areas_do_not_produce_price_per_m2(self):
        frame = pd.DataFrame({"price_millions": [28.0, 2.45, 2.0, 2.0], "area": [1.0, 10.0, 80.0, 30.0], "rooms": [5.0, 5.0, 3.0, 5.0]})
        per_m2 = price_used(frame, "Price / m²")
        self.assertTrue(per_m2.iloc[[0, 1, 3]].isna().all(), "1 m², 10 m² and 30 m² for five rooms are placeholders")
        self.assertEqual(per_m2.iloc[2], 25.0)
        self.assertIsNone(price_used({"price_millions": 28.0, "area": 1.0, "rooms": 5.0}, "Price / m²"))
        self.assertEqual(price_used({"price_millions": 2.0, "area": 80.0, "rooms": None}, "Price / m²"), 25.0)

    def test_per_m2_view_trims_extreme_ratios_with_normal_total_prices(self):
        frame = city()
        frame.loc[0, "area"] = 20.0  # whole-building price against a small unit, total price looks normal
        frame.loc[0, "rooms"] = 1.0
        frame.loc[0, "price_millions"] = 1.3
        response = build_analysis_deals_response(Store(frame), {"city": "test", "price_type": "Price / m²"})
        self.assertLess(max(point["y"] for point in response["points"]), 20)

    def test_metric_outliers_trim_ratio_but_keep_missing_metric_rows(self):
        frame = city()
        frame.loc[0, ["area", "rooms", "price_millions"]] = [20.0, 1.0, 1.3]  # ratio outlier, normal total
        frame.loc[1, "area"] = 1.0  # placeholder area: no metric, but still a transaction
        frame["marker"] = range(len(frame))
        for by_year in [False, True]:
            kept = set(remove_metric_outliers(frame, "price_per_m2", by_year=by_year)["marker"])
            self.assertNotIn(0, kept)
            self.assertIn(1, kept)
            self.assertEqual(len(kept), len(frame) - 1)
        self.assertEqual(len(remove_metric_outliers(frame, "price_millions", by_year=False)), len(frame))


if __name__ == "__main__":
    unittest.main()
