from __future__ import annotations

import os
from pathlib import Path


class Config:
    APP_NAME = os.environ.get("NADLAN2_APP_NAME", "nadlan2")
    APP_VERSION = os.environ.get("NADLAN2_VERSION", "0.2.0")

    PROJECT_ROOT = Path(__file__).resolve().parents[1]
    DATA_DIR = Path(os.environ.get("NADLAN2_DATA_DIR", PROJECT_ROOT / "data")).resolve()
    CACHE_DIR = Path(os.environ.get("NADLAN2_CACHE_DIR", PROJECT_ROOT / ".cache")).resolve()
    METADATA_CACHE_TTL_SECONDS = int(os.environ.get("NADLAN2_METADATA_CACHE_TTL_SECONDS", "3600"))
    CITY_CACHE_TTL_SECONDS = int(os.environ.get("NADLAN2_CITY_CACHE_TTL_SECONDS", "900"))
    CITY_CACHE_MAX_ITEMS = int(os.environ.get("NADLAN2_CITY_CACHE_MAX_ITEMS", "4"))
    RESPONSE_CACHE_TTL_SECONDS = int(os.environ.get("NADLAN2_RESPONSE_CACHE_TTL_SECONDS", "1800"))

    APPLICATION_ROOT = os.environ.get("SCRIPT_NAME", "/")
