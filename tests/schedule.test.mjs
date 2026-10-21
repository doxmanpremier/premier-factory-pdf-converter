import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import test from 'node:test';import assert from 'node:assert/strict';
const schedule={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/schedule.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:schedule});
const row={itemnumber:'001',quantity:2,name:'Counter',manufacturer:'Maker',model:'CUSTOM',details:'NIC',warning:''};
const ocr={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/schedule-ocr.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:ocr});
test('OCR preserves row order, skips spares and flags uncertain or missing text for confirmation',()=>{
 const word=(text,x,y,confidence=95)=>({text,confidence,bbox:{x0:x,y0:y,x1:x+20,y1:y+10}});
 const words=[word('001',0,30),word('2',100,30),word('Counter',180,30),word('Maker',550,30),word('CUSTOM',800,30,55),word('002',0,50),word('SPARE',180,50),word('NUMBER',220,50),word('003',0,70),word('Sink',180,70)];
 const result=ocr.parseScheduleWords(words,1000,{quantity:10,name:15,manufacturer:50,model:75},0);assert.equal(result.rows.length,2);assert.equal(result.rows[0].itemnumber,'001');assert.equal(result.rows[0].quantity,2);assert.match(result.rows[0].warning,/confidence/);assert.match(result.rows[1].warning,/blank/);assert.equal(result.skipped,1);assert.throws(()=>ocr.parseScheduleWords(words,1000,{quantity:30,name:20,manufacturer:50,model:75}));
});
test('schedule validates editable rows and preserves literal values',()=>{assert.equal(schedule.validateSchedule([row])[0].itemnumber,'001');for(const r of [{...row,quantity:-1},{...row,name:'SPARE NUMBER'},{...row,itemnumber:''}])assert.throws(()=>schedule.validateSchedule([r]));});
