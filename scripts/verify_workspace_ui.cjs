// Independent regressions for comparison semantics and display of identifiers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('frontend/assets/app.js', 'utf8');
function definition(name) {
  const start = source.indexOf('  function ' + name + '(');
  assert(start >= 0, `Function ${name} exists`);
  const rest = source.slice(start + 5);
  const next = rest.search(/\n  (?:async )?function /);
  assert(next >= 0, `End of ${name} found`);
  return source.slice(start, start + 5 + next);
}
const inputs = {
  'city-select': {value: 'a'},
  'city-comparison-select': {values: ['a', 'b']},
  'city-include-partial-year': {checked: false}
};
const context = {
  state: {meta: {
    source: {detected_at: '2026-09-19T11:20:00Z'},
    data_summary: {generated_at: '2029-01-01T00:00:00Z'},
    cities: [
      {id: 'a', name: 'Alpha', coverage: {scraped_to: '2026-07-01T00:00:00Z'}},
      {id: 'b', name: 'Beta', coverage: {scraped_to: '2025-08-01T00:00:00Z'}}
    ]
  }},
  document: {body: {dataset: {activeTab: 'downloads'}}},
  byId: id => inputs[id],
  selectedValues: input => input.values,
  checkboxValue: (id, fallback) => inputs[id] ? inputs[id].checked : fallback,
  pilotTableValue: (row, key) => row[key],
  formatNumber: value => Number(value).toLocaleString('en-US')
};
vm.createContext(context);
vm.runInContext(['transformSeriesForMode', 'transformPointsForMode', 'snapshotYear', 'comparisonPeriodFilters', 'tableDisplayValue', 'formatDealDate'].map(definition).join('\n'), context);
const plain = value => JSON.parse(JSON.stringify(value));

const series = [
  {name: 'a', points: [{year: 2018, y: 50}, {year: 2019, y: 100}, {year: 2020, y: null}, {year: 2021, y: 150}]},
  {name: 'b', points: [{year: 2019, y: 200}, {year: 2020, y: 250}, {year: 2021, y: 300}]}
];
const original = JSON.stringify(series);
const overlays = {available: [{year: 2018, y: 70}, {year: 2019, y: 80}, {year: 2021, y: 100}], late: [{year: 2020, y: 100}]};
const indexed = context.transformSeriesForMode(series, overlays, 'indexed');
assert.deepEqual(plain(indexed.series.map(s => s.points.map(p => [p.year, p.y, p.base_year]))), [
  [[2019, 100, 2019], [2020, null, 2019], [2021, 150, 2019]],
  [[2019, 100, 2019], [2020, 125, 2019], [2021, 150, 2019]]
]);
assert.deepEqual(plain(indexed.overlays.available.map(p => [p.year, p.y])), [[2019, 100], [2021, 125]]);
assert.equal(indexed.overlays.late.length, 0, 'Overlay without a shared baseline must not get its own baseline');
const changed = context.transformSeriesForMode(series, {}, 'change');
assert.equal(changed.series[0].points[0].y, 0);
assert.equal(changed.series[0].points[1].y, null, 'Missing year is not converted to a 100% fall');
assert.equal(changed.series[0].points[2].y, 50);
assert.equal(JSON.stringify(series), original, 'Chart transformation must not overwrite reported prices');
const unavailable = context.transformSeriesForMode([{points:[{year:2019,y:null},{year:2020,y:10}]},{points:[{year:2019,y:5}]}], {}, 'indexed');
assert.equal(unavailable.series.length, 0, 'No shared valid baseline means no relative comparison');
assert.equal(context.transformSeriesForMode(series, overlays, 'absolute').series, series);
console.log('PASS: common baseline, missing values, overlay coverage and original price preservation');

assert.equal(context.snapshotYear('city'), 2025, 'Selected cities use the oldest collection year, even from the export tab');
inputs['city-comparison-select'].values = ['a'];
assert.equal(context.snapshotYear('city'), 2026, 'Later dataset rebuild must not advance the data collection year');
assert.deepEqual(plain(context.comparisonPeriodFilters({deal_year_range:[2010,2029]}, 'city')), {deal_year_range:[2010,2025]});
assert.deepEqual(plain(context.comparisonPeriodFilters({deal_year_range:[2010,2023]}, 'city')), {deal_year_range:[2010,2023]});
assert.deepEqual(plain(context.comparisonPeriodFilters({}, 'city')), {deal_year_range:[null,2025]});
inputs['city-include-partial-year'].checked = true;
assert.deepEqual(plain(context.comparisonPeriodFilters({deal_year_range:[2010,2026]}, 'city')), {deal_year_range:[2010,2026]});
inputs['city-comparison-select'].values = ['absent'];
assert.equal(context.snapshotYear('city'), 2026, 'Fallback prefers source detection over a later site rebuild');
console.log('PASS: partial-year exclusion follows source collection, selection and explicit upper bounds');

assert.equal(String(context.tableDisplayValue({year:1998},{key:'year',type:'number'})), '1998');
assert.equal(String(context.tableDisplayValue({build_year:2004},{key:'build_year',type:'number'})), '2004');
assert.equal(String(context.tableDisplayValue({gush:6631},{key:'gush',type:'number'})), '6631');
assert.equal(context.tableDisplayValue({price_ils:5400000},{key:'price_ils',type:'number'}), '5,400,000');
assert.equal(context.tableDisplayValue({date:'2023-08-06'},{key:'date',type:'date'}), '06.08.2023');
assert.equal(context.tableDisplayValue({area:null},{key:'area',type:'number'}), '—');
assert.equal(context.tableDisplayValue({area:0},{key:'area',type:'number'}), '0');
console.log('PASS: years and cadastral IDs stay ungrouped; dates, currency, zero and missing values remain distinct');
