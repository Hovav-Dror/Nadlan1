"""CSV membership and precision regressions independent of rendered row formatting."""
from pathlib import Path
from io import StringIO
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd
from backend.services.downloads import (
    build_city_comparison_raw_download,
    build_city_comparison_summary_download,
    build_gush_performance_raw_download,
    build_gush_performance_summary_download,
)


class Store:
    def __init__(self):
        rows = []
        def append(city, gush, year, count, price):
            for index in range(count):
                rows.append({"city": city, "Gush": float(gush), "street": f"רחוב {gush}",
                             "date": f"{year}-06-01", "deal year": year, "area": 100.123456789,
                             "price_millions": price, "rooms": 4, "source_id": f"{city}:{gush}:{year}:{index}",
                             "original_measurement": 1.987654321, "sale_portion": 1})
        for year, price in [(2023, 1.123456789), (2024, 1.5), (2025, 2.246913578), (2026, 4), (2027, 8)]:
            append("עיר אלף", 10, year, 4, price)
            append("עיר אלף", 20, year, 4, 2 + (year - 2023) * .1)
        append("עיר אלף", 30, 2024, 4, 2)
        append("עיר אלף", 30, 2025, 4, 20)  # Missing common start: not rankable.
        append("עיר אלף", 40, 2023, 1, 1)
        append("עיר אלף", 40, 2025, 1, 20)  # Inadequate endpoint counts.
        append("עיר בית", 10, 2023, 2, 1)
        append("עיר בית", 10, 2024, 4, 1.1)
        append("עיר בית", 10, 2027, 4, 1.2)
        self.frame = pd.DataFrame(rows)

    def load_manifest(self):
        return {"generated_at": "2026-09-20T10:00:00+00:00"}

    def list_cities(self):
        return [{"id": "alpha", "name": "עיר אלף"}, {"id": "beta", "name": "עיר בית"}]

    def load_cities(self, cities):
        names = [city["name"] for city in self.list_cities() if city["id"] in cities]
        return self.frame.loc[self.frame.city.isin(names)].copy()

    def load_city(self, city):
        return self.load_cities([city])

    def gushes_for_city(self, city):
        return [{"id": x, "label": str(x)} for x in [10, 20, 30, 40]]


def csv(download):
    return pd.read_csv(StringIO(download["content"]))


def check_gush():
    store = Store()
    original = store.frame.copy(deep=True)
    payload = {"city": "alpha", "filters": {"deal_year_range": [2023, 2026]},
               "top_count": 1, "bottom_count": 0, "typical_count": 0, "min_deals_per_gush": 3,
               "yvar": "price_millions", "remove_price_outliers": False, "limit": 1}
    exported = csv(build_gush_performance_raw_download(store, payload))
    expected = store.frame.loc[(store.frame.city == "עיר אלף") & store.frame.Gush.eq(10) & store.frame["deal year"].between(2023, 2025)]
    assert set(exported.source_id) == set(expected.source_id)
    assert len(exported) == 12  # A graph/sample limit cannot truncate raw exports.
    first = exported.loc[exported["Deal Year"].eq(2023)].iloc[0]
    assert first["Price Millions"] == 1.123456789
    assert first["Area"] == 100.123456789
    assert first.original_measurement == 1.987654321
    restored = csv(build_gush_performance_raw_download(store, {**payload, "include_partial_year": True}))
    assert len(restored) == 16 and 2026 in set(restored["Deal Year"])
    no_ranking = csv(build_gush_performance_raw_download(store, {**payload, "min_deals_per_gush": 999}))
    assert no_ranking.empty
    summary = csv(build_gush_performance_summary_download(store, payload))
    assert set(summary.Gush) == {10}
    assert summary["First Year Deals"].iloc[0] == 4
    assert summary["Last Year Deals"].iloc[0] == 4
    assert "Compound Annual Change % (CAGR)" in summary.columns
    pd.testing.assert_frame_equal(original, store.frame)


def check_cities():
    store = Store()
    payload = {"cities": ["alpha", "beta"], "min_deals_per_year": 3, "remove_price_outliers": False, "limit": 1}
    exported = csv(build_city_comparison_raw_download(store, payload))
    expected = store.frame.loc[store.frame["deal year"].ne(2027) & ~((store.frame.city == "עיר בית") & store.frame["deal year"].eq(2023))]
    assert set(exported.source_id) == set(expected.source_id)
    summary = csv(build_city_comparison_summary_download(store, payload))
    assert set(zip(summary.City, summary["Deal Year"])) == set(zip(expected.city, expected["deal year"]))
    restored = csv(build_city_comparison_raw_download(store, {**payload, "exclude_2027": False}))
    assert 2027 in set(restored["Deal Year"])
    # City comparison honours street filters; exports must not strip them.
    street_payload = {**payload, "filters": {"streets": ["רחוב 20"]}}
    selected = csv(build_city_comparison_raw_download(store, street_payload))
    assert set(selected.source_id) == set(store.frame.loc[store.frame.street.eq("רחוב 20") & store.frame["deal year"].ne(2027), "source_id"])


def check_outliers():
    store = Store()
    # Isolate a stable population so extreme price and area cases are unambiguous.
    store.frame = store.frame.loc[(store.frame.city == "עיר אלף") & store.frame.Gush.eq(10)].copy()
    extra_price = {**store.frame.iloc[0].to_dict(), "source_id": "huge-price", "price_millions": 1e9}
    extra_area = {**store.frame.iloc[0].to_dict(), "source_id": "huge-area", "area": 1e9}
    store.frame = pd.concat([store.frame, pd.DataFrame([extra_price, extra_area])], ignore_index=True)
    payload = {"city": "alpha", "cities": ["alpha"], "filters": {"deal_year_range": [2023, 2025]},
               "min_deals_per_year": 3, "min_deals_per_gush": 3, "remove_price_outliers": True,
               "top_count": 1, "bottom_count": 0, "yvar": "price_millions"}
    gush = csv(build_gush_performance_raw_download(store, payload))
    expected = store.frame.loc[~store.frame.source_id.isin(["huge-price", "huge-area"]) & store.frame["deal year"].between(2023, 2025)]
    assert set(gush.source_id) == set(expected.source_id)
    city = csv(build_city_comparison_raw_download(store, payload))
    # City summary removes price outliers but deliberately does not remove area outliers.
    assert set(city.source_id) == set(expected.source_id) | {"huge-area"}


if __name__ == "__main__":
    check_gush()
    check_cities()
    check_outliers()
    print("Export scope: selected Gush years, eligible plotted city years, exact outlier membership, unsampled source precision passed.")
