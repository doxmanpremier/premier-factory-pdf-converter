import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const load=(file,deps={})=>{const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:n=>deps[n]??require(n),Intl,crypto});return exports;};
const pricing=load('lib/pricing.ts'),stages=load('lib/stages.ts'),insights=load('lib/project-insights.ts',{'./pricing':pricing,'./stages':stages});
const item={id:'i',kind:'item',parent:'job',itemnumber:'1',quantity:2,unit_cost_cents:100000,post_award_cost_cents:88000,pricing_mode:'markup',markup_percent:10,quoted_total_cents:220000};
test('saved 12% discount appears on item line and summary alongside profit margin',()=>{
 const Inline=load('pm/inline-pricing.tsx',{'../lib/pricing':pricing}).default;
 const line=renderToStaticMarkup(React.createElement('table',null,React.createElement('tbody',null,React.createElement('tr',null,React.createElement(Inline,{item,entries:[],save:()=>{},busy:false})))));
 assert.match(line,/Saved discount: 12% off pre-award/);
 const Overview=load('pm/project-overview.tsx',{'../lib/pricing':pricing,'../lib/stages':stages,'../lib/project-insights':insights}).default;
 const summary=renderToStaticMarkup(React.createElement(Overview,{entries:[{id:'job',kind:'folder',job_category:'awarded'},item],parent:'job',onQueue:()=>{}}));
 assert.match(summary,/12.00% off pre-award net/);assert.match(summary,/20.00% profit margin/);assert.match(summary,/\$240.00/);assert.match(summary,/\$440.00/);
});
