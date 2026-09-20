// Pure client logic regressions. Real browser checks are recorded in the audit report.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('frontend/assets/app.js', 'utf8');
function definition(name) {
  const start = source.indexOf('  function ' + name + '(');
  assert(start >= 0, name);
  const end = source.indexOf('\n  function ', start + 5);
  return source.slice(start, end);
}
const inputs = { min: {value:'1.234', dataset:{defaultValue:'1.234'}}, max: {value:'2.346', dataset:{defaultValue:'2.346'}} };
const context = {byId: id => inputs[id]};
vm.createContext(context);
vm.runInContext(['normalizeSearch','matchesSearch','parseNumericValue','numberValue','addRange'].map(definition).join('\n'), context);
for (const query of ['אברהם בויאר 12','בויאר 12','בויאר, 12 תל אביב-יפו']) {
  assert(context.matchesSearch('בויאר אברהם 12, תל אביב -יפו',query));
  assert(!context.matchesSearch('בויאר אברהם 120, תל אביב -יפו',query));
}
assert(context.matchesSearch('ז׳בוטינסקי','זבוטינסקי'));
assert(context.matchesSearch('ז\'בוטינסקי','ז״בוטינסקי'));
assert(!context.matchesSearch('anything','---'));
let filters = {};
context.addRange(filters,'area_range','min','max');
assert.deepEqual(filters, {}); // untouched full range includes unknown area
inputs.min.value = '5';
context.addRange(filters,'area_range','min','max');
assert.equal(JSON.stringify(filters),'{"area_range":[5,null]}');
filters = {};
context.addRange(filters,'floor_range','min','max');
assert.equal(JSON.stringify(filters),'{"floor_range":[5,2.346]}');
console.log('PASS: client address normalization, numeric boundaries, and explicit range filters');
vm.runInContext(['analysisDateAxis','formatDealDate','groupHistoryDates'].map(definition).join('\n'), context);
const sparse = context.analysisDateAxis([{date:'2004-12-12'},{date:'2020-06-25'},{date:'2023-08-06'}], 10);
assert.equal(JSON.stringify(sparse.ticktext), '["2004","2020","2023"]');
assert(Date.parse(sparse.range[0]) < Date.parse('2004-12-12'));
assert(Date.parse(sparse.range[1]) > Date.parse('2023-08-06'));
const singleYear = context.analysisDateAxis([{date:'2023-02-01'},{date:'2023-08-06'}], 10);
assert.equal(JSON.stringify(singleYear.ticktext), '["01.02.2023","06.08.2023"]');
const dense = context.analysisDateAxis(Array.from({length:29},(_,i)=>({date:`${1998+i}-06-01`})), 6);
assert(dense.ticktext.length <= 6);
assert.equal(dense.ticktext[0], '1998');
assert.equal(dense.ticktext.at(-1), '2026');
assert.equal(context.analysisDateAxis([{date:null}], 5).type, 'date');
const grouped = context.groupHistoryDates([{date:'2023-08-06',record_id:'new'},{date:'2023-08-06',record_id:'old'},{date:'2004-12-12',record_id:'earlier'}]);
assert.equal(grouped.length,2);
assert.equal(grouped[0].rows.length,2);
assert.equal(grouped[1].rows[0].record_id,'earlier');
console.log('PASS: transaction-year ticks, date labels, endpoint coverage, same-day source grouping');
vm.runInContext(definition('historyPresentationRows'),context);
const full = {record_id:'current:1',date:'2023-08-06',sale_portion:1,price_ils:5400000,area:98};
const reference = {record_id:'legacy:city:1',date:'2023-08-06',sale_portion:null,price_ils:5400000,area:105.8};
const presentation = context.historyPresentationRows([full,reference]);
assert.equal(presentation.length,1);
assert.equal(presentation[0].area,98);
assert.equal(presentation[0].alternate_records[0].area,105.8);
assert.equal(reference.alternate_records,undefined); // source data untouched
assert.equal(context.historyPresentationRows([{...full,sale_portion:.5},reference]).length,2);
assert.equal(context.historyPresentationRows([full,reference,{...reference,record_id:'legacy:city:2'}]).length,3);
assert.equal(context.historyPresentationRows([full,reference,{...full,record_id:'current:2'}]).length,3);
assert.equal(context.historyPresentationRows([full,reference,{...full,record_id:'current:3',date:'2020-06-25'}]).length,2);
console.log('PASS: parallel reports shown once, provenance retained, partial and ambiguous sales remain separate');

assert.equal(context.historyPresentationRows([full,reference,{...full,record_id:'current:partial',sale_portion:.5}]).length,3);

// Replacing native submission must retain validation, including collapsed year controls.
vm.runInContext(definition('validateAddressLookup'), context);
let validityReports=0;
const advanced={open:false};
const goodQuery={checkValidity:()=>true};
const invalidYear={checkValidity:()=>false,closest:()=>advanced,reportValidity(){validityReports++;}};
inputs['address-lookup-form']={querySelectorAll:()=>[goodQuery,invalidYear]};
assert.equal(context.validateAddressLookup(),false);
assert.equal(advanced.open,true,'An invalid hidden year is exposed for correction');
assert.equal(validityReports,1);
invalidYear.checkValidity=()=>true;
assert.equal(context.validateAddressLookup(),true);
assert.equal(validityReports,1,'Valid searches do not show validation prompts');
console.log('PASS: search-region validation preserves required fields and exposes invalid advanced controls');

// Address search must also be initialized for deployments without the pilot.
const bindings=[];
for (const id of ['pilot-address-lookup','address-lookup-scope','open-address-search','address-lookup-city','run-address-lookup','address-lookup-form']) {
  inputs[id]={hidden:true,addEventListener(type){bindings.push([id,type]);}};
}
inputs['city-select']={value:'tel_aviv_yafo'};
context.state={meta:{cities:[{id:'tel_aviv_yafo',name:'תל אביב -יפו'}]}};
context.pilotActive=()=>false;
context.setOptions=()=>{};
context.runAddressLookup=()=>{};
vm.runInContext(['setupAddressLookup','setupPilotControls'].map(definition).join('\n'),context);
context.setupPilotControls();
assert.equal(inputs['open-address-search'].hidden,false);
assert.equal(inputs['pilot-address-lookup'].hidden,false);
assert.equal(inputs['address-lookup-city'].value,'tel_aviv_yafo');
assert(inputs['address-lookup-scope'].textContent.includes('אינם פעילים'));
assert.equal(bindings.length,2);
context.setupPilotControls();assert.equal(bindings.length,2,'Reloading controls must not duplicate search handlers');
console.log('PASS: address search is available without pilot metadata and binds only once');
