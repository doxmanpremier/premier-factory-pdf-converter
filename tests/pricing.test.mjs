import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import test from 'node:test';import assert from 'node:assert/strict';
const api={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/pricing.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:api,Intl});
test('markup is applied to cost, while margin uses customer revenue',()=>{assert.equal(api.markedUpCents(100000,3),103000);assert.equal(api.moneyCents('1030.00'),103000);assert.equal(api.moneyCents(''),null);assert.throws(()=>api.moneyCents('1.999'));assert.throws(()=>api.moneyCents('-1'));const totals=api.itemPricing({id:'a',quantity:1,unit_price_cents:103000,unit_cost_cents:100000},[]);assert.equal(totals.profit,3000);assert.ok(Math.abs(totals.margin-3000/103000)<1e-10);});
test('missing price/cost/quantity stay unavailable; zero and fractional quantities remain valid',()=>{assert.equal(api.itemPricing({id:'a',quantity:2},[]).total,null);assert.equal(api.itemPricing({id:'a',quantity:null,unit_price_cents:0},[]).total,null);assert.equal(api.itemPricing({id:'a',quantity:0,unit_price_cents:100,unit_cost_cents:50},[]).total,0);assert.equal(api.itemPricing({id:'a',quantity:1.5,unit_price_cents:199},[]).total,299);assert.equal(api.itemPricing({id:'a',quantity:1,unit_price_cents:0,unit_cost_cents:0},[]).margin,null);});
test('landed markup includes quantity net freight and install, zero markup and factory filtering',()=>{
 const item={id:'a',manufacturer:'Factory A',quantity:2,unit_cost_cents:100000,freight_cost_cents:10000,install_cost_cents:20000};
 assert.equal(api.landedSell(item,10),253000);assert.equal(api.landedSell(item,0),230000);
 assert.equal(api.landedSell({...item,post_award_cost_cents:95000},10),242000);
 const a={...item,quoted_total_cents:253000},b={...item,id:'b',manufacturer:'Factory B',quoted_total_cents:230000};
 const total=api.pricingTotals([a,b],[]);assert.equal(total.net,400000);assert.equal(total.freight,20000);assert.equal(total.install,40000);assert.equal(total.sell,483000);assert.equal(total.profit,23000);assert.equal(total.markup,5);
 assert.equal(api.matchesFactories(a,[]),true);assert.equal(api.matchesFactories(a,['Factory B','Factory A']),true);assert.equal(api.matchesFactories(a,['Factory B']),false);
 assert.equal(api.pricingTotals([{id:'missing',quantity:1}],[]).markup,null);
});
test('markup follows baseline net freight and install changes in any entry order, post-award changes stay fixed',()=>{
 const before={pricing_mode:'markup',markup_percent:3,unit_cost_cents:100000,post_award_cost_cents:null,freight_cost_cents:0,install_cost_cents:0,unit_price_cents:103000,quoted_total_cents:206000};
 for(const field of ['unit_cost_cents','freight_cost_cents','install_cost_cents'])assert.equal(api.markupNeedsRecalculation(before,{...before,[field]:5000}),true);
 assert.equal(api.markupNeedsRecalculation(before,{...before,post_award_cost_cents:95000}),false);
 assert.equal(api.markupNeedsRecalculation(before,{...before,pricing_mode:'manual',freight_cost_cents:200}),false);
 assert.equal(api.markupNeedsRecalculation(before,before),false);assert.equal(api.markupNeedsRecalculation(before,before,true),true);
});
test('pre and post award totals show both net costs with the same saved sell net',()=>{
 const items=[{id:'a',quantity:2,unit_cost_cents:100000,post_award_cost_cents:95000,quoted_total_cents:220000},{id:'b',quantity:3,unit_cost_cents:10000,quoted_total_cents:35000}];
 const t=api.pricingTotals(items,[]);assert.equal(t.preNet,230000);assert.equal(t.postNet,220000);assert.equal(t.sell,255000);
 const zero=api.pricingTotals([{...items[0],post_award_cost_cents:0}],[]);assert.equal(zero.preNet,200000);assert.equal(zero.postNet,0);assert.equal(zero.sell,220000);
});
