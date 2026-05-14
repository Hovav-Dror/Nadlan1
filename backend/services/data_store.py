from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence

import pandas as pd

from .cache import JsonFileCache, TTLCache


NUMERIC_VARIABLES = [
    "price_millions",
    "area",
    "rooms",
    "floor",
    "roof",
    "deal year",
    "build_year",
    "building age",
    "build_floors",
]

CATEGORICAL_VARIABLES = [
    "city",
    "street",
    "Gush",
    "GUSH",
    "FULLADRESS",
    "apt type",
    "New_Project",
    "story",
]

TAB_AVAILABILITY = {
    "analysis_deals": True,
    "compare_areas": True,
    "city_comparison": True,
    "city_performance": True,
    "map": False,
    "about": True,
}

DEFAULT_APARTMENT_TYPES = [
    "דירה בבית קומות",
    "Not specified",
    "דירה",
    "קוטג' דו משפחתי",
    "קוטג' חד משפחתי",
    "דירת גן",
    "בית בודד",
    "דירת גג",
    "קוטג' טורי",
    "מגורים",
    "דירת גג (פנטהאוז)",
    "חד משפחתי (וילה)",
    "מיני פנטהאוז",
    "דופלקס",
    "בית פרטי",
]


class DataStoreError(Exception):
    def __init__(self, public_message: str):
        super().__init__(public_message)
        self.public_message = public_message


class DataStore:
    def __init__(
        self,
        data_dir: Path,
        *,
        metadata_cache_ttl_seconds: int = 3600,
        city_cache_ttl_seconds: int = 900,
        city_cache_max_items: int = 4,
        response_cache_dir: Optional[Path] = None,
        response_cache_ttl_seconds: int = 1800,
    ):
        self.data_dir = Path(data_dir)
        self.metadata_cache = TTLCache(ttl_seconds=metadata_cache_ttl_seconds, max_items=32)
        self.city_cache = TTLCache(ttl_seconds=city_cache_ttl_seconds, max_items=city_cache_max_items)
        self.response_cache = JsonFileCache(
            response_cache_dir or (self.data_dir.parent / ".cache"),
            ttl_seconds=response_cache_ttl_seconds,
            namespace="nadlan2",
        )

    def manifest_state(self) -> Dict[str, Any]:
        try:
            manifest = self.load_manifest()
            return {
                "loaded": True,
                "city_count": len(manifest.get("cities", {})),
                "total_city_rows": manifest.get("total_city_rows"),
                "metadata_count": len(manifest.get("metadata", {})),
            }
        except DataStoreError:
            return {
                "loaded": False,
                "city_count": None,
                "total_city_rows": None,
                "metadata_count": None,
            }

    def load_app_metadata(self) -> Dict[str, Any]:
        metadata = self.load_metadata()
        manifest = metadata["manifest"]
        apt_types_payload = metadata["apt_types"]

        required_columns = list(manifest.get("required_city_columns", []))
        apartment_types = list(apt_types_payload.get("apt_types", []))
        map_state = self.gush_polygon_state()
        tab_availability = dict(TAB_AVAILABILITY)
        tab_availability["map"] = bool(map_state["available"])

        return {
            "cities": self.list_cities(),
            "apartment_types": apartment_types,
            "variable_choices": {
                "numeric": _filter_known(NUMERIC_VARIABLES, required_columns),
                "categorical": _filter_known(CATEGORICAL_VARIABLES, required_columns),
            },
            "default_filters": self._default_filters(apartment_types),
            "tab_availability": tab_availability,
            "map": map_state,
            "data_summary": {
                "city_count": len(manifest.get("cities", {})),
                "total_city_rows": manifest.get("total_city_rows"),
                "generated_at": manifest.get("generated_at"),
            },
        }

    def load_manifest(self) -> Dict[str, Any]:
        def load() -> Dict[str, Any]:
            payload = self._read_json(self.data_dir / "manifest.json")
            cities = payload.get("cities")
            metadata = payload.get("metadata")
            if not isinstance(cities, Mapping) or not isinstance(metadata, Mapping):
                raise DataStoreError("Data manifest is not in the expected format.")
            return payload

        return self.metadata_cache.get_or_set("manifest", load)

    def load_apt_types(self) -> Dict[str, Any]:
        def load() -> Dict[str, Any]:
            payload = self._read_json(self.data_dir / "metadata" / "apt_types.json")
            apt_types = payload.get("apt_types")
            if not isinstance(apt_types, list):
                raise DataStoreError("Apartment type metadata is not in the expected format.")
            return payload

        return self.metadata_cache.get_or_set("apt_types", load)

    def load_metadata(self) -> Dict[str, Any]:
        def load() -> Dict[str, Any]:
            manifest = self.load_manifest()
            return {
                "manifest": manifest,
                "apt_types": self.load_apt_types(),
                "gush_descriptions": self._read_metadata_parquet("gush_descriptions"),
                "unique_gush_streets": self._read_metadata_parquet("unique_gush_streets"),
            }

        return self.metadata_cache.get_or_set("metadata", load)

    def gush_polygon_state(self) -> Dict[str, Any]:
        manifest = self.load_manifest()
        metadata = manifest.get("metadata", {})
        record = metadata.get("gush_polygons") if isinstance(metadata, Mapping) else None
        file_name = record.get("file") if isinstance(record, Mapping) else "metadata/gush_polygons.geojson"
        path = self.data_dir / file_name
        available = path.exists()
        return {
            "available": available,
            "file": file_name,
            "features": record.get("features") if isinstance(record, Mapping) else None,
            "fetched_at": record.get("fetched_at") if isinstance(record, Mapping) else None,
        }

    def load_gush_polygons(self) -> Dict[str, Any]:
        def load() -> Dict[str, Any]:
            manifest = self.load_manifest()
            metadata = manifest.get("metadata", {})
            record = metadata.get("gush_polygons") if isinstance(metadata, Mapping) else None
            file_name = record.get("file") if isinstance(record, Mapping) else "metadata/gush_polygons.geojson"
            path = self.data_dir / file_name
            try:
                with path.open("r", encoding="utf-8") as handle:
                    payload = json.load(handle)
            except FileNotFoundError as exc:
                raise DataStoreError("Cached Gush polygons are missing. Run scripts/fetch_gush_polygons.py first.") from exc
            except json.JSONDecodeError as exc:
                raise DataStoreError("Cached Gush polygons could not be parsed.") from exc
            except OSError as exc:
                raise DataStoreError("Cached Gush polygons could not be loaded.") from exc
            if not isinstance(payload, Mapping) or payload.get("type") != "FeatureCollection":
                raise DataStoreError("Cached Gush polygons are not in the expected GeoJSON format.")
            return dict(payload)

        return self.metadata_cache.get_or_set("gush_polygons", load)

    def list_cities(self) -> List[Dict[str, Any]]:
        return self._city_choices(self.load_manifest())

    def load_city(self, city: str) -> pd.DataFrame:
        city_record = self._resolve_city(city)
        key = ("city", city_record["id"])

        def load() -> pd.DataFrame:
            return self._read_city_parquet(city_record)

        return self.city_cache.get_or_set(key, load)

    def load_cities(self, cities: Sequence[str]) -> pd.DataFrame:
        city_records = self._resolve_unique_cities(cities)
        if not city_records:
            raise DataStoreError("At least one city is required.")

        frames = [self.load_city(record["id"]) for record in city_records]
        if len(frames) == 1:
            return frames[0].copy()
        return pd.concat(frames, ignore_index=True, copy=False)

    def cities_for_gushes(self, gush_ids: Iterable[Any]) -> List[Dict[str, Any]]:
        requested = _normalize_gush_set(gush_ids)
        if not requested:
            return []

        lookup = self.load_metadata()["unique_gush_streets"]
        matches = lookup[lookup["Gush"].map(_normalize_gush_id).isin(requested)]
        city_names = sorted(matches["city"].dropna().unique().tolist())
        by_name = {city["name"]: city for city in self.list_cities()}
        return [by_name[name] for name in city_names if name in by_name]

    def streets_for_city(self, city: str) -> List[str]:
        city_name = self._resolve_city(city)["name"]
        lookup = self.load_metadata()["unique_gush_streets"]
        values = lookup.loc[lookup["city"] == city_name, "street"].dropna().astype(str).unique()
        return sorted(values.tolist())

    def streets_for_gushes(self, city: str, gush_ids: Iterable[Any]) -> List[str]:
        city_name = self._resolve_city(city)["name"]
        requested = _normalize_gush_set(gush_ids)
        if not requested:
            return []

        lookup = self.load_metadata()["unique_gush_streets"]
        matches = lookup.loc[
            (lookup["city"] == city_name) & lookup["Gush"].map(_normalize_gush_id).isin(requested),
            "street",
        ]
        return sorted(matches.dropna().astype(str).unique().tolist())

    def gushes_for_streets(self, city: str, streets: Iterable[Any]) -> List[Dict[str, Any]]:
        city_name = self._resolve_city(city)["name"]
        requested = {_normalize_text(street) for street in streets if str(street).strip()}
        if not requested:
            return []

        lookup = self.load_metadata()["unique_gush_streets"]
        matches = lookup.loc[
            (lookup["city"] == city_name) & lookup["street"].astype(str).map(_normalize_text).isin(requested)
        ]
        gush_ids = sorted(gush for gush in {_normalize_gush_id(value) for value in matches["Gush"]} if gush is not None)
        known_gushes = {gush["id"]: gush for gush in self.gushes_for_city(city)}
        return [known_gushes.get(gush_id, {"id": gush_id, "label": str(gush_id), "city": city_name}) for gush_id in gush_ids]

    def gushes_for_city(self, city: str) -> List[Dict[str, Any]]:
        city_name = self._resolve_city(city)["name"]
        descriptions = self.load_metadata()["gush_descriptions"]
        matches = descriptions.loc[descriptions["city"] == city_name, ["Gush", "Gush_desc", "street", "n"]]

        results: List[Dict[str, Any]] = []
        for _, row in matches.sort_values(["Gush", "Gush_desc"]).iterrows():
            gush_id = _normalize_gush_id(row["Gush"])
            if gush_id is None:
                continue
            results.append(
                {
                    "id": gush_id,
                    "label": _safe_string(row.get("Gush_desc")) or str(gush_id),
                    "city": city_name,
                    "representative_street": _safe_string(row.get("street")),
                    "deals": _safe_int(row.get("n")),
                }
            )
        return results

    def gush_details(self, gush_id: Any) -> List[Dict[str, Any]]:
        requested = _normalize_gush_id(gush_id)
        if requested is None:
            return []

        descriptions = self.load_metadata()["gush_descriptions"]
        matches = descriptions.loc[descriptions["Gush"].map(_normalize_gush_id) == requested]

        results: List[Dict[str, Any]] = []
        for _, row in matches.sort_values(["city", "Gush_desc"]).iterrows():
            results.append(
                {
                    "id": _normalize_gush_id(row.get("Gush")),
                    "label": _safe_string(row.get("Gush_desc")) or str(requested),
                    "city": _safe_string(row.get("city")),
                    "representative_street": _safe_string(row.get("street")),
                    "deals": _safe_int(row.get("n")),
                }
            )
        return results

    def search_streets(self, query: str, city: Optional[str] = None, limit: int = 25) -> List[Dict[str, Any]]:
        normalized_query = _normalize_text(query)
        if not normalized_query:
            return []

        lookup = self.load_metadata()["unique_gush_streets"]
        if city:
            city_name = self._resolve_city(city)["name"]
            lookup = lookup.loc[lookup["city"] == city_name]

        working = lookup.dropna(subset=["city", "street", "Gush"]).copy()
        working["_street_norm"] = working["street"].astype(str).map(_normalize_text)
        matches = working[working["_street_norm"].str.contains(normalized_query, regex=False)]
        if matches.empty:
            return []

        grouped = (
            matches.groupby(["city", "street"], dropna=True)["Gush"]
            .apply(lambda values: sorted(g for g in {_normalize_gush_id(value) for value in values} if g is not None))
            .reset_index()
        )
        grouped["_rank"] = grouped["street"].astype(str).map(
            lambda street: 0 if _normalize_text(street).startswith(normalized_query) else 1
        )
        grouped = grouped.sort_values(["_rank", "city", "street"]).head(limit)

        return [
            {
                "city": row["city"],
                "street": row["street"],
                "gush_ids": row["Gush"],
            }
            for _, row in grouped.iterrows()
        ]

    def cache_status(self) -> Dict[str, Any]:
        return {
            "metadata": self.metadata_cache.stats(),
            "cities": self.city_cache.stats(),
            "response_ttl_seconds": self.response_cache.ttl_seconds,
        }

    def _read_json(self, path: Path) -> Dict[str, Any]:
        try:
            with path.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except FileNotFoundError as exc:
            raise DataStoreError("Required metadata is missing.") from exc
        except json.JSONDecodeError as exc:
            raise DataStoreError("Required metadata could not be parsed.") from exc
        except OSError as exc:
            raise DataStoreError("Required metadata could not be loaded.") from exc

        if not isinstance(payload, dict):
            raise DataStoreError("Required metadata is not in the expected format.")
        return payload

    def _read_metadata_parquet(self, metadata_key: str) -> pd.DataFrame:
        manifest = self.load_manifest()
        metadata = manifest.get("metadata", {})
        metadata_record = metadata.get(metadata_key)
        if not isinstance(metadata_record, Mapping):
            raise DataStoreError("Required metadata is missing.")
        file_name = metadata_record.get("file")
        if not isinstance(file_name, str):
            raise DataStoreError("Required metadata is not in the expected format.")
        return self._read_parquet(self.data_dir / file_name, "Required metadata could not be loaded.")

    def _read_city_parquet(self, city_record: Dict[str, Any]) -> pd.DataFrame:
        path = self.data_dir / "cities" / city_record["file"]
        frame = self._read_parquet(path, "City data could not be loaded.")
        expected_city = city_record["name"]
        if "city" in frame.columns:
            frame = frame.copy()
            frame["city"] = frame["city"].fillna(expected_city)
        return frame

    def _read_parquet(self, path: Path, public_message: str) -> pd.DataFrame:
        try:
            return pd.read_parquet(path)
        except FileNotFoundError as exc:
            raise DataStoreError(public_message) from exc
        except (OSError, ValueError, ImportError) as exc:
            raise DataStoreError(public_message) from exc

    def _resolve_city(self, city: str) -> Dict[str, Any]:
        if not isinstance(city, str) or not city.strip():
            raise DataStoreError("Unknown city.")

        normalized = _normalize_text(city)
        for record in self._city_records(self.load_manifest()):
            if normalized in {_normalize_text(record["id"]), _normalize_text(record["name"])}:
                return record
        raise DataStoreError("Unknown city.")

    def _resolve_unique_cities(self, cities: Sequence[str]) -> List[Dict[str, Any]]:
        seen: set[str] = set()
        records: List[Dict[str, Any]] = []
        for city in cities:
            record = self._resolve_city(city)
            if record["id"] in seen:
                continue
            seen.add(record["id"])
            records.append(record)
        return records

    def _city_choices(self, manifest: Dict[str, Any]) -> List[Dict[str, Any]]:
        return [
            {
                "id": record["id"],
                "name": record["name"],
                "rows": record["rows"],
            }
            for record in self._city_records(manifest)
        ]

    def _city_records(self, manifest: Dict[str, Any]) -> List[Dict[str, Any]]:
        cities = manifest.get("cities", {})
        records: List[Dict[str, Any]] = []

        for name in sorted(cities):
            city_payload = cities.get(name, {})
            file_name = city_payload.get("file", "")
            city_id = Path(file_name).stem if isinstance(file_name, str) else name
            records.append(
                {
                    "id": city_id,
                    "name": name,
                    "rows": city_payload.get("rows"),
                    "file": file_name,
                }
            )

        return records

    def _default_filters(self, apartment_types: List[str]) -> Dict[str, Any]:
        default_apartment_types = [apt_type for apt_type in DEFAULT_APARTMENT_TYPES if apt_type in apartment_types]
        if not default_apartment_types:
            default_apartment_types = ["דירה"] if "דירה" in apartment_types else apartment_types[:1]
        return {
            "cities": [],
            "apartment_types": default_apartment_types,
            "numeric_ranges": {
                "price_millions": {"min": None, "max": None},
                "area": {"min": None, "max": None},
                "rooms": {"min": None, "max": None},
                "deal year": {"min": None, "max": None},
            },
            "categorical": {
                "new_project": None,
                "gush": [],
                "streets": [],
            },
        }


def _filter_known(candidates: List[str], required_columns: List[str]) -> List[str]:
    required = set(required_columns)
    return [candidate for candidate in candidates if candidate in required]


def _normalize_text(value: Any) -> str:
    return str(value).strip().casefold()


def _normalize_gush_set(gush_ids: Iterable[Any]) -> set[int | str]:
    return {gush_id for gush_id in (_normalize_gush_id(value) for value in gush_ids) if gush_id is not None}


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


def _safe_string(value: Any) -> Optional[str]:
    if value is None or pd.isna(value):
        return None
    text = str(value).strip()
    return text or None


def _safe_int(value: Any) -> Optional[int]:
    try:
        if pd.isna(value):
            return None
        return int(value)
    except (TypeError, ValueError):
        return None
