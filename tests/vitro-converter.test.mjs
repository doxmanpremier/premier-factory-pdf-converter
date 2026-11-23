import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const html=fs.readFileSync(new URL('../public/converter.html',import.meta.url),'utf8');
const context={};vm.createContext(context);
vm.runInContext(html.slice(html.indexOf('function extractVitroRows('),html.indexOf('async function processVitroFiles(')),context);
const line=(qty,spec,unit='',total='')=>[qty,spec,'','','','','',unit,total];
test('Vitro preserves shared models, following details, quantities, charges and printed totals',()=>{
 const rows=context.extractVitroRows([
 line('QTY','Description'),line('','Model # LH-5 Booths'),line('','Upholstery: Red'),
 line(3,'Half circles',100,301),line('','Built in sections'),line(2,'Single booth',50,100),
 line('','Table Tops:'),line('','Model # BGA-225 Table Tops'),line('','Laminate: White'),
 line(4,'Size: 24 x 30',20,80),line(1,'Raw Material Surcharge','',15),line(1,'Freight','TBD','TBD'),
 line('','** Current Lead-time: 12 weeks'),line(1,'not an item',999,999)
 ],'ABC-123');
 assert.equal(rows.length,5);
 assert.equal(rows[0].qty,'3');assert.equal(rows[0].lineTotal,'301');
 assert.match(rows[0].spec,/Upholstery: Red/);assert.match(rows[0].spec,/Built in sections/);
 assert.doesNotMatch(rows[1].spec,/Built in sections/);
 assert.equal(rows[2].model,'Q#ABC-123 / BGA-225');assert.doesNotMatch(rows[2].spec,/Booths|Red/);
 assert.equal(rows[3].price,'15');assert.equal(rows[4].price,'0');
 assert.ok(rows.every(r=>r.category==='Furniture'&&r.manufacturer==='Vitro'));
});
test('Vitro skips empty worksheets and keeps repeated page headers out of specifications',()=>{
 assert.equal(context.extractVitroRows([]).length,0);
 const rows=context.extractVitroRows([line('Quantity','Description'),line('','Model #A Chairs'),line(2,'Chair',10,20),line('Quantity','Description'),line(3,'Chair',10,30)]);
 assert.equal(rows.length,2);assert.equal(rows[1].model,'A');assert.doesNotMatch(rows[0].spec,/Description/);
});
test('main export remains eight columns and Vitro pricing export uses the net price of one unit',()=>{
 const c={normalizeItemIdentifier:String,converterMode:'vitro',normalizePrice:v=>String(v??''),editableRows:()=>[{item:'1',manufacturer:'Vitro',model:'LH-5',qty:'3',spec:'Booth',category:'Furniture',price:'100',lineTotal:'301'}]};vm.createContext(c);
 vm.runInContext(html.slice(html.indexOf('function buildExportRow('),html.indexOf('function savedProjectData(')),c);
 assert.deepEqual(Array.from(c.tableData()[0]),['D','1',0,'Vitro','LH-5','3','Booth',0]);
 assert.deepEqual(Array.from(c.categoryData()[0]),['Furniture',100]);
});
