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
    }


def _quantile(values: pd.Series, quantile: float) -> float | None:
    return float(values.quantile(quantile)) if not values.empty else None
