"""Descriptive summaries of the complete filtered selection, before plot sampling."""
from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd


MIN_YEAR_PRICES = 10


def build_analysis_insights(frame: pd.DataFrame) -> dict[str, Any]:
    prices = pd.to_numeric(frame["PriceUsed"], errors="coerce").replace([np.inf, -np.inf], np.nan)
    valid = prices.dropna()
    years = pd.to_numeric(frame.get("deal year", pd.Series(index=frame.index, dtype=float)), errors="coerce")
    dated = years.between(1900, 2100) & years.mod(1).eq(0)
    yearly = pd.DataFrame({"year": years[dated], "price": prices[dated]})
    annual = []
    if not yearly.empty:
        groups = {int(year): group for year, group in yearly.groupby("year")}
        for year in range(min(groups), max(groups) + 1):
            group = groups.get(year)
            values = group["price"].dropna() if group is not None else pd.Series(dtype=float)
            annual.append({
                "year": year,
                "deals": int(len(group)) if group is not None else 0,
                "valid_prices": int(len(values)),
                "median": _quantile(values, 0.5),
                "p25": _quantile(values, 0.25),
                "p75": _quantile(values, 0.75),
                "low_sample": len(values) < MIN_YEAR_PRICES,
            })

    distribution = []
    if not valid.empty:
        # Bound response size, retain extreme values, and include the rightmost edge.
        bin_count = min(30, max(1, math.ceil(math.sqrt(len(valid)))))
        counts, edges = np.histogram(valid.to_numpy(dtype=float), bins=bin_count if valid.nunique() > 1 else 1)
        distribution = [{"low": float(edges[i]), "high": float(edges[i + 1]), "count": int(count)}
                        for i, count in enumerate(counts)]

    return {
        "matching_deals": int(len(frame)),
        "valid_price_deals": int(len(valid)),
        "missing_price_deals": int(prices.isna().sum()),
        "undated_deals": int((~dated).sum()),
        "median": _quantile(valid, 0.5),
        "p25": _quantile(valid, 0.25),
        "p75": _quantile(valid, 0.75),
        "min_year_prices": MIN_YEAR_PRICES,
        "annual": annual,
        "distribution": distribution,
        "segments": build_segment_breakdown(frame),
        "adjusted_index": build_adjusted_index(frame),
    }


def _numeric(frame: pd.DataFrame, column: str) -> pd.Series:
    if column not in frame.columns:
        return pd.Series(np.nan, index=frame.index, dtype=float)
    return pd.to_numeric(frame[column], errors="coerce").replace([np.inf, -np.inf], np.nan)


def _quantile(values: pd.Series, quantile: float) -> float | None:
    return float(values.quantile(quantile)) if not values.empty else None


# Attribute bands shared by the segment breakdown and the mix-adjusted index.
# Labels are ordered; values outside every band (or sentinels) become "unknown".
UNKNOWN_LABEL = "לא ידוע"
MIN_SEGMENT_PRICES = 10
MIN_INDEX_YEAR_PRICES = 5
MIN_INDEX_PRICES = 30
BAND_SPECS = {
    "rooms": ("rooms", [(1, 2, "1–1.5"), (2, 3, "2–2.5"), (3, 4, "3–3.5"), (4, 5, "4–4.5"), (5, 6, "5–5.5"), (6, 13, "6+")]),
    "floor": ("floor", [(-10, 1, "קרקע ומטה"), (1, 3, "1–2"), (3, 6, "3–5"), (6, 11, "6–10"), (11, 100, "11+")]),
    "age": ("building age", [(-5, 3, "חדש (עד 2)"), (3, 11, "3–10"), (11, 26, "11–25"), (26, 51, "26–50"), (51, 150, "51+")]),
    "area": ("area", [(10, 50, "עד 50"), (50, 75, "50–75"), (75, 100, "75–100"), (100, 130, "100–130"), (130, 1000, "130+")]),
}
MAX_TYPE_SEGMENTS = 6


def attribute_bands(frame: pd.DataFrame) -> dict[str, pd.Series]:
    """Return an ordered categorical per attribute; missing, sentinel and implausible values are unknown."""
    bands: dict[str, pd.Series] = {}
    for key, (column, specs) in BAND_SPECS.items():
        values = _numeric(frame, column)
        labels = pd.Series(UNKNOWN_LABEL, index=frame.index, dtype=object)
        for low, high, label in specs:
            labels[values.ge(low) & values.lt(high)] = label
        bands[key] = pd.Categorical(labels, categories=[label for *_, label in specs] + [UNKNOWN_LABEL], ordered=True)
    types = frame.get("apt type", pd.Series(index=frame.index, dtype=object)).astype(object)
    types = types.where(types.notna() & types.astype(str).str.strip().ne(""), UNKNOWN_LABEL).astype(str).str.strip()
    common = [value for value in types[types.ne(UNKNOWN_LABEL)].value_counts().index[:MAX_TYPE_SEGMENTS]]
    other = "אחר"
    types = types.where(types.isin(common) | types.eq(UNKNOWN_LABEL), other)
    bands["type"] = pd.Categorical(types, categories=common + [other, UNKNOWN_LABEL], ordered=True)
    return {key: pd.Series(value, index=frame.index) for key, value in bands.items()}


def build_segment_breakdown(frame: pd.DataFrame) -> dict[str, Any]:
    """Price by attribute band, with a premium measured against the same-year median.

    Pooling several years mixes market timing with attributes; comparing each deal with
    its own year's median separates "which apartments cost more" from "when they sold".
    Price per m² is used regardless of the selected metric: by total price, bigger
    apartments are trivially "more expensive".
    """
    prices = _numeric(frame, "price_per_m2")
    years = _numeric(frame, "deal year")
    valid_year = prices.notna() & years.notna()
    year_groups = prices[valid_year].groupby(years[valid_year])
    year_median = year_groups.transform("median")
    year_count = year_groups.transform("count")
    relative = (prices[valid_year] / year_median).where(year_count >= MIN_INDEX_YEAR_PRICES)
    relative = relative.reindex(frame.index)
    dimensions = {}
    for key, bands in attribute_bands(frame).items():
        rows = []
        for label in bands.cat.categories:
            mask = bands.eq(label)
            deals = int(mask.sum())
            if not deals:
                continue
            values = prices[mask].dropna()
            ratios = relative[mask].dropna()
            rows.append({
                "label": str(label),
                "deals": deals,
                "valid_prices": int(len(values)),
                "median": _quantile(values, 0.5),
                "p25": _quantile(values, 0.25),
                "p75": _quantile(values, 0.75),
                "premium_pct": round((float(ratios.median()) - 1) * 100, 1) if len(ratios) >= MIN_SEGMENT_PRICES else None,
                "low_sample": len(values) < MIN_SEGMENT_PRICES,
                "unknown": str(label) == UNKNOWN_LABEL,
            })
        dimensions[key] = rows
    return {"min_prices": MIN_SEGMENT_PRICES, "dimensions": dimensions}


def build_adjusted_index(frame: pd.DataFrame) -> dict[str, Any]:
    """Hedonic (repeat-characteristics) price index for the selection.

    log(price) is regressed on year indicators plus log(area) and room/floor/age/type
    bands, so a year dominated by small or new apartments does not look like a price
    change. Unknown attributes are their own band, keeping those deals in the model.
    The index is independent of the chosen price metric: area is always controlled.
    """
    price, area, years = (_numeric(frame, column) for column in ("price_millions", "area", "deal year"))
    usable = price.gt(0) & price.lt(np.inf) & area.between(10, 1000) & years.between(1900, 2100)
    counts = years[usable].value_counts()
    index_years = sorted(int(year) for year, count in counts.items() if count >= MIN_INDEX_YEAR_PRICES)
    usable &= years.isin(index_years)
    result: dict[str, Any] = {"min_year_prices": MIN_INDEX_YEAR_PRICES, "observations": int(usable.sum()), "years": [], "base_year": None}
    if len(index_years) < 2 or usable.sum() < MIN_INDEX_PRICES:
        result["reason"] = "insufficient"
        return result

    data = frame.loc[usable]
    target = np.log(price[usable].to_numpy(dtype=float))
    base_year = index_years[0]
    columns = [np.ones(len(data)), np.log(area[usable].to_numpy(dtype=float))]
    names = ["const", "log_area"]
    year_values = years[usable].to_numpy()
    for year in index_years[1:]:
        columns.append((year_values == year).astype(float))
        names.append(f"year:{year}")
    for key, bands in attribute_bands(data).items():
        present = [label for label in bands.cat.categories if bands.eq(label).any()]
        # The most common band is the reference level; others are offsets from it.
        reference = bands.value_counts().idxmax()
        for label in present:
            if label != reference:
                columns.append(bands.eq(label).to_numpy(dtype=float))
                names.append(f"{key}:{label}")
    design = np.column_stack(columns)
    coef, _, rank, _ = np.linalg.lstsq(design, target, rcond=None)
    residuals = target - design @ coef
    # One robust refit: gross misrecords (whole-building prices, typos in area) would
    # otherwise dominate a least-squares fit on a few hundred deals.
    spread = 1.4826 * float(np.median(np.abs(residuals - np.median(residuals))))
    keep = np.abs(residuals) <= 4 * spread if spread > 0 else np.ones(len(target), dtype=bool)
    if keep.sum() >= MIN_INDEX_PRICES and not keep.all():
        design, target, year_values = design[keep], target[keep], year_values[keep]
        coef, _, rank, _ = np.linalg.lstsq(design, target, rcond=None)
        residuals = target - design @ coef
    kept_counts = pd.Series(year_values).value_counts()
    dof = max(len(target) - rank, 1)
    sigma2 = float(residuals @ residuals) / dof
    covariance = sigma2 * np.linalg.pinv(design.T @ design)
    total = float(((target - target.mean()) ** 2).sum())
    raw = pd.Series(price[usable].to_numpy() * 1000 / area[usable].to_numpy()).groupby(years[usable].to_numpy()).median()

    for year in index_years:
        if year == base_year:
            value, low, high = 100.0, None, None
        else:
            position = names.index(f"year:{year}")
            estimate, error = coef[position], math.sqrt(max(covariance[position, position], 0.0))
            value = 100 * math.exp(estimate)
            low, high = 100 * math.exp(estimate - 1.96 * error), 100 * math.exp(estimate + 1.96 * error)
        result["years"].append({
            "year": year,
            "observations": int(kept_counts.get(year, 0)),
            "adjusted": round(value, 1),
            "adjusted_low": None if low is None else round(low, 1),
            "adjusted_high": None if high is None else round(high, 1),
            "raw": round(100 * float(raw[year]) / float(raw[base_year]), 1),
        })
    result.update({
        "base_year": base_year,
        "observations": int(len(target)),
        "excluded_outliers": int(usable.sum()) - int(len(target)),
        "r_squared": round(1 - float(residuals @ residuals) / total, 3) if total > 0 else None,
        "controls": ["area", "rooms", "floor", "age", "type"],
    })
    return result
