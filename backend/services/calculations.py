from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional, Sequence

import pandas as pd


PRICE_TYPE_PRICE = "Price"
PRICE_TYPE_M2 = "Price / m²"
PRICE_TYPE_ROOM = "Price / Room"

SPECIAL_UNKNOWN_VALUE = 999
MIN_RELIABLE_YEAR_SAMPLE = 10
MAX_OUTLIER_YEAR_WINDOW = 5


class CalculationServiceError(Exception):
    def __init__(self, public_message: str):
        super().__init__(public_message)
        self.public_message = public_message


def price_used(row_or_df: Any, price_type: str) -> Any:
    price_type_key = _normalize_price_type(price_type)

    if isinstance(row_or_df, pd.DataFrame):
        price = pd.to_numeric(row_or_df.get("price_millions"), errors="coerce")
        if price_type_key == "price_per_m2":
            area = pd.to_numeric(row_or_df.get("area"), errors="coerce")
            return (price * 1000 / area).where(area > 0)
        if price_type_key == "price_per_room":
            rooms = pd.to_numeric(row_or_df.get("rooms"), errors="coerce")
            return (price / rooms).where(rooms > 0)
        return price

    row = row_or_df if isinstance(row_or_df, Mapping) else row_or_df.to_dict()
    price = _safe_number(row.get("price_millions"))
    if price_type_key == "price_per_m2":
        area = _safe_number(row.get("area"))
        return price * 1000 / area if price is not None and area and area > 0 else None
    if price_type_key == "price_per_room":
        rooms = _safe_number(row.get("rooms"))
        return price / rooms if price is not None and rooms and rooms > 0 else None
    return price


def remove_price_outliers_by_year(df: pd.DataFrame) -> pd.DataFrame:
    if "price_millions" not in df.columns or "deal year" not in df.columns:
        return df.copy()
    if df.empty:
        return df.copy()

    working = df.copy()
    working["_nadlan2_price"] = pd.to_numeric(working["price_millions"], errors="coerce")
    working["_nadlan2_year"] = pd.to_numeric(working["deal year"], errors="coerce")
    years = sorted(working["_nadlan2_year"].dropna().unique().tolist())
    if not years:
        return working.drop(columns=["_nadlan2_price", "_nadlan2_year"])

    filtered_frames: list[pd.DataFrame] = []
    min_year = min(years)
    max_year = max(years)

    for current_year in years:
        year_data = working.loc[working["_nadlan2_year"] == current_year]
        reference_data = year_data

        if len(year_data) < MIN_RELIABLE_YEAR_SAMPLE:
            window_size = 1
            while len(reference_data) < MIN_RELIABLE_YEAR_SAMPLE and window_size <= MAX_OUTLIER_YEAR_WINDOW:
                window_start = max(min_year, current_year - window_size)
                window_end = min(max_year, current_year + window_size)
                reference_data = working.loc[
                    (working["_nadlan2_year"] >= window_start) & (working["_nadlan2_year"] <= window_end)
                ]
                window_size += 1

        q1 = reference_data["_nadlan2_price"].quantile(0.25)
        q3 = reference_data["_nadlan2_price"].quantile(0.75)
        iqr = q3 - q1
        lower_bound = q1 - 2.5 * iqr
        upper_bound = q3 + 2.5 * iqr

        filtered_frames.append(
            year_data.loc[
                (year_data["_nadlan2_price"] >= lower_bound) & (year_data["_nadlan2_price"] <= upper_bound)
            ]
        )

    if not filtered_frames:
        return working.iloc[0:0].drop(columns=["_nadlan2_price", "_nadlan2_year"])
    return pd.concat(filtered_frames, ignore_index=True).drop(columns=["_nadlan2_price", "_nadlan2_year"])


def remove_price_outliers_global_iqr(df: pd.DataFrame, *, multiplier: float = 1.5) -> pd.DataFrame:
    if "price_millions" not in df.columns:
        return df.copy()
    if df.empty:
        return df.copy()

    values = pd.to_numeric(df["price_millions"], errors="coerce")
    q1 = values.quantile(0.25)
    q3 = values.quantile(0.75)
    iqr = q3 - q1
    lower_bound = q1 - multiplier * iqr
    upper_bound = q3 + multiplier * iqr
    return df.loc[(values >= lower_bound) & (values <= upper_bound)].copy()


def remove_outliers_from_var(df: pd.DataFrame, var_name: str) -> pd.DataFrame:
    if var_name not in df.columns:
        return df.copy()
    if df.empty:
        return df.copy()

    values = pd.to_numeric(df[var_name], errors="coerce")
    q1 = values.quantile(0.25)
    q3 = values.quantile(0.75)
    iqr = q3 - q1
    lower_bound = q1 - 1.5 * iqr
    upper_bound = q3 + 1.5 * iqr
    return df.loc[(values >= lower_bound) & (values <= upper_bound)].copy()


def apply_common_filters(df: pd.DataFrame, filters: Optional[Mapping[str, Any]]) -> pd.DataFrame:
    if filters is None or df.empty:
        return df.copy()

    result = df.copy()

    result = _apply_exact_filter(result, "city", _filter_value(filters, "cities", "city"))
    result = _apply_exact_filter(result, "street", _filter_value(filters, "streets", "street"))
    result = _apply_gush_filter(result, _filter_value(filters, "gushes", "gush", "gush_select", "Gush"))

    result = _apply_range_filter(
        result,
        "floor",
        _range_value(filters, "floor", "floor_range"),
        retain_special_values={SPECIAL_UNKNOWN_VALUE},
    )
    result = _apply_rooms_filter(result, _filter_value(filters, "rooms", "rooms_select"))
    result = _apply_range_filter(result, "area", _range_value(filters, "area", "area_range"))
    result = _apply_range_filter(result, "price_millions", _range_value(filters, "price_millions", "price_range"))
    result = _apply_price_per_m2_filter(result, _range_value(filters, "price_per_m2", "price_per_m2_range"))
    result = _apply_range_filter(result, "deal year", _range_value(filters, "deal year", "deal_year_range", "year"))
    result = _apply_build_year_filter(result, _range_value(filters, "build_year", "built_year_range"))
    result = _apply_building_age_filter(result, _range_value(filters, "building age", "building_age_range"))
    result = _apply_building_floors_filter(
        result,
        _range_value(filters, "build_floors", "building_floors_range"),
    )
    result = _apply_roof_filter(result, _filter_value(filters, "roof", "roof_select"))
    result = _apply_new_project_filter(result, _filter_value(filters, "new_project", "new_project_select"))
    result = _apply_exact_filter(result, "apt type", _filter_value(filters, "apartment_types", "apt_type_select", "apt type"))

    return result


def summary_by_gush_year(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return _empty_summary(["city", "Gush", "deal year"] if "city" in df.columns else ["Gush", "deal year"])

    group_columns = [column for column in ["city", "Gush", "deal year"] if column in df.columns]
    return _summary_by(df, group_columns)


def summary_by_city_year(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return _empty_summary(["city", "deal year"])
    return _summary_by(df, [column for column in ["city", "deal year"] if column in df.columns])


def sp500_normalized(years: Sequence[Any], base_value: Any) -> pd.DataFrame:
    numeric_years = pd.to_numeric(pd.Series(list(years)), errors="coerce").dropna()
    base = _safe_number(base_value)
    if numeric_years.empty or base is None:
        return _empty_sp500()

    first_year = int(numeric_years.min())
    last_year = int(numeric_years.max())
    sp500 = _load_sp500_data()
    sp500_filtered = sp500.loc[sp500["Year"].between(first_year, last_year)].copy()
    if sp500_filtered.empty:
        return _empty_sp500()

    first_year_index = sp500_filtered.loc[sp500_filtered["Year"] == first_year, "index_shekels"]
    if first_year_index.empty or pd.isna(first_year_index.iloc[0]) or first_year_index.iloc[0] <= 0:
        return _empty_sp500()

    sp500_filtered["PriceUsed"] = base * (sp500_filtered["index_shekels"] / first_year_index.iloc[0])
    sp500_filtered["date"] = pd.to_datetime(sp500_filtered["Year"].astype(int).astype(str) + "-01-01").dt.date
    sp500_filtered["story"] = sp500_filtered.apply(
        lambda row: (
            "S&P 500 (normalized)<br>"
            f"Year: {int(row['Year'])}<br>"
            f"Value: {round(row['PriceUsed'], 2)}<br><br>"
            "S&P 500 (normalized)<br>"
            "Value is relative to the first year"
        ),
        axis=1,
    )
    return sp500_filtered[["Year", "date", "PriceUsed", "story"]].sort_values("date").reset_index(drop=True)


def _summary_by(df: pd.DataFrame, group_columns: list[str]) -> pd.DataFrame:
    if not group_columns:
        return _empty_summary([])

    working = df.copy()
    working["price_millions"] = pd.to_numeric(working.get("price_millions"), errors="coerce")
    working["price_per_m2"] = price_used(working, PRICE_TYPE_M2)
    working["price_per_room"] = price_used(working, PRICE_TYPE_ROOM)

    return (
        working.groupby(group_columns, dropna=False)
        .agg(
            n_deals=("price_millions", "size"),
            price_millions=("price_millions", "median"),
            price_per_m2=("price_per_m2", "median"),
            price_per_room=("price_per_room", "median"),
        )
        .reset_index()
        .sort_values(group_columns)
        .reset_index(drop=True)
    )


def _empty_summary(group_columns: list[str]) -> pd.DataFrame:
    return pd.DataFrame(columns=group_columns + ["n_deals", "price_millions", "price_per_m2", "price_per_room"])


def _apply_exact_filter(df: pd.DataFrame, column: str, selected: Any) -> pd.DataFrame:
    values = _as_list(selected)
    if column not in df.columns or not values:
        return df
    normalized_values = {_normalize_text(value) for value in values}
    mask = df[column].map(_normalize_text).isin(normalized_values)
    return df.loc[mask]


def _apply_gush_filter(df: pd.DataFrame, selected: Any) -> pd.DataFrame:
    values = _as_list(selected)
    if "Gush" not in df.columns or not values:
        return df
    normalized_values = {_normalize_gush_id(value) for value in values}
    normalized_values.discard(None)
    if not normalized_values:
        return df
    mask = df["Gush"].map(_normalize_gush_id).isin(normalized_values)
    return df.loc[mask]


def _apply_range_filter(
    df: pd.DataFrame,
    column: str,
    value_range: Optional[tuple[Optional[float], Optional[float]]],
    *,
    retain_special_values: Optional[set[int | float]] = None,
) -> pd.DataFrame:
    if column not in df.columns or value_range is None:
        return df
    values = pd.to_numeric(df[column], errors="coerce")
    mask = _between_mask(values, value_range)
    if retain_special_values:
        mask = mask | values.isin(retain_special_values)
    return df.loc[mask]


def _apply_rooms_filter(df: pd.DataFrame, selected: Any) -> pd.DataFrame:
    selected_values = _as_list(selected)
    if "rooms" not in df.columns or not selected_values:
        return df
    selected_numbers = {_safe_number(value) for value in selected_values}
    selected_numbers.discard(None)
    rooms = pd.to_numeric(df["rooms"], errors="coerce")
    rounded_rooms = (rooms * 2).round() / 2
    mask = rounded_rooms.isin(selected_numbers) | rooms.eq(SPECIAL_UNKNOWN_VALUE) | rooms.isna()
    return df.loc[mask]


def _apply_price_per_m2_filter(
    df: pd.DataFrame,
    value_range: Optional[tuple[Optional[float], Optional[float]]],
) -> pd.DataFrame:
    if value_range is None or "price_millions" not in df.columns or "area" not in df.columns:
        return df
    values = price_used(df, PRICE_TYPE_M2)
    return df.loc[_between_mask(values, value_range)]


def _apply_build_year_filter(
    df: pd.DataFrame,
    value_range: Optional[tuple[Optional[float], Optional[float]]],
) -> pd.DataFrame:
    if value_range is None or "build_year" not in df.columns:
        return df
    values = pd.to_numeric(df["build_year"], errors="coerce")
    mask = values.isna() | (values < 1900) | _between_mask(values, value_range)
    return df.loc[mask]


def _apply_building_age_filter(
    df: pd.DataFrame,
    value_range: Optional[tuple[Optional[float], Optional[float]]],
) -> pd.DataFrame:
    if value_range is None or "building age" not in df.columns:
        return df
    values = pd.to_numeric(df["building age"], errors="coerce")
    mask = values.isna() | (values > 150) | _between_mask(values, value_range)
    return df.loc[mask]


def _apply_building_floors_filter(
    df: pd.DataFrame,
    value_range: Optional[tuple[Optional[float], Optional[float]]],
) -> pd.DataFrame:
    if value_range is None or "build_floors" not in df.columns:
        return df
    values = pd.to_numeric(df["build_floors"], errors="coerce")
    comparison_values = values.fillna(SPECIAL_UNKNOWN_VALUE)
    mask = comparison_values.eq(SPECIAL_UNKNOWN_VALUE) | _between_mask(comparison_values, value_range)
    return df.loc[mask]


def _apply_roof_filter(df: pd.DataFrame, selected: Any) -> pd.DataFrame:
    selected_key = _normalize_text(selected)
    if "roof" not in df.columns or selected_key in {"", "both", "all"}:
        return df
    roof = _normalize_roof_series(df["roof"])
    if selected_key in {"yes", "true", "1", "y"}:
        return df.loc[roof.eq(True)]
    if selected_key in {"no", "false", "0", "n"}:
        return df.loc[roof.eq(False) | roof.isna()]
    return df


def _apply_new_project_filter(df: pd.DataFrame, selected: Any) -> pd.DataFrame:
    if "New_Project" not in df.columns:
        return df
    selected_key = _normalize_text(selected)
    if selected_key in {"", "both", "all"}:
        return df
    if selected_key in {"yes", "true", "1", "new", "new project"}:
        return df.loc[df["New_Project"].map(_normalize_text) == "new project"]
    if selected_key in {"no", "false", "0", "2nd hand", "second hand"}:
        return df.loc[df["New_Project"].map(_normalize_text) == "2nd hand"]
    values = _as_list(selected)
    if not values:
        return df
    normalized_values = {_normalize_text(value) for value in values}
    return df.loc[df["New_Project"].map(_normalize_text).isin(normalized_values)]


def _between_mask(values: pd.Series, value_range: tuple[Optional[float], Optional[float]]) -> pd.Series:
    low, high = value_range
    mask = pd.Series(True, index=values.index)
    if low is not None:
        mask = mask & values.ge(low)
    if high is not None:
        mask = mask & values.le(high)
    return mask & values.notna()


def _range_value(filters: Mapping[str, Any], *keys: str) -> Optional[tuple[Optional[float], Optional[float]]]:
    value = _filter_value(filters, *keys)
    if value is None:
        for container_key in ("numeric_ranges", "ranges"):
            container = filters.get(container_key)
            if isinstance(container, Mapping):
                value = _first_present(container, *keys)
                if value is not None:
                    break
    return _coerce_range(value)


def _filter_value(filters: Mapping[str, Any], *keys: str) -> Any:
    value = _first_present(filters, *keys)
    if value is not None:
        return value
    categorical = filters.get("categorical")
    if isinstance(categorical, Mapping):
        return _first_present(categorical, *keys)
    return None


def _first_present(values: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in values:
            value = values[key]
            if value is not None:
                return value
    return None


def _coerce_range(value: Any) -> Optional[tuple[Optional[float], Optional[float]]]:
    if value is None:
        return None
    if isinstance(value, Mapping):
        low = _safe_number(value.get("min"))
        high = _safe_number(value.get("max"))
    else:
        values = _as_list(value)
        if len(values) != 2:
            return None
        low = _safe_number(values[0])
        high = _safe_number(values[1])
    if low is None and high is None:
        return None
    return low, high


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, (str, bytes)):
        return [value]
    if isinstance(value, Iterable):
        return list(value)
    return [value]


def _normalize_price_type(price_type: str) -> str:
    value = _normalize_text(price_type)
    if value in {"price / m²", "price / m2", "price per m2", "price_per_m2"}:
        return "price_per_m2"
    if value in {"price / room", "price per room", "price_per_room"}:
        return "price_per_room"
    return "price"


def _normalize_roof_series(values: pd.Series) -> pd.Series:
    def normalize(value: Any) -> Optional[bool]:
        if pd.isna(value):
            return None
        if isinstance(value, bool):
            return value
        text = _normalize_text(value)
        if text in {"true", "t", "yes", "y", "1", "כן"}:
            return True
        if text in {"false", "f", "no", "n", "0", "לא"}:
            return False
        return None

    return values.map(normalize)


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    if not isinstance(value, (str, bytes)):
        try:
            is_missing = pd.isna(value)
        except (TypeError, ValueError):
            is_missing = False
        try:
            if not hasattr(is_missing, "__len__") and bool(is_missing):
                return ""
        except (TypeError, ValueError):
            pass
    return str(value).strip().casefold()


def _normalize_gush_id(value: Any) -> Optional[int | str]:
    numeric = _safe_number(value)
    if numeric is None:
        text = _normalize_text(value)
        return text or None
    if float(numeric).is_integer():
        return int(numeric)
    return str(numeric)


def _safe_number(value: Any) -> Optional[float]:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if pd.isna(numeric):
        return None
    return numeric


def _empty_sp500() -> pd.DataFrame:
    return pd.DataFrame(columns=["Year", "date", "PriceUsed", "story"])


@lru_cache(maxsize=1)
def _load_sp500_data() -> pd.DataFrame:
    path = Path(__file__).resolve().parents[2] / "data" / "metadata" / "sp500_shekels.csv"
    try:
        frame = pd.read_csv(path)
    except (FileNotFoundError, OSError, ValueError) as exc:
        raise CalculationServiceError("S&P 500 metadata could not be loaded.") from exc

    if "Year" not in frame.columns or "index_shekels" not in frame.columns:
        raise CalculationServiceError("S&P 500 metadata is not in the expected format.")
    frame = frame.copy()
    frame["Year"] = pd.to_numeric(frame["Year"], errors="coerce").astype("Int64")
    frame["index_shekels"] = pd.to_numeric(frame["index_shekels"], errors="coerce")
    return frame.dropna(subset=["Year", "index_shekels"])
