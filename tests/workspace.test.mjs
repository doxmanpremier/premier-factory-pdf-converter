import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import test from 'node:test';import assert from 'node:assert/strict';
const api={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/workspace.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:api});
test('document search is case insensitive and handles whitespace',()=>{assert.ok(api.matchesDocument({name:'AC Hotel Specs.pdf'},' hotel SPEC '));assert.ok(!api.matchesDocument({name:'Drawings.pdf'},'spec'));assert.ok(api.matchesDocument({name:'Drawings.pdf'},''));});
test('move targets identify project and item and exclude the current item and its descendants',()=>{
 const entries=[{id:'p',kind:'folder',name:'Hotel',job_category:'awarded'},{id:'q',kind:'folder',name:'Other',job_category:'quoting'},{id:'a',parent:'p',kind:'item',itemnumber:'1',name:'Walk in',manufacturer:'Maker',model:'M'},{id:'b',parent:'q',kind:'item',itemnumber:'1',name:'Walk in',manufacturer:'Maker',model:'M'},{id:'child',parent:'a',kind:'folder',name:'Drawings'}];
 const targets=api.moveDestinations(entries,'a');assert.ok(!targets.some(t=>['a','child'].includes(t.id)));assert.equal(targets.find(t=>t.id==='b').label,'Quoting / Other / 1 · Walk in · Maker · M');assert.ok(targets.find(t=>t.id==='p').label.includes('Awarded / Hotel'));
});
test('identical item paths still have distinguishable destination labels',()=>{
 const entries=[{id:'p',kind:'folder',name:'Job'},{id:'a',kind:'item',parent:'p',itemnumber:'1',name:'Sink'},{id:'b',kind:'item',parent:'p',itemnumber:'1',name:'Sink'}];const targets=api.moveDestinations(entries,'missing');assert.notEqual(targets.find(t=>t.id==='a').label,targets.find(t=>t.id==='b').label);
});
test('filtering cannot hide the count of selected items from bulk action safety checks',()=>{
 const result=api.selectionForVisible(['a','b'],[{id:'b'},{id:'c'}]);assert.equal(result.hidden.join(','),'a');assert.equal(result.visible.join(','),'b');const none=api.selectionForVisible(['a'],[]);assert.equal(none.hidden.length,1);assert.equal(none.visible.length,0);
});
