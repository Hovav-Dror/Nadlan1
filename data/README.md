# Nadlan2 Server-Only Data

This directory is the Phase 1 staging layout for the non-Shiny Nadlan2 app.
It mirrors the intended deployment shape under `/srv/nonshiny/nadlan2/data`,
but keeps all raw/private data outside the frontend tree.

Generated files:

- `cities/*.parquet`: per-city transaction data with only runtime columns used by the app.
- `metadata/gush_descriptions.parquet`: Gush display metadata.
- `metadata/unique_gush_streets.parquet`: city/street/Gush lookup metadata.
- `metadata/apt_types.json`: apartment type choices.
- `metadata/sp500_shekels.csv`: S&P 500 total-return comparison index, with dividends reinvested and converted to ILS using USD/ILS. The 2026 row is provisional/YTD as of May 2026 and should be refreshed after 2026 closes.
- `manifest.json`: Hebrew city display names mapped to stable ASCII Parquet filenames.
- `validation_report.json`: row count, column, date, and UTF-8 roundtrip checks.

Regenerate with:

```sh
Rscript scripts/convert_nadlan2_data.R
```

Use `--source-root` and `--output-root` to override the default source and target directories.
