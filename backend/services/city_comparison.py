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
)
from .data_store import DataStore


MAX_SELECTED_CITIES = 20
LOCATION_FILTER_KEYS = {"cities", "city"}


class CityComparisonError(Exception):
    def __init__(self, public_message: str):
        super().__init__(public_message)
        self.public_message = public_message


def build_city_comparison_summary_response(data_store: DataStore, payload: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    request_payload = _request_payload(payload)
    warnings: List[str] = []

    selection = resolve_city_comparison_selection(data_store, request_payload)
    city_frame = data_store.load_cities([city["id"] for city in selection["cities"]])
    raw_rows = int(len(city_frame))

    filtered = apply_common_filters(city_frame, _non_location_filters(request_payload.get("filters")))
    if _exclude_2027(request_payload):
        filtered = _without_year(filtered, 2027)
    filtered_rows = int(len(filtered))

    if _remove_price_outliers(request_payload):
        before = len(filtered)
        filtered = remove_price_outliers_by_year(filtered)
        if len(filtered) < before:
            warnings.append(f"Removed {before - len(filtered)} price outlier deals.")
    outlier_rows = int(len(filtered))

    summary = summary_by_city_year(filtered)
    if summary.empty:
        warnings.append("No matching transactions were found.")

    y_variable = _y_variable(request_payload.get("y_variable", request_payload.get("price_type")))
    table = build_city_year_rows(summary, y_variable)
    series = build_city_year_series(table)
    overlays, overlay_warnings = _overlays(filtered, request_payload, y_variable)
    warnings.extend(overlay_warnings)

    return _json_ready(
        {
            "series": series,
            "table": table,
            "counts": {
                "raw_deals": raw_rows,
                "filtered_deals": filtered_rows,
                "outlier_deals": outlier_rows,
                "summary_points": len(table),
                "unique_cities": len(selection["cities"]),
                "unique_years": _nunique(summary.get("deal year")),
            },
            "selection": {
                "cities": selection["cities"],
            },
            "overlays": overlays,
            "warnings": warnings,
            "y_variable": y_variable,
        }
    )


def build_city_comparison_raw_response(data_store: DataStore, payload: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    response = build_city_comparison_summary_response(data_store, payload)
    return {
        "rows": response["table"],
        "counts": response["counts"],
        "selection": response["selection"],
        "warnings": response["warnings"],
        "y_variable": response["y_variable"],
    }


def resolve_city_comparison_selection(data_store: DataStore, payload: Mapping[str, Any]) -> Dict[str, Any]:
    requested_cities = _selected_cities(payload)
    city_choices = data_store.list_cities()

    if not requested_cities:
        cities = city_choices
    else:
        cities = [_resolve_city_choice(city_choices, city) for city in requested_cities]
        cities = _unique_city_choices(cities)

    if not cities:
        raise CityComparisonError("At least one city is required.")
    if len(cities) > MAX_SELECTED_CITIES:
        raise CityComparisonError(f"Select up to {MAX_SELECTED_CITIES} cities.")

    return {
        "cities": [
            {
                "id": _display_value(city.get("id")),
                "name": _display_value(city.get("name")),
            }
            for city in cities
        ]
    }


def build_city_year_rows(summary: pd.DataFrame, y_variable: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for _, row in summary.iterrows():
        year = _safe_int(row.get("deal year"))
        city = _display_value(row.get("city"))
        y_value = row.get(y_variable)
        rows.append(
            {
                "city": city,
                "city_label": city,
                "series_id": str(city),
                "series_label": city,
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


def build_city_year_series(table: Sequence[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    grouped: Dict[str, Dict[str, Any]] = {}
    for row in table:
        series_id = str(row["series_id"])
        grouped.setdefault(
            series_id,
            {
                "id": series_id,
                "label": row["series_label"],
                "city": row["city"],
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


def _request_payload(payload: Optional[Mapping[str, Any]]) -> Mapping[str, Any]:
    if payload is None:
        return {}
    if not isinstance(payload, Mapping):
        raise CityComparisonError("Request body must be a JSON object.")
    return payload


def _selected_cities(payload: Mapping[str, Any]) -> List[Any]:
    return _as_list(_first_present(payload, "cities", "city", "city_ids"))


def _resolve_city_choice(city_choices: Sequence[Mapping[str, Any]], selected: Any) -> Mapping[str, Any]:
    normalized = _normalize_text(selected)
    if not normalized:
        raise CityComparisonError("Unknown city.")
    for city in city_choices:
        if normalized in {_normalize_text(city.get("id")), _normalize_text(city.get("name"))}:
            return city
    raise CityComparisonError("Unknown city.")


def _unique_city_choices(cities: Sequence[Mapping[str, Any]]) -> List[Mapping[str, Any]]:
    seen: set[str] = set()
    result: List[Mapping[str, Any]] = []
    for city in cities:
        city_id = str(city.get("id"))
        if city_id in seen:
            continue
        seen.add(city_id)
        result.append(city)
    return result


def _non_location_filters(filters: Any) -> Dict[str, Any]:
    if not isinstance(filters, Mapping):
        return {}
    return {key: value for key, value in filters.items() if key not in LOCATION_FILTER_KEYS}


def _remove_price_outliers(payload: Mapping[str, Any]) -> bool:
    value = _first_present(payload, "remove_price_outliers")
    filters = payload.get("filters")
    if value is None and isinstance(filters, Mapping):
        value = _first_present(filters, "remove_price_outliers")
    return value is not False


def _exclude_2027(payload: Mapping[str, Any]) -> bool:
    value = _first_present(payload, "exclude_2027")
    if value is None:
        return True
    return value is not False


def _without_year(df: pd.DataFrame, year: int) -> pd.DataFrame:
    if df.empty or "deal year" not in df.columns:
        return df.copy()
    years = pd.to_numeric(df["deal year"], errors="coerce")
    return df.loc[~years.eq(year)].copy()


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
    raise CityComparisonError("Unsupported y variable.")


def _overlays(
    selected_deals: pd.DataFrame,
    payload: Mapping[str, Any],
    y_variable: str,
) -> tuple[Dict[str, Any], List[str]]:
    overlays: Dict[str, Any] = {"sp500": []}
    warnings: List[str] = []

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


def _yearly_selected_medians(df: pd.DataFrame, y_variable: str) -> pd.DataFrame:
    if df.empty or "deal year" not in df.columns:
        return pd.DataFrame(columns=["deal year", "PriceUsed"])
    working = df.copy()
    working["deal year"] = pd.to_numeric(working["deal year"], errors="coerce")
    if y_variable == "price_per_m2":
        working["PriceUsed"] = price_used(working, PRICE_TYPE_M2)
    elif y_variable == "price_per_room":
        working["PriceUsed"] = price_used(working, PRICE_TYPE_ROOM)
    else:
        working["PriceUsed"] = price_used(working, PRICE_TYPE_PRICE)
    return (
        working.dropna(subset=["deal year", "PriceUsed"])
        .groupby("deal year", dropna=True)["PriceUsed"]
        .median()
        .reset_index()
    )


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


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    try:
        if not isinstance(value, (str, bytes)) and pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass
    return str(value).strip().casefold()


def _safe_int(value: Any) -> Optional[int]:
    try:
        if pd.isna(value):
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _nunique(values: Any) -> int:
    if values is None:
        return 0
    return int(pd.Series(values).dropna().nunique())


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
