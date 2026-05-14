from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from flask import Flask, Response, current_app, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

from .config import Config
from .services.analysis_deals import AnalysisDealsError, build_analysis_deals_response
from .services.city_comparison import (
    CityComparisonError,
    build_city_comparison_raw_response,
    build_city_comparison_summary_response,
)
from .services.compare_areas import CompareAreasError, build_compare_raw_response, build_compare_summary_response
from .services.data_store import DataStore, DataStoreError
from .services.downloads import (
    DownloadError,
    build_analysis_download,
    build_city_comparison_raw_download,
    build_city_comparison_summary_download,
    build_compare_raw_download,
    build_compare_summary_download,
    build_gush_performance_raw_download,
    build_gush_performance_summary_download,
)
from .services.filter_metadata import FilterMetadataError, build_filter_options, gush_detail, gush_search_results, street_search_results
from .services.gush_performance import GushPerformanceError, build_gush_performance_summary_response
from .services.gush_map import GushMapError, build_gush_map_response


def create_app(config_object: Optional[type] = None) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_object or Config)

    # Keep URL generation compatible with reverse proxies that mount under a
    # subpath and send X-Forwarded-Prefix.
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

    app.json.ensure_ascii = False
    app.config["JSON_AS_ASCII"] = False

    data_store = DataStore(
        app.config["DATA_DIR"],
        metadata_cache_ttl_seconds=app.config["METADATA_CACHE_TTL_SECONDS"],
        city_cache_ttl_seconds=app.config["CITY_CACHE_TTL_SECONDS"],
        city_cache_max_items=app.config["CITY_CACHE_MAX_ITEMS"],
        response_cache_dir=app.config["CACHE_DIR"],
        response_cache_ttl_seconds=app.config["RESPONSE_CACHE_TTL_SECONDS"],
    )
    app.extensions["nadlan2_data_store"] = data_store

    register_routes(app)
    register_error_handlers(app)
    return app


def register_routes(app: Flask) -> None:
    frontend_dir = Path(app.config["PROJECT_ROOT"]) / "frontend"

    @app.get("/api/status")
    def status():
        started = time.perf_counter()
        data_store = _data_store()
        manifest_state = data_store.manifest_state()
        status_value = "ok" if manifest_state["loaded"] else "degraded"

        response = {
            "status": status_value,
            "app": current_app.config["APP_NAME"],
            "version": current_app.config["APP_VERSION"],
            "timestamp": _utc_now_iso(),
            "data_manifest": manifest_state,
            "timing_ms": _elapsed_ms(started),
        }
        return jsonify(response)

    @app.get("/api/meta")
    def meta():
        started = time.perf_counter()
        try:
            metadata = _data_store().load_app_metadata()
        except DataStoreError as exc:
            current_app.logger.warning("Metadata load failed: %s", exc, exc_info=True)
            return (
                jsonify(
                    _api_response(
                        data=None,
                        meta={"status": "error"},
                        warnings=[exc.public_message],
                        started=started,
                    )
                ),
                503,
            )

        return jsonify(
            _api_response(
                data=metadata,
                meta={
                    "status": "ok",
                    "app": current_app.config["APP_NAME"],
                    "version": current_app.config["APP_VERSION"],
                },
                warnings=[],
                started=started,
            )
        )

    @app.get("/api/cities/<city>/streets")
    def city_streets(city: str):
        started = time.perf_counter()
        try:
            streets = _data_store().streets_for_city(city)
        except DataStoreError as exc:
            current_app.logger.warning("Street metadata load failed: %s", exc, exc_info=True)
            return _error_response(exc.public_message, started, status_code=404)

        return jsonify(_api_response(data={"city": city, "streets": streets}, meta={"status": "ok"}, warnings=[], started=started))

    @app.get("/api/cities/<city>/gushes")
    def city_gushes(city: str):
        started = time.perf_counter()
        try:
            gushes = _data_store().gushes_for_city(city)
        except DataStoreError as exc:
            current_app.logger.warning("Gush metadata load failed: %s", exc, exc_info=True)
            return _error_response(exc.public_message, started, status_code=404)

        return jsonify(_api_response(data={"city": city, "gushes": gushes}, meta={"status": "ok"}, warnings=[], started=started))

    @app.post("/api/cities/<city>/selection")
    def city_selection_metadata(city: str):
        started = time.perf_counter()
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return _error_response("Request body must be a JSON object.", started, status_code=400)
        try:
            streets = _data_store().streets_for_gushes(city, payload.get("gushes") or [])
            gushes = _data_store().gushes_for_streets(city, payload.get("streets") or [])
        except DataStoreError as exc:
            current_app.logger.warning("Selection metadata load failed: %s", exc, exc_info=True)
            return _error_response(exc.public_message, started, status_code=404)

        return jsonify(
            _api_response(
                data={"city": city, "streets": streets, "gushes": gushes},
                meta={"status": "ok"},
                warnings=[],
                started=started,
            )
        )

    @app.get("/api/gushes/<gush_id>")
    def gush(gush_id: str):
        started = time.perf_counter()
        try:
            data = gush_detail(_data_store(), gush_id)
        except (DataStoreError, FilterMetadataError) as exc:
            public_message = getattr(exc, "public_message", "Gush metadata could not be loaded.")
            current_app.logger.warning("Gush lookup failed: %s", exc, exc_info=True)
            return _error_response(public_message, started, status_code=404)

        return jsonify(_api_response(data=data, meta={"status": "ok"}, warnings=[], started=started))

    @app.get("/api/street-search")
    def street_search():
        started = time.perf_counter()
        query = request.args.get("q", "")
        city = request.args.get("city")
        limit = _query_limit(request.args.get("limit"), default=25, maximum=100)
        try:
            results = street_search_results(_data_store(), query, city=city, limit=limit)
        except DataStoreError as exc:
            current_app.logger.warning("Street search failed: %s", exc, exc_info=True)
            return _error_response(exc.public_message, started, status_code=400)

        return jsonify(
            _api_response(
                data={"query": query, "city": city, "results": results},
                meta={"status": "ok", "limit": limit},
                warnings=[],
                started=started,
            )
        )

    @app.get("/api/gush-search")
    def gush_search():
        started = time.perf_counter()
        query = request.args.get("q", "")
        city = request.args.get("city")
        limit = _query_limit(request.args.get("limit"), default=30, maximum=100)
        try:
            results = gush_search_results(_data_store(), query, city=city, limit=limit)
        except DataStoreError as exc:
            current_app.logger.warning("Gush search failed: %s", exc, exc_info=True)
            return _error_response(exc.public_message, started, status_code=400)

        return jsonify(
            _api_response(
                data={"query": query, "city": city, "results": results},
                meta={"status": "ok", "limit": limit},
                warnings=[],
                started=started,
            )
        )

    @app.post("/api/filter-options")
    def filter_options():
        started = time.perf_counter()
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return _error_response("Request body must be a JSON object.", started, status_code=400)
        try:
            data = build_filter_options(_data_store(), payload)
        except (DataStoreError, FilterMetadataError) as exc:
            public_message = getattr(exc, "public_message", "Filter metadata could not be loaded.")
            current_app.logger.warning("Filter options failed: %s", exc, exc_info=True)
            return _error_response(public_message, started, status_code=400)

        return jsonify(
            _api_response(
                data=data,
                meta={"status": "ok"},
                warnings=data.get("warnings", []),
                started=started,
            )
        )

    @app.post("/api/analysis/deals")
    def analysis_deals():
        started = time.perf_counter()
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return _error_response("Request body must be a JSON object.", started, status_code=400)
        try:
            data = build_analysis_deals_response(_data_store(), payload)
        except (DataStoreError, AnalysisDealsError) as exc:
            public_message = getattr(exc, "public_message", "Analysis data could not be loaded.")
            current_app.logger.warning("Analysis deals failed: %s", exc, exc_info=True)
            return _error_response(public_message, started, status_code=400)

        return jsonify(
            _api_response(
                data=data,
                meta={"status": "ok"},
                warnings=data.get("warnings", []),
                started=started,
            )
        )

    @app.post("/api/compare/summary")
    def compare_summary():
        started = time.perf_counter()
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return _error_response("Request body must be a JSON object.", started, status_code=400)
        try:
            data = build_compare_summary_response(_data_store(), payload)
        except (DataStoreError, CompareAreasError) as exc:
            public_message = getattr(exc, "public_message", "Compare data could not be loaded.")
            current_app.logger.warning("Compare summary failed: %s", exc, exc_info=True)
            return _error_response(public_message, started, status_code=400)

        return jsonify(
            _api_response(
                data=data,
                meta={"status": "ok"},
                warnings=data.get("warnings", []),
                started=started,
            )
        )

    @app.post("/api/compare/raw")
    def compare_raw():
        started = time.perf_counter()
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return _error_response("Request body must be a JSON object.", started, status_code=400)
        try:
            data = build_compare_raw_response(_data_store(), payload)
        except (DataStoreError, CompareAreasError) as exc:
            public_message = getattr(exc, "public_message", "Compare data could not be loaded.")
            current_app.logger.warning("Compare raw failed: %s", exc, exc_info=True)
            return _error_response(public_message, started, status_code=400)

        return jsonify(
            _api_response(
                data=data,
                meta={"status": "ok"},
                warnings=data.get("warnings", []),
                started=started,
            )
        )

    @app.post("/api/city-comparison/summary")
    def city_comparison_summary():
        started = time.perf_counter()
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return _error_response("Request body must be a JSON object.", started, status_code=400)
        try:
            data = build_city_comparison_summary_response(_data_store(), payload)
        except (DataStoreError, CityComparisonError) as exc:
            public_message = getattr(exc, "public_message", "City comparison data could not be loaded.")
            current_app.logger.warning("City comparison summary failed: %s", exc, exc_info=True)
            return _error_response(public_message, started, status_code=400)

        return jsonify(
            _api_response(
                data=data,
                meta={"status": "ok"},
                warnings=data.get("warnings", []),
                started=started,
            )
        )

    @app.post("/api/city-comparison/raw")
    def city_comparison_raw():
        started = time.perf_counter()
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return _error_response("Request body must be a JSON object.", started, status_code=400)
        try:
            data = build_city_comparison_raw_response(_data_store(), payload)
        except (DataStoreError, CityComparisonError) as exc:
            public_message = getattr(exc, "public_message", "City comparison data could not be loaded.")
            current_app.logger.warning("City comparison raw failed: %s", exc, exc_info=True)
            return _error_response(public_message, started, status_code=400)

        return jsonify(
            _api_response(
                data=data,
                meta={"status": "ok"},
                warnings=data.get("warnings", []),
                started=started,
            )
        )

    @app.post("/api/gush-performance/summary")
    def gush_performance_summary():
        started = time.perf_counter()
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return _error_response("Request body must be a JSON object.", started, status_code=400)
        try:
            data = build_gush_performance_summary_response(_data_store(), payload)
        except (DataStoreError, GushPerformanceError) as exc:
            public_message = getattr(exc, "public_message", "Gush performance data could not be loaded.")
            current_app.logger.warning("Gush performance summary failed: %s", exc, exc_info=True)
            return _error_response(public_message, started, status_code=400)

        return jsonify(
            _api_response(
                data=data,
                meta={"status": "ok"},
                warnings=data.get("warnings", []),
                started=started,
            )
        )

    @app.post("/api/gush-map")
    def gush_map():
        started = time.perf_counter()
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return _error_response("Request body must be a JSON object.", started, status_code=400)
        try:
            data = build_gush_map_response(_data_store(), payload)
        except (DataStoreError, GushMapError) as exc:
            public_message = getattr(exc, "public_message", "Gush map data could not be loaded.")
            current_app.logger.warning("Gush map failed: %s", exc, exc_info=True)
            return _error_response(public_message, started, status_code=400)

        return jsonify(
            _api_response(
                data=data,
                meta={"status": "ok"},
                warnings=data.get("warnings", []),
                started=started,
            )
        )

    @app.post("/api/download/analysis")
    def download_analysis():
        return _csv_download(build_analysis_download, "Analysis download")

    @app.post("/api/download/compare-raw")
    def download_compare_raw():
        return _csv_download(build_compare_raw_download, "Compare raw download")

    @app.post("/api/download/compare-summary")
    def download_compare_summary():
        return _csv_download(build_compare_summary_download, "Compare summary download")

    @app.post("/api/download/city-comparison-raw")
    def download_city_comparison_raw():
        return _csv_download(build_city_comparison_raw_download, "City comparison raw download")

    @app.post("/api/download/city-comparison-summary")
    def download_city_comparison_summary():
        return _csv_download(build_city_comparison_summary_download, "City comparison summary download")

    @app.post("/api/download/gush-performance-raw")
    def download_gush_performance_raw():
        return _csv_download(build_gush_performance_raw_download, "Gush performance raw download")

    @app.post("/api/download/gush-performance-summary")
    def download_gush_performance_summary():
        return _csv_download(build_gush_performance_summary_download, "Gush performance summary download")

    @app.get("/")
    def frontend_index():
        return send_from_directory(frontend_dir, "index.html")

    @app.get("/assets/<path:filename>")
    def frontend_assets(filename: str):
        return send_from_directory(frontend_dir / "assets", filename)


def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(HTTPException)
    def handle_http_error(exc: HTTPException):
        return (
            jsonify(
                {
                    "data": None,
                    "meta": {"status": "error", "code": exc.code},
                    "warnings": [exc.description],
                    "timing_ms": 0,
                }
            ),
            exc.code,
        )

    @app.errorhandler(Exception)
    def handle_unexpected_error(exc: Exception):
        app.logger.exception("Unhandled API error: %s", exc)
        return (
            jsonify(
                {
                    "data": None,
                    "meta": {"status": "error", "code": 500},
                    "warnings": ["Unexpected server error."],
                    "timing_ms": 0,
                }
            ),
            500,
        )


def _data_store() -> DataStore:
    return current_app.extensions["nadlan2_data_store"]


def _api_response(
    *,
    data: Optional[Dict[str, Any]],
    meta: Dict[str, Any],
    warnings: List[str],
    started: float,
) -> Dict[str, Any]:
    return {
        "data": data,
        "meta": meta,
        "warnings": warnings,
        "timing_ms": _elapsed_ms(started),
    }


def _error_response(public_message: str, started: float, *, status_code: int):
    return (
        jsonify(
            _api_response(
                data=None,
                meta={"status": "error", "code": status_code},
                warnings=[public_message],
                started=started,
            )
        ),
        status_code,
    )


def _query_limit(value: Optional[str], *, default: int, maximum: int) -> int:
    try:
        limit = int(value) if value is not None else default
    except ValueError:
        return default
    return max(1, min(limit, maximum))


def _csv_download(builder, log_label: str):
    started = time.perf_counter()
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return _error_response("Request body must be a JSON object.", started, status_code=400)
    try:
        download = builder(_data_store(), payload)
    except (
        DataStoreError,
        AnalysisDealsError,
        CompareAreasError,
        CityComparisonError,
        GushPerformanceError,
        DownloadError,
    ) as exc:
        public_message = getattr(exc, "public_message", "Download could not be generated.")
        current_app.logger.warning("%s failed: %s", log_label, exc, exc_info=True)
        return _error_response(public_message, started, status_code=400)

    response = Response(download["content"], content_type=download["content_type"])
    response.headers["Content-Disposition"] = f'attachment; filename="{download["filename"]}"'
    response.headers["X-Row-Count"] = str(download["row_count"])
    return response


def _elapsed_ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    app = create_app()
    app.run(host="127.0.0.1", port=8006)
