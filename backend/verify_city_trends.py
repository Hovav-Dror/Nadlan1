"""Comparable city-stat endpoints, independent of each city's wider coverage."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pandas as pd
from backend.services.city_comparison import build_city_stats, build_city_comparison_summary_response


def point(city, year, y):
    return {"city": city, "deal_year": year, "y": y, "n_deals": 10}


def check_stats():
    rows = [point("A", 1998, .001), point("A", 2020, 10), point("A", 2022, 11), point("A", 2025, 1000),
            point("B", 2010, 1), point("B", 2020, 20), point("B", 2022, 30), point("B", 2024, 1)]
    stats = build_city_stats(rows, [{"id": "A"}, {"id": "B"}], "price_millions")
    assert stats["comparable"] and stats["year_range"] == {"min": 2020, "max": 2022}
    assert [r["city"] for r in stats["ranking"]] == ["B", "A"]
    assert [r["pct_change"] for r in stats["ranking"]] == [50, 10]
    assert all(r["years"] == 2 and r["total_deals"] == 20 for r in stats["ranking"])
    assert stats["cards"][2]["value"] == "B"
    for invalid in [None, 0, -1, float('nan'), float('inf')]:
        no_common = build_city_stats([point("A", 2020, 1), point("A", 2022, invalid), point("B", 2020, 2), point("B", 2022, 4)], [], "price_millions")
        assert not no_common["comparable"] and not no_common["ranking"]
        assert len(no_common["cards"]) == 2  # No best/highest comparative claims.
        assert no_common["first_year"] is None
    none = build_city_stats([], [], "price_millions")
    assert not none["ranking"] and not none["comparable"]
    sparse = build_city_stats([point("A", 2020, 1), point("A", 2025, 2), point("B", 2021, 1), point("B", 2025, 2)], [], "price_millions")
    assert sparse["common_years"] == [2025] and not sparse["ranking"]


class Store:
    def list_cities(self):
        return [{"id": "A", "name": "עיר אלף"}, {"id": "B", "name": "עיר בית"}]

    def load_cities(self, cities):
        return pd.DataFrame([{"city": city, "deal year": year, "price_millions": value, "area": 100, "rooms": 4}
            for city in ["עיר אלף", "עיר בית"] for year, value, count in [(2019, .1, 1), (2020, 1, 3), (2022, 2, 3), (2027, 100, 3)] for _ in range(count)])


def check_plot_scope():
    payload = {"cities": ["A", "B"], "min_deals_per_year": 2, "remove_price_outliers": False, "y_variable": "price_millions"}
    result = build_city_comparison_summary_response(Store(), payload)
    assert result["city_stats"]["first_year"] == 2020
    assert result["city_stats"]["last_year"] == 2022
    assert all(row["pct_change"] == 100 for row in result["city_stats"]["ranking"])
    assert 2027 in {row["deal_year"] for row in result["table"]}  # Raw summary remains intact.
    included = build_city_comparison_summary_response(Store(), {**payload, "exclude_2027": False})
    assert included["city_stats"]["last_year"] == 2027


if __name__ == "__main__":
    check_stats()
    check_plot_scope()
    print("City statistics: common positive endpoints, incomparable/sparse cities, plotted filters and raw table preservation passed.")
