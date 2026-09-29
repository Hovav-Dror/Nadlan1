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
console.log('PASS: aggregate charts use the complete population, retain missing-year gaps, mark partial years, and escape tables');
