// Full-population chart contracts, missing years, partial coverage and escaping.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = {window: {}, Intl};
vm.createContext(context);
vm.runInContext(fs.readFileSync('frontend/assets/analysis-insights.js', 'utf8'), context);
const ui = context.window.NadlanInsights;
const data = {points: [{y: 999}], insights: {
  matching_deals: 14, valid_price_deals: 12, missing_price_deals: 2, undated_deals: 1,
  median: 2, p25: 1.5, p75: 3, min_year_prices: 10,
  annual: [
    {year: 2023, deals: 11, valid_prices: 10, median: 2, p25: 1.5, p75: 3, low_sample: false},
    {year: 2024, deals: 0, valid_prices: 0, median: null, p25: null, p75: null, low_sample: true},
    {year: 2025, deals: 2, valid_prices: 1, median: 0, p25: 0, p75: 0, low_sample: true}
  ],
  distribution: [{low: 0, high: 2, count: 6}, {low: 2, high: 4, count: 6}]
}};
const options = {unit: 'millions <img src=x>', partialYear: 2025};
const original = JSON.stringify(data);
let spec = ui.chartSpec(data, 'trend', options);
const median = spec.traces.find(trace => trace.name === 'חציון');
assert.equal(median.y[1], null, 'Missing years must remain gaps, not zero prices');
assert.equal(median.y[2], 0, 'Zero and missing remain distinct');
assert.equal(median.connectgaps, false);
assert.equal(median.marker.symbol[2], 'circle-open');
const ribbons = spec.traces.filter(trace => trace.fill === 'toself');
assert.equal(ribbons.length,2,'Price-spread ribbons must break across missing years too');
assert(ribbons.every(trace => Math.max(...trace.x) === Math.min(...trace.x)));
assert.equal(spec.layout.xaxis.ticktext.at(-1), '2025*', 'Use collection year, not wall-clock year');
assert(spec.partial);
const target = {};
ui.renderTable(spec, target);
assert(!target.innerHTML.includes('<img'), 'Escape user-facing table labels');
assert(target.innerHTML.includes('scope="col"'));
spec = ui.chartSpec(data, 'volume', options);
assert.equal(spec.traces[0].y.reduce((a,b)=>a+b,0), 13, 'Activity includes missing prices and excludes undated records');
assert.equal(spec.traces[0].y[1], 0);
spec = ui.chartSpec(data, 'distribution', options);
assert.equal(spec.traces[0].y.reduce((a,b)=>a+b,0),12,'Distribution must not use the one-point scatter sample');
assert.equal(spec.traces[0].x[0],1);
assert(!spec.partial);
ui.renderSummary(data, target, options.unit);
assert(!target.hidden);
assert(!target.innerHTML.includes('<img'));
assert(target.innerHTML.includes('14'));
assert.equal(JSON.stringify(data), original, 'Rendering cannot mutate the response');
ui.renderSummary({insights:{matching_deals:0}}, target, 'price');
assert(target.hidden);
assert.equal(target.innerHTML,'');
assert(ui.description('trend',data.insights).includes('10'));
assert(!ui.chartSpec({insights:{annual:[],distribution:[],valid_price_deals:0}},'volume',options).hasData);

// Mix-adjusted index: gaps for years the model skipped, base year without a range, headline change.
const adjusted = {insights: {adjusted_index: {base_year: 2020, excluded_outliers: 2, years: [
  {year: 2020, observations: 50, adjusted: 100, adjusted_low: null, adjusted_high: null, raw: 100},
  {year: 2022, observations: 40, adjusted: 121, adjusted_low: 115, adjusted_high: 127, raw: 140},
  {year: 2023, observations: 30, adjusted: 130, adjusted_low: 120, adjusted_high: 140, raw: 150}]}}};
spec = ui.chartSpec(adjusted, 'adjusted', {unit: 'x', partialYear: 2023});
const line = spec.traces.find(trace => trace.name === 'מדד מתוקן לתמהיל');
assert.deepEqual(Array.from(line.x), [2020, 2021, 2022, 2023]);
assert.equal(line.y[1], null, 'A skipped year is a gap, not an interpolated value');
assert(spec.hasData && spec.partial);
assert(spec.note.includes('2020') && spec.note.includes('2022') && !spec.note.includes('2023'), 'Headline change ignores the partial year');
assert(spec.note.includes('21%') && spec.note.includes('40%'));
assert.equal(spec.rows[0][3], 'בסיס');
assert(!ui.chartSpec({insights: {adjusted_index: {years: [], reason: 'insufficient'}}}, 'adjusted', options).hasData);

// Segment premiums: unknown band in the table only, low samples grey and without a bar value.
const segments = {insights: {segments: {dimensions: {rooms: [
  {label: '3–3.5', deals: 40, valid_prices: 40, median: 20, p25: 18, p75: 22, premium_pct: -4.5, low_sample: false, unknown: false},
  {label: '<b>6+</b>', deals: 3, valid_prices: 3, median: 25, p25: 24, p75: 26, premium_pct: null, low_sample: true, unknown: false},
  {label: 'לא ידוע', deals: 5, valid_prices: 5, median: 9, p25: 8, p75: 10, premium_pct: null, low_sample: true, unknown: true}]}}}};
spec = ui.chartSpec(segments, 'segments', {unit: 'x', partialYear: 2030, segmentDim: 'rooms'});
assert.deepEqual(Array.from(spec.traces[0].x), ['3–3.5', '<b>6+</b>']);
assert.equal(spec.traces[0].y[1], null);
assert.equal(spec.rows.length, 3);
assert(spec.traces[0].text[1].includes('&lt;b&gt;'), 'Escape segment labels in hover text');
assert(spec.hasData);
assert(!ui.chartSpec(segments, 'segments', {unit: 'x', segmentDim: 'floor'}).hasData);
console.log('PASS: aggregate charts use the complete population, retain missing-year gaps, mark partial years, and escape tables; adjusted index and segment views keep gaps, partial years and unknowns honest');
