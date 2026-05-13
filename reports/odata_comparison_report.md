# OData Nadlan Import Comparison Report

Generated: 2026-05-13 15:07:58

## Executive Summary

- Existing app data: **20 cities**, **711,876 rows**, generated `2026-05-12T11:20:08+0300`.
- OData transformed data: **292 cities**, **1,072,778 rows**, generated `2026-05-13T14:52:37+0300` from `https://www.odata.org.il/dataset/nadlan`.
- Common cities: **20 / 20** old cities are present in OData. New-only cities in OData: **272**.
- OData transformed date range: **1998-01-01 to 2030-12-29**.
- For the existing 20 cities, OData has **718,610 rows** vs old **711,876 rows**. It does **not** extend the max date for any of the 20 current cities.
- OData has **6 rows after 2026-05-13**, so future-dated rows are a real anomaly to filter or flag.

## Generated Files

- `reports/odata_2025_city_counts.csv`
- `reports/odata_anomaly_summary.csv`
- `reports/odata_city_year_counts.csv`
- `reports/odata_common_city_summary.csv`
- `reports/odata_common_city_year_counts.csv`
- `reports/odata_field_coverage.csv`
- `reports/odata_future_rows_by_city_year.csv`
- `reports/odata_global_year_counts.csv`
- `reports/odata_internal_repeat_sale_groups_address_like.csv`
- `reports/odata_internal_repeat_sale_groups_parcel_address.csv`
- `reports/odata_internal_repeat_sale_groups_parcel_definitions_summary.csv`
- `reports/odata_internal_repeat_sale_groups_parcel_street.csv`
- `reports/odata_internal_repeat_sale_groups_parcel_unit_like.csv`
- `reports/odata_internal_repeat_sale_groups_unit_like.csv`
- `reports/odata_raw_field_coverage.csv`
- `reports/odata_repeat_sale_candidates_address_like.csv`
- `reports/odata_repeat_sale_candidates_address_like_by_city_year.csv`
- `reports/odata_repeat_sale_candidates_parcel_address.csv`
- `reports/odata_repeat_sale_candidates_parcel_address_by_city_year.csv`
- `reports/odata_repeat_sale_candidates_parcel_definitions_summary.csv`
- `reports/odata_repeat_sale_candidates_parcel_street.csv`
- `reports/odata_repeat_sale_candidates_parcel_street_by_city_year.csv`
- `reports/odata_repeat_sale_candidates_parcel_unit_like.csv`
- `reports/odata_repeat_sale_candidates_parcel_unit_like_by_city_year.csv`
- `reports/odata_repeat_sale_candidates_strict.csv`
- `reports/odata_repeat_sale_candidates_strict_by_city_year.csv`
- `reports/odata_repeat_sale_candidates_unit_like.csv`
- `reports/odata_repeat_sale_candidates_unit_like_by_city_year.csv`

## City / Year Counts

Full city/year counts are in `reports/odata_city_year_counts.csv`; common-city old-vs-OData counts are in `reports/odata_common_city_year_counts.csv`.

Recent global counts:

|   year |   old_current_data |   odata_all_cities |   odata_minus_old |
|-------:|-------------------:|-------------------:|------------------:|
|   2020 |              34026 |              53625 |             19599 |
|   2021 |              54777 |              86439 |             31662 |
|   2022 |              43806 |              69850 |             26044 |
|   2023 |              29872 |              46188 |             16316 |
|   2024 |              21947 |              33719 |             11772 |
|   2025 |                  2 |                  2 |                 0 |
|   2026 |                  3 |                  3 |                 0 |
|   2027 |                  2 |                  2 |                 0 |
|   2030 |                  0 |                  2 |                 2 |


Largest row-count changes among the 20 current cities:

| city               |   old_rows |   odata_rows |   odata_minus_old | old_min_date   | old_max_date   | odata_min_date   | odata_max_date   |   odata_rows_after_old_city_max |
|:-------------------|-----------:|-------------:|------------------:|:---------------|:---------------|:-----------------|:-----------------|--------------------------------:|
| תל אביב -יפו       |     100245 |       122738 |             22493 | 1998-01-01     | 2026-11-30     | 1998-01-01       | 2026-11-30       |                               0 |
| אשדוד              |      34120 |        51625 |             17505 | 1998-01-01     | 2024-09-18     | 1998-01-01       | 2024-09-18       |                               0 |
| בת ים              |      29157 |        40399 |             11242 | 1998-01-02     | 2024-09-11     | 1998-01-02       | 2024-09-11       |                               0 |
| רחובות             |      23895 |        13682 |            -10213 | 1998-01-01     | 2024-09-19     | 1998-01-01       | 2024-09-19       |                               0 |
| רמת גן             |      39019 |        30048 |             -8971 | 1998-01-01     | 2025-08-24     | 1998-01-01       | 2025-08-24       |                               0 |
| חיפה               |      62472 |        53685 |             -8787 | 1998-01-01     | 2027-07-29     | 1998-01-01       | 2027-07-29       |                               0 |
| נתניה              |      45471 |        36964 |             -8507 | 1998-01-01     | 2024-09-16     | 1998-01-01       | 2024-09-15       |                               0 |
| פתח תקווה          |      49408 |        40904 |             -8504 | 1998-01-01     | 2027-04-25     | 1998-01-01       | 2027-04-25       |                               0 |
| באר שבע            |      42077 |        35465 |             -6612 | 1998-01-04     | 2024-09-17     | 1998-01-04       | 2024-09-17       |                               0 |
| חולון              |      36352 |        31868 |             -4484 | 1998-01-01     | 2024-09-19     | 1998-01-01       | 2024-09-19       |                               0 |
| הרצלייה            |      18384 |        22819 |              4435 | 1998-01-01     | 2024-09-12     | 1998-01-01       | 2024-09-12       |                               0 |
| ראשון לציון        |      40730 |        45029 |              4299 | 1998-01-01     | 2024-09-15     | 1998-01-01       | 2024-09-15       |                               0 |
| מודיעין-מכבים-רעות |      14520 |        10554 |             -3966 | 1998-01-06     | 2024-09-11     | 1998-01-06       | 2024-09-08       |                               0 |
| בני ברק            |      24124 |        27592 |              3468 | 1998-01-01     | 2024-09-19     | 1998-01-01       | 2024-09-19       |                               0 |
| כפר סבא            |      17076 |        20215 |              3139 | 1998-01-01     | 2026-11-29     | 1998-01-01       | 2026-11-29       |                               0 |
| ירושלים            |      65504 |        65701 |               197 | 1998-01-01     | 2024-09-17     | 1998-01-01       | 2024-09-17       |                               0 |
| בית שמש            |      13149 |        13149 |                 0 | 1998-01-01     | 2024-09-17     | 1998-01-01       | 2024-09-17       |                               0 |
| חדרה               |      18356 |        18356 |                 0 | 1998-01-01     | 2024-09-15     | 1998-01-01       | 2024-09-15       |                               0 |
| רעננה              |      15041 |        15041 |                 0 | 1998-01-01     | 2024-09-11     | 1998-01-01       | 2024-09-11       |                               0 |
| אשקלון             |      22776 |        22776 |                 0 | 1998-01-01     | 2024-09-19     | 1998-01-01       | 2024-09-19       |                               0 |


## 2025 Emphasis

2025 counts in the 20 current cities:

| city         | in_old_20_cities   |   old_current_data |   odata_all_cities |   odata_minus_old |
|:-------------|:-------------------|-------------------:|-------------------:|------------------:|
| רמת גן       | True               |                  1 |                  1 |                 0 |
| תל אביב -יפו | True               |                  1 |                  1 |                 0 |


Top 2025 counts among OData-only cities:

_None._


## Repeat-Sale Candidates

I used three property-match definitions:

- `strict`: city + full Gush string + full address + area + rooms + floor + apartment type + build year.
- `unit_like`: city + full Gush string + area + rooms + floor + apartment type + build year. This avoids missing/changed address text, but is fuzzier.
- `address_like`: city + full Gush string + full address. This is broad and can group different units in the same address/subparcel.

Counts of OData rows whose property key existed in old data but whose sale date was not present for that old property key:

| definition   |   candidate_rows |   cities |
|:-------------|-----------------:|---------:|
| strict       |                0 |        0 |
| unit_like    |                0 |        0 |
| address_like |                0 |        0 |


Internal OData repeat-sale groups within the 20 current cities:

| definition   |   groups_with_multiple_sale_dates |   cities |   sale_date_rows_in_groups |
|:-------------|----------------------------------:|---------:|---------------------------:|
| unit_like    |                                 0 |        0 |                          0 |
| address_like |                                 0 |        0 |                          0 |


Candidate row details are in `reports/odata_repeat_sale_candidates_*.csv`.


## Parcel-Level Repeat-Sale Addendum

The exact full-`GUSH` definitions above produced zero old-property/new-date candidates. Because full `GUSH` includes subparcel, I also checked softer parcel-level keys using the `gush-helka` prefix. These are less exact, but they are useful for finding possible second sales on a property/parcel we already had.

Parcel-level OData rows whose property/parcel key existed in old data but whose sale date was not present in old data:

| definition       |   candidate_rows |   cities |
|:-----------------|-----------------:|---------:|
| parcel_street    |                0 |        0 |
| parcel_address   |                0 |        0 |
| parcel_unit_like |              294 |       19 |

Internal OData parcel-level groups with multiple sale dates in the 20 current cities:

| definition       |   groups_with_multiple_sale_dates |   cities |   sale_date_rows_in_groups |
|:-----------------|----------------------------------:|---------:|---------------------------:|
| parcel_street    |                             66004 |       20 |                     592914 |
| parcel_address   |                             66004 |       20 |                     592914 |
| parcel_unit_like |                             74054 |       20 |                     192196 |

`parcel_unit_like` candidates by city/year, first 40 rows:

| city    |   year |   candidate_rows |
|:--------|-------:|-----------------:|
| אשדוד   |   1998 |                6 |
| אשדוד   |   2000 |               17 |
| אשדוד   |   2001 |                5 |
| אשדוד   |   2002 |               12 |
| אשדוד   |   2003 |               11 |
| אשקלון  |   2000 |                7 |
| אשקלון  |   2001 |                4 |
| אשקלון  |   2002 |                1 |
| אשקלון  |   2021 |                1 |
| באר שבע |   1999 |                4 |
| באר שבע |   2000 |                4 |
| באר שבע |   2001 |                6 |
| באר שבע |   2002 |                3 |
| באר שבע |   2003 |                3 |
| באר שבע |   2010 |                1 |
| באר שבע |   2015 |                1 |
| באר שבע |   2016 |                2 |
| באר שבע |   2018 |                2 |
| באר שבע |   2019 |                2 |
| באר שבע |   2020 |                1 |
| באר שבע |   2021 |                6 |
| באר שבע |   2022 |                1 |
| באר שבע |   2023 |                3 |
| באר שבע |   2024 |                1 |
| בית שמש |   2000 |                2 |
| בית שמש |   2002 |                1 |
| בית שמש |   2008 |                1 |
| בני ברק |   1998 |                1 |
| בני ברק |   1999 |                1 |
| בני ברק |   2007 |                1 |
| בני ברק |   2013 |                3 |
| בני ברק |   2015 |                1 |
| בני ברק |   2021 |                1 |
| בת ים   |   1998 |                4 |
| בת ים   |   2012 |                2 |
| בת ים   |   2013 |                2 |
| הרצלייה |   1999 |                2 |
| הרצלייה |   2001 |                1 |
| הרצלייה |   2010 |                3 |
| הרצלייה |   2023 |                1 |

Interpretation: `parcel_unit_like` found 294 candidate rows across 19 current cities. `parcel_street` and `parcel_address` found none when requiring the OData row to be on a parcel/street or parcel/address already present in old data with a new sale date. The very large internal parcel repeat counts are expected at parcel granularity and should not be treated as exact apartment repeat sales without manual QA.

## Data Elements

Runtime columns: the OData importer successfully produces the same 18 app runtime columns as the existing parquet files; `columns_match=true` in the import report.

Field coverage percentages for old/current, OData/common, and OData/all:

| field          |   odata / 20 current cities |   odata / all 292 cities |   old_current_data / 20 current cities |
|:---------------|----------------------------:|-------------------------:|---------------------------------------:|
| FULLADRESS     |                      100    |                   100    |                                  98.95 |
| GUSH           |                      100    |                   100    |                                 100    |
| Gush           |                      100    |                   100    |                                 100    |
| New_Project    |                      100    |                   100    |                                 100    |
| apt type       |                      100    |                   100    |                                 100    |
| area           |                       98.24 |                    98.53 |                                  98.37 |
| build_floors   |                       94.3  |                    89.95 |                                  94.17 |
| build_year     |                       98.74 |                    98.44 |                                  98.63 |
| building age   |                       98.74 |                    98.44 |                                  98.63 |
| city           |                      100    |                   100    |                                 100    |
| date           |                      100    |                   100    |                                 100    |
| deal year      |                      100    |                   100    |                                 100    |
| floor          |                       90.53 |                    87.63 |                                 100    |
| price_millions |                      100    |                   100    |                                 100    |
| roof           |                      100    |                   100    |                                 100    |
| rooms          |                        0    |                     0    |                                  92.94 |
| story          |                      100    |                   100    |                                 100    |
| street         |                      100    |                   100    |                                 100    |


OData source fields not preserved as standalone runtime fields:

`keyvalue`, `polygon_id`, `projectname`, `row_num`, `type`.

Important caveat: raw OData `fulladdress` and `displayaddress` are sparse; when both are missing, the importer falls back to `street, city`. See `reports/odata_raw_field_coverage.csv`.

## Abnormalities

Anomaly summary:

| check                                       | scope           |   count | notes                                                                  |
|:--------------------------------------------|:----------------|--------:|:-----------------------------------------------------------------------|
| area <= 0                                   | odata_all       |       0 |                                                                        |
| area >= 1000                                | odata_all       |    6321 |                                                                        |
| cities with future-dated rows in OData      | odata_all       |       5 |                                                                        |
| date after 2027-12-31                       | odata_all       |       2 | very far future                                                        |
| date after current date 2026-05-13          | odata_all       |       6 | future-dated relative to report date                                   |
| duplicate transformed transaction signature | odata_all       |  237500 | same transformed fields; can be legitimate bulk/new-project repetition |
| missing FULLADRESS                          | odata_all       |       0 |                                                                        |
| missing GUSH                                | odata_all       |       0 |                                                                        |
| missing area                                | odata_all       |   15803 |                                                                        |
| missing build_year                          | odata_all       |   16744 |                                                                        |
| missing floor                               | odata_all       |  132665 |                                                                        |
| missing price_millions                      | odata_all       |       0 |                                                                        |
| missing rooms                               | odata_all       | 1072778 |                                                                        |
| missing street                              | odata_all       |       0 |                                                                        |
| price_millions <= 0                         | odata_all       |       0 |                                                                        |
| price_millions >= 100                       | odata_all       |    2103 | >= NIS 100m                                                            |
| area <= 0                                   | odata_common_20 |       0 |                                                                        |
| area >= 1000                                | odata_common_20 |    4158 |                                                                        |
| date after 2027-12-31                       | odata_common_20 |       0 | very far future                                                        |
| date after current date 2026-05-13          | odata_common_20 |       4 | future-dated relative to report date                                   |
| duplicate transformed transaction signature | odata_common_20 |  157576 | same transformed fields; can be legitimate bulk/new-project repetition |
| missing FULLADRESS                          | odata_common_20 |       0 |                                                                        |
| missing GUSH                                | odata_common_20 |       0 |                                                                        |
| missing area                                | odata_common_20 |   12644 |                                                                        |
| missing build_year                          | odata_common_20 |    9066 |                                                                        |
| missing floor                               | odata_common_20 |   68068 |                                                                        |
| missing price_millions                      | odata_common_20 |       0 |                                                                        |
| missing rooms                               | odata_common_20 |  718610 |                                                                        |
| missing street                              | odata_common_20 |       0 |                                                                        |
| price_millions <= 0                         | odata_common_20 |       0 |                                                                        |
| price_millions >= 100                       | odata_common_20 |    1952 | >= NIS 100m                                                            |
| area <= 0                                   | old_current_20  |       0 |                                                                        |
| area >= 1000                                | old_current_20  |    4026 |                                                                        |
| date after 2027-12-31                       | old_current_20  |       0 | very far future                                                        |
| date after current date 2026-05-13          | old_current_20  |       4 | future-dated relative to report date                                   |
| duplicate transformed transaction signature | old_current_20  |       0 | same transformed fields; can be legitimate bulk/new-project repetition |
| missing FULLADRESS                          | old_current_20  |    7505 |                                                                        |
| missing GUSH                                | old_current_20  |       0 |                                                                        |
| missing area                                | old_current_20  |   11576 |                                                                        |
| missing build_year                          | old_current_20  |    9746 |                                                                        |
| missing floor                               | old_current_20  |      30 |                                                                        |
| missing price_millions                      | old_current_20  |       0 |                                                                        |
| missing rooms                               | old_current_20  |   50270 |                                                                        |
| missing street                              | old_current_20  |       0 |                                                                        |
| price_millions <= 0                         | old_current_20  |       0 |                                                                        |
| price_millions >= 100                       | old_current_20  |    1700 | >= NIS 100m                                                            |


Future-dated OData rows by city/year:

| city         |   year |   future_rows |
|:-------------|-------:|--------------:|
| כפר סבא      |   2026 |             1 |
| תל אביב -יפו |   2026 |             1 |
| חיפה         |   2027 |             1 |
| פתח תקווה    |   2027 |             1 |
| צור יצחק     |   2030 |             2 |


## Suggested Handling Before Production Switch

1. Add a runtime/date filter or visible warning for future-dated rows, especially rows after the current date and after 2027.
2. Decide whether the production dataset should be `all` cities or only `current` cities; all-city defaults may become heavier with 292 cities.
3. Treat repeat-sale enrichment as a separate append/merge step, not as a replacement. Use the candidate CSVs to validate matching strictness before changing production data.
4. Do not rely on OData `FULLADRESS` quality without checking raw address coverage; `GUSH` plus property attributes is often a better matching basis than address text alone.
