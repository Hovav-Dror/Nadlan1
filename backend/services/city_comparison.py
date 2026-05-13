from __future__ import annotations

from typing import Any, Dict, List, Mapping, Optional, Sequence

import pandas as pd

from .calculations import (
    PRICE_TYPE_M2,
    PRICE_TYPE_PRICE,
    PRICE_TYPE_ROOM,
    apply_common_filters,
    price_used,
    remove_price_outliers_global_iqr,
    sp500_normalized,
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
    filtered_rows = int(len(filtered))

    if _remove_price_outliers(request_payload):
        before = len(filtered)
        filtered = remove_price_outliers_global_iqr(filtered)
        if len(filtered) < before:
            warnings.append(f"Removed {before - len(filtered)} price outlier deals.")
    outlier_rows = int(len(filtered))

    statistic = _statistic(request_payload)
    summary = _summary_by_city_year(filtered, statistic)
    if summary.empty:
        warnings.append("No matching transactions were found.")

    y_variable = _y_variable(request_payload.get("y_variable", request_payload.get("price_type")))
    table = build_city_year_rows(summary, y_variable)
    min_deals = _min_deals_per_year(request_payload)
    if min_deals > 1:
        before = len(table)
        table = [row for row in table if _safe_int(row.get("n_deals")) is not None and int(row["n_deals"]) >= min_deals]
        if len(table) < before:
            warnings.append(f"Hidden {before - len(table)} city/year points below {min_deals} deals.")
    plot_table = _without_year_rows(table, 2027) if _exclude_2027(request_payload) else table
    series = build_city_year_series(plot_table)
    city_stats = build_city_stats(table, selection["cities"], y_variable)
    overlay_frame = _without_year(filtered, 2027) if _exclude_2027(request_payload) else filtered
    overlays, overlay_warnings = _overlays(overlay_frame, request_payload, y_variable)
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
                "plotted_points": len(plot_table),
                "unique_cities": len(selection["cities"]),
                "plotted_cities": len(series),
                "unique_years": len({row.get("deal_year") for row in table if row.get("deal_year") is not None}),
            },
            "selection": {
                "cities": selection["cities"],
            },
            "overlays": overlays,
            "city_stats": city_stats,
            "warnings": warnings,
            "y_variable": y_variable,
            "statistic": statistic,
        }
    )


def build_city_comparison_raw_response(data_store: DataStore, payload: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    request_payload = _request_payload(payload)
    warnings: List[str] = []

    selection = resolve_city_comparison_selection(data_store, request_payload)
    city_frame = data_store.load_cities([city["id"] for city in selection["cities"]])
    filtered = apply_common_filters(city_frame, _non_location_filters(request_payload.get("filters")))
    filtered_rows = int(len(filtered))

    if _remove_price_outliers(request_payload):
        before = len(filtered)
        filtered = remove_price_outliers_global_iqr(filtered)
        if len(filtered) < before:
            warnings.append(f"Removed {before - len(filtered)} price outlier deals.")
    if filtered.empty:
        warnings.append("No matching transactions were found.")

    return _json_ready(
        {
            "rows": _raw_rows(_with_price_calculations(filtered)),
            "counts": {
                "raw_deals": int(len(city_frame)),
                "filtered_deals": filtered_rows,
                "outlier_deals": int(len(filtered)),
                "unique_cities": len(selection["cities"]),
                "unique_years": _nunique(filtered.get("deal year")),
            },
            "selection": {"cities": selection["cities"]},
            "warnings": warnings,
            "y_variable": _y_variable(request_payload.get("y_variable", request_payload.get("price_type"))),
            "statistic": _statistic(request_payload),
        }
    )


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


def build_city_stats(
    table: Sequence[Mapping[str, Any]],
    selected_cities: Sequence[Mapping[str, Any]],
    y_variable: str,
) -> Dict[str, Any]:
    if not table:
        return {"cards": [], "ranking": [], "year_range": None}

    by_city: Dict[str, List[Mapping[str, Any]]] = {}
    for row in table:
        city = str(row.get("city") or row.get("city_label") or "")
        if city:
            by_city.setdefault(city, []).append(row)

    first_years = []
    last_years = []
    ranking: List[Dict[str, Any]] = []
    for city, rows in by_city.items():
        ordered = sorted(
            [row for row in rows if row.get("deal_year") is not None],
            key=lambda row: int(row["deal_year"]),
        )
        if not ordered:
            continue
        first = ordered[0]
        last = ordered[-1]
        first_y = _safe_float(first.get("y"))
        last_y = _safe_float(last.get("y"))
        first_years.append(first.get("deal_year"))
        last_years.append(last.get("deal_year"))
        pct_change = None
        absolute_change = None
        if first_y is not None and last_y is not None:
            absolute_change = _compact_number(last_y - first_y)
            if first_y != 0:
                pct_change = _compact_number(((last_y / first_y) - 1) * 100)
        ranking.append(
            {
                "city": city,
                "city_label": city,
                "first_year": first.get("deal_year"),
                "last_year": last.get("deal_year"),
                "first_value": first.get("y"),
                "last_value": last.get("y"),
                "absolute_change": absolute_change,
                "pct_change": pct_change,
                "years": len(ordered),
                "total_deals": _compact_number(sum((_safe_float(row.get("n_deals")) or 0) for row in ordered)),
                "avg_deals_per_year": _compact_number(
                    sum((_safe_float(row.get("n_deals")) or 0) for row in ordered) / len(ordered)
                ),
            }
        )

    ranking = sorted(
        ranking,
        key=lambda row: (row.get("pct_change") is None, 0 if row.get("pct_change") is None else -float(row["pct_change"]), str(row.get("city") or "")),
    )

    cards = _city_stat_cards(ranking, len(selected_cities), y_variable)
    year_range = None
    all_years = [year for year in first_years + last_years if year is not None]
    if all_years:
        year_range = {"min": min(all_years), "max": max(all_years)}
    return {"cards": cards, "ranking": ranking, "year_range": year_range}


def _city_stat_cards(ranking: Sequence[Mapping[str, Any]], selected_count: int, y_variable: str) -> List[Dict[str, Any]]:
    cards: List[Dict[str, Any]] = [
        {"label": "Selected cities", "value": selected_count},
        {"label": "Plotted cities", "value": len(ranking)},
    ]
    comparable = [row for row in ranking if row.get("pct_change") is not None]
    if comparable:
        best = comparable[0]
        cards.append({"label": "Strongest change", "value": best.get("city"), "detail": f"{best.get('pct_change')}%"})
        last_values = [row for row in ranking if row.get("last_value") is not None]
        if last_values:
            highest = sorted(last_values, key=lambda row: (-float(row["last_value"]), str(row.get("city") or "")))[0]
            cards.append({"label": f"Highest latest {_y_label(y_variable)}", "value": highest.get("city"), "detail": highest.get("last_value")})
    return cards


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


def _without_year_rows(rows: Sequence[Mapping[str, Any]], year: int) -> List[Dict[str, Any]]:
    return [dict(row) for row in rows if _safe_int(row.get("deal_year")) != year]


def _with_price_calculations(df: pd.DataFrame) -> pd.DataFrame:
    working = df.copy()
    working["price_per_m2"] = price_used(working, PRICE_TYPE_M2)
    working["price_per_room"] = price_used(working, PRICE_TYPE_ROOM)
    return working


def _raw_rows(df: pd.DataFrame) -> List[Dict[str, Any]]:
    columns = [
        column
        for column in [
            "city",
            "street",
            "Gush",
            "FULLADRESS",
            "date",
            "deal year",
            "price_millions",
            "price_per_m2",
            "price_per_room",
            "area",
            "rooms",
            "floor",
            "roof",
            "apt type",
            "New_Project",
            "build_year",
            "building age",
            "build_floors",
            "story",
        ]
        if column in df.columns
    ]
    if "date" in df.columns:
        working = df.copy()
        working["_city_comparison_date_sort"] = pd.to_datetime(working["date"], errors="coerce")
        working = working.sort_values(["_city_comparison_date_sort"], kind="mergesort").drop(
            columns=["_city_comparison_date_sort"]
        )
    else:
        working = df
    return [_normalize_row(row) for row in working[columns].to_dict(orient="records")]


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


def _statistic(payload: Mapping[str, Any]) -> str:
    normalized = _normalize_text(_first_present(payload, "statistic", "stat"))
    if normalized in {"mean", "average", "avg"}:
        return "mean"
    return "median"


def _summary_by_city_year(df: pd.DataFrame, statistic: str) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=["city", "deal year", "n_deals", "price_millions", "price_per_m2", "price_per_room"])
    working = df.copy()
    working["price_millions"] = pd.to_numeric(working.get("price_millions"), errors="coerce")
    working["price_per_m2"] = price_used(working, PRICE_TYPE_M2)
    working["price_per_room"] = price_used(working, PRICE_TYPE_ROOM)
    aggregator = "mean" if statistic == "mean" else "median"
    return (
        working.groupby(["city", "deal year"], dropna=False)
        .agg(
            n_deals=("price_millions", "size"),
            price_millions=("price_millions", aggregator),
            price_per_m2=("price_per_m2", aggregator),
            price_per_room=("price_per_room", aggregator),
        )
        .reset_index()
        .sort_values(["city", "deal year"])
        .reset_index(drop=True)
    )


def _min_deals_per_year(payload: Mapping[str, Any]) -> int:
    value = _first_present(payload, "min_deals_per_year", "min_deals")
    if value is None:
        value = _first_present(payload.get("filters", {}) if isinstance(payload.get("filters"), Mapping) else {}, "min_deals_per_year")
    try:
        return max(1, int(value))
    except (TypeError, ValueError):
        return 1


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


def _safe_float(value: Any) -> Optional[float]:
    try:
        if pd.isna(value):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _y_label(y_variable: str) -> str:
    return {
        "price_millions": "price",
        "price_per_m2": "price / m²",
        "price_per_room": "price / room",
        "n_deals": "deal count",
    }.get(y_variable, "value")


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


def _normalize_row(row: Mapping[str, Any]) -> Dict[str, Any]:
    return {str(key): _json_ready(value) for key, value in row.items()}


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
