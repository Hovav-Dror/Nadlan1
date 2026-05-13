from __future__ import annotations

from typing import Any, Dict, List, Mapping, Optional, Sequence

import pandas as pd

from .calculations import (
    PRICE_TYPE_M2,
    SPECIAL_UNKNOWN_VALUE,
    apply_common_filters,
    price_used,
    remove_price_outliers_by_year,
)
from .data_store import DataStore


class FilterMetadataError(Exception):
    def __init__(self, public_message: str):
        super().__init__(public_message)
        self.public_message = public_message


def build_filter_options(data_store: DataStore, payload: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    request_payload = payload or {}
    cities = _selected_cities(request_payload)
    if not cities:
        gushes = _as_list(_first_present(request_payload, "gushes", "gush", "gush_select", "Gush"))
        cities = [city["id"] for city in data_store.cities_for_gushes(gushes)]
    if not cities:
        raise FilterMetadataError("At least one city is required.")

    frame = data_store.load_cities(cities)
    location_filters = _location_filters(request_payload)
    filtered = apply_common_filters(frame, location_filters)
    apartment_types = list(data_store.load_apt_types().get("apt_types", []))

    return build_filter_options_from_frame(filtered, apartment_types)


def build_filter_options_from_frame(df: pd.DataFrame, apartment_types: Sequence[str]) -> Dict[str, Any]:
    cleaned = remove_price_outliers_by_year(df)
    rooms = _room_choices(df.get("rooms"))
    return _json_ready(
        {
            "counts": {
                "before_outlier_removal": int(len(df)),
                "after_outlier_removal": int(len(cleaned)),
            },
            "ranges": _numeric_ranges(df),
            "rooms": {
                "choices": rooms,
                "smart_selected": smart_room_defaults(rooms, df.get("rooms")),
                "unknown_count": _special_count(df.get("rooms"), include_na=True),
            },
            "apartment_types": {
                "choices": list(apartment_types),
                "available": _sorted_strings(df.get("apt type")),
            },
            "roof": _roof_counts(df.get("roof")),
            "warnings": ["No matching transactions were found."] if df.empty else [],
        }
    )


def smart_room_defaults(room_choices: Sequence[Any], room_values: Optional[pd.Series] = None) -> List[float | int]:
    numeric_choices = sorted({_compact_number(value) for value in room_choices if _safe_number(value) is not None})
    if not numeric_choices:
        return []

    if room_values is None:
        return numeric_choices

    counts = _room_counts(room_values, numeric_choices)
    if len(counts) <= 3:
        return numeric_choices
    if not counts:
        return numeric_choices

    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    total_deals = sum(count for _, count in ranked)
    if total_deals <= 0:
        return numeric_choices

    selected: List[float | int] = []
    cumulative_deals = 0
    for index, (room, count) in enumerate(ranked):
        cumulative_deals += count
        cumulative_percentage = (cumulative_deals / total_deals) * 100
        contribution = (count / total_deals) * 100

        if index == 0 or len(selected) < 2 or cumulative_percentage <= 80 or contribution >= 8:
            selected.append(room)
        else:
            break

        if len(selected) >= 6:
            break

    selected_set = set(selected)
    return [room for room in numeric_choices if room in selected_set]


def street_search_results(
    data_store: DataStore,
    query: str,
    *,
    city: Optional[str] = None,
    limit: int = 25,
) -> List[Dict[str, Any]]:
    results = data_store.search_streets(query, city=city, limit=limit)
    enriched: List[Dict[str, Any]] = []
    for result in results:
        gushes = []
        for gush_id in result.get("gush_ids", []):
            details = [
                detail
                for detail in data_store.gush_details(gush_id)
                if not city or detail.get("city") == result.get("city")
            ]
            label = details[0]["label"] if details else str(gush_id)
            gushes.append({"id": gush_id, "label": label})
        enriched.append({**result, "gushes": gushes})
    return _json_ready(enriched)


def gush_search_results(
    data_store: DataStore,
    query: str,
    *,
    limit: int = 30,
) -> List[Dict[str, Any]]:
    normalized_query = _normalize_text(query)
    if not normalized_query:
        return []
    descriptions = data_store.load_metadata()["gush_descriptions"].copy()
    working = descriptions.dropna(subset=["Gush", "Gush_desc"]).copy()
    haystack = (
        working["Gush"].astype(str).map(_normalize_text)
        + " "
        + working["Gush_desc"].astype(str).map(_normalize_text)
        + " "
        + working.get("city", pd.Series("", index=working.index)).astype(str).map(_normalize_text)
        + " "
        + working.get("street", pd.Series("", index=working.index)).astype(str).map(_normalize_text)
    )
    matches = working.loc[haystack.str.contains(normalized_query, regex=False)].copy()
    if matches.empty:
        return []
    matches["_rank"] = matches["Gush_desc"].astype(str).map(
        lambda label: 0 if _normalize_text(label).startswith(normalized_query) else 1
    )
    matches = matches.sort_values(["_rank", "city", "Gush_desc"]).head(limit)
    return _json_ready(
        [
            {
                "id": _normalize_gush_id(row.get("Gush")),
                "label": _safe_string(row.get("Gush_desc")) or str(row.get("Gush")),
                "city": _safe_string(row.get("city")),
                "representative_street": _safe_string(row.get("street")),
                "deals": _safe_int(row.get("n")),
            }
            for _, row in matches.iterrows()
        ]
    )


def gush_detail(data_store: DataStore, gush_id: Any) -> Dict[str, Any]:
    matches = data_store.gush_details(gush_id)
    if not matches:
        raise FilterMetadataError("Unknown Gush.")
    return {"id": str(matches[0]["id"]), "matches": _json_ready(matches)}


def _selected_cities(payload: Mapping[str, Any]) -> List[str]:
    value = _first_present(payload, "cities", "city")
    values = _as_list(value)
    return [str(value).strip() for value in values if str(value).strip()]


def _location_filters(payload: Mapping[str, Any]) -> Dict[str, Any]:
    filters: Dict[str, Any] = {}
    for target, keys in {
        "streets": ("streets", "street"),
        "gushes": ("gushes", "gush", "gush_select", "Gush"),
    }.items():
        value = _first_present(payload, *keys)
        values = _as_list(value)
        if values:
            filters[target] = values
    return filters


def _numeric_ranges(df: pd.DataFrame) -> Dict[str, Any]:
    price_per_m2 = price_used(df, PRICE_TYPE_M2) if {"price_millions", "area"}.issubset(df.columns) else None
    return {
        "price_millions": _range_payload(df.get("price_millions")),
        "price_per_m2": _range_payload(price_per_m2),
        "area": _range_payload(df.get("area")),
        "rooms": _range_payload(df.get("rooms"), excluded_values={SPECIAL_UNKNOWN_VALUE}),
        "floor": _range_payload(df.get("floor"), excluded_values={SPECIAL_UNKNOWN_VALUE}),
        "deal_year": _range_payload(df.get("deal year")),
        "build_year": _range_payload(df.get("build_year"), min_value=1900),
        "building_age": _range_payload(df.get("building age"), max_value=150),
        "build_floors": _range_payload(df.get("build_floors"), excluded_values={SPECIAL_UNKNOWN_VALUE}),
    }


def _range_payload(
    values: Optional[pd.Series],
    *,
    excluded_values: Optional[set[int | float]] = None,
    min_value: Optional[float] = None,
    max_value: Optional[float] = None,
) -> Dict[str, Any]:
    if values is None:
        return {"min": None, "max": None, "count": 0, "special_count": 0}

    numeric = pd.to_numeric(values, errors="coerce")
    usable = numeric.dropna()
    special_mask = numeric.isna()
    if excluded_values:
        excluded_mask = numeric.isin(excluded_values)
        special_mask = special_mask | excluded_mask
        usable = usable.loc[~usable.isin(excluded_values)]
    if min_value is not None:
        too_low = usable < min_value
        special_mask = special_mask | numeric.lt(min_value).fillna(False)
        usable = usable.loc[~too_low]
    if max_value is not None:
        too_high = usable > max_value
        special_mask = special_mask | numeric.gt(max_value).fillna(False)
        usable = usable.loc[~too_high]

    if usable.empty:
        return {"min": None, "max": None, "count": 0, "special_count": int(special_mask.sum())}
    return {
        "min": _compact_number(usable.min()),
        "max": _compact_number(usable.max()),
        "count": int(len(usable)),
        "special_count": int(special_mask.sum()),
    }


def _room_choices(values: Optional[pd.Series]) -> List[float | int]:
    if values is None:
        return []
    numeric = pd.to_numeric(values, errors="coerce")
    numeric = numeric.dropna()
    numeric = numeric.loc[~numeric.eq(SPECIAL_UNKNOWN_VALUE)]
    return [_compact_number(value) for value in sorted(numeric.unique().tolist())]


def _room_counts(values: pd.Series, room_choices: Sequence[float | int]) -> Dict[float | int, int]:
    numeric = pd.to_numeric(values, errors="coerce")
    numeric = numeric.dropna()
    numeric = numeric.loc[~numeric.eq(SPECIAL_UNKNOWN_VALUE)]
    rounded = (numeric * 2).round() / 2
    counts = rounded.map(_compact_number).value_counts()
    return {room: int(counts.get(room, 0)) for room in room_choices if int(counts.get(room, 0)) > 0}


def _special_count(values: Optional[pd.Series], *, include_na: bool = False) -> int:
    if values is None:
        return 0
    numeric = pd.to_numeric(values, errors="coerce")
    mask = numeric.eq(SPECIAL_UNKNOWN_VALUE)
    if include_na:
        mask = mask | numeric.isna()
    return int(mask.sum())


def _sorted_strings(values: Optional[pd.Series]) -> List[str]:
    if values is None:
        return []
    strings = [str(value).strip() for value in values.dropna().unique().tolist() if str(value).strip()]
    return sorted(strings)


def _roof_counts(values: Optional[pd.Series]) -> Dict[str, int]:
    if values is None:
        return {"yes": 0, "no": 0, "unknown": 0}
    normalized = values.map(_normalize_roof)
    return {
        "yes": int(normalized.eq(True).sum()),
        "no": int(normalized.eq(False).sum()),
        "unknown": int(normalized.isna().sum()),
    }


def _normalize_roof(value: Any) -> Optional[bool]:
    if value is None or pd.isna(value):
        return None
    if isinstance(value, bool):
        return value
    text = str(value).strip().casefold()
    if text in {"true", "t", "yes", "y", "1", "כן"}:
        return True
    if text in {"false", "f", "no", "n", "0", "לא"}:
        return False
    return None


def _json_ready(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _json_ready(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_ready(item) for item in value]
    if isinstance(value, tuple):
        return [_json_ready(item) for item in value]
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if not isinstance(value, (list, tuple, dict, pd.Series, pd.DataFrame)) and pd.isna(value):
        return None
    if hasattr(value, "item"):
        try:
            return value.item()
        except (TypeError, ValueError):
            pass
    return value


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


def _normalize_gush_id(value: Any) -> Optional[int | str]:
    numeric = _safe_number(value)
    if numeric is None:
        text = str(value).strip()
        return text or None
    if float(numeric).is_integer():
        return int(numeric)
    return str(numeric)


def _safe_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    text = str(value).strip()
    return text or None


def _safe_int(value: Any) -> Optional[int]:
    try:
        if pd.isna(value):
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _safe_number(value: Any) -> Optional[float]:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if pd.isna(numeric):
        return None
    return numeric


def _compact_number(value: Any) -> float | int:
    numeric = float(value)
    if numeric.is_integer():
        return int(numeric)
    return round(numeric, 3)
