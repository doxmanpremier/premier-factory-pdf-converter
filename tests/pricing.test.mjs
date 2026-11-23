import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import test from 'node:test';import assert from 'node:assert/strict';
const api={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/pricing.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:api,Intl});
test('post-award discount uses pre-award unit net with exact cents and bounds',()=>{
 assert.equal(api.discountedPostAward(100000,'5'),95000);assert.equal(api.discountedPostAward(100000,'0'),100000);assert.equal(api.discountedPostAward(100000,'100'),0);assert.equal(api.discountedPostAward(19999,'2.5'),19499);assert.equal(api.discountedPostAward(0,'5'),0);
 for(const value of ['', '-1','101','NaN','Infinity'])assert.throws(()=>api.discountedPostAward(100000,value));assert.throws(()=>api.discountedPostAward(null,'5'));
});
test('markup is applied to cost, while margin uses customer revenue',()=>{assert.equal(api.markedUpCents(100000,3),103000);assert.equal(api.moneyCents('1030.00'),103000);assert.equal(api.moneyCents(''),null);assert.throws(()=>api.moneyCents('1.999'));assert.throws(()=>api.moneyCents('-1'));const totals=api.itemPricing({id:'a',quantity:1,unit_price_cents:103000,unit_cost_cents:100000},[]);assert.equal(totals.profit,3000);assert.ok(Math.abs(totals.margin-3000/103000)<1e-10);});
test('quantity changes keep landed cost and markup-based sell current with fixed freight and install',()=>{
 const item={id:'a',quantity:1,unit_cost_cents:10000,post_award_cost_cents:9000,freight_cost_cents:1000,install_cost_cents:2000,install_mode:'manual',pricing_mode:'markup',markup_percent:10,quoted_total_cents:14300};
 const updated=api.pricingAfterQuantity(item,2);
 const totals=api.pricingTotals([updated],[]);
 assert.equal(updated.unit_cost_cents,10000);
 assert.equal(totals.landedCost,21000);
 assert.equal(totals.sell,25300);
 assert.equal(api.dollars(totals.profit),'$43.00');
 assert.equal(api.pricingAfterQuantity({...item,pricing_mode:'manual'},2).quoted_total_cents,14300);
});
test('lump-sum freight and install count without an equipment unit net',()=>{
 const equipment={id:'equipment',quantity:1,unit_cost_cents:7600000,post_award_cost_cents:6992000,install_cost_cents:1200000,quoted_total_cents:8976000};
 const install={id:'install',quantity:3,install_cost_cents:2500000};
 const freight={id:'freight',freight_cost_cents:100000};
 assert.equal(api.landedSell(install,2),2550000);
 assert.equal(api.landedSell(freight,2),102000);
 const totals=api.pricingTotals([equipment,{...install,quoted_total_cents:api.landedSell(install,2)}],[]);
 assert.equal(totals.landedCost,10692000);
 assert.equal(totals.sell,11526000);
 assert.equal(totals.equipmentCosted,1);
 assert.equal(totals.markup,2);
 assert.equal(api.itemPricing({id:'blank'},[]).landedCost,null);
});
test('displayed Sell net uses pre-award costs while profit uses active landed costs',()=>{
 const items=[
  {id:'equipment',quantity:2,unit_cost_cents:10000,post_award_cost_cents:9000,markup_percent:5,quoted_total_cents:99999},
  {id:'installation',install_cost_cents:2500,markup_percent:10},
  {id:'freight',freight_cost_cents:1000},
  {id:'blank',quantity:1,quoted_total_cents:12345,markup_percent:10},
 ];
 const totals=api.pricingTotals(items,[],true);
 assert.equal(totals.landedCost,21500);
 assert.equal(totals.sell,24750);
 assert.equal(totals.priced,3);
 assert.equal(totals.profit,3250);
 assert.equal(api.itemPricing(items[3],[],true).total,null);
 assert.equal(api.itemPricing(items[0],[]).total,99999);
});
test('missing price/cost/quantity stay unavailable; zero and fractional quantities remain valid',()=>{assert.equal(api.itemPricing({id:'a',quantity:2},[]).total,null);assert.equal(api.itemPricing({id:'a',quantity:null,unit_price_cents:0},[]).total,null);assert.equal(api.itemPricing({id:'a',quantity:0,unit_price_cents:100,unit_cost_cents:50},[]).total,0);assert.equal(api.itemPricing({id:'a',quantity:1.5,unit_price_cents:199},[]).total,299);assert.equal(api.itemPricing({id:'a',quantity:1,unit_price_cents:0,unit_cost_cents:0},[]).margin,null);});
test('landed markup includes quantity net freight and install, zero markup and factory filtering',()=>{
 const item={id:'a',manufacturer:'Factory A',quantity:2,unit_cost_cents:100000,freight_cost_cents:10000,install_cost_cents:20000};
 assert.equal(api.landedSell(item,10),253000);assert.equal(api.landedSell(item,0),230000);
 assert.equal(api.landedSell({...item,post_award_cost_cents:95000},10),253000);
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
test('partial project profit uses only paired costs and sell prices, retaining post award costs',()=>{
 const items=[{id:'ready',quantity:2,unit_cost_cents:100000,post_award_cost_cents:95000,freight_cost_cents:1000,install_cost_cents:2000,quoted_total_cents:210000},{id:'sell-only',quantity:1,quoted_total_cents:500000},{id:'cost-only',quantity:1,unit_cost_cents:500000},{id:'blank',quantity:1}];
 const t=api.pricingTotals(items,[]);assert.equal(t.complete,false);assert.equal(t.profitItems,1);assert.equal(t.profit,17000);assert.ok(Math.abs(t.markup-7000/203000*100)<1e-10);
 assert.equal(api.pricingTotals(items.slice(1),[]).profit,null);
 const zero=api.pricingTotals([{id:'zero',quantity:1,unit_cost_cents:0,quoted_total_cents:0},items[3]],[]);assert.equal(zero.profit,0);assert.equal(zero.profitItems,1);
});
test('installation percent uses active unit net times quantity and preserves fixed sell on post-award change',()=>{
 assert.equal(api.installationCost({unit_cost_cents:100000,quantity:4},3),12000);assert.equal(api.installationCost({unit_cost_cents:100000,quantity:4},5),20000);assert.equal(api.installationCost({unit_cost_cents:100000,post_award_cost_cents:95000,quantity:4},4),15200);assert.equal(api.installationCost({unit_cost_cents:0,quantity:4},0),0);
 const before={pricing_mode:'markup',markup_percent:3,install_mode:'percent',install_percent:4,install_cost_cents:16000,unit_cost_cents:100000,post_award_cost_cents:null,unit_price_cents:103000,quoted_total_cents:428480};
 assert.equal(api.markupNeedsRecalculation(before,{...before,post_award_cost_cents:95000,install_cost_cents:15200}),false);assert.equal(api.markupNeedsRecalculation(before,{...before,install_percent:5,install_cost_cents:20000}),true);
});


test('pre-award markup stays unchanged by post-award discounts while profit increases',()=>{
 const pre={id:'a',quantity:2,unit_cost_cents:100000,freight_cost_cents:10000,install_cost_cents:20000,quoted_total_cents:236900};
 const post={...pre,post_award_cost_cents:90000};
 assert.equal(api.landedSell(post,3),236900);
 assert.equal(api.landedSell({...post,post_award_cost_cents:0},0),230000);
 const before=api.pricingTotals([pre],[]),after=api.pricingTotals([post],[]);
 assert.equal(before.markup,3);assert.equal(after.markup,3);
 assert.equal(before.profit,6900);assert.equal(after.profit,26900);
 assert.throws(()=>api.landedSell({quantity:1,post_award_cost_cents:10000},3),/pre-award/);
});

test('item net totals extend pre and post separately by quantity without freight or fallback',()=>{
 assert.deepEqual({...api.itemNetTotals({quantity:3,unit_cost_cents:12345,post_award_cost_cents:11000,freight_cost_cents:900})},{pre:37035,post:33000});
 assert.deepEqual({...api.itemNetTotals({quantity:2,unit_cost_cents:100,post_award_cost_cents:null})},{pre:200,post:null});
 assert.deepEqual({...api.itemNetTotals({quantity:0,unit_cost_cents:100,post_award_cost_cents:0})},{pre:0,post:0});
 assert.deepEqual({...api.itemNetTotals({quantity:null,unit_cost_cents:100,post_award_cost_cents:100})},{pre:null,post:null});
 assert.deepEqual({...api.itemNetTotals({quantity:1.5,unit_cost_cents:101,post_award_cost_cents:0})},{pre:152,post:0});
});

test('discount and profit percentages use matching item bases and survive saved cents',()=>{
 const item={id:'discounted',quantity:3,unit_cost_cents:100000,post_award_cost_cents:88000,quoted_total_cents:330000};
 assert.equal(api.percentLabel(api.itemDiscountPercent(item)),'12%');
 const t=api.pricingTotals([item,{id:'sell-only',quoted_total_cents:900000},{id:'blank',quantity:2}],[]);
 assert.equal(t.discountAmount,36000);assert.equal(t.discountPercent,12);assert.equal(t.discountItems,1);assert.equal(t.profit,66000);assert.equal(t.profitPercent,20);
 assert.equal(api.itemDiscountPercent({unit_cost_cents:0,post_award_cost_cents:0}),null);
 assert.equal(api.pricingTotals([],[]).profitPercent,null);
 const full=api.pricingTotals([item,{id:'other',quantity:1,unit_cost_cents:100000,post_award_cost_cents:100000,quoted_total_cents:100000}],[]);
 assert.equal(full.discountPercent,9);
});
