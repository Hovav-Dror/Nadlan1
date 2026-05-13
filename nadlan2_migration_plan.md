# Nadlan2 Shiny-to-Flask Migration Plan

## Goal

Migrate the existing R Shiny app at `/Users/hovav/Documents/R projects/nadlan2` to a lightweight non-Shiny app suitable for a cheap Ubuntu server with low CPU and memory.

Target architecture:

- Flask + Gunicorn backend
- Static HTML/CSS/JavaScript frontend, using Plotly.js and a lightweight table library if needed
- Deployment root: `/srv/nonshiny/nadlan2`
- Public serving under an Nginx subpath, for example `/app-url/`
- Gunicorn bound locally to `127.0.0.1:8006`
- Required health endpoint: `/api/status`
- Expensive computation cached
- Raw/private data kept server-only
- Frontend paths must be relative, not absolute `/static/...`
- No Shiny, Dash, or Streamlit

## Current App Summary

Primary files:

- `/Users/hovav/Documents/R projects/nadlan2/app.R`
- `/Users/hovav/Documents/R projects/nadlan2/global.R`
- `/Users/hovav/Documents/R projects/nadlan2/helpers.R`
- `/Users/hovav/Documents/R projects/nadlan2/performance_monitor.R`
- `/Users/hovav/Documents/R projects/nadlan2/data_prep.R`
- `/Users/hovav/Documents/R projects/nadlan2/prep_by_city.R`

Main Shiny tabs:

- Analysis Deals: individual transaction scatter plot, filters, table, CSV download
- Compare Areas: Gush/year aggregated comparison
- City Comparison: city/year aggregated comparison
- City Performance: top/typical/bottom Gush performance inside one city
- Map: placeholder
- About: static informational content

Current data:

- Per-city `.fst` runtime data in `/Users/hovav/Documents/R projects/nadlan2/fst_data`
- About 711,876 total deal rows across 20 city files
- Largest file: Tel Aviv, about 100,245 rows, about 32 MB
- `fst_data` totals about 216 MB
- Repo/work folder totals about 1.5 GB due to duplicate `.fst`, `.rds`, `.RData`, `.xlsx`, and zip artifacts

Runtime metadata:

- `GushDescriptions.fst`: Gush descriptions and display names
- `unique_gush_streets.fst`: city/street/Gush lookup
- `apt_types.fst`: apartment type choices
- `SP500_shekels.csv`: S&P 500 comparison index

Columns used by the app:

- `city`, `street`, `Gush`, `GUSH`, `FULLADRESS`
- `date`, `deal year`
- `price_millions`
- `area`, `rooms`, `floor`, `roof`
- `apt type`, `New_Project`
- `build_year`, `building age`, `build_floors`
- `story`

## Important Migration Principles

- Treat the existing Shiny app as the source of behavior, not as reusable runtime code.
- Keep all raw data and detailed transaction records outside the web-served frontend directory.
- Make the backend return chart-ready JSON, not rendered images.
- Keep Plotly rendering in the browser to reduce server CPU and avoid Shiny-like server sessions.
- Prefer coarse-grained API calls triggered by user actions instead of reactive server chatter.
- Cache every endpoint that reads multiple city files or aggregates data.
- Preserve Hebrew text and UTF-8 CSV export behavior.
- Make all frontend resource references relative so the app works under `/app-url/`.

## Phase 0: Behavior Freeze And Baseline

Purpose:

Capture current Shiny behavior before implementation starts, so later Python outputs can be compared against known examples.

Background needed:

- Current app logic is spread across `app.R` and `helpers.R`.
- Some controls are stale or inconsistent:
  - Main plot references `input$color_palette`, but the visible main UI appears to have removed the color palette control.
  - Main plot references `input$reverse_colors`, but no matching main UI input was found.
  - `cmp_stat`, `city_comp_stat`, and `gush_perf_stat` exist but summaries appear to use median only.
  - `expand_streets_by_gush` and `expand_to_gush_from_streets` buttons appear in the UI, but matching observers were not found.
  - `selected_point_info` references `building.age` while selected data uses `building age`.
  - City Performance warns that the logic was not QA'd.

Deliverables:

- Write down several representative scenarios:
  - Analysis: one city, one Gush, default filters
  - Analysis: streets selected instead of Gush
  - Compare Areas: 2-4 Gushes, default filters
  - City Comparison: 3 cities, default apartment types
  - City Performance: Tel Aviv default
- For each scenario, record expected row counts, summary counts, and exported CSV columns.
- Decide which known bugs/stale controls should be preserved, fixed, or dropped.

Implementation notes:

- Do not port every Shiny UI detail blindly.
- Use this phase to define exact API request payloads for each scenario.
- Capture a few sample JSON/CSV expected outputs manually before rewriting.

Validation:

- Baseline counts from R and later Python should match for the selected scenarios, except for explicitly accepted behavior changes.

## Phase 1: Data Format And Server-Only Storage

Purpose:

Convert the existing R-focused data artifacts into Python-friendly files optimized for low-memory server use.

Background needed:

- Python support for `.fst` is not a good deployment bet.
- The current Shiny app reads selected columns from per-city `.fst` files.
- The per-city split is good for low-memory deployment and should be retained.
- Duplicate `.RData`, `.rds`, `.xlsx`, and full combined files should not be copied into the deployed app unless needed for offline rebuilds.

Recommended target layout:

```text
/srv/nonshiny/nadlan2/
  backend/
  frontend/
  data/
    cities/
      <city>.parquet
    metadata/
      gush_descriptions.parquet
      unique_gush_streets.parquet
      apt_types.json
      sp500_shekels.csv
```

Conversion tasks:

- Convert each `fst_data/fst_<city>.fst` to Parquet with only the required runtime columns.
- Convert `GushDescriptions.fst` and `unique_gush_streets.fst` to Parquet.
- Convert `apt_types.fst` to JSON.
- Keep `SP500_shekels.csv` as CSV or convert to JSON/Parquet.
- Normalize filenames so Hebrew city names do not create fragile URL/path logic. Use a manifest:

```json
{
  "אשדוד": "ashdod.parquet",
  "תל אביב -יפו": "tel_aviv_yafo.parquet"
}
```

Recommended Python libraries:

- `pandas`
- `pyarrow`
- `duckdb` optional, useful for low-memory filtering and aggregations

Validation:

- For every converted city file, compare row count and required columns against the original `.fst`.
- Confirm all date columns parse correctly.
- Confirm Hebrew text survives a read/write/read cycle.

## Phase 2: Flask Backend Skeleton

Purpose:

Create a minimal backend that can be deployed independently before porting analytics.

Background needed:

- The app will run behind Nginx on a subpath.
- The backend should not assume it is mounted at `/`.
- Gunicorn should bind to `127.0.0.1:8006`.

Likely files:

```text
backend/
  app.py
  config.py
  wsgi.py
  services/
    __init__.py
    data_store.py
    cache.py
  requirements.txt
  gunicorn.conf.py
```

Initial endpoints:

- `GET /api/status`
  - Returns status, app name, version, data manifest load state, and timestamp.
- `GET /api/meta`
  - Returns cities, apartment types, numeric/categorical variable choices, default filters, and tab availability.

API design rules:

- Accept JSON POST bodies for analytical endpoints.
- Return structured JSON with `data`, `meta`, `warnings`, and `timing_ms`.
- Include row counts before and after filters for each analysis endpoint.
- Do not expose filesystem paths or raw server errors to the browser.

Validation:

- `curl http://127.0.0.1:8006/api/status` works locally.
- App can run with `gunicorn -c backend/gunicorn.conf.py backend.wsgi:app`.
- Nginx subpath can proxy `/app-url/api/...` without changing frontend API code if the frontend uses relative paths.

## Phase 3: Data Access Layer And Cache Foundation

Purpose:

Build reusable data-loading and caching functions before porting specific tabs.

Background needed:

- Repeated city file reads are one of the expensive operations in Shiny.
- City Comparison defaults to all cities, which can touch every city file.
- Compare Areas may load all cities containing selected Gushes.
- Analysis can load one city or multiple cities if Gushes span cities.

Data access functions:

- `load_metadata()`
- `list_cities()`
- `load_city(city)`
- `load_cities(cities)`
- `cities_for_gushes(gush_ids)`
- `streets_for_city(city)`
- `gushes_for_city(city)`
- `search_streets(query, city=None)`

Cache strategy:

- In-process LRU cache for recently loaded city DataFrames.
- Disk or filesystem cache for expensive computed summaries.
- Cache keys based on normalized request payloads:
  - selected cities/Gushes
  - filters
  - y metric
  - outlier toggle
  - endpoint version
  - data manifest/version
- Short-to-medium TTL for computed responses, for example 15-60 minutes.
- Longer TTL for static metadata.

Recommended cache layers:

- Layer 1: city Parquet reads
- Layer 2: base filtered datasets or row-id lists
- Layer 3: aggregated chart-ready summaries
- Layer 4: generated CSV download payloads

Validation:

- Repeated identical requests should avoid re-reading files.
- Cache size should be bounded.
- Memory usage should stay acceptable after requesting the largest city.

## Phase 4: Shared Filtering And Calculation Services

Purpose:

Port Shiny's common data manipulation into backend service functions.

Background needed:

Shared filters include:

- city, streets, Gush
- floor range, rooms, area, price
- price per m2
- deal year
- built year
- building age
- building floors
- roof yes/no/both
- new project yes/no/both
- apartment type
- remove outliers

Shared calculation functions:

- `price_used(row, price_type)`
  - `Price`: `price_millions`
  - `Price / m²`: `price_millions * 1000 / area`
  - `Price / Room`: `price_millions / rooms`
- `remove_price_outliers_by_year(df)`
  - Match Shiny's year-specific IQR behavior, including neighboring-year fallback for small samples.
- `remove_outliers_from_var(df, "area")`
- `apply_common_filters(df, filters)`
- `summary_by_gush_year(df)`
- `summary_by_city_year(df)`
- `sp500_normalized(years, base_value)`

Important data semantics:

- `floor == 999` means unknown and is included in floor filters.
- `rooms == 999` means unknown and is included in room filters in several paths.
- `build_floors == 999` means unknown and is included in building-floor filters.
- `build_year < 1900` and `building age > 150` are treated as special/unknown and often retained.
- `roof` is inconsistently represented as boolean or `"TRUE"`/`"FALSE"` in R logic; normalize in Python.

Validation:

- Unit-test filters with small hand-built DataFrames.
- Regression-test R vs Python counts for selected scenarios.
- Confirm all returned rows are JSON serializable and dates are ISO strings.

## Phase 5: Metadata And Dynamic Filter APIs

Purpose:

Replace Shiny observers that populate UI controls and dynamic sliders.

Background needed:

The Shiny app dynamically recomputes:

- streets for selected city
- Gush choices and labels for selected city
- filter ranges after city/street/Gush selection
- smart default room selections
- street search results that map street names to Gush areas

Endpoints:

- `GET /api/meta`
- `GET /api/cities/<city>/streets`
- `GET /api/cities/<city>/gushes`
- `GET /api/gushes/<gush_id>`
- `GET /api/street-search?q=<query>&city=<optional-city>`
- `POST /api/filter-options`

`POST /api/filter-options` should return:

- numeric min/max ranges for available data
- unique room choices
- smart-selected rooms
- apartment type choices
- counts before outlier removal and after outlier removal
- warning if no data

Validation:

- Street and Gush dropdowns match the Shiny metadata.
- Search with Hebrew terms works case-insensitively where applicable.
- API never returns raw full transaction rows for metadata-only calls.

## Phase 6: Analysis Deals Endpoint

Purpose:

Port the main individual-deal analysis tab.

Background needed:

Current Shiny flow:

1. Choose city.
2. Choose streets or Gush areas.
3. Load one or more city files.
4. Filter to selected streets or Gushes.
5. Optionally remove price and area outliers.
6. Apply additional filters.
7. Process chart aesthetics.
8. Calculate `PriceUsed`.
9. Return at most 2,000 sampled rows for plotting if filtered data is larger.
10. Render Plotly scatter and table.

Endpoint:

- `POST /api/analysis/deals`

Request fields:

- `city`
- `streets`
- `gushes`
- `filters`
- `price_type`
- `color_var`, `shape_var`, `size_var`, `facet_var`
- `show_sp500`
- `show_city_comparison`
- `limit`
- `sample_seed`

Response fields:

- `points`: chart-ready rows with date, y value, tooltip, optional color/shape/size/facet
- `table_rows`: limited table rows
- `counts`: city rows, location rows, outlier rows, filtered rows, returned rows
- `overlays`: S&P 500 and city-wide series
- `warnings`: sampled, no data, too many categories, etc.

Frontend rendering:

- Use Plotly.js scatter traces.
- Use client-side click handling to highlight a table row.
- Use table click handling to highlight a chart point if practical.

Validation:

- Counts match R baseline scenarios.
- Sampling behavior is deterministic if `sample_seed` is supplied.
- Tooltip uses `story` but does not expose more raw fields than intended.

## Phase 7: Compare Areas Endpoint

Purpose:

Port Gush/year aggregated comparison.

Background needed:

Current Shiny behavior:

- User selects up to 15 Gush descriptions or selects city/streets and adds those streets' Gushes.
- Backend loads all cities represented by selected Gushes.
- Applies common filters.
- Optional IQR outlier removal on `price_millions`.
- Groups by `city`, `Gush`, `deal year`.
- Calculates:
  - `n_deals`
  - median `price_millions`
  - median `price_per_m2`
  - median `price_per_room`
- Optional city-wide comparison line.
- Optional S&P 500 normalized line.

Endpoints:

- `POST /api/compare/summary`
- `POST /api/compare/raw`

Response fields for summary:

- `series`: one trace per Gush description
- `table`: summary rows
- `counts`: raw deals, filtered deals, summary points, unique Gushes, unique years
- `overlays`: city-wide and S&P 500 if requested

Validation:

- Enforce max 15 selected Gushes server-side.
- Confirm Gush description to numeric Gush mapping is exact.
- Confirm y variable options match:
  - `price_millions`
  - `price_per_m2`
  - `price_per_room`
  - `n_deals`

## Phase 8: City Comparison Endpoint

Purpose:

Port city/year aggregated comparison.

Background needed:

Current Shiny behavior:

- User selects up to 20 cities.
- Defaults to all cities in the current app.
- Loads all selected city files.
- Applies common filters.
- Optional IQR outlier removal on `price_millions`.
- Groups by `city`, `deal year`.
- Calculates the same summary metrics as Compare Areas.
- Plot can hide/show points and control point size range.
- Optional S&P 500 normalized overlay.

Endpoints:

- `POST /api/city-comparison/summary`
- `POST /api/city-comparison/raw`

Implementation notes:

- Consider changing default frontend selection to a smaller set or lazy-load all-city summary only on explicit update, because all-city requests are expensive.
- Use cached summaries aggressively.
- Consider precomputing unfiltered city/year summaries as a fast initial view.

Validation:

- Enforce max city count server-side.
- Confirm 2027 exclusion if preserving current plot behavior; Shiny filters `deal year != 2027` in the plot.
- Confirm exported raw and summary columns match current downloads.

## Phase 9: City / Gush Performance Endpoint

Purpose:

Port the top/typical/bottom Gush performance tab, but only after confirming intended behavior.

Background needed:

The Shiny UI warns that this tab was not QA'd. The implementation:

- Selects one city.
- Applies common filters and outlier removal.
- Groups by `Gush`, `deal year`.
- Calculates yearly medians.
- Keeps Gushes with median deals per year above threshold and at least two years of data.
- Calculates year-over-year percentage changes per Gush.
- Uses trimmed mean yearly change as `yearly_slope`.
- Selects top, bottom, and central typical performers.
- Colors top/typical/bottom with a dedicated palette.

Endpoint:

- `POST /api/gush-performance/summary`

Request fields:

- `city`
- `filters`
- `yvar`
- `top_count`
- `typical_count`
- `bottom_count`
- `min_deals_per_gush`
- `show_city`
- `show_sp500`

Response fields:

- `series`: selected Gush/year traces
- `performance_table`
- `changes`: ranking and slope details
- `counts`
- `warnings`

Decision required before implementation:

- Keep current YoY-average behavior, or replace with a clearer regression/CAGR metric.
- Fix UI copy that currently says linear regression even though code does not use regression.

Validation:

- Confirm selected top/bottom Gushes match R for a fixed scenario if preserving behavior.
- Confirm warning copy remains visible in frontend if logic stays provisional.

## Phase 10: Downloads

Purpose:

Replace Shiny `downloadHandler` outputs with Flask CSV endpoints.

Endpoints:

- `POST /api/download/analysis`
- `POST /api/download/compare-raw`
- `POST /api/download/compare-summary`
- `POST /api/download/city-comparison-raw`
- `POST /api/download/city-comparison-summary`
- `POST /api/download/gush-performance-raw`
- `POST /api/download/gush-performance-summary`

Background needed:

- CSVs must be UTF-8.
- Existing downloads rename columns to English names.
- Existing downloads round numeric values and normalize roof to Yes/No.

Implementation notes:

- Reuse the same filter services as chart endpoints.
- Set `Content-Disposition` filenames matching current style.
- Consider caching generated CSV for identical payloads.

Validation:

- Open CSV in spreadsheet app and confirm Hebrew text is readable.
- Compare columns and row counts against baseline R downloads.

## Phase 11: Static Frontend

Purpose:

Build the non-Shiny UI with relative paths and minimal dependencies.

Recommended frontend structure:

```text
frontend/
  index.html
  assets/
    app.css
    app.js
```

Suggested browser libraries:

- Plotly.js from local vendored asset or CDN with fallback
- A lightweight table library such as Tabulator, or simple custom table for initial version
- No React unless UI state becomes hard to maintain

Frontend responsibilities:

- Render tabs and form controls.
- Fetch metadata on load.
- Fetch filter options when city/street/Gush context changes.
- Trigger heavy API calls only on update buttons or when auto-update rules allow.
- Render Plotly traces from backend JSON.
- Render tables and selected-row panels.
- Trigger downloads.

Subpath-safe fetch rules:

- Use relative URLs like `api/status`, `api/meta`, `api/analysis/deals`.
- Use relative asset paths like `assets/app.css`.
- Do not use `/static/...`, `/api/...`, or hard-coded domain paths.

Validation:

- Open under local root path.
- Open behind Nginx under `/app-url/`.
- Confirm all API calls and assets resolve in both contexts.

## Phase 12: Deployment On Ubuntu

Purpose:

Deploy the app in the target architecture.

Target server layout:

```text
/srv/nonshiny/nadlan2/
  backend/
  frontend/
  data/
  venv/
```

Gunicorn:

- Bind: `127.0.0.1:8006`
- Workers: start with 1 worker on low-memory server
- Threads: 2-4 if memory allows
- Timeout: 120-300 seconds for expensive first requests
- Preload: evaluate carefully; it may improve cache sharing but increase startup memory pressure

Systemd service:

- Working directory: `/srv/nonshiny/nadlan2`
- ExecStart: `/srv/nonshiny/nadlan2/venv/bin/gunicorn -c backend/gunicorn.conf.py backend.wsgi:app`
- Environment:
  - `FLASK_ENV=production`
  - `NADLAN_DATA_DIR=/srv/nonshiny/nadlan2/data`
  - `NADLAN_CACHE_DIR=/srv/nonshiny/nadlan2/cache`

Nginx subpath:

- Serve `frontend/` under `/app-url/`
- Proxy `/app-url/api/` to `http://127.0.0.1:8006/api/`
- Ensure trailing slash redirects are stable.
- Set proxy timeouts high enough for cold cache requests.

Validation:

- `GET /app-url/` loads the frontend.
- `GET /app-url/api/status` returns healthy JSON.
- Browser devtools show no absolute `/static` or root `/api` calls.

## Phase 13: Performance Hardening

Purpose:

Make the app comfortable on a cheap server.

Actions:

- Measure cold and warm timings for each endpoint.
- Limit raw row payloads.
- Use server-side table pagination if raw data tables become large.
- Add request payload normalization and cache hits to logs.
- Consider DuckDB for filter/aggregate queries if pandas memory use is too high.
- Precompute common summaries:
  - unfiltered city/year medians
  - city metadata ranges
  - Gush metadata ranges

Operational guardrails:

- Max selected cities: 20
- Max selected Gushes: 15
- Max chart points for raw deals: 2,000 by default
- Max CSV rows may be uncapped but should stream, not build giant strings in memory

Validation:

- Largest city Analysis request completes within acceptable time.
- All-city City Comparison warm request is fast from cache.
- Memory returns to stable baseline after repeated requests.

## Phase 14: Test Plan

Purpose:

Prevent silent analytic drift during migration.

Backend tests:

- Metadata load tests.
- City file manifest tests.
- Common filter tests.
- Outlier tests.
- Aggregation tests.
- Download column tests.
- UTF-8 CSV tests.

Regression scenarios:

- Analysis: Ashdod default Gush example.
- Analysis: Tel Aviv selected street search.
- Compare Areas: 3 selected Gushes across at least 2 cities.
- City Comparison: Tel Aviv, Jerusalem, Haifa.
- City Performance: Tel Aviv defaults.

Frontend checks:

- Subpath navigation.
- No broken relative assets.
- Hebrew text renders correctly.
- Plot redraw after filters.
- Download button returns CSV.

Manual acceptance:

- The first screen is the actual analysis app, not a landing page.
- The app remains usable on a small server.
- Raw data is not reachable from frontend asset URLs.

## Proposed Implementation Order

1. Freeze expected behavior and resolve unclear Shiny behavior.
2. Convert data to Parquet and create a manifest.
3. Build Flask skeleton with `/api/status` and `/api/meta`.
4. Implement data access and caching.
5. Port shared filtering and outlier logic.
6. Implement Analysis Deals API and minimal frontend.
7. Implement Compare Areas.
8. Implement City Comparison.
9. Decide and implement City Performance.
10. Implement downloads.
11. Harden frontend for subpath deployment.
12. Add systemd/Gunicorn/Nginx deployment files.
13. Run regression and performance validation.
14. Remove or archive unused deployment artifacts from the final server bundle.

## Open Decisions

- Exact public subpath name, currently represented as `/app-url/`.
- Whether the app name should be `nadlan2` or a different deployed folder under `/srv/nonshiny/`.
- Whether to preserve or fix known Shiny inconsistencies.
- Whether Gush Performance should keep current YoY-average logic or move to regression/CAGR.
- Whether to use pandas-only or DuckDB-backed filtering for production.
- Whether to vendor frontend dependencies locally or allow CDN use.

