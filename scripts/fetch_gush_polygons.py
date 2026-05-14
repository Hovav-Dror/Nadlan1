#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, Iterable, List

import pandas as pd


DEFAULT_LAYER_URL = (
    "https://services8.arcgis.com/JcXY3lLZni6BK4El/arcgis/rest/services/"
    "%D7%A9%D7%9B%D7%91%D7%AA_%D7%92%D7%95%D7%A9%D7%99%D7%9D/FeatureServer/0/query"
)
DEFAULT_DATA_DIR = Path(__file__).resolve().parents[1] / "data"
DEFAULT_OUTPUT = DEFAULT_DATA_DIR / "metadata" / "gush_polygons.geojson"


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch local cached Gush polygons from the public ArcGIS layer.")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--layer-url", default=DEFAULT_LAYER_URL)
    parser.add_argument("--chunk-size", type=int, default=120)
    parser.add_argument("--sleep", type=float, default=0.2)
    parser.add_argument("--limit", type=int, default=0, help="Optional number of Gush IDs to fetch for a quick smoke test.")
    args = parser.parse_args()

    descriptions_path = args.data_dir / "metadata" / "gush_descriptions.parquet"
    descriptions = pd.read_parquet(descriptions_path)
    gush_ids = sorted(
        {
            int(float(value))
            for value in descriptions["Gush"].dropna().unique().tolist()
            if float(value).is_integer()
        }
    )
    if args.limit:
        gush_ids = gush_ids[: args.limit]

    features: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for index, chunk in enumerate(chunks(gush_ids, max(args.chunk_size, 1)), start=1):
        payload = fetch_chunk(args.layer_url, chunk)
        chunk_features = payload.get("features") or []
        for feature in chunk_features:
            key = feature_key(feature)
            if key in seen:
                continue
            seen.add(key)
            features.append(feature)
        print(f"Fetched chunk {index}: {len(chunk_features)} features; total {len(features)}")
        if args.sleep:
            time.sleep(args.sleep)

    collection = {
        "type": "FeatureCollection",
        "name": "gush_polygons",
        "source": {
            "name": "שכבת גושים",
            "url": args.layer_url,
            "fetched_at": pd.Timestamp.utcnow().isoformat(),
            "disclaimer": (
                "The source layer states that cadastral data is informational, not legal proof of parcel/block "
                "boundaries, and freshness is the user's responsibility."
            ),
        },
        "features": features,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        json.dump(collection, handle, ensure_ascii=False, separators=(",", ":"))
    update_manifest(args.data_dir, args.output, len(features), collection["source"]["fetched_at"])
    print(f"Wrote {len(features)} features to {args.output}")


def chunks(values: List[int], size: int) -> Iterable[List[int]]:
    for start in range(0, len(values), size):
        yield values[start : start + size]


def fetch_chunk(layer_url: str, gush_ids: List[int]) -> Dict[str, Any]:
    where = "GUSH_NUM IN ({})".format(",".join(str(value) for value in gush_ids))
    query = {
        "f": "geojson",
        "where": where,
        "outFields": ",".join(
            [
                "FID",
                "GUSH_NUM",
                "GUSH_SUFFI",
                "SUB_GUSH_I",
                "STATUS_TEX",
                "LOCALITY_N",
                "REG_MUN_NA",
                "COUNTY_NAM",
                "REGION_NAM",
                "Shape__Area",
                "Shape__Length",
            ]
        ),
        "returnGeometry": "true",
        "outSR": "4326",
        "geometryPrecision": "6",
    }
    url = layer_url + "?" + urllib.parse.urlencode(query, safe=",()")
    request = urllib.request.Request(url, headers={"User-Agent": "nadlan-gush-map-cache/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def feature_key(feature: Dict[str, Any]) -> str:
    properties = feature.get("properties") or {}
    fid = properties.get("FID")
    if fid is not None:
        return f"fid:{fid}"
    geometry = feature.get("geometry") or {}
    return json.dumps([properties.get("GUSH_NUM"), properties.get("SUB_GUSH_I"), geometry], sort_keys=True)


def update_manifest(data_dir: Path, output: Path, feature_count: int, fetched_at: str) -> None:
    manifest_path = data_dir / "manifest.json"
    with manifest_path.open("r", encoding="utf-8") as handle:
        manifest = json.load(handle)
    metadata = manifest.setdefault("metadata", {})
    metadata["gush_polygons"] = {
        "file": output.relative_to(data_dir).as_posix(),
        "features": feature_count,
        "fetched_at": fetched_at,
    }
    with manifest_path.open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


if __name__ == "__main__":
    main()
