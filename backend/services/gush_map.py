from __future__ import annotations

from typing import Any, Dict, Iterable, List, Mapping, Optional

import pandas as pd

from .data_store import DataStore


class GushMapError(Exception):
    def __init__(self, public_message: str):
        super().__init__(public_message)
        self.public_message = public_message


def build_gush_map_response(data_store: DataStore, payload: Mapping[str, Any]) -> Dict[str, Any]:
    city = _as_text(payload.get("city"))
    selected_gushes = _normalize_gush_set(_as_list(payload.get("gushes")))

    city_gushes = data_store.gushes_for_city(city) if city else []
    city_name = _as_text(city_gushes[0].get("city")) if city_gushes else city
    city_gush_ids = _normalize_gush_set([row.get("id") for row in city_gushes])
    requested_gushes = city_gush_ids | selected_gushes
    if not requested_gushes:
        raise GushMapError("Choose a city or at least one Gush area before loading the map.")

    collection = data_store.load_gush_polygons()
    features = _matching_features(collection.get("features") or [], requested_gushes, city_name, city_gush_ids)
    description_by_gush = {_gush_key(row.get("id")): row for row in city_gushes}

    enriched_features = []
    matched_gushes: set[int | str] = set()
    for feature in features:
        properties = dict(feature.get("properties") or {})
        gush_id = _normalize_gush_id(properties.get("GUSH_NUM"))
        if gush_id is None:
            continue
        matched_gushes.add(gush_id)
        description = description_by_gush.get(_gush_key(gush_id), {})
        is_selected = gush_id in selected_gushes
        map_id = feature_id(feature, gush_id)
        enriched = {
            **properties,
            "map_id": map_id,
            "gush": gush_id,
            "label": description.get("label") or f"גוש {gush_id}",
            "city": description.get("city") or properties.get("LOCALITY_N") or properties.get("REG_MUN_NA"),
            "representative_street": description.get("representative_street"),
            "deals": description.get("deals"),
            "selected": is_selected,
            "fill_value": 1 if is_selected else 0,
        }
        enriched_features.append(
            {
                "type": "Feature",
                "id": map_id,
                "properties": enriched,
                "geometry": feature.get("geometry"),
            }
        )

    source = collection.get("source") if isinstance(collection.get("source"), Mapping) else {}
    missing_values = requested_gushes - matched_gushes
    missing = sorted(str(value) for value in missing_values)
    selected_missing = sorted(str(value) for value in selected_gushes - matched_gushes)
    warnings: List[str] = []
    if selected_missing:
        warnings.append(f"{len(selected_missing)} selected Gush polygons were not found in the local cache.")
    if not enriched_features:
        raise GushMapError("No cached polygons matched the current map selection.")

    return {
        "geojson": {
            "type": "FeatureCollection",
            "features": enriched_features,
        },
        "counts": {
            "features": len(enriched_features),
            "gushes": len({_gush_key(feature["properties"].get("gush")) for feature in enriched_features}),
            "selected_gushes": len(selected_gushes),
            "missing_gushes": len(missing),
        },
        "selection": {
            "city": city_name,
            "gushes": sorted(str(value) for value in selected_gushes),
        },
        "source": {
            "name": source.get("name") or "שכבת גושים",
            "url": source.get("url"),
            "fetched_at": source.get("fetched_at"),
            "disclaimer": source.get("disclaimer"),
        },
        "warnings": warnings,
    }


def feature_id(feature: Mapping[str, Any], gush_id: int | str) -> str:
    properties = feature.get("properties") if isinstance(feature.get("properties"), Mapping) else {}
    for key in ("FID", "OBJECTID", "oid"):
        if properties.get(key) is not None:
            return str(properties[key])
    return str(gush_id)


def _matching_features(
    features: Iterable[Mapping[str, Any]],
    requested_gushes: set[int | str],
    city: Optional[str],
    city_gush_ids: set[int | str],
) -> List[Mapping[str, Any]]:
    if not city:
        return [feature for feature in features if _normalize_gush_id((feature.get("properties") or {}).get("GUSH_NUM")) in requested_gushes]

    city_matches: List[Mapping[str, Any]] = []
    fallback_matches: List[Mapping[str, Any]] = []
    normalized_city = _normalize_place(city)
    for feature in features:
        properties = feature.get("properties") or {}
        gush_id = _normalize_gush_id(properties.get("GUSH_NUM"))
        if gush_id not in requested_gushes:
            continue
        if gush_id in city_gush_ids:
            fallback_matches.append(feature)
        place_values = [properties.get("LOCALITY_N"), properties.get("REG_MUN_NA")]
        if any(_normalize_place(value) == normalized_city for value in place_values if value):
            city_matches.append(feature)
    return city_matches or fallback_matches


def _as_list(value: Any) -> List[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _as_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalize_gush_set(values: Iterable[Any]) -> set[int | str]:
    return {gush_id for gush_id in (_normalize_gush_id(value) for value in values) if gush_id is not None}


def _normalize_gush_id(value: Any) -> Optional[int | str]:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        text = str(value).strip()
        return text or None
    if pd.isna(numeric):
        return None
    if numeric.is_integer():
        return int(numeric)
    return str(numeric)


def _gush_key(value: Any) -> str:
    normalized = _normalize_gush_id(value)
    return "" if normalized is None else str(normalized)


def _normalize_place(value: Any) -> str:
    text = str(value or "").casefold().strip()
    replacements = {
        "-": "",
        "־": "",
        "–": "",
        "—": "",
        "'": "",
        '"': "",
        " ": "",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text
