// Regression checks for filter validity, stale responses, exports and street context.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('frontend/assets/app.js', 'utf8');
function definition(name) {
  const match = new RegExp('  (?:async )?function ' + name + '\\(').exec(source);
  assert(match, name);
  const next = source.slice(match.index + 5).search(/\n  (?:async )?function /);
  return source.slice(match.index, match.index + 5 + next);
}
function load(context, names) {
  vm.createContext(context);
  vm.runInContext(names.map(definition).join('\n'), context);
  return context;
}
function numericValidation() {
  const inputs = {};
  const input = (id, value, extra = {}) => inputs[id] = {
    id, value, min:'', max:'', step:'', attrs:{}, validity:{}, ...extra,
    setAttribute(k, v) {this.attrs[k] = v;}, getAttribute(k) {return this.attrs[k] || '';},
    insertAdjacentElement(where, node) {inputs[node.id] = node;}
  };
  const c = load({byId: id => inputs[id], updateAnalysisFreshness(){}, document: {createElement() {return {setAttribute() {}};}}},
    ['parseNumericValue', 'validateNumericInput', 'normalizeNumericInput', 'numberValue', 'intValue']);
  for (const [text, value] of [['',null],['  ',null],['0',0],['-2',-2],['.5',.5],['1,000',1000],['1,234.50',1234.5]]) {
    assert.equal(c.parseNumericValue(text),value);
  }
  for (const text of ['1,00','1,2,3','abc','Infinity','0x10','1e3']) assert(Number.isNaN(c.parseNumericValue(text)));
  const min = input('filter-area-min','100');
  const max = input('filter-area-max','1,000');
  assert(c.validateNumericInput(max));
  assert.equal(c.numberValue(max.id),1000);
  max.value='bad'; assert(!c.validateNumericInput(max)); assert.equal(max.attrs['aria-invalid'],'true');
  assert(max.attrs['aria-describedby'].includes(max.id+'-error'));
  max.value='50'; assert(!c.validateNumericInput(max), 'Reject reversed ranges');
  max.value=''; assert(c.validateNumericInput(max)); assert.equal(c.numberValue(max.id),null);
  c.normalizeNumericInput(max); assert.equal(max.value,'', 'Blank bounds stay unbounded on blur');
  max.value='1,000'; c.normalizeNumericInput(max); assert.equal(max.value,'1000');
  max.value='bad'; c.normalizeNumericInput(max); assert.equal(max.value,'bad');
  input('row-limit','1,000',{min:'1',max:'5000',step:'1'});
  assert.equal(c.intValue('row-limit',3000,1,5000),1000);
  inputs['row-limit'].value='1.5'; assert(!c.validateNumericInput(inputs['row-limit']));
  assert.equal(inputs['row-limit'].value,'1.5', 'Validation must not silently change input');
  console.log('PASS: commas, zero, blank bounds, invalid numbers and reversed ranges');
}
async function staleResults() {
  let payload={city:'city',gushes:[],filters:{price_range:[null,5]}};
  let resolve, reject, posts=0, valid=true;
  const nodes = new Proxy({}, {get(target,id) {return target[id] ||= {hidden:true,focus(){this.focused=true;}};}});
  const state={analysisMode:'chart',analysisRequestId:0,successfulAnalysisPayload:null,latestPayloads:{}};
  const c = load({state,URL,document:{body:{dataset:{}}},window:{location:{href:'http://localhost/#analysis'},history:{replaceState(){}}},
    byId:id=>nodes[id], validateNumericScope:()=>valid, buildAnalysisPayload:()=>structuredClone(payload),
    endpoints:{analysis:'api/analysis/deals'},startRequest:()=>({signal:{}}),finishRequest(){},setAnalysisBusy(){},
    postJson(){posts++; return new Promise((yes,no)=>{resolve=yes;reject=no;});},
    renderAnalysisChart(){},renderSelectedDeal(){},renderMetrics(){},renderTable(){},analysisColumns:()=>[],
    persistSharedView(){},rememberNavigation(){},setNotice(){},warningText:()=>'',emptyText:()=>'',activateTab(){}},
    ['analysisNeedsUpdate','updateAnalysisFreshness','runAnalysis','previewExport']);
  let run=c.runAnalysis(); resolve({data:{table_rows:[{price:4}]}}); await run;
  assert(!c.analysisNeedsUpdate());
  payload.filters.price_range=[null,0]; c.updateAnalysisFreshness();
  assert(c.analysisNeedsUpdate()); assert.equal(nodes['analysis-stale'].hidden,false);
  c.previewExport('analysis'); assert(nodes['update-stale-analysis'].focused,'Stale exports require an update');
  run=c.runAnalysis(); payload.filters.price_range=[null,2]; resolve({data:{table_rows:[]}}); await run;
  assert(c.analysisNeedsUpdate(),'Inputs edited during a request remain stale when its response arrives');
  assert.deepEqual(JSON.parse(JSON.stringify(state.successfulAnalysisPayload.filters.price_range)),[null,0]);
  run=c.runAnalysis(); reject(new Error('offline')); await run;
  assert(c.analysisNeedsUpdate(),'Failed request must retain previous result identity');
  run=c.runAnalysis(); resolve({data:{table_rows:[]}}); await run;
  assert(!c.analysisNeedsUpdate()); assert(nodes['analysis-stale'].hidden);
  valid=false; const count=posts; await c.runAnalysis(); assert.equal(posts,count,'Invalid numbers block requests');
  assert(c.analysisNeedsUpdate(),'Invalid filter input marks displayed results as stale');
  console.log('PASS: stale exports, in-flight edits, failed requests and successful refresh');
}
function streetResolution() {
  const c=load({},['lookupStreets']);
  const rows=[{reference_address:'בויאר אברהם 12, תל אביב -יפו',reference_streets:['בויאר אברהם']}];
  const available=['בויאר אברהם','רחוב 2'];
  assert.equal(JSON.stringify(c.lookupStreets(rows,available)),JSON.stringify(['בויאר אברהם']));
  assert.equal(c.lookupStreets([...rows,{reference_streets:['רחוב 2']}],available).length,2);
  assert.equal(c.lookupStreets([{reference_address:'unknown'}],available).length,0);
  console.log('PASS: structured street identity and ambiguous/missing candidates');
}
async function ambiguousStreetFallback() {
  const nodes = new Proxy({}, {get(target,id) {return target[id] ||= {value:'',focus(){this.focused=true;},scrollIntoView(){}};}});
  let runs=0, active;
  const state={lookupRequest:{city:'city',address:'full address'},lookupData:{rows:[{reference_streets:['one','two']}]},streets:['one','two']};
  const c=load({state,byId:id=>nodes[id],pushNavigation(){},cleanAnalysisUrl:()=>'',setAnalysisLocation:async()=>{},
    renderLocationPickers(){},updateSelectionSummary(){},activateTab(tab){active=tab;},renderPicker(){},setNotice(){},rememberNavigation(){},
    runAnalysis:async()=>{runs++;}},['lookupStreets','openLookupContext']);
  await c.openLookupContext('street');
  assert.equal(active,'analysis'); assert.equal(state.analysisMode,'chart');
  assert(nodes['street-picker-search'].focused,'Ambiguous streets expose and focus a usable picker');
  assert.equal(nodes['analysis-address'].value,''); assert.equal(runs,0,'Do not automatically analyze an ambiguous scope');
  console.log('PASS: ambiguous street lookup opens the picker without running a broad analysis');
}
(async()=>{numericValidation(); await staleResults(); streetResolution(); await ambiguousStreetFallback();})().catch(error=>{console.error(error);process.exitCode=1;});
