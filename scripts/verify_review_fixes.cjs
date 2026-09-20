// Regression checks for shared links, chart membership and independent filters.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('frontend/assets/app.js', 'utf8');
function definition(name) {
  const match = new RegExp('  (?:async )?function ' + name + '\\(').exec(source);
  assert(match, name);
  const next = source.slice(match.index + 5).search(/\n  (?:async )?function /);
  assert(next >= 0, name);
  return source.slice(match.index, match.index + 5 + next);
}
function load(context, names) {
  vm.createContext(context);
  vm.runInContext(names.map(definition).join('\n'), context);
  return context;
}
const plain = value => JSON.parse(JSON.stringify(value));

async function sharedLinks() {
  let location = new URL('http://localhost:8006/nadlan/?keep=yes#analysis');
  let copied;
  const view = {version: 1, tab: 'analysis', mode: 'chart', controls: {}, lookup: null};
  for (let i = 0; i < 160; i++) view.controls['control-' + i] = 'רחוב בויאר 12 ? # &';
  const context = load({
    URL, URLSearchParams, state: {}, captureView: () => view,
    validTab: tab => ['analysis', 'map', 'city'].includes(tab),
    window: {get location() {return location;}, history: {
      state: {}, replaceState(state, unused, url) {location = new URL(url, location);}
    }},
    byId: () => ({}), navigator: {clipboard: {async writeText(value) {copied = value;}}},
    rememberNavigation() {}
  }, ['urlForTab', 'initialTabFromHash', 'sharedViewValue', 'sharedViewUrl',
      'readSharedView', 'shareCurrentView', 'persistSharedView', 'dealUrl', 'cleanAnalysisUrl']);
  await context.shareCurrentView();
  assert.equal(copied, location.href);
  assert(location.href.length > 4094, 'Exercise a view larger than the server request limit');
  assert.equal(location.pathname + location.search, '/nadlan/?keep=yes', 'State never enters the HTTP request target');
  assert.deepEqual(plain(context.readSharedView()), view);
  location = context.urlForTab('map');
  assert.equal(context.initialTabFromHash(), 'map');
  assert.deepEqual(plain(context.readSharedView()), view, 'Tab navigation retains shared state');
  location = new URL(context.dealUrl('תל אביב', 'legacy:1'), location);
  assert.equal(context.initialTabFromHash(), 'analysis');
  assert.equal(location.searchParams.get('deal_record'), 'legacy:1');
  assert.deepEqual(plain(context.readSharedView()), view, 'Deal links retain shared state');
  location = new URL(context.cleanAnalysisUrl(), location);
  assert(!location.searchParams.has('deal_record'));
  assert.deepEqual(plain(context.readSharedView()), view, 'Closing a deal retains shared state');
  view.controls['control-0'] = 'updated';
  context.persistSharedView();
  assert.equal(context.readSharedView().controls['control-0'], 'updated');
  // Older links remain readable and migrate on the next state update.
  location = new URL('http://localhost:8006/?view=' + encodeURIComponent(JSON.stringify(view)) + '#city');
  assert.deepEqual(plain(context.readSharedView()), view);
  context.persistSharedView();
  assert(!location.searchParams.has('view'));
  assert.equal(context.initialTabFromHash(), 'city');
  assert.deepEqual(plain(context.readSharedView()), view);
  console.log('PASS: large shared views, legacy links, tab/deal navigation and state updates');
}

function chartMembership() {
  let enabled = true;
  const context = load({
    ANALYSIS_FACET_LIMIT: 12,
    byId: id => ({value: id === 'analysis-facet-var' && enabled ? 'floor' : ''}),
    // Layout is orthogonal to this test: inspect the actual point traces sent to Plotly.
    chartLayout: () => ({}), yLabel: () => '', selectedOptionText: () => '',
    addOverlayTraces() {}, applyFacetLayout() {}, dateAxisRange: () => [],
    numericAxisSpec: () => ({}), analysisDateAxis: () => ({})
  }, ['analysisFacetGroups', 'analysisChartSpec', 'categoryValue', 'limitedCategories',
      'compareCategoryValues', 'leadingNumber', 'colorPalette', 'shapeSymbols', 'mapByValue',
      'scaledSizes', 'groupPoints', 'orderedGroupKeys', 'categoryOrder', 'compareWithOrder',
      'traceName', 'axisName', 'layoutAxisName']);
  function check(values) {
    const points = values.map((facet, i) => ({id: String(i), facet, date: '2024-01-01', y: i + 1}));
    const original = JSON.stringify(points);
    const groups = context.analysisFacetGroups(points, enabled);
    assert(groups.length <= 12);
    const spec = context.analysisChartSpec(points, {});
    const plotted = Array.from(spec.traces).flatMap(trace => Array.from(trace.customdata)).sort();
    assert.deepEqual(plotted, points.map(p => p.id).sort(), 'Every transaction appears exactly once');
    assert.equal(JSON.stringify(points), original, 'Grouping preserves transaction records');
    return groups;
  }
  assert.equal(check([1, null]).length, 2);
  assert.equal(check([null, undefined, ''])[0].label, 'לא ידוע');
  check(['All', null, 'לא ידוע', '__proto__']);
  const overflow = check([...Array.from({length: 25}, (_, i) => i), null]);
  assert(overflow.some(group => group.label.startsWith('ערכים נוספים')));
  assert(overflow.some(group => group.label === 'לא ידוע'));
  check(Array.from({length: 13}, (_, i) => i));
  enabled = false;
  assert.equal(check([1, 2, null]).length, 1);
  console.log('PASS: missing, overflow and literal facet values preserve exact plotted membership');
}

function filterIsolation() {
  const elements = {};
  function element(id) {
    if (!elements[id]) {
      elements[id] = {value: 'unchanged', dataset: {}, options: [
        {value: '3', selected: true}, {value: '4', selected: false}
      ]};
      Object.defineProperty(elements[id], 'selectedOptions', {get() {return this.options.filter(o => o.selected);}});
    }
    return elements[id];
  }
  const context = load({
    state: {roomsSelectionInitialized: true, compareRoomsSelectionInitialized: true},
    byId: element, pilotActive: () => false,
    applyScopedFilterDefaults(scope) {assert.equal(scope, 'analysis');},
    setOptions(select, options) {select.options = options.map(o => ({value: String(o.value), selected: false}));},
    renderRoomChips() {}, renderCompareRoomChips() {}, renderGushRoomChips() {},
    renderApartmentTypeChips() {}, renderCompareApartmentTypeChips() {}, renderGushApartmentTypeChips() {},
    syncSegmentedControls() {}, valueOrEmpty: x => String(x), valueOrDash: x => String(x)
  }, ['applyFilterDefaults', 'smartRoomSelectionForOptions', 'selectedValues', 'setSelectedValues', 'setRangeInputs']);
  ['gush-filter-year-min', 'gush-filter-year-max', 'gush-filter-price-min',
   'gush-rooms-select', 'gush-apartment-type-select', 'gush-city-select'].forEach(element);
  const original = JSON.stringify(elements);
  context.applyFilterDefaults({ranges: {deal_year: {min: 2000, max: 2005}, price_millions: {min: 1, max: 2}},
    rooms: {choices: [2, 3, 4], smart_selected: [2, 3]}, apartment_types: {available: ['new-type']}});
  const performance = Object.fromEntries(Object.entries(elements).filter(([id]) => id.startsWith('gush-')));
  assert.equal(JSON.stringify(performance), original, 'Analysis updates cannot mutate independent performance controls');
  assert.deepEqual(plain(context.selectedValues(element('rooms-select'))), ['3']);
  assert.deepEqual(plain(context.smartRoomSelectionForOptions(['3'], [2, 3, 4], [2, 4])), ['3']);
  assert.deepEqual(plain(context.smartRoomSelectionForOptions([], [2, 3, 4], [3])), []);
  assert.deepEqual(plain(context.smartRoomSelectionForOptions(['3', '4'], [3, 5], [5])), ['3']);
  context.state.roomsSelectionInitialized = false;
  assert.deepEqual(plain(context.smartRoomSelectionForOptions([], [2, 3, 4], [3])), ['3']);
  console.log('PASS: independent performance filters and deliberate room selections survive metadata updates');
}

(async () => {await sharedLinks(); chartMembership(); filterIsolation();})().catch(error => {
  console.error(error); process.exitCode = 1;
});
