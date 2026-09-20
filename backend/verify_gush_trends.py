"""Independent arithmetic and endpoint regressions for comparable Gush trends."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd
from backend.services.gush_performance import (
    _qualified_performance,
    _yoy_changes,
    build_gush_performance_summary_response,
)


def row(gush, year, value, n=5):
    return {"gush_key": str(gush), "gush": gush, "gush_label": str(gush), "city": "בדיקה", "deal_year": year, "y": value, "n_deals": n}


def check_arithmetic():
    # A 409.4% overall rise over 26 years is about 6.46% a year,
    # regardless of an unusually volatile intermediate observation.
    base = [row(1, 1998, 1), row(1, 1999, 40), row(1, 2024, 5.094)]
    _, ranked = _qualified_performance(base, 5)
    change = ranked[0]
    assert change["price_change"] == 409.4
    assert 6.46 < change["annualized_change"] < 6.47, change
    assert abs((1 + change["annualized_change"] / 100) ** 26 - 5.094) < 0.001
    sparse = _yoy_changes([row(1, 2020, 100), row(1, 2022, 121)])
    assert sparse[-1]["yoy_pct_change"] == 10  # not 10.5% arithmetic division
    declining = _yoy_changes([row(1, 2020, 100), row(1, 2022, 81)])
    assert declining[-1]["yoy_pct_change"] == -10
    assert _yoy_changes([row(1, 2020, 0), row(1, 2022, 1)])[-1]["yoy_pct_change"] is None


def check_common_endpoints():
    rows = [row(1, 2020, 1), row(1, 2022, 1.21)]
    rows += [row(2, 2021, 1), row(2, 2022, 100)]  # Missing first common year.
    rows += [row(3, 2020, 1, 1), row(3, 2021, 3, 50), row(3, 2022, 5, 50)]
    rows += [row(4, 2020, 1, 50), row(4, 2021, 3, 50), row(4, 2022, 5, 1)]
    rows += [row(5, 2020, 1), row(5, 2021, 9, 1), row(5, 2022, 1.44)]
    rows += [row(6, 2020, float('inf')), row(6, 2022, 3)]
    qualified, ranked = _qualified_performance(rows, 5)
    assert [x["gush"] for x in ranked] == [5, 1]
    assert all((x["first_year"], x["last_year"]) == (2020, 2022) for x in ranked)
    assert next(x for x in qualified if x["gush"] == 5 and x["deal_year"] == 2021)["low_sample"]
    # An explicitly selected unavailable endpoint must not silently move.
    assert _qualified_performance(rows, 5, 2019, 2022) == ([], [])
    assert _qualified_performance(rows, 5, 2022, 2022) == ([], [])
    assert _qualified_performance(rows, 5, 2023, 2020) == ([], [])


class Store:
    def __init__(self):
        self.frame = pd.DataFrame([
            {"city": "בדיקה", "Gush": 10, "street": "רחוב", "date": f"{year}-06-01", "deal year": year,
             "price_millions": price, "area": 100, "rooms": 4}
            for year, price in [(2024, 1), (2025, 1.1), (2026, 10)] for _ in range(5)
        ])

    def load_manifest(self):
        # Testing a fixed snapshot ensures the rule survives future calendar years.
        return {"generated_at": "2026-09-19T11:00:00+00:00"}

    def list_cities(self):
        return [{"id": "test", "name": "בדיקה"}]

    def load_city(self, city):
        return self.frame.copy()

    def gushes_for_city(self, city):
        return [{"id": 10, "label": "בדיקה"}]


def check_response():
    store = Store()
    original = store.frame.copy(deep=True)
    payload = {"city": "test", "yvar": "price_millions", "remove_price_outliers": False,
               "filters": {"deal_year_range": [2024, 2026]}, "show_city": True}
    result = build_gush_performance_summary_response(store, payload)
    assert result["comparison_period"]["excluded_years"] == [2026]
    assert result["comparison_period"]["last_year"] == 2025
    assert result["performance_table"][0]["annualized_change"] == 10
    assert result["performance_table"][0]["first_year_deals"] == 5
    assert [p["year"] for p in result["series"][0]["points"]] == [2024, 2025]
    assert [p["year"] for p in result["overlays"]["city"]] == [2024, 2025]
    assert result["changes"]["thresholds"]["min_deals_basis"] == "each_common_endpoint_year"
    included = build_gush_performance_summary_response(store, {**payload, "include_partial_year": True})
    assert included["comparison_period"]["last_year"] == 2026
    assert included["comparison_period"]["excluded_years"] == []
    assert included["comparison_period"]["partial_years"] == [2026]
    assert included["warnings"]
    empty = build_gush_performance_summary_response(store, {**payload, "filters": {"deal_year_range": [2026, 2026]}})
    assert empty["series"] == []
    assert any("common endpoint" in warning for warning in empty["warnings"])
    pd.testing.assert_frame_equal(original, store.frame)


if __name__ == "__main__":
    check_arithmetic()
    check_common_endpoints()
    check_response()
    print("Gush trends: geometric arithmetic, common endpoint sample thresholds, partial-year control and source preservation passed.")
