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


MAX_SELECTED_GUSHES = 15
LOCATION_FILTER_KEYS = {"cities", "city", "streets", "street", "gushes", "gush", "gush_select", "Gush"}
PRICE_COLUMN_BY_TYPE = {
    PRICE_TYPE_PRICE: "price_millions",
    PRICE_TYPE_M2: "price_per_m2",
    PRICE_TYPE_ROOM: "price_per_room",
    "price_millions": "price_millions",
    "price_per_m2": "price_per_m2",
    "price_per_room": "price_per_room",
    "n_deals": "n_deals",
}


class CompareAreasError(Exception):
    def __init__(self, public_message: str):
        super().__init__(public_message)
        self.public_message = public_message


def build_compare_summary_response(data_store: DataStore, payload: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    request_payload = _request_payload(payload)
    warnings: List[str] = []

    selection = resolve_compare_selection(data_store, request_payload)
    city_frame = data_store.load_cities(selection["city_ids"])
    raw_rows = int(len(city_frame))

    filtered, compare_counts, filter_warnings = _filtered_compare_deals(city_frame, selection["gush_ids"], request_payload)
    warnings.extend(filter_warnings)

    statistic = _statistic(request_payload.get("statistic", request_payload.get("stat")))
    summary = _summary_by_gush_year(filtered, statistic)
    if summary.empty:
        warnings.append("No matching transactions were found.")

    y_variable = _y_variable(request_payload.get("y_variable", request_payload.get("price_type")))
    table = _summary_rows(summary, selection["label_by_key"], y_variable)
    series = _series_rows(table)
    overlays, overlay_warnings = _overlays(city_frame, filtered, request_payload, y_variable, statistic)
    warnings.extend(overlay_warnings)

    return _json_ready(
        {
            "series": series,
            "table": table,
            "counts": {
                "raw_deals": raw_rows,
                "selected_deals": compare_counts["selected_deals"],
                "filtered_deals": compare_counts["filtered_deals"],
                "outlier_deals": compare_counts["outlier_deals"],
                "summary_points": len(table),
                "unique_gushes": len(selection["gush_ids"]),
                "unique_years": _nunique(summary.get("deal year")),
            },
            "selection": {
                "gushes": selection["gushes"],
                "cities": selection["cities"],
            },
            "overlays": overlays,
            "warnings": warnings,
            "y_variable": y_variable,
            "statistic": statistic,
        }
    )


def build_compare_raw_response(data_store: DataStore, payload: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    request_payload = _request_payload(payload)
    warnings: List[str] = []
    selection = resolve_compare_selection(data_store, request_payload)
    city_frame = data_store.load_cities(selection["city_ids"])
    filtered, compare_counts, filter_warnings = _filtered_compare_deals(city_frame, selection["gush_ids"], request_payload)
    warnings.extend(filter_warnings)
    if filtered.empty:
        warnings.append("No matching transactions were found.")
    return _json_ready(
        {
            "rows": _raw_rows(filtered),
            "counts": {
                "raw_deals": int(len(city_frame)),
                **compare_counts,
                "unique_gushes": len(selection["gush_ids"]),
                "unique_years": _nunique(filtered.get("deal year")),
            },
            "selection": {
                "gushes": selection["gushes"],
                "cities": selection["cities"],
            },
            "warnings": warnings,
            "y_variable": _y_variable(request_payload.get("y_variable", request_payload.get("price_type"))),
            "statistic": _statistic(request_payload.get("statistic", request_payload.get("stat"))),
        }
    )


def resolve_compare_selection(data_store: DataStore, payload: Mapping[str, Any]) -> Dict[str, Any]:
    metadata = data_store.load_metadata()
    lookup = metadata["unique_gush_streets"]
    descriptions = metadata["gush_descriptions"]

    requested_gushes = _selected_gushes(payload)
    requested_gushes.extend(_gushes_from_descriptions(descriptions, _as_list(_first_present(payload, "gush_descriptions", "gush_labels"))))
    requested_gushes.extend(_gushes_from_city_streets(data_store, lookup, payload))

    gush_ids = _unique_gushes(requested_gushes)
    if not gush_ids:
        raise CompareAreasError("At least one Gush or city/street selection is required.")
    if len(gush_ids) > MAX_SELECTED_GUSHES:
        raise CompareAreasError(f"Select up to {MAX_SELECTED_GUSHES} Gushes.")

    cities = data_store.cities_for_gushes(gush_ids)
    if not cities:
        raise CompareAreasError("No city data was found for the selected Gushes.")

    label_by_key = _label_by_key(data_store, gush_ids)
    return {
        "gush_ids": gush_ids,
        "city_ids": [city["id"] for city in cities],
        "cities": [{"id": city["id"], "name": city["name"]} for city in cities],
        "gushes": [_selection_gush_payload(gush_id, label_by_key) for gush_id in gush_ids],
        "label_by_key": label_by_key,
    }


def _filtered_compare_deals(
    city_frame: pd.DataFrame,
    gush_ids: Sequence[Any],
    request_payload: Mapping[str, Any],
) -> tuple[pd.DataFrame, Dict[str, int], List[str]]:
    warnings: List[str] = []
    selected_frame = apply_common_filters(city_frame, {"gushes": gush_ids})
    selected_rows = int(len(selected_frame))
    filtered = apply_common_filters(selected_frame, _non_location_filters(request_payload.get("filters")))
    filtered_rows = int(len(filtered))

    if _remove_price_outliers(request_payload):
        before = len(filtered)
        filtered = remove_price_outliers_by_year(filtered)
        if len(filtered) < before:
            warnings.append(f"Removed {before - len(filtered)} price outlier deals.")

    return (
        filtered,
        {
            "selected_deals": selected_rows,
            "filtered_deals": filtered_rows,
            "outlier_deals": int(len(filtered)),
        },
        warnings,
    )


def _request_payload(payload: Optional[Mapping[str, Any]]) -> Mapping[str, Any]:
    if payload is None:
        return {}
    if not isinstance(payload, Mapping):
        raise CompareAreasError("Request body must be a JSON object.")
    return payload


def _selected_gushes(payload: Mapping[str, Any]) -> List[Any]:
    return _as_list(_first_present(payload, "gushes", "gush", "gush_select", "Gush"))


def _gushes_from_city_streets(data_store: DataStore, lookup: pd.DataFrame, payload: Mapping[str, Any]) -> List[Any]:
    cities = [str(value).strip() for value in _as_list(_first_present(payload, "cities", "city")) if str(value).strip()]
    streets = [str(value).strip() for value in _as_list(_first_present(payload, "streets", "street")) if str(value).strip()]
    if not cities:
        return []

    city_names = {_city_name(data_store, city) for city in cities}
    working = lookup.loc[lookup["city"].isin(city_names)]
    if streets:
        normalized_streets = {_normalize_text(street) for street in streets}
        working = working.loc[working["street"].map(_normalize_text).isin(normalized_streets)]
    return working["Gush"].dropna().tolist()


def _gushes_from_descriptions(descriptions: pd.DataFrame, labels: Sequence[Any]) -> List[Any]:
    normalized_labels = {_normalize_text(label) for label in labels if _normalize_text(label)}
    if not normalized_labels:
        return []
    matches = descriptions.loc[descriptions["Gush_desc"].map(_normalize_text).isin(normalized_labels)]
    exact_match_count = int(matches["Gush_desc"].map(_normalize_text).nunique())
    if exact_match_count != len(normalized_labels):
        raise CompareAreasError("One or more Gush descriptions were not found.")
    return matches["Gush"].dropna().tolist()


def _city_name(data_store: DataStore, city: str) -> str:
    for record in data_store.list_cities():
        if city in {record.get("id"), record.get("name")}:
            return str(record["name"])
    raise CompareAreasError("Unknown city.")


def _unique_gushes(values: Sequence[Any]) -> List[Any]:
    seen: set[Any] = set()
    result: List[Any] = []
    for value in values:
        normalized = _normalize_gush_id(value)
        if normalized is None or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


def _label_by_key(data_store: DataStore, gush_ids: Sequence[Any]) -> Dict[str, str]:
    labels: Dict[str, str] = {}
    for gush_id in gush_ids:
        details = data_store.gush_details(gush_id)
        if details:
            labels[_gush_key(gush_id)] = str(details[0].get("label") or gush_id)
        else:
            labels[_gush_key(gush_id)] = str(gush_id)
    return labels


def _selection_gush_payload(gush_id: Any, label_by_key: Mapping[str, str]) -> Dict[str, Any]:
    return {"id": gush_id, "label": label_by_key.get(_gush_key(gush_id), str(gush_id))}


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
    raise CompareAreasError("Unsupported y variable.")


def _statistic(value: Any) -> str:
    normalized = _normalize_text(value)
    if normalized in {"", "median"}:
        return "median"
    if normalized == "mean":
        return "mean"
    raise CompareAreasError("Unsupported statistic.")


def _summary_by_gush_year(df: pd.DataFrame, statistic: str) -> pd.DataFrame:
    if statistic == "median":
        return summary_by_gush_year(df)
    return _summary_by(df, [column for column in ["city", "Gush", "deal year"] if column in df.columns], statistic)


def _summary_by_city_year(df: pd.DataFrame, statistic: str) -> pd.DataFrame:
    if statistic == "median":
        return summary_by_city_year(df)
    return _summary_by(df, [column for column in ["city", "deal year"] if column in df.columns], statistic)


def _summary_by(df: pd.DataFrame, group_columns: List[str], statistic: str) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=group_columns + ["n_deals", "price_millions", "price_per_m2", "price_per_room"])
    working = df.copy()
    working["price_millions"] = pd.to_numeric(working.get("price_millions"), errors="coerce")
    working["price_per_m2"] = price_used(working, PRICE_TYPE_M2)
    working["price_per_room"] = price_used(working, PRICE_TYPE_ROOM)
    agg = "mean" if statistic == "mean" else "median"
    return (
        working.groupby(group_columns, dropna=False)
        .agg(
            n_deals=("price_millions", "size"),
            price_millions=("price_millions", agg),
            price_per_m2=("price_per_m2", agg),
            price_per_room=("price_per_room", agg),
        )
        .reset_index()
        .sort_values(group_columns)
        .reset_index(drop=True)
    )


def _summary_rows(summary: pd.DataFrame, label_by_key: Mapping[str, str], y_variable: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for _, row in summary.iterrows():
        year = _safe_int(row.get("deal year"))
        gush_id = _normalize_gush_id(row.get("Gush"))
        label = label_by_key.get(_gush_key(gush_id), str(gush_id))
        y_value = row.get(y_variable)
        rows.append(
            {
                "city": _display_value(row.get("city")),
                "gush": gush_id,
                "gush_label": label,
                "series_id": f"{_display_value(row.get('city'))}|{_gush_key(gush_id)}",
                "series_label": f"{_display_value(row.get('city'))} - {label}",
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


def _series_rows(table: Sequence[Mapping[str, Any]]) -> List[Dict[str, Any]]:
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


def _raw_rows(df: pd.DataFrame) -> List[Dict[str, Any]]:
    if df.empty:
        return []
    working = df.copy()
    working["price_per_m2"] = price_used(working, PRICE_TYPE_M2)
    working["price_per_room"] = price_used(working, PRICE_TYPE_ROOM)
    columns = [
        "city",
        "street",
        "Gush",
        "GUSH",
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
    if "date" in working.columns:
        working["_compare_date_sort"] = pd.to_datetime(working["date"], errors="coerce")
        working = working.sort_values(["_compare_date_sort"], kind="mergesort").drop(columns=["_compare_date_sort"])
    return [_json_ready(row) for row in working[[column for column in columns if column in working.columns]].to_dict(orient="records")]


def _overlays(
    city_frame: pd.DataFrame,
    selected_deals: pd.DataFrame,
    payload: Mapping[str, Any],
    y_variable: str,
    statistic: str,
) -> tuple[Dict[str, Any], List[str]]:
    overlays: Dict[str, Any] = {"city_comparison": [], "sp500": []}
    warnings: List[str] = []

    if payload.get("show_city_comparison") is True:
        city_filtered = apply_common_filters(city_frame, _non_location_filters(payload.get("filters")))
        if _remove_price_outliers(payload):
            city_filtered = remove_price_outliers_by_year(city_filtered)
        overlays["city_comparison"] = _city_overlay_rows(_summary_by_city_year(city_filtered, statistic), y_variable)

    if payload.get("show_sp500") is True and y_variable != "n_deals" and not selected_deals.empty:
        yearly = _yearly_selected_values(selected_deals, y_variable, statistic)
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


def _yearly_selected_values(df: pd.DataFrame, y_variable: str, statistic: str) -> pd.DataFrame:
    if df.empty or "deal year" not in df.columns:
        return pd.DataFrame(columns=["deal year", "PriceUsed"])
    working = df.copy()
    working["deal year"] = pd.to_numeric(working["deal year"], errors="coerce")
    if y_variable == "price_per_m2":
        working["PriceUsed"] = price_used(working, PRICE_TYPE_M2)
    elif y_variable == "price_per_room":
        working["PriceUsed"] = price_used(working, PRICE_TYPE_ROOM)
    else:
        working["PriceUsed"] = pd.to_numeric(working.get("price_millions"), errors="coerce")
    return (
        working.dropna(subset=["deal year", "PriceUsed"])
        .groupby("deal year", dropna=True)["PriceUsed"]
        .agg("mean" if statistic == "mean" else "median")
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
