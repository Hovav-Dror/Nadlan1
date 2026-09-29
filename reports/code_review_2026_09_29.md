# Code and UX review — 29 September 2026

The review covered the transaction analysis pipeline, shared filters, chart rendering,
sampling, exports, navigation, and the existing verification scripts. Changes are local;
the source datasets were not regenerated.

## Correctness fixes

| Problem | Impact | Change |
| --- | --- | --- |
| Faceting removed rows containing the `999` unknown marker | Changing chart presentation changed the count, median, and available transactions. It could also disagree with the raw export. | Preserve rows. Recognized unknown room/floor/building-floor values form the unknown category; `999` in unrelated fields is retained. |
| Price per room divided by `999` | Unknown room counts appeared as exceptionally cheap prices per room. | Return a missing ratio for the sentinel. Reject non-finite denominators and results. Raw source attributes remain available. |
| “Include unknown” switches depended on having numeric bounds or selected rooms | Unchecking a switch while leaving the range blank did not exclude unknown values. | Apply the unknown-value choice independently for rooms, floor, building floors, construction year, and building age. |
| An empty scatterplot disappeared | Users had no guidance on recovering a result. | Show an actionable empty state, distinguishing no matching transactions from missing values needed for the selected view. |

## New analysis views

The transaction analysis screen now offers four views of the same selection:

- **Individual transactions:** the existing scatterplot and transaction drilldown.
- **Yearly price trend:** median and 25th–75th percentiles; hollow markers indicate
  fewer than ten usable price observations. Missing years break both the line and
  the shaded band.
- **Transaction volume:** counts all filtered transactions, including transactions
  without a usable value for the selected price metric. Missing year values are
  disclosed separately.
- **Price distribution:** bounded-size histogram of every usable selected value,
  including extremes and the maximum endpoint. It combines the selected years and
  does not adjust prices for inflation.

Aggregation occurs before scatterplot sampling. Changing the sample limit, sample
seed, or facet cannot change these statistics. Switching views uses the existing
response, so it requires no new request. The collection year is attached to that
response; changing the city controls cannot relabel an older chart’s partial year.

The 25th–75th percentile band describes price dispersion, not a confidence interval.
Annual medians describe the transactions observed that year. Changes can reflect
property mix; they are not individual-property investment returns. The ten-price
marker is a sample-size cue, not a statistical guarantee. Zero activity means no
rows in the selection, not proof of no market transactions. Partial years remain
visible and are marked when present; there is no annualization or inferred growth.

## UI changes

- Replace the large repeated introduction with a shorter explanation and map link.
- Show four useful cards: matching transactions, median, middle-50% range, and
  usable-price coverage, with units and denominators.
- Add a question-based view selector and an explanation of each analysis.
- Keep filters visible. Show scatter-specific presentation controls in the scatter
  view, preserving their values when another view is selected.
- Provide accessible tables behind the aggregate charts. Move the original
  filtering-stage counters into “How were transactions filtered?” below the chart.
- Add mobile shortcuts between filters and results. Shared links retain the view.

## Verification

All existing backend verification modules and frontend verification scripts passed.
New checks include seven backend regression cases and a frontend chart-contract
script. Syntax and whitespace checks passed.

Relevant commands:

```sh
.venv/bin/python -m backend.verify_backend
.venv/bin/python -m backend.verify_analysis_insights
node scripts/verify_analysis_insights.cjs
```

The other backend checks covered address lookup/search, export scope, city trends,
gush trends, maps, the original pilot, and the linked pilot. Browser verification
used the local linked pilot at port 5051, including desktop and 390px mobile layouts,
all three new views, shared-link reload, and a five-point scatter sample while the
aggregate cards continued to describe all 160 matching transactions in the chosen
street and filter selection. No horizontal page overflow appeared at 390px.

## Further work

1. **Comparable-property cohorts.** Compare within room-count, area, property-type,
   and age bands, and show how much of a median change accompanies a changing mix.
   This is the most useful next analysis with the existing data.
2. **Valid-observation thresholds throughout comparisons.** City/gush summaries
   currently retain transaction counts separately from missing metric values.
   Qualification thresholds should explicitly count usable observations for the
   chosen price metric, alongside total transaction volume.
3. **Consistent outlier methodology.** Transaction analysis uses yearly references;
   comparison services use a global IQR. Long date ranges can therefore yield
   different populations. Make this choice explicit and test a consistent option.
4. **Repeat-sale analysis.** Useful only with conservative property identity and
   matching-attribute checks. A shared parcel or reference address alone does not
   establish that two transactions concern the same unchanged apartment.
5. **Inflation-adjusted trends.** Requires a versioned CPI series and explicit
   base-date and coverage rules; no inflation series was added in this change.
6. **Maintainability.** Split the large `app.js` by navigation, search, filters,
   charts, and exports. The new aggregate renderer is already a separate module.
   Introduce centralized request-schema validation before broader API exposure.

These are follow-up improvements, not features implemented in this review.
