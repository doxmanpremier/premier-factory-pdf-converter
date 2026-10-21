import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import test from 'node:test';import assert from 'node:assert/strict';
const pricing={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/pricing.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:pricing,Intl});
const api={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/equipment-import.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:api,require:()=>pricing,Date});
test('pricing headers may be reordered and blanks keep values while zero remains explicit',()=>{
 const parsed=api.parseEquipmentRows([['Manufacturer','Item number','Markup %','Pre-award unit net','Quantity','Install %','Freight net','Category / Description'],['Factory A','01A','3%','$1,000.00','4','4','100','Counter'],['','02','0','','','0','','']]);
 assert.equal(parsed.errors.length,0);assert.equal(parsed.rows[0].itemnumber,'01A');assert.equal(parsed.rows[0].pricing.unit_cost_cents,'1000.00');assert.equal(parsed.rows[0].pricing.install_percent,'4');assert.equal(parsed.rows[1].pricing.markup_percent,'0');assert.equal(parsed.rows[1].quantity,undefined);assert.equal(parsed.rows[1].pricing.unit_cost_cents,undefined);
});
test('invalid pricing and conflicting amounts are rejected before import',()=>{
 for(const [headers,values] of [[['Item number','Install net','Install %'],['1','100','4']],[['Item number','Markup %','Sell net'],['1','3','100']],[['Item number','Pre-award unit net'],['1','-1']],[['Item number','Markup %'],['1','bad']],[['Item number','Expected receiving date'],['1','2026-02-30']]])assert.ok(api.parseEquipmentRows([headers,values]).errors.length>0);
});
test('import pricing preserves omitted values and defaults to fixed sell for explicit Sell net',()=>{
 const old={unit_cost_cents:100000,post_award_cost_cents:95000,unit_price_cents:110000,freight_cost_cents:10000,install_cost_cents:15000,install_mode:'percent',install_percent:4,pricing_mode:'markup',markup_percent:3};
 const row=api.parseEquipmentRows([['Item number','Post-award unit net'],['01','900']]).rows[0];const form=api.equipmentImportPricing(row,old);assert.equal(form.unit_cost_cents,'1000.00');assert.equal(form.post_award_cost_cents,'900.00');assert.equal(form.freight_cost_cents,'100.00');assert.equal(form.install_mode,'percent');assert.equal(form.install_percent,4);assert.equal(form.recalculate_sell,'no');
 const manual=api.equipmentImportPricing(api.parseEquipmentRows([['Item number','Sell net','Install net'],['01','5000','0']]).rows[0],old);assert.equal(manual.pricing_mode,'manual');assert.equal(manual.quoted_total_cents,'5000.00');assert.equal(manual.install_mode,'manual');assert.equal(manual.install_cost_cents,'0.00');
});
test('optional item IDs target exact duplicates and cannot reuse a matching item',()=>{
 const entries=[{id:'a',kind:'item',parent:'p',itemnumber:'1',name:'A'},{id:'b',kind:'item',parent:'p',itemnumber:'1',name:'B'}];const rows=api.parseEquipmentRows([['Item number','Item ID'],['1','b'],['1','a']]).rows;const matches=api.matchEquipmentRows(rows,entries,'p');assert.equal(matches[0].id,'b');assert.equal(matches[1].id,'a');
});
test('pricing export reimports with original markup, percentage installation and fixed saved sell',()=>{
 const old={id:'exact',kind:'item',parent:'p',itemnumber:'01A',name:'Counter',manufacturer:'Factory',model:'CUSTOM',quantity:2,unit_cost_cents:100000,post_award_cost_cents:95000,unit_price_cents:110000,quoted_total_cents:220000,freight_cost_cents:10000,install_cost_cents:7600,install_mode:'percent',install_percent:4,pricing_mode:'markup',markup_percent:3,quote_number:'Q1',po_number:'P1',shipping_destination:'installer',expected_receiving_date:'2026-12-01',shop_drawings:'yes',stage:'Awarded'};
 const grid=api.equipmentExportGrid([old]);const parsed=api.parseEquipmentRows(grid);assert.equal(parsed.errors.length,0);const row=parsed.rows[0],form=api.equipmentImportPricing(row,old);assert.equal(row.itemnumber,'01A');assert.equal(row.item_id,'exact');assert.equal(row.model,'CUSTOM');assert.equal(row.shipping_destination,'installer');assert.equal(form.install_mode,'percent');assert.equal(form.install_percent,'4');assert.equal(form.markup_percent,'3');assert.equal(form.quoted_total_cents,'2200.00');assert.equal(form.preserve_import_sell,'yes');assert.equal(form.recalculate_sell,'no');
 const recreate=api.equipmentImportPricing(row);assert.equal(recreate.pricing_mode,'markup');assert.equal(recreate.quoted_total_cents,'2200.00');
});
test('stale foreign and copied item IDs fall back to item numbers without creating duplicate items',()=>{
 const entries=[{id:'a',kind:'item',parent:'p',itemnumber:'01',name:'Counter',manufacturer:'A',model:'X'},{id:'b',kind:'item',parent:'p',itemnumber:'02',name:'Sink',manufacturer:'B',model:'Y'},{id:'foreign',kind:'item',parent:'other',itemnumber:'01',name:'Counter'}];
 const rows=[{itemnumber:'01',name:'Counter',manufacturer:'A',model:'X',item_id:'foreign'},{itemnumber:'02',name:'Sink',manufacturer:'B',model:'Y',item_id:'old-b'}];
 let matches=api.matchEquipmentRows(rows,entries,'p');assert.equal(matches[0].id,'a');assert.equal(matches[1].id,'b');assert.equal(api.equipmentIdentityIssues(rows,entries,'p').errors.length,0);
 rows.forEach(r=>r.item_id='a');matches=api.matchEquipmentRows(rows,entries,'p');assert.equal(matches[0].id,'a');assert.equal(matches[1].id,'b');assert.equal(api.equipmentIdentityIssues(rows,entries,'p').errors.length,0);assert.equal(api.equipmentIdentityIssues(rows,entries,'p').fallback,2);
 assert.equal(api.equipmentIdentityIssues([rows[0],rows[0]],entries,'p').errors.length,1);
});
test('valid item IDs and specific duplicate details are reserved before fallback matching',()=>{
 const entries=[{id:'a',kind:'item',parent:'p',itemnumber:'1',name:'Hood',manufacturer:'A',model:'X'},{id:'b',kind:'item',parent:'p',itemnumber:'1',name:'Sink',manufacturer:'B',model:'Y'}];
 let rows=[{itemnumber:'1',name:'',item_id:'stale'},{itemnumber:'1',name:'Hood',item_id:'a'}],matches=api.matchEquipmentRows(rows,entries,'p');assert.equal(matches[0].id,'b');assert.equal(matches[1].id,'a');
 rows=[{itemnumber:'1',name:'',item_id:'stale'},{itemnumber:'1',name:'Hood',item_id:'also-stale'}];matches=api.matchEquipmentRows(rows,entries,'p');assert.equal(matches[0].id,'b');assert.equal(matches[1].id,'a');
 const fresh=api.matchEquipmentRows([{itemnumber:'9',name:'New equipment',item_id:'foreign'}],entries,'p');assert.equal(fresh[0],undefined);
});

test('two-column bulk net pricing supports Excel headers and headerless rows without changing quantity',()=>{
 for(const grid of [[['Item number','Net price'],['01','$1,200.50'],['02','0']],[['01','1200.50'],['02','0']]]){
 const parsed=api.parseEquipmentRows(grid,true);assert.equal(parsed.errors.length,0);assert.equal(parsed.rows[0].pricing.unit_cost_cents,'1200.50');assert.equal(parsed.rows[0].quantity,undefined);assert.equal(parsed.rows[1].pricing.unit_cost_cents,'0.00');
 }
});
test('bulk pricing rejects missing and ambiguous items and accepts optional identifying fields',()=>{
 const items=[{id:'a',kind:'item',parent:'p',itemnumber:'1',name:'Hood'},{id:'b',kind:'item',parent:'p',itemnumber:'1',name:'Sink'}];
 const parse=grid=>api.parseEquipmentRows(grid,true).rows;
 assert.match(api.bulkPricingIssues(parse([['1',100]]),items,'p')[0],/duplicate/);
 assert.match(api.bulkPricingIssues(parse([['9',100]]),items,'p')[0],/no matching/);
 assert.equal(api.bulkPricingIssues(parse([['Item number','Net price','Category'],['1',100,'Sink']]),items,'p').length,0);
});
