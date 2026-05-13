from __future__ import annotations

import math
from typing import Any, Dict, List, Mapping, Optional, Sequence

import pandas as pd

from .calculations import (
    PRICE_TYPE_M2,
    PRICE_TYPE_PRICE,
    PRICE_TYPE_ROOM,
    apply_common_filters,
    price_used,
    remove_outliers_from_var,
    remove_price_outliers_by_year,
    sp500_normalized,
    summary_by_city_year,
)
from .data_store import DataStore


DEFAULT_LIMIT = 2000
MAX_LIMIT = 5000
MAX_CATEGORY_VALUES = 30

DISPLAY_COLUMNS = [
    "city",
    "street",
    "Gush",
    "FULLADRESS",
    "date",
    "deal year",
    "price_millions",
    "area",
    "rooms",
    "floor",
    "roof",
    "apt type",
    "New_Project",
    "build_year",
    "building age",
    "build_floors",
]

SAFE_AESTHETIC_COLUMNS = set(DISPLAY_COLUMNS) | {"GUSH", "PriceUsed", "price_per_m2", "price_per_room"}
LOCATION_FILTER_KEYS = {"cities", "city", "streets", "street", "gushes", "gush", "gush_select", "Gush"}
PRICE_COLUMN_BY_TYPE = {
    PRICE_TYPE_PRICE: "price_millions",
    PRICE_TYPE_M2: "price_per_m2",
    PRICE_TYPE_ROOM: "price_per_room",
}


class AnalysisDealsError(Exception):
    def __init__(self, public_message: str):
        super().__init__(public_message)
        self.public_message = public_message


def build_analysis_deals_response(data_store: DataStore, payload: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    request_payload = payload or {}
    if not isinstance(request_payload, Mapping):
        raise AnalysisDealsError("Request body must be a JSON object.")

    warnings: List[str] = []
    selected_cities = _selected_cities(data_store, request_payload)
    if not selected_cities:
        raise AnalysisDealsError("At least one city or Gush is required.")

    limit = _coerce_limit(request_payload.get("limit"))
    sample_seed = _safe_int(request_payload.get("sample_seed"))
    price_type = _price_type(_first_present(request_payload, "price_type", "y_variable"))

    city_frame = data_store.load_cities(selected_cities)
    city_rows = int(len(city_frame))

    location_frame = apply_common_filters(city_frame, _location_filters(request_payload))
    location_rows = int(len(location_frame))

    filtered = apply_common_filters(location_frame, _non_location_filters(request_payload.get("filters")))
    pre_outlier_rows = int(len(filtered))
    filtered = _apply_requested_outlier_filters(filtered, request_payload, warnings)
    outlier_rows = int(len(filtered))

    prepared = _with_display_calculations(filtered, price_type)
    prepared = prepared.loc[pd.to_numeric(prepared["PriceUsed"], errors="coerce").notna()].copy()
    filtered_rows = int(len(prepared))

    if prepared.empty:
        warnings.append("No matching transactions were found.")

    aesthetic_columns = _requested_aesthetic_columns(request_payload)
    aesthetic_labels: Dict[str, str] = {}
    prepared = _with_plot_aesthetic_processing(data_store, prepared, aesthetic_columns, aesthetic_labels, warnings)
    filtered_rows = int(len(prepared))

    sampled, sampled_flag = _sample_for_response(prepared, limit=limit, sample_seed=sample_seed)
    if sampled_flag:
        warnings.append(f"Returned a deterministic sample of {len(sampled)} deals from {len(prepared)} matching deals.")

    warnings.extend(_category_warnings(prepared, aesthetic_columns, aesthetic_labels))

    points = _point_rows(sampled, aesthetic_columns)
    table_rows = _table_rows(sampled)
    summary = _summary_stats(prepared, price_type)
    overlays, overlay_warnings = _overlays(
        city_frame,
        request_payload,
        price_type=price_type,
        selected_deals=prepared,
    )
    warnings.extend(overlay_warnings)

    return _json_ready(
        {
            "points": points,
            "table_rows": table_rows,
            "summary": summary,
            "counts": {
                "city_rows": city_rows,
                "location_rows": location_rows,
                "pre_outlier_rows": pre_outlier_rows,
                "outlier_rows": outlier_rows,
                "filtered_rows": filtered_rows,
                "returned_rows": len(points),
            },
            "overlays": overlays,
            "warnings": warnings,
        }
    )


def _selected_cities(data_store: DataStore, payload: Mapping[str, Any]) -> List[str]:
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


def _apply_requested_outlier_filters(df: pd.DataFrame, payload: Mapping[str, Any], warnings: List[str]) -> pd.DataFrame:
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
        before = len(df)
        df = remove_outliers_from_var(df, "area")
        if len(df) < before:
            warnings.append(f"Removed {before - len(df)} area outlier deals.")
    return df


def _with_display_calculations(df: pd.DataFrame, price_type: str) -> pd.DataFrame:
    working = df.copy()
    working["PriceUsed"] = price_used(working, price_type)
    working["price_per_m2"] = price_used(working, PRICE_TYPE_M2)
    working["price_per_room"] = price_used(working, PRICE_TYPE_ROOM)
    working["_deal_id"] = [f"deal-{index}" for index in working.index]
    if "date" in working.columns:
        working["_date_sort"] = pd.to_datetime(working["date"], errors="coerce")
    else:
        working["_date_sort"] = pd.NaT
    return working.sort_values(["_date_sort", "_deal_id"], kind="mergesort").reset_index(drop=True)


def _sample_for_response(df: pd.DataFrame, *, limit: int, sample_seed: Optional[int]) -> tuple[pd.DataFrame, bool]:
    if len(df) <= limit:
        return df.copy(), False
    sample = df.sample(n=limit, random_state=sample_seed if sample_seed is not None else 1)
    return sample.sort_values(["_date_sort", "_deal_id"], kind="mergesort").reset_index(drop=True), True


def _requested_aesthetic_columns(payload: Mapping[str, Any]) -> Dict[str, str]:
    result: Dict[str, str] = {}
    for response_key, payload_key in {
        "color": "color_var",
        "shape": "shape_var",
        "size": "size_var",
        "facet": "facet_var",
    }.items():
        column = payload.get(payload_key)
        if isinstance(column, str) and column in SAFE_AESTHETIC_COLUMNS:
            result[response_key] = column
    return result


def _with_plot_aesthetic_processing(
    data_store: DataStore,
    df: pd.DataFrame,
    aesthetic_columns: Dict[str, str],
    aesthetic_labels: Dict[str, str],
    warnings: List[str],
) -> pd.DataFrame:
    if df.empty:
        return df

    working = df.copy()
    descriptions = _gush_description_lookup(data_store)
    for response_key in ("color", "shape", "facet"):
        column = aesthetic_columns.get(response_key)
        if not column or column not in working.columns:
            continue

        if response_key == "facet":
            before = len(working)
            working = working.loc[~working[column].map(_is_unknown_facet_value)].copy()
            removed = before - len(working)
            if removed:
                warnings.append(f"Removed {removed} deals with unknown {column} facet values.")
            if working.empty:
                return working

        processed = _processed_aesthetic_series(working, column, response_key, descriptions)
        if processed is not None:
            processed_column = f"_{response_key}_processed"
            working[processed_column] = processed
            aesthetic_labels[processed_column] = column
            aesthetic_columns[response_key] = processed_column
    return working


def _processed_aesthetic_series(
    df: pd.DataFrame,
    column: str,
    response_key: str,
    descriptions: Mapping[tuple[Any, Optional[int]], Any],
) -> Optional[pd.Series]:
    if column == "Gush":
        if descriptions:
            labels = []
            for _, row in df.iterrows():
                key = (_display_value(row.get("city")), _safe_int(row.get("Gush")))
                labels.append(descriptions.get(key) or _display_value(row.get("Gush")))
            return pd.Series(labels, index=df.index, dtype="object")
        return df[column].map(_display_value)

    numeric = pd.to_numeric(df[column], errors="coerce")
    if numeric.notna().all():
        unique_values = sorted(numeric.dropna().unique().tolist())
        discrete_limit = 8 if response_key == "color" else 5
        if column in {"rooms", "floor", "build_floors"} or len(unique_values) <= discrete_limit:
            return numeric.map(_compact_number).astype("object")
        max_bins = 8 if response_key == "color" else 6
        bin_count = min(max_bins, max(3, len(unique_values) // 2))
        try:
            breaks = _nice_breaks_for_values(numeric, bin_count, max_bins=max_bins)
            labels = _bin_labels(breaks)
            binned = pd.cut(
                numeric,
                bins=breaks,
                labels=labels,
                include_lowest=True,
                right=False,
                duplicates="drop",
            )
            return binned.astype("object")
        except ValueError:
            return numeric.map(_compact_number).astype("object")

    return df[column].map(_display_value)


def _gush_description_lookup(data_store: DataStore) -> Dict[tuple[Any, Optional[int]], Any]:
    if not hasattr(data_store, "load_metadata"):
        return {}
    try:
        descriptions = data_store.load_metadata().get("gush_descriptions")
    except Exception:
        return {}
    if not isinstance(descriptions, pd.DataFrame) or not {"city", "Gush", "Gush_desc"}.issubset(descriptions.columns):
        return {}
    lookup: Dict[tuple[Any, Optional[int]], Any] = {}
    for _, row in descriptions.iterrows():
        city = _display_value(row.get("city"))
        gush = _safe_int(row.get("Gush"))
        label = _display_value(row.get("Gush_desc"))
        if city and gush is not None and label:
            lookup[(city, gush)] = label
    return lookup


def _is_unknown_facet_value(value: Any) -> bool:
    if value is None:
        return False
    try:
        if pd.isna(value):
            return False
    except (TypeError, ValueError):
        pass
    text = str(value).strip()
    return text == "999" or text == "999.0"


def _format_interval(value: Any) -> Any:
    if pd.isna(value):
        return None
    if hasattr(value, "left") and hasattr(value, "right"):
        return f"{_compact_number(value.left)}-{_compact_number(value.right)}"
    return _display_value(value)


def _nice_breaks_for_values(values: pd.Series, target_bins: int, *, max_bins: int) -> List[float]:
    numeric = pd.to_numeric(values, errors="coerce").dropna().sort_values()
    if numeric.empty:
        raise ValueError("Cannot bin empty values.")

    split = _isolated_extreme_split(numeric)
    if split is None or max_bins <= 2:
        return _nice_breaks(float(numeric.min()), float(numeric.max()), target_bins, max_bins=max_bins)

    low_values, high_values = split
    low_is_outlier = len(low_values) < len(high_values)
    dense_values = high_values if low_is_outlier else low_values
    outlier_values = low_values if low_is_outlier else high_values
    dense_bins = max(1, min(max_bins - 1, target_bins - 1))

    dense_breaks = _nice_breaks(float(dense_values.min()), float(dense_values.max()), dense_bins, max_bins=dense_bins)
    outlier_breaks = _nice_breaks(float(outlier_values.min()), float(outlier_values.max()), 1, max_bins=1)
    if low_is_outlier:
        return _merge_breaks(outlier_breaks, dense_breaks)
    return _merge_breaks(dense_breaks, outlier_breaks)


def _isolated_extreme_split(values: pd.Series) -> Optional[tuple[pd.Series, pd.Series]]:
    values = values.reset_index(drop=True)
    if len(values) < 12:
        return None
    gaps = values.diff().iloc[1:]
    positive_gaps = gaps[gaps > 0]
    if positive_gaps.empty:
        return None

    largest_gap_position = int(positive_gaps.idxmax())
    largest_gap = float(positive_gaps.loc[largest_gap_position])
    left_count = largest_gap_position
    right_count = len(values) - left_count
    smaller_side = min(left_count, right_count)
    if smaller_side == 0 or smaller_side > max(2, math.ceil(len(values) * 0.08)):
        return None

    q25 = float(values.quantile(0.25))
    q75 = float(values.quantile(0.75))
    iqr = max(q75 - q25, 0)
    median_gap = float(positive_gaps.median())
    reference_step = _nice_step((iqr or float(values.max() - values.min()) or 1) / 4)
    if largest_gap < max(reference_step * 4, median_gap * 20):
        return None

    return values.iloc[:largest_gap_position], values.iloc[largest_gap_position:]


def _merge_breaks(first: Sequence[float], second: Sequence[float]) -> List[float]:
    merged = list(first)
    for value in second:
        if not merged or value > merged[-1]:
            merged.append(value)
    return merged


def _nice_breaks(min_value: float, max_value: float, target_bins: int, *, max_bins: int) -> List[float]:
    if not math.isfinite(min_value) or not math.isfinite(max_value):
        raise ValueError("Cannot bin non-finite values.")
    if min_value == max_value:
        step = _nice_step((abs(min_value) or 1) / 8)
        lower = math.floor(min_value / step) * step
        upper = lower + step
        if upper <= max_value:
            upper += step
        return [_clean_break(lower), _clean_break(upper)]

    span = max_value - min_value
    target_bins = max(1, target_bins)
    min_bins = min(3, max_bins)
    best: Optional[tuple[tuple[float, float, float], List[float]]] = None

    base_step = _nice_step(span / target_bins)
    base_power = math.floor(math.log10(base_step)) if base_step > 0 else 0
    for power in range(base_power - 2, base_power + 4):
        magnitude = 10**power
        for multiplier in (1, 2, 2.5, 5, 10):
            step = multiplier * magnitude
            if step <= 0:
                continue
            lower = math.floor(min_value / step) * step
            upper = math.ceil(max_value / step) * step
            if upper <= max_value:
                upper += step
            bin_total = int(round((upper - lower) / step))
            if bin_total <= 0:
                continue
            penalty = (
                1000 if bin_total > max_bins else 0,
                100 if bin_total < min_bins else 0,
                abs(bin_total - target_bins),
                step,
            )
            breaks = [_clean_break(lower + step * index) for index in range(bin_total + 1)]
            if best is None or penalty < best[0]:
                best = (penalty, breaks)

    if best is None:
        raise ValueError("Could not calculate breaks.")
    return best[1]


def _nice_step(raw_step: float) -> float:
    if raw_step <= 0 or not math.isfinite(raw_step):
        return 1
    magnitude = 10 ** math.floor(math.log10(raw_step))
    normalized = raw_step / magnitude
    for step in (1, 2, 2.5, 5, 10):
        if normalized <= step:
            return step * magnitude
    return 10 * magnitude


def _clean_break(value: float) -> float:
    if abs(value) < 1e-12:
        return 0.0
    return round(value, 12)


def _bin_labels(breaks: Sequence[float]) -> List[str]:
    labels: List[str] = []
    for index in range(len(breaks) - 1):
        labels.append(f"{_compact_number(breaks[index])}-{_compact_number(breaks[index + 1])}")
    return labels


def _point_rows(df: pd.DataFrame, aesthetic_columns: Mapping[str, str]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for _, row in df.iterrows():
        point = {
            "id": row["_deal_id"],
            "date": _date_value(row.get("date")),
            "year": _compact_number(row.get("deal year")),
            "y": _compact_number(row.get("PriceUsed")),
            "tooltip": _tooltip(row),
        }
        for response_key, column in aesthetic_columns.items():
            if column in df.columns:
                point[response_key] = _aesthetic_value(response_key, row.get(column))
        rows.append(point)
    return rows


def _table_rows(df: pd.DataFrame) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for _, row in df.sort_values(["_date_sort", "_deal_id"], ascending=[False, True], kind="mergesort").iterrows():
        rows.append(
            {
                "id": row["_deal_id"],
                "date": _date_value(row.get("date")),
                "city": _display_value(row.get("city")),
                "street": _display_value(row.get("street")),
                "gush": _display_value(row.get("Gush")),
                "address": _display_value(row.get("FULLADRESS")),
                "deal_year": _compact_number(row.get("deal year")),
                "price_millions": _compact_number(row.get("price_millions")),
                "price_per_m2": _compact_number(row.get("price_per_m2")),
                "price_per_room": _compact_number(row.get("price_per_room")),
                "price_used": _compact_number(row.get("PriceUsed")),
                "area": _compact_number(row.get("area")),
                "rooms": _compact_number(row.get("rooms")),
                "floor": _compact_number(row.get("floor")),
                "roof": _display_value(row.get("roof")),
                "apartment_type": _display_value(row.get("apt type")),
                "new_project": _display_value(row.get("New_Project")),
                "build_year": _compact_number(row.get("build_year")),
                "building_age": _compact_number(row.get("building age")),
                "building_floors": _compact_number(row.get("build_floors")),
            }
        )
    return rows


def _summary_stats(df: pd.DataFrame, price_type: str) -> Dict[str, Any]:
    if df.empty:
        return {
            "price_type": price_type,
            "deals": 0,
            "median_y": None,
            "median_price_millions": None,
            "median_price_per_m2": None,
            "median_price_per_room": None,
            "median_area": None,
            "median_rooms": None,
            "year_min": None,
            "year_max": None,
            "date_min": None,
            "date_max": None,
            "city_count": 0,
            "street_count": 0,
            "gush_count": 0,
        }

    dates = pd.to_datetime(df.get("date"), errors="coerce")
    years = pd.to_numeric(df.get("deal year"), errors="coerce")
    return {
        "price_type": price_type,
        "deals": int(len(df)),
        "median_y": _series_median(df.get("PriceUsed")),
        "median_price_millions": _series_median(df.get("price_millions")),
        "median_price_per_m2": _series_median(df.get("price_per_m2")),
        "median_price_per_room": _series_median(df.get("price_per_room")),
        "median_area": _series_median(df.get("area")),
        "median_rooms": _series_median(df.get("rooms")),
        "year_min": _compact_number(years.min()),
        "year_max": _compact_number(years.max()),
        "date_min": _date_value(dates.min()),
        "date_max": _date_value(dates.max()),
        "city_count": _nunique(df.get("city")),
        "street_count": _nunique(df.get("street")),
        "gush_count": _nunique(df.get("Gush")),
    }


def _overlays(
    city_frame: pd.DataFrame,
    payload: Mapping[str, Any],
    *,
    price_type: str,
    selected_deals: pd.DataFrame,
) -> tuple[Dict[str, Any], List[str]]:
    warnings: List[str] = []
    overlays: Dict[str, Any] = {"sp500": [], "city_comparison": []}

    if payload.get("show_city_comparison") is True:
        city_filtered = apply_common_filters(city_frame, _non_location_filters(payload.get("filters")))
        if payload.get("remove_price_outliers") is not False:
            city_filtered = remove_price_outliers_by_year(city_filtered)
        city_prepared = _with_display_calculations(city_filtered, price_type)
        city_summary = summary_by_city_year(city_prepared)
        overlays["city_comparison"] = _summary_overlay_rows(city_summary, price_type)

    if payload.get("show_sp500") is True and not selected_deals.empty:
        yearly = _yearly_selected_medians(selected_deals)
        if not yearly.empty:
            try:
                base_value = yearly.sort_values("deal year")["PriceUsed"].iloc[0]
                sp500 = sp500_normalized(yearly["deal year"].tolist(), base_value)
                overlays["sp500"] = [
                    {
                        "date": _date_value(row.get("date")),
                        "year": _compact_number(row.get("Year")),
                        "y": _compact_number(row.get("PriceUsed")),
                        "tooltip": _display_value(row.get("story")),
                    }
                    for _, row in sp500.iterrows()
                ]
            except Exception:
                warnings.append("S&P 500 overlay could not be loaded.")
    return overlays, warnings


def _summary_overlay_rows(summary: pd.DataFrame, price_type: str) -> List[Dict[str, Any]]:
    value_column = PRICE_COLUMN_BY_TYPE.get(price_type, "price_millions")
    if summary.empty or value_column not in summary.columns:
        return []
    rows: List[Dict[str, Any]] = []
    for _, row in summary.iterrows():
        year = _safe_int(row.get("deal year"))
        rows.append(
            {
                "city": _display_value(row.get("city")),
                "year": year,
                "date": f"{year}-01-01" if year is not None else None,
                "y": _compact_number(row.get(value_column)),
                "n_deals": _compact_number(row.get("n_deals")),
            }
        )
    return rows


def _yearly_selected_medians(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty or "deal year" not in df.columns:
        return pd.DataFrame(columns=["deal year", "PriceUsed"])
    working = df.copy()
    working["deal year"] = pd.to_numeric(working["deal year"], errors="coerce")
    working["PriceUsed"] = pd.to_numeric(working["PriceUsed"], errors="coerce")
    return (
        working.dropna(subset=["deal year", "PriceUsed"])
        .groupby("deal year", dropna=True)["PriceUsed"]
        .median()
        .reset_index()
    )


def _category_warnings(
    df: pd.DataFrame,
    aesthetic_columns: Mapping[str, str],
    aesthetic_labels: Optional[Mapping[str, str]] = None,
) -> List[str]:
    warnings: List[str] = []
    labels = aesthetic_labels or {}
    for response_key, column in aesthetic_columns.items():
        if response_key == "size" or column not in df.columns:
            continue
        unique_count = int(df[column].dropna().nunique())
        if unique_count > MAX_CATEGORY_VALUES:
            label = labels.get(column, column)
            warnings.append(f"{label} has {unique_count} categories; the frontend may group or hide some categories.")
    return warnings


def _price_type(value: Any) -> str:
    if value == PRICE_TYPE_M2 or str(value).strip().casefold() in {"price / m2", "price per m2", "price_per_m2"}:
        return PRICE_TYPE_M2
    if value == PRICE_TYPE_ROOM or str(value).strip().casefold() in {"price per room", "price_per_room"}:
        return PRICE_TYPE_ROOM
    return PRICE_TYPE_PRICE


def _coerce_limit(value: Any) -> int:
    try:
        limit = int(value)
    except (TypeError, ValueError):
        limit = DEFAULT_LIMIT
    return max(1, min(limit, MAX_LIMIT))


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


def _safe_int(value: Any) -> Optional[int]:
    try:
        if pd.isna(value):
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _series_median(values: Any) -> Any:
    if values is None:
        return None
    numeric = pd.to_numeric(values, errors="coerce").dropna()
    if numeric.empty:
        return None
    return _compact_number(numeric.median())


def _nunique(values: Any) -> int:
    if values is None:
        return 0
    return int(pd.Series(values).dropna().nunique())


def _tooltip(row: Mapping[str, Any]) -> Optional[str]:
    story = row.get("story")
    if story is None or pd.isna(story):
        return None
    return str(story).replace("\r\n", "\n").replace("\r", "\n").replace("\n", "<br>")


def _date_value(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, pd.Timestamp):
        if pd.isna(value):
            return None
        return value.date().isoformat()
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(value, "isoformat"):
        return value.isoformat()
    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.date().isoformat()


def _display_value(value: Any) -> Any:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(value, "item"):
        try:
            return value.item()
        except (TypeError, ValueError):
            pass
    return value


def _aesthetic_value(response_key: str, value: Any) -> Any:
    display_value = _display_value(value)
    if response_key == "size":
        return _compact_number(display_value)
    if display_value is None:
        return None
    compact = _compact_number(display_value)
    return str(compact)


def _compact_number(value: Any) -> Any:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return _display_value(value)
    if pd.isna(numeric):
        return None
    if numeric.is_integer():
        return int(numeric)
    return round(numeric, 3)


def _json_ready(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _json_ready(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_ready(item) for item in value]
    if isinstance(value, tuple):
        return [_json_ready(item) for item in value]
    if isinstance(value, pd.Timestamp):
        return _date_value(value)
    try:
        if value is None or pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(value, "item"):
        try:
            return value.item()
        except (TypeError, ValueError):
            pass
    return value
