"""Regression checks for the 29 September 2026 backend review fixes."""
import math
import unittest

import pandas as pd

from backend.services.analysis_deals import build_analysis_deals_response
from backend.services.calculations import CalculationServiceError, apply_transaction_filters, remove_price_outliers_by_year


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


if __name__ == "__main__":
    unittest.main()
