import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const html=readFileSync(new URL('../public/converter.html',import.meta.url),'utf8');
const factories={clines:{label:"Cline's Welding and Fabrication",manufacturer:'CWF'},halton:{label:'Halton',manufacturer:'Halton'},lti:{label:'Low Temp Industries',manufacturer:'LTI'},amerikooler:{label:'AmeriKooler',manufacturer:'Ameri'},browne:{label:'Browne USA Foodservice',manufacturer:'Browne'}};
const context={FACTORIES:factories};
vm.createContext(context);
vm.runInContext(html.slice(html.indexOf('function projectFactories('),html.indexOf('function renderFactoryTotals(')),context);
test('each factory uses corrected saved totals, including zero, instead of stale quote totals',()=>{
 for(const {label} of Object.values(factories)) {
  const p={factories:[label],totalAmount:1250,quotes:[{factory:label,totalAmount:1000}]};
  assert.equal(context.projectFactoryAmounts(p).get(label),1250);
  p.totalAmount=0;
  assert.equal(context.projectFactoryAmounts(p).get(label),0);
 }
});
test('multi-factory quotes and saved row prices retain their separate amounts',()=>{
 const p={factories:['Halton','AmeriKooler'],totalAmount:1600,quotes:[{factory:'Halton',totalAmount:1000}],items:[['D','1','0','Ameri','model','2','spec','300','0','category']]};
 const amounts=context.projectFactoryAmounts(p);
 assert.equal(amounts.get('Halton'),1000);
 assert.equal(amounts.get('AmeriKooler'),600);
});
test('factory totals change after additions, updates and deletions, including more than 250 projects',()=>{
 const projects=Array.from({length:251},()=>({factories:['Halton'],totalAmount:10}));
 assert.equal(context.factoryTotalsForProjects(projects).get('Halton'),2510);
 projects[0].totalAmount=20;
 assert.equal(context.factoryTotalsForProjects(projects).get('Halton'),2520);
 projects.pop();
 assert.equal(context.factoryTotalsForProjects(projects).get('Halton'),2510);
});
test('project API paginates without dropping the 251st record and disables caching',async()=>{
 const {default:worker}=await import('../dist/server/index.js');
 const records=Array.from({length:251},(_,i)=>({id:String(i),factory:'Halton',total_amount:10,dealers:'[]',premier_estimator:'[]',premier_sales_rep:'[]',items:'[]',quotes:'[]'}));
 const env={DB:{prepare(sql){assert.match(sql,/LIMIT 251 OFFSET \?/);return {bind(key,offset){assert.equal(key,'project-test-1234567890');return {async all(){return {results:records.slice(offset,offset+251)};}};}};}}};
 for(const [offset,count,next] of [[0,250,250],[250,1,null]]) {
  const response=await worker.fetch(new Request(`http://terminal.local/api/projects?offset=${offset}`,{headers:{'x-project-key':'project-test-1234567890'}}),env,{});
  assert.equal(response.headers.get('cache-control'),'no-store');
  const data=await response.json();
  assert.equal(data.projects.length,count);
  assert.equal(data.nextOffset,next);
 }
});
