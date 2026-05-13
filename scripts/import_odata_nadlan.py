#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import shutil
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence
from urllib.request import Request
from urllib.request import urlopen

import pandas as pd


DATASET_PAGE = "https://www.odata.org.il/dataset/nadlan"
PACKAGE_ID = "84f2bc2d-87a0-474e-a3ea-63d7bb9b5447"
PACKAGE_API = "https://www.odata.org.il/api/3/action/package_show?id=nadlan"

RESOURCES = [
    {
        "name": "part 1.csv",
        "id": "24eabceb-faea-4f92-9e94-df710c29cae7",
        "url": "https://www.odata.org.il/dataset/84f2bc2d-87a0-474e-a3ea-63d7bb9b5447/resource/24eabceb-faea-4f92-9e94-df710c29cae7/download/part-1.csv",
    },
    {
        "name": "part 2.csv",
        "id": "742a49d3-4ebe-4541-a715-5c8456cd7a65",
        "url": "https://www.odata.org.il/dataset/84f2bc2d-87a0-474e-a3ea-63d7bb9b5447/resource/742a49d3-4ebe-4541-a715-5c8456cd7a65/download/part-2.csv",
    },
    {
        "name": "part 3.csv",
        "id": "78d33b90-cb93-478a-ba60-3b519e551505",
        "url": "https://www.odata.org.il/dataset/84f2bc2d-87a0-474e-a3ea-63d7bb9b5447/resource/78d33b90-cb93-478a-ba60-3b519e551505/download/part-3.csv",
    },
]

REQUIRED_CITY_COLUMNS = [
    "city",
    "street",
    "Gush",
    "GUSH",
    "FULLADRESS",
    "date",
    "deal year",
    "price_millions",
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

CURRENT_CITY_SLUGS = {
    "אשדוד": "ashdod.parquet",
    "אשקלון": "ashkelon.parquet",
    "באר שבע": "beer_sheva.parquet",
    "בית שמש": "beit_shemesh.parquet",
    "בני ברק": "bnei_brak.parquet",
    "בת ים": "bat_yam.parquet",
    "הרצלייה": "herzliya.parquet",
    "חדרה": "hadera.parquet",
    "חולון": "holon.parquet",
    "חיפה": "haifa.parquet",
    "ירושלים": "jerusalem.parquet",
    "כפר סבא": "kfar_saba.parquet",
    "מודיעין-מכבים-רעות": "modiin_maccabim_reut.parquet",
    "נתניה": "netanya.parquet",
    "פתח תקווה": "petah_tikva.parquet",
    "ראשון לציון": "rishon_lezion.parquet",
    "רחובות": "rehovot.parquet",
    "רמת גן": "ramat_gan.parquet",
    "רעננה": "raanana.parquet",
    "תל אביב -יפו": "tel_aviv_yafo.parquet",
}

CITY_ALIASES = {
    "הרצליה": "הרצלייה",
    "פתח תקוה": "פתח תקווה",
    "תל אביב-יפו": "תל אביב -יפו",
    "תל אביב יפו": "תל אביב -יפו",
    "מודיעין מכבים רעות": "מודיעין-מכבים-רעות",
}

FLOOR_MAP = {
    "מרתף": -1,
    "מרתף שני": -1,
    "מרתף ‎-1‏": -1,
    "קרקע": 0,
    "הקרקע": 0,
    "קרקע תחתונה": 0,
    "קרקע עליונה": 0,
    "ראשונה (קרקע)": 0,
    "קרקע וראשונה": 0,
    "קרקע + ראשונה": 0,
    "קרקע+ראשונה": 0,
    "קרקע ראשונה": 0,
    "קרקע, ראשונה": 0,
    "קרקע,ראשונה": 0,
    "מרתף+קרקע": 0,
    "מרתף + קרקע": 0,
    "מרתף וקרקע": 0,
    "מרתף, קרקע": 0,
    "מרתף+קרקע+ראשונה": 0,
    "מרתף + קרקע + ראשונה": 0,
    "מרתף קרקע ראשונה": 0,
    "ראשונה": 1,
    "א": 1,
    "א'": 1,
    "עמודים": 1,
    "ראשונה+שניה": 1,
    "ראשונה + שניה": 1,
    "ראשונה +שניה": 1,
    "ראשונה, שניה": 1,
    "ראשונה שניה": 1,
    "ראשונה+קרקע": 0,
    "קרקע ראשונה ושניה": 1,
    "קרקע+ראשונה+שניה": 1,
    "קרקע + ראשונה + שניה": 1,
    "קרקע, ראשונה, שניה": 1,
    "קרקע,ראשונה,שניה": 1,
    "קרקע ראשונה שניה": 1,
    "שנייה": 2,
    "שניה": 2,
    "ב": 2,
    "ב'": 2,
    "שניה ושלישית": 2,
    "שניה+שלישית": 2,
    "שניה + שלישית": 2,
    "שניה, שלישית": 2,
    "שניה שלישית": 2,
    "שניה+גג": 2,
    "שניה וגג": 2,
    "שניה+קרקע": 1,
    "שלישית": 3,
    "ג": 3,
    "ג'": 3,
    "שלישית ורביעית": 3,
    "שלישית+רביעית": 3,
    "שלישית + רביעית": 3,
    "שלישית רביעית": 3,
    "שלישית, רביעית": 3,
    "שלישית+גג": 3,
    "שלישית + גג": 3,
    "שלישית וגג": 3,
    "רביעית": 4,
    "ד": 4,
    "ד'": 4,
    "רביעית+חמישית": 4,
    "רביעית + חמישית": 4,
    "רביעית וחמישית": 4,
    "רביעית, חמישית": 4,
    "רביעית חמישית": 4,
    "רביעית+גג": 4,
    "רביעית + גג": 4,
    "רביעית וגג": 4,
    "חמישית": 5,
    "ה": 5,
    "חמישית+שישית": 5,
    "חמישית + שישית": 5,
    "חמישית ושישית": 5,
    "חמישית, שישית": 5,
    "חמישית שישית": 5,
    "חמישית+גג": 5,
    "חמישית + גג": 5,
    "חמישית וגג": 5,
    "שישית": 6,
    "ו": 6,
    "שישית+שביעית": 6,
    "שישית + שביעית": 6,
    "שישית ושביעית": 6,
    "שישית, שביעית": 6,
    "שישית+גג": 6,
    "שישית + גג": 6,
    "שביעית": 7,
    "שביעית+שמינית": 7,
    "שביעית + שמינית": 7,
    "שביעית, שמינית": 7,
    "שביעית ושמינית": 7,
    "שביעית שמינית": 7,
    "שמינית": 8,
    "שמינית+תשיעית": 8,
    "שמינית + תשיעית": 8,
    "שמינית, תשיעית": 8,
    "שמינית ותשיעית": 8,
    "תשיעית": 9,
    "תשיעית+עשירית": 9,
    "תשיעית + עשירית": 9,
    "תשיעית, עשירית": 9,
    "תשיעית ועשירית": 9,
    "עשירית": 10,
    "אחת עשרה": 11,
    "שתים עשרה": 12,
    "שלוש עשרה": 13,
    "ארבע עשרה": 14,
    "חמש עשרה": 15,
    "שש עשרה": 16,
    "שבע עשרה": 17,
    "שמונה עשרה": 18,
    "תשע עשרה": 19,
    "עשרים": 20,
    "עשרים ואחת": 21,
    "עשרים ושתיים": 22,
    "עשרים ושתים": 22,
    "עשרים ושלוש": 23,
    "עשרים וארבע": 24,
    "עשרים וחמש": 25,
    "עשרים ושש": 26,
    "עשרים ושבע": 27,
    "עשרים ושמונה": 28,
    "עשרים ותשע": 29,
    "שלושים": 30,
    "שלושים ואחת": 31,
    "שלושים ושתיים": 32,
    "שלושים ושלוש": 33,
    "שלושים וארבע": 34,
    "שלושים וחמש": 35,
    "שלושים ושבע": 37,
}

HIGH_FLOOR_MAP = {
    "קרקע וראשונה": 1,
    "קרקע + ראשונה": 1,
    "קרקע+ראשונה": 1,
    "קרקע ראשונה": 1,
    "קרקע, ראשונה": 1,
    "קרקע,ראשונה": 1,
    "מרתף+קרקע+ראשונה": 1,
    "מרתף + קרקע + ראשונה": 1,
    "מרתף קרקע ראשונה": 1,
    "ראשונה+שניה": 2,
    "ראשונה + שניה": 2,
    "ראשונה +שניה": 2,
    "ראשונה, שניה": 2,
    "ראשונה שניה": 2,
    "קרקע ראשונה ושניה": 2,
    "קרקע+ראשונה+שניה": 2,
    "קרקע + ראשונה + שניה": 2,
    "קרקע, ראשונה, שניה": 2,
    "קרקע,ראשונה,שניה": 2,
    "קרקע ראשונה שניה": 2,
    "שניה ושלישית": 3,
    "שניה+שלישית": 3,
    "שניה + שלישית": 3,
    "שניה, שלישית": 3,
    "שניה שלישית": 3,
    "שלישית ורביעית": 4,
    "שלישית+רביעית": 4,
    "שלישית + רביעית": 4,
    "שלישית רביעית": 4,
    "שלישית, רביעית": 4,
    "רביעית+חמישית": 5,
    "רביעית + חמישית": 5,
    "רביעית וחמישית": 5,
    "רביעית, חמישית": 5,
    "רביעית חמישית": 5,
    "חמישית+שישית": 6,
    "חמישית + שישית": 6,
    "חמישית ושישית": 6,
    "חמישית, שישית": 6,
    "חמישית שישית": 6,
    "שישית+שביעית": 7,
    "שישית + שביעית": 7,
    "שישית ושביעית": 7,
    "שישית, שביעית": 7,
    "שביעית+שמינית": 8,
    "שביעית + שמינית": 8,
    "שביעית, שמינית": 8,
    "שביעית ושמינית": 8,
    "שביעית שמינית": 8,
    "שמינית+תשיעית": 9,
    "שמינית + תשיעית": 9,
    "שמינית, תשיעית": 9,
    "שמינית ותשיעית": 9,
    "תשיעית+עשירית": 10,
    "תשיעית + עשירית": 10,
    "תשיעית, עשירית": 10,
    "תשיעית ועשירית": 10,
}

ROOF_TYPES = {"דירת גג", "דירת גג (פנטהאוז)", "מיני פנטהאוז"}
MISSING_APT_TYPE = "לא צויין סוג "
REQUEST_HEADERS = {"User-Agent": "nadlan2-data-importer/1.0"}


def main() -> int:
    args = parse_args()
    output_root = args.output_root.resolve()
    raw_dir = args.raw_dir.resolve()

    if args.inspect_only:
        inspect_resources()
        return 0

    if args.download:
        download_resources(raw_dir, force=args.force_download)

    missing = [resource["name"] for resource in RESOURCES if not (raw_dir / resource["name"]).exists()]
    if missing:
        print(
            "Missing raw CSV files: "
            + ", ".join(missing)
            + f"\nRun with --download or place them in {raw_dir}.",
            file=sys.stderr,
        )
        return 2

    existing_root = args.existing_root.resolve() if args.existing_root else None
    data = load_odata(raw_dir, chunksize=args.chunksize)
    if args.cities == "current":
        data = data[data["city"].isin(CURRENT_CITY_SLUGS)].copy()

    source_row_count = len(data)
    if args.merge_existing and existing_root:
        data, merge_report = merge_existing_data(data, existing_root)
    else:
        merge_report = None

    pre_dedupe_row_count = len(data)
    data = dedupe_transactions(data)
    post_dedupe_row_count = len(data)
    data = disambiguate_multi_city_gush(data)
    validation = write_output(
        data,
        output_root,
        source_row_count=source_row_count,
        pre_dedupe_row_count=pre_dedupe_row_count,
        post_dedupe_row_count=post_dedupe_row_count,
        merge_report=merge_report,
    )

    print(
        f"Wrote {validation['manifest']['city_count']} city files "
        f"({validation['manifest']['total_city_rows']:,} rows) into {output_root}"
    )
    print(f"Date range: {validation['date_range']['min']} to {validation['date_range']['max']}")
    print(f"Report: {output_root / 'odata_import_report.json'}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download and transform the odata.org.il Nadlan CSVs into the Nadlan2 app parquet layout."
    )
    parser.add_argument("--output-root", type=Path, default=Path("data_odata"))
    parser.add_argument("--raw-dir", type=Path, default=Path("data/raw/odata"))
    parser.add_argument("--existing-root", type=Path, default=Path("data"))
    parser.add_argument("--download", action="store_true", help="Download the three current CKAN CSV files.")
    parser.add_argument("--force-download", action="store_true", help="Re-download CSVs even if they already exist.")
    parser.add_argument(
        "--cities",
        choices=["all", "current"],
        default="all",
        help="Write all OData cities, or only the 20 cities currently present in the app.",
    )
    parser.add_argument(
        "--merge-existing",
        action="store_true",
        help="Append existing app rows before transaction-level deduping. Repeat sales on different dates are retained.",
    )
    parser.add_argument("--chunksize", type=int, default=100_000)
    parser.add_argument("--inspect-only", action="store_true", help="Print current CKAN resource metadata and exit.")
    return parser.parse_args()


def inspect_resources() -> None:
    print(f"Dataset: {DATASET_PAGE}")
    with urlopen(Request(PACKAGE_API, headers=REQUEST_HEADERS), timeout=60) as response:
        payload = json.load(response)
    for resource in payload["result"]["resources"]:
        print(
            f"{resource['name']}: id={resource['id']} "
            f"size={resource.get('size')} modified={resource.get('last_modified')} "
            f"datastore={resource.get('datastore_active')}"
        )


def download_resources(raw_dir: Path, *, force: bool) -> None:
    raw_dir.mkdir(parents=True, exist_ok=True)
    for resource in RESOURCES:
        target = raw_dir / resource["name"]
        if target.exists() and not force:
            print(f"Using existing {target}")
            continue
        print(f"Downloading {resource['name']}...")
        with tempfile.NamedTemporaryFile(delete=False, dir=raw_dir, suffix=".tmp") as handle:
            tmp_path = Path(handle.name)
            with urlopen(Request(resource["url"], headers=REQUEST_HEADERS), timeout=300) as response:
                shutil.copyfileobj(response, handle)
        tmp_path.replace(target)


def load_odata(raw_dir: Path, *, chunksize: int) -> pd.DataFrame:
    chunks: List[pd.DataFrame] = []
    for resource in RESOURCES:
        path = raw_dir / resource["name"]
        print(f"Reading {path}...")
        for chunk in pd.read_csv(
            path,
            dtype=str,
            keep_default_na=False,
            na_values=[""],
            chunksize=chunksize,
            quoting=csv.QUOTE_MINIMAL,
        ):
            chunk["_resource_id"] = resource["id"]
            transformed = transform_chunk(chunk)
            if not transformed.empty:
                chunks.append(transformed)

    if not chunks:
        return pd.DataFrame(columns=REQUIRED_CITY_COLUMNS)

    data = pd.concat(chunks, ignore_index=True, copy=False)
    return data[REQUIRED_CITY_COLUMNS + ["_source_key"]]


def transform_chunk(chunk: pd.DataFrame) -> pd.DataFrame:
    data = pd.DataFrame()
    deal_date = parse_dates(chunk.get("dealdatetime"), chunk.get("dealdate"))
    deal_year = deal_date.dt.year
    apt_type = clean_text(chunk.get("dealnaturedescription")).fillna(MISSING_APT_TYPE)
    floor_text = clean_text(chunk.get("floorno"))
    floor = parse_floor_series(floor_text)
    build_floors = parse_number_series(chunk.get("buildingfloors"))
    build_year = parse_number_series(chunk.get("buildingyear"))
    year_built = parse_number_series(chunk.get("yearbuilt"))
    effective_build_year = build_year.where(build_year.notna(), year_built)
    full_address = first_nonempty(
        clean_text(chunk.get("fulladdress")),
        clean_text(chunk.get("displayaddress")),
        build_address(clean_text(chunk.get("street")), clean_text(chunk.get("city_name"))),
    )
    city = clean_text(chunk.get("city_name")).map(normalize_city_name)
    street = clean_text(chunk.get("street"))
    gush = clean_text(chunk.get("gush"))
    area = parse_number_series(chunk.get("dealnature"))
    rooms = parse_number_series(chunk.get("assetroomno"))
    price_millions = parse_number_series(chunk.get("dealamount")) / 1_000_000
    high_floor = parse_high_floor_series(floor_text, floor)

    data["city"] = city
    data["street"] = street
    data["Gush"] = parse_gush_number(gush)
    data["GUSH"] = gush
    data["FULLADRESS"] = full_address
    data["date"] = deal_date.dt.date
    data["deal year"] = deal_year.astype("float64")
    data["price_millions"] = price_millions
    data["area"] = area
    data["rooms"] = rooms
    data["floor"] = floor
    data["roof"] = (
        apt_type.isin(ROOF_TYPES)
        | floor_text.fillna("").str.contains("גג", regex=False)
        | same_number(floor, build_floors)
        | same_number(high_floor, build_floors)
    )
    data["apt type"] = apt_type
    data["New_Project"] = "2nd hand"
    new_project_flag = clean_text(chunk.get("newprojectext")).isin({"1", "true", "TRUE", "כן"})
    data.loc[new_project_flag, "New_Project"] = "New Project"
    data.loc[build_year.notna() & deal_year.notna() & (build_year >= deal_year), "New_Project"] = "New Project"
    data["build_year"] = build_year
    data["building age"] = deal_year - effective_build_year
    data["build_floors"] = build_floors
    data["_source_key"] = build_source_key(clean_text(chunk.get("_resource_id")), clean_text(chunk.get("row_num")))
    data["story"] = build_story(
        deal_year=deal_year,
        dealdate=clean_text(chunk.get("dealdate")),
        full_address=full_address,
        apt_type=apt_type,
        gush=gush,
        build_year=build_year,
        building_age=data["building age"],
        floor_text=floor_text,
        build_floors=build_floors,
        rooms=rooms,
        area=area,
        dealamount=clean_text(chunk.get("dealamount")),
        price_millions=price_millions,
    )

    data = data[data["city"].notna() & data["date"].notna()]
    return data


def clean_text(values: Any) -> pd.Series:
    if values is None:
        return pd.Series(dtype="object")
    return pd.Series(values, dtype="object").replace("", pd.NA).map(lambda value: str(value).strip() if pd.notna(value) else pd.NA)


def normalize_city_name(value: Any) -> Any:
    if pd.isna(value):
        return pd.NA
    return CITY_ALIASES.get(str(value).strip(), str(value).strip())


def parse_dates(dealdatetime: Any, dealdate: Any) -> pd.Series:
    first = pd.to_datetime(dealdatetime, errors="coerce")
    second = pd.to_datetime(dealdate, format="%d.%m.%Y", errors="coerce")
    return first.fillna(second)


def parse_number_series(values: Any) -> pd.Series:
    if values is None:
        return pd.Series(dtype="float64")
    text = pd.Series(values, dtype="object").replace("", pd.NA).astype("string")
    text = text.str.replace(",", "", regex=False).str.replace("₪", "", regex=False)
    extracted = text.str.extract(r"(-?\d+(?:\.\d+)?)", expand=False)
    return pd.to_numeric(extracted, errors="coerce")


def build_source_key(resource_id: pd.Series, row_num: pd.Series) -> pd.Series:
    key = resource_id.astype("string").fillna("") + ":" + row_num.astype("string").fillna("")
    return key.replace(":", pd.NA)


def parse_gush_number(gush: pd.Series) -> pd.Series:
    first_part = gush.astype("string").str.extract(r"^(\d+)", expand=False)
    return pd.to_numeric(first_part, errors="coerce")


def parse_floor_series(floor_text: pd.Series) -> pd.Series:
    cleaned = normalize_floor_text(floor_text)
    mapped = cleaned.map(FLOOR_MAP)
    numeric = cleaned.str.extract(r"^(-?\d+)$", expand=False)
    floor = mapped.where(mapped.notna(), pd.to_numeric(numeric, errors="coerce"))
    floor_from_phrase = cleaned.str.extract(r"(?:^קומה\s*(-?\d+)|^(-?\d+)\s*קומה)", expand=True)
    phrase_number = pd.to_numeric(floor_from_phrase.bfill(axis=1).iloc[:, 0], errors="coerce")
    floor = floor.where(floor.notna(), phrase_number)
    return floor.astype("float64")


def parse_high_floor_series(floor_text: pd.Series, fallback: pd.Series) -> pd.Series:
    cleaned = normalize_floor_text(floor_text)
    mapped = cleaned.map(HIGH_FLOOR_MAP)
    return mapped.where(mapped.notna(), fallback).astype("float64")


def normalize_floor_text(floor_text: pd.Series) -> pd.Series:
    return (
        floor_text.astype("string")
        .str.replace(r"[\u200e\u200f\u202a-\u202e\u00a0]", " ", regex=True)
        .str.replace(r"\s+", " ", regex=True)
        .str.strip()
    )


def first_nonempty(*series: pd.Series) -> pd.Series:
    result = pd.Series(pd.NA, index=series[0].index if series else None, dtype="object")
    for candidate in series:
        result = result.where(result.notna(), candidate)
    return result


def build_address(street: pd.Series, city: pd.Series) -> pd.Series:
    street = street.astype("string")
    city = city.astype("string")
    address = street.fillna("") + ", " + city.fillna("")
    return address.str.strip(" ,").replace("", pd.NA)


def same_number(left: pd.Series, right: pd.Series) -> pd.Series:
    return left.notna() & right.notna() & (left.astype("float64") == right.astype("float64"))


def build_story(**columns: pd.Series) -> pd.Series:
    pieces = []
    for index in columns["deal_year"].index:
        price = columns["price_millions"].loc[index] * 1_000_000
        area = columns["area"].loc[index]
        price_per_meter = round(price / area) if pd.notna(price) and pd.notna(area) and area else pd.NA
        pieces.append(
            "\n".join(
                [
                    safe_display(columns["deal_year"].loc[index]),
                    f"Deal date: {safe_display(columns['dealdate'].loc[index])}",
                    safe_display(columns["full_address"].loc[index]),
                    safe_display(columns["apt_type"].loc[index]),
                    f"Gush-Helka-TatHelka: {safe_display(columns['gush'].loc[index])}",
                    f"Built in: {safe_display(columns['build_year'].loc[index])} ({safe_display(columns['building_age'].loc[index])} years old)",
                    f"Floor: {safe_display(columns['floor_text'].loc[index], default='?')} out of {safe_display(columns['build_floors'].loc[index])}",
                    f"Rooms: {safe_display(columns['rooms'].loc[index])} ",
                    f"Area: {safe_display(columns['area'].loc[index])} m2",
                    f"Price: ₪ {safe_display(columns['dealamount'].loc[index])} ",
                    f"Price per m2: ₪ {safe_display(price_per_meter)} ",
                ]
            )
        )
    return pd.Series(pieces, index=columns["deal_year"].index)


def safe_display(value: Any, *, default: str = "-") -> str:
    if pd.isna(value):
        return default
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def merge_existing_data(odata: pd.DataFrame, existing_root: Path) -> tuple[pd.DataFrame, Dict[str, Any]]:
    manifest_path = existing_root / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"Existing manifest not found: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    frames = [odata]
    existing_rows = 0
    for city, record in manifest["cities"].items():
        path = existing_root / "cities" / record["file"]
        if not path.exists():
            continue
        frame = pd.read_parquet(path)
        frame = frame[REQUIRED_CITY_COLUMNS]
        frame["_source_key"] = pd.NA
        existing_rows += len(frame)
        frames.append(frame)
    merged = pd.concat(frames, ignore_index=True, copy=False)
    return merged, {"existing_rows": existing_rows, "odata_rows": len(odata), "pre_dedupe_rows": len(merged)}


def dedupe_transactions(data: pd.DataFrame) -> pd.DataFrame:
    if "_source_key" in data.columns:
        source_mask = data["_source_key"].notna()
        sourced = data.loc[source_mask].drop_duplicates(subset=["_source_key"], keep="last")
        unsourced = data.loc[~source_mask]
        if unsourced.empty:
            return sourced.reset_index(drop=True)

        source_signatures = set(transaction_signature_frame(sourced).itertuples(index=False, name=None))
        unsourced_signatures = transaction_signature_frame(unsourced)
        keep_unsourced = ~unsourced_signatures.apply(tuple, axis=1).isin(source_signatures)
        return pd.concat([unsourced.loc[keep_unsourced], sourced], ignore_index=True, copy=False)

    dedupe_columns = [
        "city",
        "street",
        "GUSH",
        "date",
        "price_millions",
        "area",
        "rooms",
        "floor",
        "apt type",
        "build_year",
    ]
    return data.drop_duplicates(subset=dedupe_columns, keep="last").reset_index(drop=True)


def transaction_signature_frame(data: pd.DataFrame) -> pd.DataFrame:
    dedupe_columns = [
        "city",
        "street",
        "GUSH",
        "date",
        "price_millions",
        "area",
        "rooms",
        "floor",
        "apt type",
        "build_year",
    ]
    return data[dedupe_columns].astype("string").fillna("<NA>")


def disambiguate_multi_city_gush(data: pd.DataFrame) -> pd.DataFrame:
    data = data.copy()
    pairs = data.loc[data["Gush"].notna(), ["Gush", "city"]].drop_duplicates()
    duplicated_gushes = pairs["Gush"].value_counts()
    duplicated_gushes = duplicated_gushes[duplicated_gushes > 1].index
    if len(duplicated_gushes) == 0:
        return data

    multi_city = pairs[pairs["Gush"].isin(duplicated_gushes)].sort_values(["Gush", "city"]).copy()
    multi_city["Gush1"] = multi_city["Gush"] * 10 + multi_city.groupby("Gush").cumcount() + 1
    data = data.merge(multi_city, how="left", on=["Gush", "city"])
    data["Gush"] = data["Gush1"].where(data["Gush1"].notna(), data["Gush"])
    return data.drop(columns=["Gush1"])


def write_output(
    data: pd.DataFrame,
    output_root: Path,
    *,
    source_row_count: int,
    pre_dedupe_row_count: int,
    post_dedupe_row_count: int,
    merge_report: Optional[Mapping[str, Any]],
) -> Dict[str, Any]:
    city_dir = output_root / "cities"
    metadata_dir = output_root / "metadata"
    city_dir.mkdir(parents=True, exist_ok=True)
    metadata_dir.mkdir(parents=True, exist_ok=True)

    manifest_cities: Dict[str, Dict[str, Any]] = {}
    city_validations: Dict[str, Dict[str, Any]] = {}
    for city in sorted(data["city"].dropna().unique()):
        city_data = data.loc[data["city"] == city, REQUIRED_CITY_COLUMNS].copy()
        file_name = city_file_name(city)
        target = city_dir / file_name
        city_data.to_parquet(target, compression="zstd", index=False)
        roundtrip = pd.read_parquet(target)
        manifest_cities[city] = {"file": file_name, "rows": len(roundtrip)}
        city_validations[city] = {
            "file": file_name,
            "row_count": len(roundtrip),
            "columns_match": list(roundtrip.columns) == REQUIRED_CITY_COLUMNS,
            "min_date": safe_min(roundtrip["date"]),
            "max_date": safe_max(roundtrip["date"]),
        }

    gush_descriptions = build_gush_descriptions(data)
    unique_gush_streets = data[["city", "Gush", "street"]].drop_duplicates().sort_values(["city", "Gush", "street"])
    apt_types = sorted(value for value in data["apt type"].dropna().astype(str).unique())

    gush_descriptions.to_parquet(metadata_dir / "gush_descriptions.parquet", compression="zstd", index=False)
    unique_gush_streets.to_parquet(metadata_dir / "unique_gush_streets.parquet", compression="zstd", index=False)
    write_json({"apt_types": apt_types}, metadata_dir / "apt_types.json")

    sp500_source = Path("data/metadata/sp500_shekels.csv")
    sp500_target = metadata_dir / "sp500_shekels.csv"
    if sp500_source.exists() and sp500_source.resolve() != sp500_target.resolve():
        shutil.copyfile(sp500_source, sp500_target)

    generated_at = datetime.now().astimezone().strftime("%Y-%m-%dT%H:%M:%S%z")
    manifest = {
        "app": "nadlan2",
        "generated_at": generated_at,
        "source_root": DATASET_PAGE,
        "source_package_id": PACKAGE_ID,
        "required_city_columns": REQUIRED_CITY_COLUMNS,
        "city_count": len(manifest_cities),
        "total_city_rows": sum(record["rows"] for record in manifest_cities.values()),
        "cities": manifest_cities,
        "metadata": {
            "gush_descriptions": {"file": "metadata/gush_descriptions.parquet", "rows": len(gush_descriptions)},
            "unique_gush_streets": {"file": "metadata/unique_gush_streets.parquet", "rows": len(unique_gush_streets)},
            "apt_types": {"file": "metadata/apt_types.json", "rows": len(apt_types)},
            "sp500_shekels": {"file": "metadata/sp500_shekels.csv", "bytes": sp500_target.stat().st_size if sp500_target.exists() else 0},
        },
    }

    date_range = {"min": safe_min(data["date"]), "max": safe_max(data["date"])}
    report = {
        "generated_at": generated_at,
        "source": {
            "dataset_page": DATASET_PAGE,
            "package_api": PACKAGE_API,
            "resources": RESOURCES,
            "source_rows_after_city_filter": source_row_count,
        },
        "merge": merge_report,
        "dedupe": {
            "pre_dedupe_rows": pre_dedupe_row_count,
            "post_dedupe_rows": post_dedupe_row_count,
            "removed_rows": pre_dedupe_row_count - post_dedupe_row_count,
        },
        "date_range": date_range,
        "city_count": len(manifest_cities),
        "total_city_rows": manifest["total_city_rows"],
        "columns_match": all(item["columns_match"] for item in city_validations.values()),
        "cities": city_validations,
    }

    write_json(manifest, output_root / "manifest.json")
    write_json(report, output_root / "odata_import_report.json")
    return {"manifest": manifest, "date_range": date_range, "report": report}


def build_gush_descriptions(data: pd.DataFrame) -> pd.DataFrame:
    counts = data.groupby(["city", "Gush", "street"], dropna=True).size().reset_index(name="n")
    counts = counts.sort_values(["city", "Gush", "n"], ascending=[True, True, False])
    rows: List[Dict[str, Any]] = []
    for (city, gush), group in counts.groupby(["city", "Gush"], sort=True):
        first = group.iloc[0]
        other_count = len(group) - 1
        suffix = "" if other_count == 0 else f" ו-{other_count} רחובות אחרים"
        rows.append(
            {
                "city": city,
                "Gush": gush,
                "street": first["street"],
                "n": int(first["n"]),
                "Gush_desc": f"{city} {safe_display(gush)} ({first['street']}{suffix})",
            }
        )
    return pd.DataFrame(rows, columns=["city", "Gush", "street", "n", "Gush_desc"])


def city_file_name(city: str) -> str:
    if city in CURRENT_CITY_SLUGS:
        return CURRENT_CITY_SLUGS[city]
    digest = hashlib.sha1(city.encode("utf-8")).hexdigest()[:10]
    return f"city_{digest}.parquet"


def safe_min(values: pd.Series) -> Optional[str]:
    values = values.dropna()
    if values.empty:
        return None
    return str(values.min())


def safe_max(values: pd.Series) -> Optional[str]:
    values = values.dropna()
    if values.empty:
        return None
    return str(values.max())


def write_json(value: Mapping[str, Any], path: Path) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
