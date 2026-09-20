# Nadlan2 Server-Only Data

This directory is the Phase 1 staging layout for the non-Shiny Nadlan2 app.
It mirrors the intended deployment shape under `/srv/nonshiny/nadlan2/data`,
but keeps all raw/private data outside the frontend tree.

Generated files:

- `cities/*.parquet`: per-city transaction data with only runtime columns used by the app.
- `metadata/gush_descriptions.parquet`: Gush display metadata.
- `metadata/unique_gush_streets.parquet`: city/street/Gush lookup metadata.
- `metadata/gush_polygons.geojson`: local cached Gush polygon geometries used by the map tab.
- `metadata/apt_types.json`: apartment type choices.
- `metadata/sp500_shekels.csv`: S&P 500 total-return comparison index, with dividends reinvested and converted to ILS using USD/ILS. The 2026 row is provisional/YTD as of May 2026 and should be refreshed after 2026 closes.
- `manifest.json`: Hebrew city display names mapped to stable ASCII Parquet filenames.
- `validation_report.json`: row count, column, date, and UTF-8 roundtrip checks.

Regenerate with:

```sh
Rscript scripts/convert_nadlan2_data.R
```

Use `--source-root` and `--output-root` to override the default source and target directories.

Refresh the local Gush polygon cache with:

```sh
python3 scripts/fetch_gush_polygons.py
```

The polygon cache is fetched from the public ArcGIS Gush layer and is intended
for visual analysis, not legal cadastral proof.

Experimental OData import:

```sh
python3 scripts/import_odata_nadlan.py --inspect-only
python3 scripts/import_odata_nadlan.py --download --output-root data_odata --cities all
```

The OData importer reads the current CSV resources from
<https://www.odata.org.il/dataset/nadlan>, maps them into the same runtime
columns, rebuilds the city parquet files and metadata, and writes an
`odata_import_report.json` with row counts and date ranges. Use
`--cities current` to keep only the 20 cities currently present in the app, or
`--merge-existing` to append the current app data. Native OData rows are kept by
their `resource_id + row_num` row identity; when merging legacy rows, transaction
fields such as date, price, Gush, address details, area, rooms, and floor are
used only to avoid keeping a duplicate legacy row. Repeat sales of the same
property on different dates are retained.

OVER / Versions for the People assessment (2026-09-19):

- `raw/over_fd06f5ae/`: all 108 distinct download URLs referenced by five
  versions of the Tax Authority dataset, plus its complete append-table export.
- `raw/over_fd06f5ae/download_manifest.json`: file membership, row counts,
  byte sizes, and SHA-256 checksums; `append_download_manifest.json` records
  the separate append export.
- `../reports/over_2026_09_19/assessment_he.md`: findings and a proposed
  integration plan. Raw files remain excluded from Git by `data/raw/`.
- `../scripts/download_over_nadlan.py`: rerun snapshot downloads against the
  saved version inventory. It does not refresh that inventory or the append export.
- `../scripts/profile_over_nadlan.py` and
  `../scripts/check_over_price_reconciliation.py`: reproduce the local checks.

The running application's city files, manifest, and configuration have not been
switched to this source. Snapshot versions must not be concatenated as if they
were disjoint transactions. Read the assessment before using sale shares,
unknown attributes, or historical property matches.

## Isolated OVER pilot

The approved 20-city pilot is available separately in `../data_over/`.
The default application still uses the legacy dataset. To build a new pilot
snapshot from the downloaded inventory and launch it locally:

```sh
.venv/bin/python scripts/import_over_pilot.py
.venv/bin/python -m backend.pilot --port 5051
```

The importer refuses to overwrite an existing output directory. To reproduce
the build, pass `--output-root` with a new directory. The final manifest is
written only after the complete build succeeds.

The pilot defaults to full residential sales in analyses and exports. Partial
and unknown shares require explicit selection; prices are never scaled to a
whole property. Each city has transaction-date and collection-date coverage.
Address and floor enrichment requires a unique transaction key in both inputs,
a full sale, matching positive area and rooms, compatible construction years,
and price agreement within ILS 1,000. Missing attributes remain unknown.

Verification:

```sh
.venv/bin/python backend/verify_backend.py
.venv/bin/python backend/verify_over_pilot.py
```

See `../reports/over_2026_09_19/pilot_implementation_he.md` for the snapshot
counts, matching rules, limitations, and deferred work. `data_over/` and
`.cache_over/` are local generated artifacts excluded from Git.

The current pilot launcher uses `../data_over_linked/`, built after the strict
snapshot with `.venv/bin/python scripts/link_over_pilot_locations.py`. It adds
explicitly labelled property-location references to normal analysis, filters,
and exports, preserving `verified_*` fields and source transaction attributes.
Use the location-basis filter for strict transaction matches only. Verify the
normal analysis path with `.venv/bin/python backend/verify_linked_pilot.py`.
