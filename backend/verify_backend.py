from __future__ import annotations

import sys
from io import StringIO
from pathlib import Path

import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.app import create_app  # noqa: E402
from backend.services.calculations import (  # noqa: E402
    apply_common_filters,
    price_used,
    remove_outliers_from_var,
    remove_price_outliers_by_year,
    sp500_normalized,
    summary_by_city_year,
    summary_by_gush_year,
)
from backend.services.analysis_deals import _bin_labels, _nice_breaks, _nice_breaks_for_values, build_analysis_deals_response  # noqa: E402
from backend.services.city_comparison import (  # noqa: E402
    CityComparisonError,
    build_city_comparison_summary_response,
    resolve_city_comparison_selection,
)
from backend.services.compare_areas import (  # noqa: E402
    CompareAreasError,
    build_compare_summary_response,
    resolve_compare_selection,
)
from backend.services.filter_metadata import (  # noqa: E402
    build_filter_options_from_frame,
    smart_room_defaults,
)
from backend.services.gush_performance import (  # noqa: E402
    GushPerformanceError,
    build_gush_performance_summary_response,
    resolve_gush_performance_city,
)
from backend.services.downloads import (  # noqa: E402
    build_analysis_download,
    build_city_comparison_raw_download,
    build_city_comparison_summary_download,
    build_compare_raw_download,
    build_compare_summary_download,
    build_gush_performance_raw_download,
    build_gush_performance_summary_download,
)


def main() -> int:
    app = create_app()
    client = app.test_client()

    status_response = client.get("/api/status")
    assert status_response.status_code == 200, status_response.data
    status_payload = status_response.get_json()
    assert status_payload["status"] == "ok"
    assert status_payload["data_manifest"]["loaded"] is True

    meta_response = client.get("/api/meta")
    assert meta_response.status_code == 200, meta_response.data
    meta_payload = meta_response.get_json()
    assert meta_payload["meta"]["status"] == "ok"
    assert len(meta_payload["data"]["cities"]) == status_payload["data_manifest"]["city_count"]
    assert "source_root" not in str(meta_payload)
    assert "parquet" not in str(meta_payload)

    data_store = app.extensions["nadlan2_data_store"]
    metadata = data_store.load_metadata()
    cities = data_store.list_cities()
    assert len(cities) == metadata["manifest"]["city_count"]

    sample_city = cities[0]
    sample_city_frame = data_store.load_city(sample_city["id"])
    assert len(sample_city_frame) == sample_city["rows"]

    sample_streets = data_store.streets_for_city(sample_city["id"])
    sample_gushes = data_store.gushes_for_city(sample_city["id"])
    assert sample_streets
    assert sample_gushes

    streets_response = client.get(f"/api/cities/{sample_city['id']}/streets")
    assert streets_response.status_code == 200, streets_response.data
    assert streets_response.get_json()["data"]["streets"] == sample_streets

    gushes_response = client.get(f"/api/cities/{sample_city['id']}/gushes")
    assert gushes_response.status_code == 200, gushes_response.data
    assert gushes_response.get_json()["data"]["gushes"][0]["id"] == sample_gushes[0]["id"]

    gush_response = client.get(f"/api/gushes/{sample_gushes[0]['id']}")
    assert gush_response.status_code == 200, gush_response.data
    assert "matches" in gush_response.get_json()["data"]

    cities_for_first_gush = data_store.cities_for_gushes([sample_gushes[0]["id"]])
    assert any(city["id"] == sample_city["id"] for city in cities_for_first_gush)

    search_query = sample_streets[0][: min(3, len(sample_streets[0]))]
    search_results = data_store.search_streets(search_query, city=sample_city["id"], limit=5)
    assert search_results

    search_response = client.get(
        "/api/street-search",
        query_string={"q": search_query, "city": sample_city["id"], "limit": 5},
    )
    assert search_response.status_code == 200, search_response.data
    api_search_results = search_response.get_json()["data"]["results"]
    assert api_search_results
    assert api_search_results[0]["gushes"]

    filter_options_response = client.post(
        "/api/filter-options",
        json={"city": sample_city["id"], "streets": [sample_city_frame["street"].dropna().astype(str).iloc[0]]},
    )
    assert filter_options_response.status_code == 200, filter_options_response.data
    filter_options = filter_options_response.get_json()["data"]
    assert filter_options["counts"]["before_outlier_removal"] > 0
    assert filter_options["ranges"]["floor"]["max"] != 999
    assert all(room != 999 for room in filter_options["rooms"]["choices"])

    combined = data_store.load_cities([sample_city["id"], sample_city["name"]])
    assert len(combined) == sample_city["rows"]

    hand_built_result = verify_calculation_services()
    metadata_result = verify_filter_metadata_helpers()
    analysis_helper_result = verify_analysis_deals_helpers()
    compare_helper_result = verify_compare_areas_helpers()
    city_comparison_helper_result = verify_city_comparison_helpers()
    gush_performance_helper_result = verify_gush_performance_helpers()
    download_helper_result = verify_download_helpers()
    smoke_result = verify_real_city_services(data_store, client)

    print("Backend verification passed.")
    print(f"Available cities: {len(cities)}")
    print(f"Loaded city: {sample_city['name']} ({sample_city['id']})")
    print(f"Loaded city rows: {len(sample_city_frame)}")
    print(f"Sample streets: {', '.join(sample_streets[:3])}")
    print(
        "Sample gushes: "
        + ", ".join(f"{gush['id']}:{gush['label']}" for gush in sample_gushes[:3])
    )
    print(f"Sample search query: {search_query}")
    print(f"Sample search result: {search_results[0]}")
    print(f"Cache status: {data_store.cache_status()}")
    print(f"Hand-built service checks: {hand_built_result}")
    print(f"Hand-built metadata checks: {metadata_result}")
    print(f"Hand-built analysis deals checks: {analysis_helper_result}")
    print(f"Hand-built compare areas checks: {compare_helper_result}")
    print(f"Hand-built city comparison checks: {city_comparison_helper_result}")
    print(f"Hand-built Gush performance checks: {gush_performance_helper_result}")
    print(f"Hand-built download checks: {download_helper_result}")
    print(f"Real-city service smoke: {smoke_result}")
    return 0


def verify_calculation_services() -> dict[str, object]:
    df = pd.DataFrame(
        {
            "id": [1, 2, 3, 4, 5],
            "city": ["תל אביב -יפו", "תל אביב -יפו", "רמת גן", "רמת גן", "רמת גן"],
            "street": ["הרב הרצוג", "הרב הרצוג", "ביאליק", "ביאליק", "ביאליק"],
            "Gush": [6107, 6107.0, "6108", 6108, 6109],
            "deal year": [2020, 2020, 2021, 2021, 2022],
            "price_millions": [2.0, 3.0, 4.0, 5.0, 6.0],
            "area": [100, 150, 0, 80, 120],
            "rooms": [4, 999, None, 3, 2],
            "floor": [2, 999, 7, 1, 4],
            "roof": [True, "TRUE", "FALSE", False, None],
            "apt type": ["דירה", "דירה", "דירה", "גג", "דירה"],
            "New_Project": ["New Project", "2nd hand", "2nd hand", "New Project", "2nd hand"],
            "build_year": [2000, 1800, None, 1950, 2020],
            "building age": [20, 220, None, 70, 2],
            "build_floors": [4, 999, None, 10, 5],
        }
    )

    assert price_used(df.iloc[0], "Price") == 2.0
    assert price_used(df.iloc[0], "Price / m²") == 20.0
    assert price_used(df.iloc[0], "Price / Room") == 0.5
    assert price_used(df.iloc[2], "Price / m²") is None

    filtered = apply_common_filters(
        df,
        {
            "floor_range": [0, 3],
            "rooms_select": [4],
            "built_year_range": [1990, 2022],
            "building_age_range": [0, 80],
            "building_floors_range": [1, 5],
        },
    )
    assert filtered["id"].tolist() == [1, 2]

    assert apply_common_filters(df, {"roof_select": "yes"})["id"].tolist() == [1, 2]
    assert apply_common_filters(df, {"roof_select": "no"})["id"].tolist() == [3, 4, 5]
    assert apply_common_filters(df, {"gushes": ["6107"]})["id"].tolist() == [1, 2]
    assert apply_common_filters(df, {"apartment_types": ["דירה"]})["id"].tolist() == [1, 2, 3, 5]
    assert apply_common_filters(df, {"new_project_select": "no"})["id"].tolist() == [2, 3, 5]
    assert apply_common_filters(df, {"price_per_m2_range": [15, 25]})["id"].tolist() == [1, 2]

    area_clean = remove_outliers_from_var(pd.DataFrame({"area": [10, 11, 12, 1000]}), "area")
    assert area_clean["area"].tolist() == [10, 11, 12]

    yearly_prices = pd.DataFrame(
        {
            "deal year": [2020] * 4 + [2021] * 11,
            "price_millions": [1.0, 1.1, 1.2, 20.0] + [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 100.0],
        }
    )
    price_clean = remove_price_outliers_by_year(yearly_prices)
    assert len(price_clean) == 13
    assert price_clean["price_millions"].max() == 1.9

    gush_summary = summary_by_gush_year(df)
    city_summary = summary_by_city_year(df)
    assert {"n_deals", "price_per_m2", "price_per_room"}.issubset(gush_summary.columns)
    assert len(city_summary) == 3

    sp500 = sp500_normalized([2020, 2022], 100)
    assert sp500["Year"].tolist() == [2020, 2021, 2022]
    assert round(sp500["PriceUsed"].iloc[0], 6) == 100
    assert all(hasattr(value, "isoformat") for value in sp500["date"])

    return {
        "filtered_ids": filtered["id"].tolist(),
        "roof_no_ids": apply_common_filters(df, {"roof_select": "no"})["id"].tolist(),
        "price_outlier_rows": len(price_clean),
        "sp500_rows": len(sp500),
    }


def verify_filter_metadata_helpers() -> dict[str, object]:
    df = pd.DataFrame(
        {
            "id": [1, 2, 3, 4, 5],
            "city": ["בדיקה"] * 5,
            "street": ["אלף"] * 5,
            "Gush": [1, 1, 2, 2, 2],
            "deal year": [2020, 2020, 2021, 2021, 2022],
            "price_millions": [1.0, 1.2, 1.4, 1.6, 20.0],
            "area": [50, 60, 70, 80, 90],
            "rooms": [2, 3, 4, 999, None],
            "floor": [1, 2, 999, 4, None],
            "roof": [True, "כן", "FALSE", "לא", None],
            "apt type": ["דירה", "דירה", "גג", "דירה", "דירה"],
            "build_year": [1899, 1950, 2000, None, 2021],
            "building age": [151, 70, 20, None, 2],
            "build_floors": [4, 999, 10, None, 12],
        }
    )

    options = build_filter_options_from_frame(df, ["דירה", "גג"])
    assert options["ranges"]["floor"]["max"] == 4
    assert options["ranges"]["rooms"]["max"] == 4
    assert options["ranges"]["build_year"]["min"] == 1950
    assert options["ranges"]["building_age"]["max"] == 70
    assert options["ranges"]["build_floors"]["max"] == 12
    assert options["rooms"]["choices"] == [2, 3, 4]
    assert options["rooms"]["smart_selected"] == [2, 3, 4]
    assert options["rooms"]["unknown_count"] == 2
    assert options["roof"] == {"yes": 2, "no": 2, "unknown": 1}
    assert smart_room_defaults([1, 2.5, 5]) == [1, 2.5, 5]
    assert smart_room_defaults(
        [2, 3, 4, 5, 6],
        pd.Series(([2] * 60) + ([5] * 25) + ([3] * 7) + ([4] * 4) + ([6] * 4)),
    ) == [2, 5]

    return {
        "floor_range": options["ranges"]["floor"],
        "room_choices": options["rooms"]["choices"],
        "smart_rooms": options["rooms"]["smart_selected"],
        "build_year_range": options["ranges"]["build_year"],
    }


def verify_analysis_deals_helpers() -> dict[str, object]:
    class FakeStore:
        def __init__(self):
            self.frame = pd.DataFrame(
                {
                    "city": ["בדיקה"] * 6,
                    "street": ["אלף", "אלף", "אלף", "בית", "בית", "בית"],
                    "Gush": [10, 10, 10, 11, 11, 11],
                    "GUSH": ["10-1-1", "10-1-2", "10-1-3", "11-1-1", "11-1-2", "11-1-3"],
                    "FULLADRESS": ["אלף 1", "אלף 2", "אלף 3", "בית 1", "בית 2", "בית 3"],
                    "date": pd.to_datetime(
                        ["2020-01-01", "2020-02-01", "2020-03-01", "2021-01-01", "2021-02-01", "2021-03-01"]
                    ).date,
                    "deal year": [2020, 2020, 2020, 2021, 2021, 2021],
                    "price_millions": [1.0, 1.1, 1.2, 1.3, 1.4, 99.0],
                    "area": [50, 55, 60, 65, 70, 75],
                    "rooms": [3, 3, 4, 3, 4, 4],
                    "floor": [1, 2, 3, 4, 5, 6],
                    "roof": [False, False, True, False, True, False],
                    "apt type": ["דירה"] * 6,
                    "New_Project": ["2nd hand", "2nd hand", "New Project", "2nd hand", "New Project", "2nd hand"],
                    "build_year": [2000, 2001, 2002, 2003, 2004, 2005],
                    "building age": [20, 19, 18, 18, 17, 16],
                    "build_floors": [6, 6, 6, 8, 8, 8],
                    "story": ["סיפור אלף 1", "סיפור אלף 2", "סיפור אלף 3", "סיפור בית 1", "סיפור בית 2", "סיפור בית 3"],
                }
            )

        def load_cities(self, cities):
            assert cities == ["בדיקה"]
            return self.frame.copy()

        def cities_for_gushes(self, gushes):
            return [{"id": "בדיקה", "name": "בדיקה", "rows": len(self.frame)}]

        def load_metadata(self):
            return {
                "gush_descriptions": pd.DataFrame(
                    {
                        "city": ["בדיקה", "בדיקה"],
                        "Gush": [10, 11],
                        "Gush_desc": ["גוש אלף", "גוש בית"],
                    }
                )
            }

    response = build_analysis_deals_response(
        FakeStore(),
        {
            "city": "בדיקה",
            "streets": ["אלף"],
            "filters": {
                "rooms_select": [3, 4],
                "area_range": [45, 70],
                "floor_range": [0, 5],
                "roof_select": "both",
                "apartment_types": ["דירה"],
                "new_project_select": "all",
                "deal_year_range": [2020, 2021],
                "built_year_range": [1990, 2025],
                "building_age_range": [0, 50],
                "building_floors_range": [1, 10],
            },
            "price_type": "Price / m²",
            "color_var": "street",
            "shape_var": "apt type",
            "size_var": "area",
            "facet_var": "Gush",
            "show_city_comparison": True,
            "limit": 2,
            "sample_seed": 7,
        },
    )

    assert response["counts"]["city_rows"] == 6
    assert response["counts"]["location_rows"] == 3
    assert response["counts"]["filtered_rows"] == 3
    assert response["counts"]["returned_rows"] == 2
    assert response["summary"]["deals"] == 3
    assert response["summary"]["price_type"] == "Price / m²"
    assert len(response["points"]) == 2
    assert len(response["table_rows"]) == 2
    assert response["points"][0]["tooltip"].startswith("סיפור")
    assert response["points"][0]["facet"] == "גוש אלף"
    assert "color" in response["points"][0]
    assert "path" not in str(response).casefold()
    assert response["overlays"]["city_comparison"]

    repeat = build_analysis_deals_response(
        FakeStore(),
        {"city": "בדיקה", "streets": ["אלף"], "price_type": "Price / m²", "limit": 2, "sample_seed": 7},
    )
    assert [row["id"] for row in response["points"]] == [row["id"] for row in repeat["points"]]

    y_variable_response = build_analysis_deals_response(
        FakeStore(),
        {
            "city": "בדיקה",
            "streets": ["אלף"],
            "y_variable": "price_per_room",
            "limit": 10,
        },
    )
    assert y_variable_response["summary"]["price_type"] == "Price / Room"
    assert y_variable_response["points"][0]["y"] == round(1.0 / 3, 3)

    rooms_facet_response = build_analysis_deals_response(
        FakeStore(),
        {
            "city": "בדיקה",
            "streets": ["אלף"],
            "facet_var": "rooms",
            "color_var": "deal year",
            "size_var": "price_per_room",
            "limit": 10,
        },
    )
    assert rooms_facet_response["points"][0]["facet"] == "3"
    assert rooms_facet_response["points"][0]["color"] == "2020"
    assert rooms_facet_response["points"][0]["size"] == round(1.0 / 3, 3)

    price_type_response = build_analysis_deals_response(
        FakeStore(),
        {
            "city": "בדיקה",
            "streets": ["אלף"],
            "y_variable": "price_per_room",
            "price_type": "Price / m²",
            "limit": 10,
        },
    )
    assert price_type_response["summary"]["price_type"] == "Price / m²"
    assert price_type_response["points"][0]["y"] == 20

    nice_area_breaks = _nice_breaks(63.858, 105.15, 6, max_bins=6)
    assert nice_area_breaks == [60, 70, 80, 90, 100, 110]
    assert _bin_labels(nice_area_breaks) == ["60-70", "70-80", "80-90", "90-100", "100-110"]
    outlier_area_breaks = _nice_breaks_for_values(
        pd.Series([63.858, 66, 70.775, 77.65, 84.525, 98.275, 105.15] * 20 + [2700]),
        6,
        max_bins=6,
    )
    assert outlier_area_breaks == [60, 70, 80, 90, 100, 110, 2500, 3000]

    return {
        "counts": response["counts"],
        "summary": response["summary"],
        "point_keys": sorted(response["points"][0].keys()),
        "table_keys": sorted(response["table_rows"][0].keys()),
    }


def verify_compare_areas_helpers() -> dict[str, object]:
    class FakeStore:
        def __init__(self):
            self.frame = pd.DataFrame(
                {
                    "city": ["בדיקה"] * 8,
                    "street": ["אלף", "אלף", "בית", "בית", "גימל", "גימל", "דלת", "דלת"],
                    "Gush": [10, 10, 10, 10, 11, 11, 11, 11],
                    "deal year": [2020, 2020, 2021, 2021, 2020, 2020, 2021, 2021],
                    "price_millions": [1.0, 1.2, 1.4, 50.0, 2.0, 2.2, 2.4, 2.6],
                    "area": [50, 60, 70, 80, 100, 110, 120, 130],
                    "rooms": [2, 3, 3, 4, 4, 4, 5, 5],
                    "floor": [1, 2, 3, 4, 1, 2, 3, 4],
                    "roof": [False] * 8,
                    "apt type": ["דירה"] * 8,
                    "New_Project": ["2nd hand"] * 8,
                    "build_year": [2000] * 8,
                    "building age": [20] * 8,
                    "build_floors": [6] * 8,
                }
            )
            self.lookup = pd.DataFrame(
                {
                    "city": ["בדיקה", "בדיקה", "בדיקה", "בדיקה"],
                    "street": ["אלף", "בית", "גימל", "דלת"],
                    "Gush": [10, 10, 11, 11],
                }
            )
            self.descriptions = pd.DataFrame(
                {
                    "city": ["בדיקה", "בדיקה"],
                    "Gush": [10, 11],
                    "Gush_desc": ["גוש אלף", "גוש בית"],
                    "street": ["אלף", "גימל"],
                    "n": [4, 4],
                }
            )

        def load_metadata(self):
            return {"unique_gush_streets": self.lookup.copy(), "gush_descriptions": self.descriptions.copy()}

        def list_cities(self):
            return [{"id": "test_city", "name": "בדיקה", "rows": len(self.frame)}]

        def cities_for_gushes(self, gushes):
            return [{"id": "test_city", "name": "בדיקה", "rows": len(self.frame)}] if gushes else []

        def load_cities(self, cities):
            assert cities == ["test_city"]
            return self.frame.copy()

        def gush_details(self, gush_id):
            matches = self.descriptions[self.descriptions["Gush"] == int(gush_id)]
            return [
                {
                    "id": int(row["Gush"]),
                    "label": row["Gush_desc"],
                    "city": row["city"],
                    "representative_street": row["street"],
                    "deals": int(row["n"]),
                }
                for _, row in matches.iterrows()
            ]

        def gushes_for_city(self, city):
            return [{"id": 10, "label": "גוש אלף"}, {"id": 11, "label": "גוש בית"}]

    store = FakeStore()
    selection = resolve_compare_selection(store, {"city": "test_city", "streets": ["אלף", "גימל"]})
    assert selection["gush_ids"] == [10, 11]

    response = build_compare_summary_response(
        store,
        {
            "city": "test_city",
            "streets": ["אלף", "גימל"],
            "filters": {
                "deal_year_range": [2020, 2021],
                "rooms_select": [2, 3, 4, 5],
                "area_range": [40, 150],
                "floor_range": [0, 10],
                "roof_select": "both",
            },
            "remove_price_outliers": False,
            "y_variable": "price_per_m2",
            "show_city_comparison": True,
            "show_sp500": True,
        },
    )

    assert response["counts"]["unique_gushes"] == 2
    assert response["counts"]["summary_points"] == 4
    assert len(response["series"]) == 2
    assert response["table"][0]["city"] == "בדיקה"
    assert response["table"][0]["gush_label"].startswith("גוש")
    assert response["table"][0]["price_per_m2"] == 20
    assert response["table"][0]["y"] == 20
    assert response["overlays"]["city_comparison"]
    assert response["overlays"]["sp500"]
    assert "parquet" not in str(response)
    assert "source_root" not in str(response)

    too_many = {"gushes": list(range(1, 17))}
    try:
        build_compare_summary_response(store, too_many)
        raise AssertionError("Expected max Gush guardrail to reject 16 Gushes")
    except CompareAreasError as exc:
        assert "15" in exc.public_message

    return {
        "selection": selection["gush_ids"],
        "counts": response["counts"],
        "first_row": response["table"][0],
        "overlay_rows": {key: len(value) for key, value in response["overlays"].items()},
    }


def verify_city_comparison_helpers() -> dict[str, object]:
    class FakeStore:
        def __init__(self):
            self.frames = {
                "city_a": pd.DataFrame(
                    {
                        "city": ["עיר א"] * 5,
                        "street": ["אלף"] * 5,
                        "Gush": [1] * 5,
                        "deal year": [2020, 2020, 2021, 2021, 2027],
                        "price_millions": [1.0, 1.2, 1.4, 100.0, 9.0],
                        "area": [50, 60, 70, 80, 90],
                        "rooms": [2, 3, 3, 4, 5],
                        "floor": [1, 2, 3, 4, 5],
                        "roof": [False] * 5,
                        "apt type": ["דירה"] * 5,
                        "New_Project": ["2nd hand"] * 5,
                        "build_year": [2000] * 5,
                        "building age": [20] * 5,
                        "build_floors": [6] * 5,
                    }
                ),
                "city_b": pd.DataFrame(
                    {
                        "city": ["עיר ב"] * 4,
                        "street": ["בית"] * 4,
                        "Gush": [2] * 4,
                        "deal year": [2020, 2020, 2021, 2021],
                        "price_millions": [2.0, 2.2, 2.4, 2.6],
                        "area": [100, 110, 120, 130],
                        "rooms": [4, 4, 5, 5],
                        "floor": [1, 2, 3, 4],
                        "roof": [False] * 4,
                        "apt type": ["דירה"] * 4,
                        "New_Project": ["2nd hand"] * 4,
                        "build_year": [2000] * 4,
                        "building age": [20] * 4,
                        "build_floors": [6] * 4,
                    }
                ),
            }

        def list_cities(self):
            return [{"id": "city_a", "name": "עיר א"}, {"id": "city_b", "name": "עיר ב"}]

        def load_cities(self, cities):
            return pd.concat([self.frames[city] for city in cities], ignore_index=True)

    store = FakeStore()
    selection = resolve_city_comparison_selection(store, {"cities": ["city_a", "עיר ב", "city_a"]})
    assert [city["id"] for city in selection["cities"]] == ["city_a", "city_b"]

    response = build_city_comparison_summary_response(
        store,
        {
            "cities": ["city_a", "city_b"],
            "filters": {
                "deal_year_range": [2020, 2027],
                "rooms_select": [2, 3, 4, 5],
                "area_range": [40, 150],
                "floor_range": [0, 10],
                "roof_select": "both",
                "apartment_types": ["דירה"],
            },
            "remove_price_outliers": False,
            "y_variable": "price_per_room",
            "show_sp500": True,
        },
    )

    assert response["counts"]["unique_cities"] == 2
    assert response["counts"]["summary_points"] == 4
    assert response["counts"]["filtered_deals"] == 8
    assert len(response["series"]) == 2
    assert response["table"][0]["city"] == "עיר א"
    assert response["table"][0]["price_per_room"] == 0.45
    assert response["table"][0]["y"] == 0.45
    assert all(row["deal_year"] != 2027 for row in response["table"])
    assert response["overlays"]["sp500"]
    assert "parquet" not in str(response)
    assert "source_root" not in str(response)

    too_many_store = FakeStore()
    too_many_store.list_cities = lambda: [{"id": f"city_{i}", "name": f"עיר {i}"} for i in range(21)]
    try:
        build_city_comparison_summary_response(too_many_store, {})
        raise AssertionError("Expected max city guardrail to reject 21 cities")
    except CityComparisonError as exc:
        assert "20" in exc.public_message

    bad_y = {"cities": ["city_a"], "y_variable": "unknown"}
    try:
        build_city_comparison_summary_response(store, bad_y)
        raise AssertionError("Expected unsupported y variable to be rejected")
    except CityComparisonError:
        pass

    return {
        "selection": selection["cities"],
        "counts": response["counts"],
        "first_row": response["table"][0],
        "overlay_rows": {key: len(value) for key, value in response["overlays"].items()},
    }


def verify_gush_performance_helpers() -> dict[str, object]:
    def rows_for_gush(gush, yearly_prices, label_street):
        rows = []
        for year, price in yearly_prices.items():
            rows.extend(
                [
                    {
                        "city": "בדיקה",
                        "street": label_street,
                        "Gush": gush,
                        "deal year": year,
                        "price_millions": price,
                        "area": 100,
                        "rooms": 4,
                        "floor": 2,
                        "roof": False,
                        "apt type": "דירה",
                        "New_Project": "2nd hand",
                        "build_year": 2000,
                        "building age": 20,
                        "build_floors": 6,
                    },
                    {
                        "city": "בדיקה",
                        "street": label_street,
                        "Gush": gush,
                        "deal year": year,
                        "price_millions": price,
                        "area": 100,
                        "rooms": 4,
                        "floor": 3,
                        "roof": False,
                        "apt type": "דירה",
                        "New_Project": "2nd hand",
                        "build_year": 2000,
                        "building age": 20,
                        "build_floors": 6,
                    },
                ]
            )
        return rows

    class FakeStore:
        def __init__(self):
            rows = []
            rows.extend(rows_for_gush(10, {2020: 1.00, 2021: 1.10, 2022: 1.21}, "אלף"))
            rows.extend(rows_for_gush(11, {2020: 1.00, 2021: 0.90, 2022: 0.81}, "בית"))
            rows.extend(rows_for_gush(12, {2020: 1.00, 2021: 1.01, 2022: 1.02}, "גימל"))
            rows.append(
                {
                    "city": "בדיקה",
                    "street": "דלת",
                    "Gush": 13,
                    "deal year": 2020,
                    "price_millions": 1.0,
                    "area": 100,
                    "rooms": 4,
                    "floor": 2,
                    "roof": False,
                    "apt type": "דירה",
                    "New_Project": "2nd hand",
                    "build_year": 2000,
                    "building age": 20,
                    "build_floors": 6,
                }
            )
            rows.append({**rows[-1], "deal year": 2021, "price_millions": 1.2})
            self.frame = pd.DataFrame(rows)

        def list_cities(self):
            return [{"id": "test_city", "name": "בדיקה", "rows": len(self.frame)}]

        def load_city(self, city):
            assert city == "test_city"
            return self.frame.copy()

        def gushes_for_city(self, city):
            assert city == "test_city"
            return [
                {"id": 10, "label": "גוש עולה"},
                {"id": 11, "label": "גוש יורד"},
                {"id": 12, "label": "גוש מרכזי"},
                {"id": 13, "label": "גוש דל"},
            ]

    store = FakeStore()
    city = resolve_gush_performance_city(store, {"city": "בדיקה"})
    assert city == {"id": "test_city", "name": "בדיקה"}

    response = build_gush_performance_summary_response(
        store,
        {
            "city": "test_city",
            "filters": {
                "deal_year_range": [2020, 2022],
                "apartment_types": ["דירה"],
                "roof_select": "both",
            },
            "remove_price_outliers": False,
            "yvar": "price_millions",
            "top_count": 1,
            "typical_count": 1,
            "bottom_count": 1,
            "min_deals_per_gush": 2,
            "show_city": True,
            "show_sp500": True,
        },
    )

    selected = response["changes"]["selected"]
    assert [row["performance_group"] for row in selected] == ["top", "typical", "bottom"]
    assert selected[0]["gush"] == 10
    assert selected[1]["gush"] == 12
    assert selected[2]["gush"] == 11
    assert selected[0]["yearly_slope"] == 10
    assert selected[2]["yearly_slope"] == -10
    assert response["counts"]["qualified_gushes"] == 3
    assert response["counts"]["selected_gushes"] == 3
    assert len(response["series"]) == 3
    assert response["series"][0]["points"][1]["y"] == 1.1
    assert response["performance_table"][0]["price_change"] == 21
    assert response["performance_table"][0]["first_y"] == 1
    assert response["yearly_table"][0]["price_per_m2"] == 10
    assert response["overlays"]["city"]
    assert response["overlays"]["sp500"]
    assert "parquet" not in str(response)
    assert "source_root" not in str(response)

    empty = build_gush_performance_summary_response(
        store,
        {"city": "test_city", "remove_price_outliers": False, "min_deals_per_gush": 99},
    )
    assert empty["series"] == []
    assert empty["performance_table"] == []
    assert empty["counts"]["qualified_gushes"] == 0
    assert any("threshold" in warning for warning in empty["warnings"])

    app = create_app()
    app.extensions["nadlan2_data_store"] = store
    client = app.test_client()
    route_response = client.post(
        "/api/gush-performance/summary",
        json={
            "city": "test_city",
            "remove_price_outliers": False,
            "top_count": 1,
            "typical_count": 1,
            "bottom_count": 1,
            "min_deals_per_gush": 2,
        },
    )
    assert route_response.status_code == 200, route_response.data
    route_data = route_response.get_json()["data"]
    assert route_data["counts"]["selected_gushes"] == 3
    assert route_data["changes"]["selected"][0]["gush_label"] == "גוש עולה"

    bad_route_response = client.post("/api/gush-performance/summary", json={"city": "missing"})
    assert bad_route_response.status_code == 400
    bad_payload = bad_route_response.get_json()
    assert "Unknown city." in bad_payload["warnings"]
    assert "Traceback" not in str(bad_payload)

    try:
        build_gush_performance_summary_response(store, {"city": "test_city", "yvar": "unknown"})
        raise AssertionError("Expected unsupported y variable to be rejected")
    except GushPerformanceError:
        pass

    return {
        "city": city,
        "counts": response["counts"],
        "selected": [(row["gush"], row["performance_group"], row["yearly_slope"]) for row in selected],
        "first_yoy": selected[0]["yoy_changes"][1],
        "empty_counts": empty["counts"],
    }


def verify_download_helpers() -> dict[str, object]:
    class FakeStore:
        def __init__(self):
            self.frame = pd.DataFrame(
                {
                    "city": ["בדיקה"] * 8,
                    "street": ["אלף", "אלף", "בית", "בית", "גימל", "גימל", "דלת", "דלת"],
                    "Gush": [10, 10, 10, 10, 11, 11, 11, 11],
                    "GUSH": ["10-1", "10-2", "10-3", "10-4", "11-1", "11-2", "11-3", "11-4"],
                    "FULLADRESS": ["אלף 1", "אלף 2", "בית 1", "בית 2", "גימל 1", "גימל 2", "דלת 1", "דלת 2"],
                    "date": pd.to_datetime(
                        [
                            "2020-01-01",
                            "2020-02-01",
                            "2021-01-01",
                            "2021-02-01",
                            "2020-01-01",
                            "2020-02-01",
                            "2021-01-01",
                            "2027-01-01",
                        ]
                    ).date,
                    "deal year": [2020, 2020, 2021, 2021, 2020, 2020, 2021, 2027],
                    "price_millions": [1.0, 1.2, 1.4, 1.6, 2.0, 2.2, 2.4, 9.0],
                    "area": [50, 60, 70, 80, 100, 110, 120, 130],
                    "rooms": [2, 3, 3, 4, 4, 4, 5, 5],
                    "floor": [1, 2, 3, 4, 1, 2, 3, 4],
                    "roof": [True, "FALSE", "כן", "לא", None, False, True, True],
                    "apt type": ["דירה"] * 8,
                    "New_Project": ["2nd hand"] * 8,
                    "build_year": [2000] * 8,
                    "building age": [20] * 8,
                    "build_floors": [6] * 8,
                    "story": ["סיפור"] * 8,
                }
            )
            self.lookup = pd.DataFrame(
                {
                    "city": ["בדיקה", "בדיקה", "בדיקה", "בדיקה"],
                    "street": ["אלף", "בית", "גימל", "דלת"],
                    "Gush": [10, 10, 11, 11],
                }
            )
            self.descriptions = pd.DataFrame(
                {
                    "city": ["בדיקה", "בדיקה"],
                    "Gush": [10, 11],
                    "Gush_desc": ["גוש אלף", "גוש בית"],
                    "street": ["אלף", "גימל"],
                    "n": [4, 4],
                }
            )

        def load_metadata(self):
            return {"unique_gush_streets": self.lookup.copy(), "gush_descriptions": self.descriptions.copy()}

        def list_cities(self):
            return [{"id": "test_city", "name": "בדיקה", "rows": len(self.frame)}]

        def load_city(self, city):
            assert city == "test_city"
            return self.frame.copy()

        def load_cities(self, cities):
            assert cities == ["test_city"]
            return self.frame.copy()

        def cities_for_gushes(self, gushes):
            return [{"id": "test_city", "name": "בדיקה", "rows": len(self.frame)}] if gushes else []

        def gush_details(self, gush_id):
            matches = self.descriptions[self.descriptions["Gush"] == int(gush_id)]
            return [{"id": int(row["Gush"]), "label": row["Gush_desc"]} for _, row in matches.iterrows()]

        def gushes_for_city(self, city):
            assert city == "test_city"
            return [{"id": 10, "label": "גוש אלף"}, {"id": 11, "label": "גוש בית"}]

    store = FakeStore()
    request_payload = {
        "city": "test_city",
        "streets": ["אלף"],
        "filters": {"deal_year_range": [2020, 2021], "roof_select": "both"},
        "remove_price_outliers": False,
    }
    analysis = build_analysis_download(store, request_payload)
    analysis_csv = _read_download_csv(analysis)
    assert analysis["filename"] == "nadlan_analysis_deals.csv"
    assert analysis["row_count"] == 2
    assert analysis["content"].startswith("\ufeff")
    assert analysis_csv["City"].tolist() == ["בדיקה", "בדיקה"]
    assert analysis_csv["Street"].tolist() == ["אלף", "אלף"]
    assert analysis_csv["Roof"].tolist() == ["Yes", "No"]
    assert analysis_csv["Price Per M2"].tolist() == [20, 20]
    assert "Story" in analysis_csv.columns

    compare_raw = build_compare_raw_download(
        store,
        {"gushes": [10], "filters": {"deal_year_range": [2020, 2021]}, "remove_price_outliers": False},
    )
    assert _read_download_csv(compare_raw)["Gush"].tolist() == [10, 10, 10, 10]

    compare_summary = build_compare_summary_download(
        store,
        {"gushes": [10], "filters": {"deal_year_range": [2020, 2021]}, "remove_price_outliers": False},
    )
    compare_summary_csv = _read_download_csv(compare_summary)
    assert compare_summary_csv["Gush Label"].iloc[0] == "גוש אלף"
    assert compare_summary_csv["Deals"].tolist() == [2, 2]

    city_raw = build_city_comparison_raw_download(
        store,
        {"cities": ["test_city"], "filters": {"deal_year_range": [2020, 2027]}, "remove_price_outliers": False},
    )
    assert 2027 not in _read_download_csv(city_raw)["Deal Year"].tolist()

    city_summary = build_city_comparison_summary_download(
        store,
        {"cities": ["test_city"], "filters": {"deal_year_range": [2020, 2021]}, "remove_price_outliers": False},
    )
    assert _read_download_csv(city_summary)["City"].iloc[0] == "בדיקה"

    gush_raw = build_gush_performance_raw_download(
        store,
        {"city": "test_city", "filters": {"deal_year_range": [2020, 2021]}, "remove_price_outliers": False},
    )
    assert _read_download_csv(gush_raw)["Full Address"].iloc[0] == "אלף 1"

    gush_summary = build_gush_performance_summary_download(
        store,
        {
            "city": "test_city",
            "filters": {"deal_year_range": [2020, 2021]},
            "remove_price_outliers": False,
            "min_deals_per_gush": 1,
            "top_count": 1,
            "typical_count": 0,
            "bottom_count": 1,
        },
    )
    assert set(_read_download_csv(gush_summary)["Performance Group"]) == {"top", "bottom"}

    app = create_app()
    app.extensions["nadlan2_data_store"] = store
    client = app.test_client()
    route_response = client.post("/api/download/analysis", json=request_payload)
    assert route_response.status_code == 200, route_response.data
    assert route_response.headers["Content-Disposition"] == 'attachment; filename="nadlan_analysis_deals.csv"'
    assert route_response.headers["X-Row-Count"] == "2"
    assert "בדיקה" in route_response.get_data(as_text=True)

    bad_route_response = client.post("/api/download/analysis", json={})
    assert bad_route_response.status_code == 400
    bad_payload = bad_route_response.get_json()
    assert "At least one city or Gush is required." in bad_payload["warnings"]
    assert "Traceback" not in str(bad_payload)

    return {
        "analysis_columns": analysis["columns"],
        "analysis_rows": analysis["row_count"],
        "compare_summary_rows": compare_summary["row_count"],
        "city_raw_rows_without_2027": city_raw["row_count"],
        "gush_summary_groups": sorted(set(_read_download_csv(gush_summary)["Performance Group"])),
        "assumption": "Legacy Shiny filenames/column order were unavailable; verifier checks stable English export names.",
    }


def _read_download_csv(download: dict[str, object]) -> pd.DataFrame:
    return pd.read_csv(StringIO(str(download["content"]).lstrip("\ufeff")))


def verify_real_city_services(data_store, client) -> dict[str, object]:
    tel_aviv = data_store.load_city("tel_aviv_yafo")
    filtered = apply_common_filters(
        tel_aviv,
        {
            "deal_year_range": [2020, 2022],
            "floor_range": [0, 40],
            "rooms_select": [3, 4],
            "building_floors_range": [1, 60],
            "roof_select": "both",
        },
    )
    cleaned = remove_price_outliers_by_year(filtered)
    summary = summary_by_city_year(cleaned)

    assert len(filtered) > 0
    assert len(cleaned) > 0
    assert len(summary) > 0
    assert "תל אביב" in str(summary["city"].iloc[0])

    first = summary.sort_values("deal year").iloc[0]
    options_response = client.post(
        "/api/filter-options",
        json={"city": "tel_aviv_yafo", "gushes": ["6107"], "streets": ["הרב הרצוג"]},
    )
    assert options_response.status_code == 200, options_response.data
    options = options_response.get_json()["data"]
    assert options["counts"]["before_outlier_removal"] > 0
    assert options["counts"]["after_outlier_removal"] > 0
    assert options["ranges"]["floor"]["max"] != 999

    analysis_response = client.post(
        "/api/analysis/deals",
        json={
            "city": "tel_aviv_yafo",
            "streets": ["הרב הרצוג"],
            "filters": {
                "deal_year_range": [1998, 2024],
                "rooms_select": [3, 4],
                "area_range": [40, 180],
                "floor_range": [0, 40],
                "roof_select": "both",
                "building_floors_range": [1, 60],
            },
            "price_type": "Price",
            "color_var": "apt type",
            "shape_var": "New_Project",
            "size_var": "area",
            "show_sp500": True,
            "show_city_comparison": True,
            "limit": 50,
            "sample_seed": 42,
        },
    )
    assert analysis_response.status_code == 200, analysis_response.data
    analysis = analysis_response.get_json()["data"]
    assert analysis["counts"]["city_rows"] == len(tel_aviv)
    assert analysis["counts"]["location_rows"] > 0
    assert analysis["counts"]["filtered_rows"] > 0
    assert 0 < analysis["counts"]["returned_rows"] <= 50
    assert analysis["summary"]["deals"] == analysis["counts"]["filtered_rows"]
    assert analysis["points"][0]["date"]
    assert analysis["points"][0]["tooltip"]
    assert analysis["table_rows"][0]["city"] == "תל אביב -יפו"
    assert analysis["overlays"]["city_comparison"]
    assert analysis["overlays"]["sp500"]
    assert "parquet" not in str(analysis)
    assert "source_root" not in str(analysis)

    compare_response = client.post(
        "/api/compare/summary",
        json={
            "gushes": ["6107"],
            "filters": {
                "deal_year_range": [1998, 2024],
                "rooms_select": [3, 4],
                "area_range": [40, 180],
                "floor_range": [0, 40],
                "roof_select": "both",
                "building_floors_range": [1, 60],
            },
            "y_variable": "price_millions",
            "show_city_comparison": True,
            "show_sp500": True,
        },
    )
    assert compare_response.status_code == 200, compare_response.data
    compare = compare_response.get_json()["data"]
    assert compare["counts"]["unique_gushes"] == 1
    assert compare["counts"]["filtered_deals"] > 0
    assert compare["counts"]["summary_points"] > 0
    assert compare["series"]
    assert compare["table"]
    assert compare["table"][0]["city"] == "תל אביב -יפו"
    assert compare["overlays"]["city_comparison"]
    assert compare["overlays"]["sp500"]
    assert "parquet" not in str(compare)
    assert "source_root" not in str(compare)

    compare_raw_response = client.post("/api/compare/raw", json={"gushes": ["6107"], "filters": {"deal_year_range": [2020, 2024]}})
    assert compare_raw_response.status_code == 200, compare_raw_response.data
    compare_raw = compare_raw_response.get_json()["data"]
    assert compare_raw["rows"]
    assert "price_millions" in compare_raw["rows"][0]

    city_comparison_response = client.post(
        "/api/city-comparison/summary",
        json={
            "cities": ["tel_aviv_yafo", "jerusalem", "haifa"],
            "filters": {
                "deal_year_range": [2020, 2024],
                "rooms_select": [3, 4],
                "area_range": [40, 180],
                "floor_range": [0, 40],
                "roof_select": "both",
                "building_floors_range": [1, 60],
            },
            "remove_price_outliers": True,
            "y_variable": "price_per_m2",
            "show_sp500": True,
        },
    )
    assert city_comparison_response.status_code == 200, city_comparison_response.data
    city_comparison = city_comparison_response.get_json()["data"]
    assert city_comparison["counts"]["unique_cities"] == 3
    assert city_comparison["counts"]["filtered_deals"] > 0
    assert city_comparison["counts"]["summary_points"] > 0
    assert len(city_comparison["series"]) == 3
    assert city_comparison["table"]
    assert city_comparison["table"][0]["city"] in {"חיפה", "ירושלים", "תל אביב -יפו"}
    assert city_comparison["table"][0]["price_per_m2"] is not None
    assert city_comparison["table"][0]["y"] == city_comparison["table"][0]["price_per_m2"]
    assert city_comparison["overlays"]["sp500"]
    assert "parquet" not in str(city_comparison)
    assert "source_root" not in str(city_comparison)

    city_comparison_raw_response = client.post(
        "/api/city-comparison/raw",
        json={"cities": ["tel_aviv_yafo", "jerusalem"], "filters": {"deal_year_range": [2021, 2022]}},
    )
    assert city_comparison_raw_response.status_code == 200, city_comparison_raw_response.data
    city_comparison_raw = city_comparison_raw_response.get_json()["data"]
    assert city_comparison_raw["rows"]
    assert "price_per_room" in city_comparison_raw["rows"][0]

    gush_performance_response = client.post(
        "/api/gush-performance/summary",
        json={
            "city": "tel_aviv_yafo",
            "filters": {
                "deal_year_range": [2020, 2024],
                "rooms_select": [3, 4],
                "area_range": [40, 180],
                "floor_range": [0, 40],
                "roof_select": "both",
                "building_floors_range": [1, 60],
            },
            "remove_price_outliers": True,
            "yvar": "price_per_m2",
            "top_count": 2,
            "typical_count": 1,
            "bottom_count": 2,
            "min_deals_per_gush": 5,
            "show_city": True,
            "show_sp500": True,
        },
    )
    assert gush_performance_response.status_code == 200, gush_performance_response.data
    gush_performance = gush_performance_response.get_json()["data"]
    assert gush_performance["counts"]["filtered_deals"] > 0
    assert gush_performance["counts"]["summary_points"] > 0
    assert gush_performance["counts"]["qualified_gushes"] > 0
    assert gush_performance["series"]
    assert gush_performance["performance_table"]
    assert gush_performance["changes"]["selected"]
    assert gush_performance["performance_table"][0]["city"] == "תל אביב -יפו"
    assert gush_performance["performance_table"][0]["last_y"] is not None
    assert gush_performance["overlays"]["city"]
    assert gush_performance["overlays"]["sp500"]
    assert "parquet" not in str(gush_performance)
    assert "source_root" not in str(gush_performance)

    download_response = client.post(
        "/api/download/analysis",
        json={
            "city": "tel_aviv_yafo",
            "streets": ["הרב הרצוג"],
            "filters": {
                "deal_year_range": [2020, 2024],
                "rooms_select": [3, 4],
                "area_range": [40, 180],
                "floor_range": [0, 40],
                "roof_select": "both",
                "building_floors_range": [1, 60],
            },
            "remove_price_outliers": True,
        },
    )
    assert download_response.status_code == 200, download_response.data
    assert download_response.headers["Content-Disposition"] == 'attachment; filename="nadlan_analysis_deals.csv"'
    assert int(download_response.headers["X-Row-Count"]) > 0
    download_text = download_response.get_data(as_text=True)
    assert download_text.startswith("\ufeff")
    assert "תל אביב -יפו" in download_text
    assert "parquet" not in download_text
    assert "source_root" not in download_text

    return {
        "city": first["city"],
        "filtered_rows": len(filtered),
        "after_price_outliers": len(cleaned),
        "api_filter_option_rows": options["counts"]["before_outlier_removal"],
        "api_floor_range": options["ranges"]["floor"],
        "api_smart_rooms": options["rooms"]["smart_selected"],
        "summary_years": summary["deal year"].astype(int).tolist(),
        "first_year": int(first["deal year"]),
        "first_year_deals": int(first["n_deals"]),
        "first_year_median_price": round(float(first["price_millions"]), 3),
        "analysis_counts": analysis["counts"],
        "analysis_summary": analysis["summary"],
        "analysis_first_point": analysis["points"][0],
        "analysis_overlay_rows": {
            "sp500": len(analysis["overlays"]["sp500"]),
            "city_comparison": len(analysis["overlays"]["city_comparison"]),
        },
        "compare_counts": compare["counts"],
        "compare_first_row": compare["table"][0],
        "compare_overlay_rows": {
            "sp500": len(compare["overlays"]["sp500"]),
            "city_comparison": len(compare["overlays"]["city_comparison"]),
        },
        "city_comparison_counts": city_comparison["counts"],
        "city_comparison_first_row": city_comparison["table"][0],
        "city_comparison_overlay_rows": {
            "sp500": len(city_comparison["overlays"]["sp500"]),
        },
        "gush_performance_counts": gush_performance["counts"],
        "gush_performance_first_selected": gush_performance["changes"]["selected"][0],
        "gush_performance_first_row": gush_performance["performance_table"][0],
        "gush_performance_overlay_rows": {
            "city": len(gush_performance["overlays"]["city"]),
            "sp500": len(gush_performance["overlays"]["sp500"]),
        },
        "download_analysis_rows": int(download_response.headers["X-Row-Count"]),
        "download_analysis_filename": download_response.headers["Content-Disposition"],
    }


if __name__ == "__main__":
    raise SystemExit(main())
