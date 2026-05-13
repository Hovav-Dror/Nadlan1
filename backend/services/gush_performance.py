from __future__ import annotations

from typing import Any, Dict, List, Mapping, Optional, Sequence

import pandas as pd

from .calculations import (
    PRICE_TYPE_M2,
    PRICE_TYPE_PRICE,
    PRICE_TYPE_ROOM,
    apply_common_filters,
    price_used,
    remove_price_outliers_by_year,
    sp500_normalized,
    summary_by_city_year,
    summary_by_gush_year,
)
from .data_store import DataStore


LOCATION_FILTER_KEYS = {"cities", "city", "city_ids"}
PRICE_COLUMN_BY_TYPE = {
    PRICE_TYPE_PRICE: "price_millions",
    PRICE_TYPE_M2: "price_per_m2",
    PRICE_TYPE_ROOM: "price_per_room",
    "price_millions": "price_millions",
    "price_per_m2": "price_per_m2",
    "price_per_room": "price_per_room",
    "n_deals": "n_deals",
}
DEFAULT_TOP_COUNT = 5
DEFAULT_TYPICAL_COUNT = 5
DEFAULT_BOTTOM_COUNT = 5
DEFAULT_MIN_DEALS_PER_GUSH = 10
MIN_YEARS_PER_GUSH = 2
TRIM_FRACTION = 0.1


class GushPerformanceError(Exception):
    def __init__(self, public_message: str):
        super().__init__(public_message)
        self.public_message = public_message


def build_gush_performance_summary_response(data_store: DataStore, payload: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    request_payload = _request_payload(payload)
    warnings: List[str] = [
        (
            "City Performance was marked as not QA'd in the Shiny app; this endpoint preserves "
            "the described YoY trimmed-mean behavior rather than replacing it with regression/CAGR."
        )
    ]

    city = resolve_gush_performance_city(data_store, request_payload)
    city_frame = data_store.load_city(city["id"])
    raw_rows = int(len(city_frame))

    filtered = apply_common_filters(city_frame, _non_city_filters(request_payload.get("filters")))
    filtered_rows = int(len(filtered))

    if _remove_price_outliers(request_payload):
        before = len(filtered)
        filtered = remove_price_outliers_by_year(filtered)
        if len(filtered) < before:
            warnings.append(f"Removed {before - len(filtered)} price outlier deals.")
    outlier_rows = int(len(filtered))

    y_variable = _y_variable(_first_present(request_payload, "yvar", "y_variable", "price_type"))
    min_deals = _positive_int(_first_present(request_payload, "min_deals_per_gush"), DEFAULT_MIN_DEALS_PER_GUSH)
    top_count = _non_negative_int(_first_present(request_payload, "top_count"), DEFAULT_TOP_COUNT)
    typical_count = _non_negative_int(_first_present(request_payload, "typical_count"), DEFAULT_TYPICAL_COUNT)
    bottom_count = _non_negative_int(_first_present(request_payload, "bottom_count"), DEFAULT_BOTTOM_COUNT)

    summary = summary_by_gush_year(filtered)
    label_by_key = _label_by_key(data_store, city["id"])
    table = _summary_rows(summary, label_by_key, y_variable)
    qualified_table, changes = _qualified_performance(table, min_deals)

    selected_changes = _selected_performers(changes, top_count, typical_count, bottom_count)
    selected_keys = {row["gush_key"] for row in selected_changes}
    selected_table = [row for row in qualified_table if row["gush_key"] in selected_keys]
    series = _series_rows(selected_table, selected_changes)

    overlays, overlay_warnings = _overlays(filtered, request_payload, y_variable)
    warnings.extend(overlay_warnings)
    if not table:
        warnings.append("No matching transactions were found.")
    elif not qualified_table:
        warnings.append("No Gushes passed the yearly data and median deal-volume thresholds.")

    return _json_ready(
        {
            "series": series,
            "performance_table": selected_table,
            "changes": {
                "ranked": changes,
                "selected": selected_changes,
                "thresholds": {
                    "min_years_per_gush": MIN_YEARS_PER_GUSH,
                    # The migration plan says "above threshold"; inclusive matching keeps exact
                    # Shiny-style numeric slider values from unexpectedly excluding boundary Gushes.
                    "min_deals_per_gush": min_deals,
                    "min_deals_comparison": ">=",
                    "yearly_slope_metric": "trimmed_mean_yoy_pct_change",
                    "trim_fraction": TRIM_FRACTION,
                },
            },
            "counts": {
                "raw_deals": raw_rows,
                "filtered_deals": filtered_rows,
                "outlier_deals": outlier_rows,
                "summary_points": len(table),
                "qualified_summary_points": len(qualified_table),
                "qualified_gushes": _nunique([row["gush_key"] for row in qualified_table]),
                "selected_gushes": len(selected_keys),
                "unique_years": _nunique([row["deal_year"] for row in table]),
            },
            "selection": {
                "city": city,
                "top_count": top_count,
                "typical_count": typical_count,
                "bottom_count": bottom_count,
            },
            "overlays": overlays,
            "warnings": warnings,
            "y_variable": y_variable,
        }
    )


def resolve_gush_performance_city(data_store: DataStore, payload: Mapping[str, Any]) -> Dict[str, str]:
    selected = _first_present(payload, "city")
    if selected is None:
        raise GushPerformanceError("One city is required.")
    normalized = _normalize_text(selected)
    for city in data_store.list_cities():
        if normalized in {_normalize_text(city.get("id")), _normalize_text(city.get("name"))}:
            return {"id": _display_value(city.get("id")), "name": _display_value(city.get("name"))}
    raise GushPerformanceError("Unknown city.")


def _request_payload(payload: Optional[Mapping[str, Any]]) -> Mapping[str, Any]:
    if payload is None:
        return {}
    if not isinstance(payload, Mapping):
        raise GushPerformanceError("Request body must be a JSON object.")
    return payload


def _non_city_filters(filters: Any) -> Dict[str, Any]:
    if not isinstance(filters, Mapping):
        return {}
    return {key: value for key, value in filters.items() if key not in LOCATION_FILTER_KEYS}


def _remove_price_outliers(payload: Mapping[str, Any]) -> bool:
    value = _first_present(payload, "remove_price_outliers")
    filters = payload.get("filters")
    if value is None and isinstance(filters, Mapping):
        value = _first_present(filters, "remove_price_outliers")
    return value is not False


def _y_variable(value: Any) -> str:
    normalized = _normalize_text(value)
    if normalized in {"price / m²", "price / m2", "price per m2", "price_per_m2"}:
        return "price_per_m2"
    if normalized in {"price / room", "price per room", "price_per_room"}:
        return "price_per_room"
    if normalized in {"n_deals", "deals", "count"}:
        return "n_deals"
    if normalized in {"price_millions", "price", ""}:
        return "price_millions"
    raise GushPerformanceError("Unsupported y variable.")


def _summary_rows(summary: pd.DataFrame, label_by_key: Mapping[str, str], y_variable: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for _, row in summary.iterrows():
        year = _safe_int(row.get("deal year"))
        gush_id = _normalize_gush_id(row.get("Gush"))
        gush_key = _gush_key(gush_id)
        label = label_by_key.get(gush_key, str(gush_id))
        y_value = row.get(y_variable)
        rows.append(
            {
                "city": _display_value(row.get("city")),
                "gush": gush_id,
                "gush_key": gush_key,
                "gush_label": label,
                "series_id": gush_key,
                "series_label": label,
                "deal_year": year,
                "date": f"{year}-01-01" if year is not None else None,
                "n_deals": _compact_number(row.get("n_deals")),
                "price_millions": _compact_number(row.get("price_millions")),
                "price_per_m2": _compact_number(row.get("price_per_m2")),
                "price_per_room": _compact_number(row.get("price_per_room")),
                "y": _compact_number(y_value),
            }
        )
    return rows


def _qualified_performance(table: Sequence[Mapping[str, Any]], min_deals: int) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    by_gush: Dict[str, List[Mapping[str, Any]]] = {}
    for row in table:
        if row.get("gush_key") and row.get("deal_year") is not None:
            by_gush.setdefault(str(row["gush_key"]), []).append(row)

    qualified_rows: List[Dict[str, Any]] = []
    changes: List[Dict[str, Any]] = []
    for gush_key, rows in by_gush.items():
        sorted_rows = sorted(rows, key=lambda item: item["deal_year"])
        yearly_deals = [_safe_number(row.get("n_deals")) for row in sorted_rows]
        deal_median = _median([value for value in yearly_deals if value is not None])
        year_count = len({row["deal_year"] for row in sorted_rows})
        if year_count < MIN_YEARS_PER_GUSH or deal_median is None or deal_median < min_deals:
            continue

        yoy_values = _yoy_changes(sorted_rows)
        yearly_slope = _trimmed_mean([row["yoy_pct_change"] for row in yoy_values if row["yoy_pct_change"] is not None])
        if yearly_slope is None:
            continue

        qualified_rows.extend([dict(row) for row in sorted_rows])
        first = sorted_rows[0]
        changes.append(
            {
                "gush": first.get("gush"),
                "gush_key": gush_key,
                "gush_label": first.get("gush_label"),
                "year_count": year_count,
                "median_deals_per_year": _compact_number(deal_median),
                "yearly_slope": _compact_number(yearly_slope),
                "yoy_changes": yoy_values,
                "first_year": sorted_rows[0].get("deal_year"),
                "last_year": sorted_rows[-1].get("deal_year"),
                "first_y": sorted_rows[0].get("y"),
                "last_y": sorted_rows[-1].get("y"),
            }
        )

    changes.sort(key=lambda row: (-float(row["yearly_slope"]), str(row["gush_label"])))
    for index, row in enumerate(changes, start=1):
        row["rank"] = index
    return qualified_rows, changes


def _selected_performers(
    changes: Sequence[Mapping[str, Any]],
    top_count: int,
    typical_count: int,
    bottom_count: int,
) -> List[Dict[str, Any]]:
    if not changes:
        return []

    used: set[str] = set()
    selected: List[Dict[str, Any]] = []

    def add(rows: Sequence[Mapping[str, Any]], group: str) -> None:
        for row in rows:
            key = str(row["gush_key"])
            if key in used:
                continue
            used.add(key)
            selected.append({**dict(row), "performance_group": group})

    ranked = list(changes)
    add(ranked[:top_count], "top")
    add(list(reversed(ranked))[:bottom_count], "bottom")

    remaining = [row for row in ranked if str(row["gush_key"]) not in used]
    slopes = [_safe_number(row.get("yearly_slope")) for row in ranked]
    median_slope = _median([value for value in slopes if value is not None])
    # "Central typical" is not specified more exactly in the plan; closest to
    # the median trimmed YoY slope gives stable representative middle performers.
    if median_slope is not None:
        remaining.sort(key=lambda row: (abs(float(row["yearly_slope"]) - median_slope), str(row["gush_label"])))
    add(remaining[:typical_count], "typical")

    group_order = {"top": 0, "typical": 1, "bottom": 2}
    return sorted(selected, key=lambda row: (group_order.get(str(row["performance_group"]), 9), row["rank"]))


def _yoy_changes(rows: Sequence[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    changes: List[Dict[str, Any]] = []
    previous: Optional[Mapping[str, Any]] = None
    for row in rows:
        current_y = _safe_number(row.get("y"))
        previous_y = _safe_number(previous.get("y")) if previous is not None else None
        yoy = None
        if current_y is not None and previous_y is not None and previous_y > 0:
            yoy = ((current_y / previous_y) - 1) * 100
        changes.append(
            {
                "from_year": previous.get("deal_year") if previous is not None else None,
                "to_year": row.get("deal_year"),
                "previous_y": _compact_number(previous_y),
                "current_y": _compact_number(current_y),
                "yoy_pct_change": _compact_number(yoy),
            }
        )
        previous = row
    return changes


def _series_rows(table: Sequence[Mapping[str, Any]], selected_changes: Sequence[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    group_by_key = {str(row["gush_key"]): row.get("performance_group") for row in selected_changes}
    grouped: Dict[str, Dict[str, Any]] = {}
    for row in table:
        series_id = str(row["series_id"])
        grouped.setdefault(
            series_id,
            {
                "id": series_id,
                "label": row["series_label"],
                "city": row["city"],
                "gush": row["gush"],
                "gush_label": row["gush_label"],
                "performance_group": group_by_key.get(str(row["gush_key"])),
                "points": [],
            },
        )
        grouped[series_id]["points"].append(
            {
                "year": row["deal_year"],
                "date": row["date"],
                "y": row["y"],
                "n_deals": row["n_deals"],
                "price_millions": row["price_millions"],
                "price_per_m2": row["price_per_m2"],
                "price_per_room": row["price_per_room"],
            }
        )
    return list(grouped.values())


def _overlays(
    selected_deals: pd.DataFrame,
    payload: Mapping[str, Any],
    y_variable: str,
) -> tuple[Dict[str, Any], List[str]]:
    overlays: Dict[str, Any] = {"city": [], "sp500": []}
    warnings: List[str] = []

    if payload.get("show_city") is True:
        overlays["city"] = _city_overlay_rows(summary_by_city_year(selected_deals), y_variable)

    if payload.get("show_sp500") is True and y_variable != "n_deals" and not selected_deals.empty:
        yearly = _yearly_selected_medians(selected_deals, y_variable)
        if not yearly.empty:
            try:
                base_value = yearly.sort_values("deal year")["PriceUsed"].iloc[0]
                sp500 = sp500_normalized(yearly["deal year"].tolist(), base_value)
                overlays["sp500"] = [
                    {
                        "year": _compact_number(row.get("Year")),
                        "date": _date_value(row.get("date")),
                        "y": _compact_number(row.get("PriceUsed")),
                        "tooltip": _display_value(row.get("story")),
                    }
                    for _, row in sp500.iterrows()
                ]
            except Exception:
                warnings.append("S&P 500 overlay could not be loaded.")

    return overlays, warnings


def _city_overlay_rows(summary: pd.DataFrame, y_variable: str) -> List[Dict[str, Any]]:
    value_column = PRICE_COLUMN_BY_TYPE.get(y_variable, "price_millions")
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


def _yearly_selected_medians(df: pd.DataFrame, y_variable: str) -> pd.DataFrame:
    if df.empty or "deal year" not in df.columns:
        return pd.DataFrame(columns=["deal year", "PriceUsed"])
    working = df.copy()
    working["deal year"] = pd.to_numeric(working["deal year"], errors="coerce")
    if y_variable == "price_per_m2":
        working["PriceUsed"] = price_used(working, PRICE_TYPE_M2)
    elif y_variable == "price_per_room":
        working["PriceUsed"] = price_used(working, PRICE_TYPE_ROOM)
    elif y_variable == "n_deals":
        working["PriceUsed"] = 1
    else:
        working["PriceUsed"] = price_used(working, PRICE_TYPE_PRICE)
    return (
        working.dropna(subset=["deal year", "PriceUsed"])
        .groupby("deal year", dropna=True)["PriceUsed"]
        .median()
        .reset_index()
    )


def _label_by_key(data_store: DataStore, city_id: str) -> Dict[str, str]:
    labels: Dict[str, str] = {}
    for gush in data_store.gushes_for_city(city_id):
        labels[_gush_key(gush.get("id"))] = str(gush.get("label") or gush.get("id"))
    return labels


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


def _positive_int(value: Any, default: int) -> int:
    number = _safe_number(value)
    if number is None:
        return default
    return max(1, int(number))


def _non_negative_int(value: Any, default: int) -> int:
    number = _safe_number(value)
    if number is None:
        return default
    return max(0, int(number))


def _normalize_gush_id(value: Any) -> Optional[int | str]:
    numeric = _safe_number(value)
    if numeric is None:
        text = _normalize_text(value)
        return text or None
    if float(numeric).is_integer():
        return int(numeric)
    return str(numeric)


def _gush_key(value: Any) -> str:
    normalized = _normalize_gush_id(value)
    return "" if normalized is None else str(normalized)


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    try:
        if not isinstance(value, (str, bytes)) and pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass
    return str(value).strip().casefold()


def _safe_number(value: Any) -> Optional[float]:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if pd.isna(numeric):
        return None
    return numeric


def _safe_int(value: Any) -> Optional[int]:
    try:
        if pd.isna(value):
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _median(values: Sequence[float]) -> Optional[float]:
    if not values:
        return None
    return float(pd.Series(values).median())


def _trimmed_mean(values: Sequence[Any], trim: float = TRIM_FRACTION) -> Optional[float]:
    numeric = sorted(value for value in (_safe_number(value) for value in values) if value is not None)
    if not numeric:
        return None
    trim_count = int(len(numeric) * trim)
    if trim_count and len(numeric) > trim_count * 2:
        numeric = numeric[trim_count:-trim_count]
    return sum(numeric) / len(numeric)


def _nunique(values: Any) -> int:
    if values is None:
        return 0
    return int(pd.Series(values, dtype="object").dropna().nunique())


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
