from __future__ import annotations

from io import StringIO
from typing import Any, Dict, List, Mapping, Optional, Sequence

import pandas as pd

from .analysis_deals import DISPLAY_COLUMNS
from .calculations import (
    apply_common_filters,
    price_used,
    remove_outliers_from_var,
    remove_price_outliers_global_iqr,
    remove_price_outliers_by_year,
)
from .city_comparison import build_city_comparison_summary_response, resolve_city_comparison_selection
from .compare_areas import build_compare_summary_response, resolve_compare_selection
from .data_store import DataStore
from .gush_performance import build_gush_performance_summary_response, resolve_gush_performance_city


LOCATION_FILTER_KEYS = {"cities", "city", "city_ids", "streets", "street", "gushes", "gush", "gush_select", "Gush"}

RAW_COLUMN_NAMES = {
    "city": "City",
    "street": "Street",
    "Gush": "Gush",
    "GUSH": "Gush Code",
    "FULLADRESS": "Full Address",
    "date": "Date",
    "deal year": "Deal Year",
    "price_millions": "Price Millions",
    "price_per_m2": "Price Per M2",
    "price_per_room": "Price Per Room",
    "area": "Area",
    "rooms": "Rooms",
    "floor": "Floor",
    "roof": "Roof",
    "apt type": "Apartment Type",
    "New_Project": "New Project",
    "build_year": "Build Year",
    "building age": "Building Age",
    "build_floors": "Building Floors",
    "story": "Story",
}

SUMMARY_COLUMN_NAMES = {
    "city": "City",
    "city_label": "City Label",
    "gush": "Gush",
    "gush_key": "Gush Key",
    "gush_label": "Gush Label",
    "series_id": "Series ID",
    "series_label": "Series Label",
    "deal_year": "Deal Year",
    "date": "Date",
    "n_deals": "Deals",
    "price_millions": "Price Millions",
    "price_per_m2": "Price Per M2",
    "price_per_room": "Price Per Room",
    "y": "Selected Value",
    "performance_group": "Performance Group",
    "rank": "Rank",
    "position_in_group": "Position In Group",
    "price_change": "Price Change %",
    "yearly_slope": "Annualized YoY Change %",
    "first_year": "First Year",
    "last_year": "Last Year",
    "years_span": "Years Span",
    "first_y": "First Selected Value",
    "last_y": "Last Selected Value",
    "median_deals_per_year": "Median Deals Per Year",
    "total_deals": "Total Deals",
    "y_variable": "Y Variable",
}


class DownloadError(Exception):
    def __init__(self, public_message: str):
        super().__init__(public_message)
        self.public_message = public_message


def build_analysis_download(data_store: DataStore, payload: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    request_payload = _request_payload(payload)
    rows = _analysis_raw_rows(data_store, request_payload)
    return _download_payload(rows, filename="nadlan_analysis_deals.csv", column_names=RAW_COLUMN_NAMES)


def build_compare_raw_download(data_store: DataStore, payload: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    request_payload = _request_payload(payload)
    selection = resolve_compare_selection(data_store, request_payload)
    city_frame = data_store.load_cities(selection["city_ids"])
    selected = apply_common_filters(city_frame, {"gushes": selection["gush_ids"]})
    filtered = apply_common_filters(selected, _non_location_filters(request_payload.get("filters")))
    if _remove_price_outliers(request_payload):
        filtered = remove_price_outliers_global_iqr(filtered)
    rows = _raw_rows(_with_price_calculations(filtered), include_story=True)
    return _download_payload(rows, filename="nadlan_compare_raw.csv", column_names=RAW_COLUMN_NAMES)


def build_compare_summary_download(data_store: DataStore, payload: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    response = build_compare_summary_response(data_store, _request_payload(payload))
    return _download_payload(
        response["table"],
        filename="nadlan_compare_summary.csv",
        column_names=SUMMARY_COLUMN_NAMES,
    )


def build_city_comparison_raw_download(data_store: DataStore, payload: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    request_payload = _request_payload(payload)
    selection = resolve_city_comparison_selection(data_store, request_payload)
    city_frame = data_store.load_cities([city["id"] for city in selection["cities"]])
    filtered = apply_common_filters(city_frame, _non_location_filters(request_payload.get("filters")))
    if _remove_price_outliers(request_payload):
        filtered = remove_price_outliers_global_iqr(filtered)
    rows = _raw_rows(_with_price_calculations(filtered), include_story=True)
    return _download_payload(rows, filename="nadlan_city_comparison_raw.csv", column_names=RAW_COLUMN_NAMES)


def build_city_comparison_summary_download(data_store: DataStore, payload: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    response = build_city_comparison_summary_response(data_store, _request_payload(payload))
    return _download_payload(
        response["table"],
        filename="nadlan_city_comparison_summary.csv",
        column_names=SUMMARY_COLUMN_NAMES,
    )


def build_gush_performance_raw_download(data_store: DataStore, payload: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    request_payload = _request_payload(payload)
    city = resolve_gush_performance_city(data_store, request_payload)
    city_frame = data_store.load_city(city["id"])
    filtered = apply_common_filters(city_frame, _non_city_filters(request_payload.get("filters")))
    if _remove_price_outliers(request_payload):
        filtered = remove_price_outliers_global_iqr(filtered)
        filtered = remove_outliers_from_var(filtered, "area")
    rows = _raw_rows(_with_price_calculations(filtered), include_story=True)
    return _download_payload(rows, filename="nadlan_gush_performance_raw.csv", column_names=RAW_COLUMN_NAMES)


def build_gush_performance_summary_download(data_store: DataStore, payload: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    response = build_gush_performance_summary_response(data_store, _request_payload(payload))
    return _download_payload(
        response["performance_table"],
        filename="nadlan_gush_performance_summary.csv",
        column_names=SUMMARY_COLUMN_NAMES,
    )


def _analysis_raw_rows(data_store: DataStore, payload: Mapping[str, Any]) -> List[Dict[str, Any]]:
    cities = _selected_analysis_cities(data_store, payload)
    if not cities:
        raise DownloadError("At least one city or Gush is required.")
    city_frame = data_store.load_cities(cities)
    filtered = apply_common_filters(city_frame, _location_filters(payload))
    filtered = apply_common_filters(filtered, _non_location_filters(payload.get("filters")))
    filtered = _apply_analysis_outlier_filters(filtered, payload)
    return _raw_rows(_with_price_calculations(filtered), include_story=True)


def _selected_analysis_cities(data_store: DataStore, payload: Mapping[str, Any]) -> List[str]:
    selected = _as_list(_first_present(payload, "cities", "city"))
    cities = [str(value).strip() for value in selected if str(value).strip()]
    if cities:
        return cities
    gushes = _as_list(_first_present(payload, "gushes", "gush", "gush_select", "Gush"))
    return [city["id"] for city in data_store.cities_for_gushes(gushes)]


def _location_filters(payload: Mapping[str, Any]) -> Dict[str, Any]:
    filters: Dict[str, Any] = {}
    for target, keys in {
        "streets": ("streets", "street"),
        "gushes": ("gushes", "gush", "gush_select", "Gush"),
    }.items():
        values = _as_list(_first_present(payload, *keys))
        if values:
            filters[target] = values
    return filters


def _non_location_filters(filters: Any) -> Dict[str, Any]:
    if not isinstance(filters, Mapping):
        return {}
    return {key: value for key, value in filters.items() if key not in LOCATION_FILTER_KEYS}


def _non_city_filters(filters: Any) -> Dict[str, Any]:
    if not isinstance(filters, Mapping):
        return {}
    return {key: value for key, value in filters.items() if key not in {"cities", "city", "city_ids"}}


def _apply_analysis_outlier_filters(df: pd.DataFrame, payload: Mapping[str, Any]) -> pd.DataFrame:
    filters = payload.get("filters") if isinstance(payload.get("filters"), Mapping) else {}
    remove_price = _first_present(payload, "remove_price_outliers")
    if remove_price is None and isinstance(filters, Mapping):
        remove_price = _first_present(filters, "remove_price_outliers")
    if remove_price is not False:
        df = remove_price_outliers_by_year(df)

    remove_area = _first_present(payload, "remove_area_outliers")
    if remove_area is None and isinstance(filters, Mapping):
        remove_area = _first_present(filters, "remove_area_outliers")
    if remove_area is True:
        df = remove_outliers_from_var(df, "area")
    return df


def _with_price_calculations(df: pd.DataFrame) -> pd.DataFrame:
    working = df.copy()
    working["price_per_m2"] = price_used(working, "Price / m²")
    working["price_per_room"] = price_used(working, "Price / Room")
    return working


def _raw_rows(df: pd.DataFrame, *, include_story: bool) -> List[Dict[str, Any]]:
    columns = [column for column in DISPLAY_COLUMNS + ["price_per_m2", "price_per_room"] if column in df.columns]
    if include_story and "story" in df.columns:
        columns.append("story")
    if "date" in df.columns:
        working = df.copy()
        working["_download_date_sort"] = pd.to_datetime(working["date"], errors="coerce")
        working = working.sort_values(["_download_date_sort"], kind="mergesort").drop(columns=["_download_date_sort"])
    else:
        working = df
    return [_normalize_row(row) for row in working[columns].to_dict(orient="records")]


def _download_payload(
    rows: Sequence[Mapping[str, Any]],
    *,
    filename: str,
    column_names: Mapping[str, str],
) -> Dict[str, Any]:
    normalized_rows = [_normalize_row(row) for row in rows]
    frame = pd.DataFrame(normalized_rows)
    if frame.empty:
        frame = pd.DataFrame(columns=list(column_names.values()))
    else:
        ordered_columns = [column for column in column_names if column in frame.columns]
        ordered_columns.extend(column for column in frame.columns if column not in ordered_columns)
        frame = frame[ordered_columns].rename(columns=column_names)

    output = StringIO()
    # UTF-8 BOM keeps Hebrew readable in spreadsheet apps that guess encodings.
    output.write("\ufeff")
    frame.to_csv(output, index=False)
    return {
        "filename": filename,
        "content": output.getvalue(),
        "content_type": "text/csv; charset=utf-8",
        "row_count": int(len(frame)),
        "columns": [str(column) for column in frame.columns],
    }


def _normalize_row(row: Mapping[str, Any]) -> Dict[str, Any]:
    return {str(key): _normalize_value(key, value) for key, value in row.items()}


def _normalize_value(key: Any, value: Any) -> Any:
    if str(key) == "roof":
        return _normalize_roof(value)
    if isinstance(value, pd.Timestamp):
        return value.date().isoformat()
    if hasattr(value, "isoformat") and not isinstance(value, str):
        return value.isoformat()
    try:
        if value is None or pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(value, "item"):
        try:
            value = value.item()
        except (TypeError, ValueError):
            pass
    if isinstance(value, float):
        if pd.isna(value):
            return None
        if value.is_integer():
            return int(value)
        return round(value, 3)
    return value


def _normalize_roof(value: Any) -> Optional[str]:
    try:
        if value is None or pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, bool):
        return "Yes" if value else "No"
    text = str(value).strip().casefold()
    if text in {"true", "t", "yes", "y", "1", "כן"}:
        return "Yes"
    if text in {"false", "f", "no", "n", "0", "לא"}:
        return "No"
    return None


def _remove_price_outliers(payload: Mapping[str, Any]) -> bool:
    value = _first_present(payload, "remove_price_outliers")
    filters = payload.get("filters")
    if value is None and isinstance(filters, Mapping):
        value = _first_present(filters, "remove_price_outliers")
    return value is not False


def _request_payload(payload: Optional[Mapping[str, Any]]) -> Mapping[str, Any]:
    if payload is None:
        return {}
    if not isinstance(payload, Mapping):
        raise DownloadError("Request body must be a JSON object.")
    return payload


def _first_present(values: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in values and values[key] is not None:
            return values[key]
    filters = values.get("filters")
    if isinstance(filters, Mapping):
        for key in keys:
            if key in filters and filters[key] is not None:
                return filters[key]
    return None


def _as_list(value: Any) -> List[Any]:
    if value is None:
        return []
    if isinstance(value, (str, bytes)):
        return [value]
    if isinstance(value, Sequence):
        return list(value)
    return [value]
