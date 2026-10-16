import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import assert from 'node:assert/strict';import test from 'node:test';import {DatabaseSync} from 'node:sqlite';
const database=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())database.exec(fs.readFileSync('drizzle/'+f,'utf8'));
const DB={prepare(sql){return {bind(...args){return {first:async()=>database.prepare(sql).get(...args)||null,all:async()=>({results:database.prepare(sql).all(...args)}),run:async()=>database.prepare(sql).run(...args),sql,args};},first:async()=>database.prepare(sql).get()||null,sql,args:[]}},async batch(statements){database.exec('BEGIN');try{const result=statements.map(s=>database.prepare(s.sql).run(...s.args));database.exec('COMMIT');return result;}catch(e){database.exec('ROLLBACK');throw e;}}};
const stageAPI={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/stages.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:stageAPI});const API={};const blobs=new Map();const env={DB,BUCKET:{put:async(key,stream)=>blobs.set(key,await new Response(stream).arrayBuffer()),get:async key=>blobs.has(key)?{body:blobs.get(key)}:null,delete:async key=>blobs.delete(key)}};const transfer=[{id:'test-project',parent:null,kind:'folder',name:'Test Project',content:'',created:'2026-10-13T12:00:00.000Z'},...Array.from({length:9},(_,index)=>({id:'test-item-'+index,parent:'test-project',kind:'item',name:'Test equipment '+(index+1),content:'',itemnumber:String(index+1),manufacturer:'Example manufacturer',model:'TEST-'+(index+1),quantity:1,stage:'Pending quote',created:'2026-10-13T12:00:00.000Z'})),{id:'test-status',parent:null,kind:'status',name:'Pending quote',content:'',color:'#bc6454',created:'2026-10-13T12:00:00.000Z'}];
vm.runInNewContext(ts.transpileModule(fs.readFileSync('worker/pm-api.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports:API,require:n=>n==='../lib/stages'?stageAPI:transfer,Response,Request,FormData,File,crypto,URL});
const parent=transfer.find(r=>r.kind==='folder').id;const ids=transfer.filter(r=>r.kind==='item').slice(0,5).map(r=>r.id);
async function post(v,origin='https://combined.test'){const body=new FormData();if(v.kind==='status'||v.action==='deleteStatus')v={stage_scope:parent,...v};for(const [k,value]of Object.entries(v))body.set(k,value instanceof File?value:String(value));const r=await API.pmPost(new Request('https://combined.test/api/pm/entries',{method:'POST',headers:{origin},body}),env);return {status:r.status,body:await r.json()};}
test('migration imports source records once and preserves deletion',async()=>{await API.initializePM(env);assert.equal(database.prepare('SELECT count(*) AS n FROM entries').get().n,transfer.length);await API.initializePM(env);assert.equal(database.prepare('SELECT count(*) AS n FROM entries').get().n,transfer.length);});
test('bulk status and PO assignment updates only selected items',async()=>{assert.equal((await post({action:'bulkStatus',ids:JSON.stringify(ids),stage:'PO issued',po_number:'PO-1042'})).status,200);for(const id of ids){const row=database.prepare('SELECT stage,po_number FROM entries WHERE id=?').get(id);assert.equal(row.stage,'PO issued');assert.equal(row.po_number,'PO-1042');}assert.equal(database.prepare('SELECT count(*) AS n FROM entries WHERE stage=?').get('PO issued').n,5);});
test('shared note appears independently under every selected item',async()=>{assert.equal((await post({action:'bulkNote',ids:JSON.stringify(ids),content:'Received together on PO-1042',date:'2026-10-13'})).status,200);for(const id of ids)assert.equal(database.prepare("SELECT count(*) AS n FROM entries WHERE parent=? AND kind='note'").get(id).n,1);});
test('bulk operations validate all items before changing any record',async()=>{assert.equal((await post({action:'bulkStatus',ids:JSON.stringify([ids[0],'missing']),stage:'Installed'})).status,400);assert.equal(database.prepare('SELECT stage FROM entries WHERE id=?').get(ids[0]).stage,'PO issued');assert.equal((await post({action:'bulkNote',ids:JSON.stringify(ids),content:'',date:'2026-10-13'})).status,400);assert.equal((await post({action:'bulkStatus',ids:JSON.stringify(ids),stage:'Installed'},'https://attacker.test')).status,403);});
test('shop drawings and import edits keep PO, status, documents and notes',async()=>{assert.equal((await post({action:'metadata',id:ids[0],shop_drawings:'yes'})).status,200);const r=transfer.find(r=>r.id===ids[0]);assert.equal((await post({action:'edit',id:r.id,name:r.name,itemnumber:r.itemnumber,quantity:2,manufacturer:r.manufacturer,model:r.model})).status,200);const row=database.prepare('SELECT * FROM entries WHERE id=?').get(r.id);assert.equal(row.shop_drawings,'yes');assert.equal(row.po_number,'PO-1042');assert.equal(row.stage,'PO issued');assert.equal(database.prepare("SELECT count(*) AS n FROM entries WHERE parent=? AND kind='note'").get(r.id).n,1);assert.equal((await post({action:'metadata',id:r.id,shop_drawings:'bad'})).status,400);});
test('converter login protects PM page, APIs, files and static bundle',async()=>{const exp={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('worker/index.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports:exp,require:n=>n==='./pm-api'?API:{default:{fetch:async()=>new Response('ok')}},Response,Request,URL,crypto,TextEncoder,TextDecoder,btoa,atob});for(const path of ['/pm','/pm-bundle.js','/api/pm/entries','/api/pm/file?id=x']){const response=await exp.default.fetch(new Request('https://combined.test'+path),env,{});assert.equal(response.status,path.startsWith('/api/')?401:303);}});
test('bulk shop drawings updates every selected item and rejects invalid flags',async()=>{assert.equal((await post({action:'bulkDrawings',ids:JSON.stringify(ids),shop_drawings:'yes'})).status,200);for(const id of ids)assert.equal(database.prepare('SELECT shop_drawings FROM entries WHERE id=?').get(id).shop_drawings,'yes');assert.equal((await post({action:'bulkDrawings',ids:JSON.stringify(ids),shop_drawings:'maybe'})).status,400);assert.equal((await post({action:'bulkDrawings',ids:JSON.stringify(ids),shop_drawings:'no'})).status,200);for(const id of ids)assert.equal(database.prepare('SELECT shop_drawings FROM entries WHERE id=?').get(id).shop_drawings,'no');});
test('shared file is attached to every item and survives removal from one item',async()=>{assert.equal((await post({action:'bulkDocument',ids:JSON.stringify(ids),file:new File(['shared PDF contents'],'PO drawings.pdf',{type:'application/pdf'})})).status,200);const rows=database.prepare("SELECT * FROM entries WHERE kind='file'").all();assert.equal(rows.length,5);assert.equal(new Set(rows.map(r=>r.key)).size,1);for(const id of ids)assert.equal(rows.filter(r=>r.parent===id).length,1);const key=rows[0].key;assert.ok(blobs.has(key));assert.equal((await post({action:'delete',id:rows[0].id})).status,200);assert.ok(blobs.has(key));const download=await API.pmFile(new Request('https://combined.test/api/pm/file?id='+rows[1].id),env);assert.equal(download.status,200);assert.equal(await download.text(),'shared PDF contents');for(const row of rows.slice(1))assert.equal((await post({action:'delete',id:row.id})).status,200);assert.equal(blobs.has(key),false);});
test('shared HTTPS links appear on all targets; invalid target sets never upload files',async()=>{assert.equal((await post({action:'bulkDocument',ids:JSON.stringify(ids),name:'Shop drawings',url:'https://example.com/drawings'})).status,200);assert.equal(database.prepare("SELECT count(*) AS n FROM entries WHERE kind='link'").get().n,5);assert.equal((await post({action:'bulkDocument',ids:JSON.stringify(ids),name:'Unsafe',url:'javascript:alert(1)'})).status,400);const before=blobs.size;assert.equal((await post({action:'bulkDocument',ids:JSON.stringify([ids[0],'missing']),file:new File(['x'],'bad.pdf')})).status,400);assert.equal(blobs.size,before);});
test('saved project order persists and preserves item details and children',async()=>{const all=transfer.filter(r=>r.kind==='item').map(r=>r.id);const reversed=[...all].reverse();assert.equal((await post({action:'reorder',parent,ids:JSON.stringify(reversed)})).status,200);assert.deepEqual(database.prepare("SELECT id FROM entries WHERE parent=? AND kind='item' ORDER BY order_position").all(parent).map(r=>r.id),reversed);assert.equal(database.prepare('SELECT po_number FROM entries WHERE id=?').get(ids[0]).po_number,'PO-1042');assert.equal(database.prepare("SELECT count(*) AS n FROM entries WHERE parent=? AND kind='note'").get(ids[0]).n,1);assert.equal(database.prepare("SELECT count(*) AS n FROM entries WHERE parent=? AND kind='link'").get(ids[0]).n,1);assert.equal((await post({action:'reorder',parent,ids:JSON.stringify(reversed.slice(1))})).status,409);assert.equal((await post({action:'reorder',parent,ids:JSON.stringify([...reversed.slice(1),reversed[1]])})).status,400);assert.deepEqual(database.prepare("SELECT id FROM entries WHERE parent=? AND kind='item' ORDER BY order_position").all(parent).map(r=>r.id),reversed);});
test('up/down and drag ordering move one item without losing other rows',()=>{const exp={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/item-order.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exp});assert.equal(JSON.stringify(exp.moveItem(['a','b','c'],'a','c')),JSON.stringify(['b','c','a']));assert.equal(JSON.stringify(exp.moveItem(['a','b','c'],'c','b')),JSON.stringify(['a','c','b']));assert.equal(JSON.stringify(exp.moveItem(['a','b','c'],'missing','b')),JSON.stringify(['a','b','c']));const rows=[{id:'x',parent:'p',kind:'item',itemnumber:'10'},{id:'y',parent:'p',kind:'item',itemnumber:'2'},{id:'z',parent:'p',kind:'item',itemnumber:'20',order_position:0}];assert.equal(JSON.stringify(exp.orderedItems(rows,'p').map(r=>r.id)),JSON.stringify(['z','y','x']));});
test('renaming built-in and custom stages updates existing items without restoring old labels',async()=>{assert.equal((await post({action:'create',id:'po-stage',kind:'status',name:'Waiting drawings',content:'PO issued',color:'#aabbcc'})).status,200);for(const id of ids)assert.equal(database.prepare('SELECT stage FROM entries WHERE id=?').get(id).stage,'Waiting drawings');assert.equal((await post({action:'edit',id:'po-stage',name:'Order sent',content:'PO issued',color:'#112233'})).status,200);for(const id of ids)assert.equal(database.prepare('SELECT stage FROM entries WHERE id=?').get(id).stage,'Order sent');assert.equal((await post({action:'create',kind:'status',name:'Order sent',color:'#112233'})).status,409);const exp={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/stages.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports:exp,require:()=>({})});const stages=exp.statusesFor(database.prepare("SELECT * FROM entries WHERE kind='status'").all(),'quoting');assert.equal(stages.filter(s=>s.name==='Order sent').length,1);assert.equal(stages.filter(s=>s.name==='PO issued').length,0);assert.equal(stages.find(s=>s.name==='Order sent').color,'#112233');});

test('deleting renamed/default/custom stages transfers items and stays deleted',async()=>{assert.equal((await post({action:'deleteStatus',name:'Order sent',replacement:'Quoted'})).status,200);for(const id of ids)assert.equal(database.prepare('SELECT stage FROM entries WHERE id=?').get(id).stage,'Quoted');let active=stageAPI.statusesFor(database.prepare("SELECT * FROM entries WHERE kind IN ('status','status_removed')").all(),'quoting');assert.ok(!active.some(s=>s.name==='Order sent'||s.name==='PO issued'));assert.equal((await post({action:'deleteStatus',name:'Quoted',replacement:'Quoted'})).status,400);assert.equal((await post({action:'deleteStatus',name:'Quoted',replacement:'Missing'})).status,400);assert.equal((await post({action:'create',kind:'status',id:'custom-stage',name:'Reviewing',color:'#aabbcc'})).status,200);assert.equal((await post({action:'deleteStatus',name:'Reviewing',replacement:'Quoted'})).status,200);assert.equal(database.prepare('SELECT id FROM entries WHERE id=?').get('custom-stage'),undefined);assert.equal((await post({action:'deleteStatus',name:'Installed',replacement:'Quoted'})).status,200);active=stageAPI.statusesFor(database.prepare("SELECT * FROM entries WHERE kind IN ('status','status_removed')").all(),'quoting');assert.ok(!active.some(s=>s.name==='Installed'));assert.equal((await post({action:'create',kind:'status',name:'Installed',color:'#123456'})).status,200);active=stageAPI.statusesFor(database.prepare("SELECT * FROM entries WHERE kind IN ('status','status_removed')").all(),'quoting');assert.equal(active.filter(s=>s.name==='Installed').length,1);assert.equal(database.prepare('SELECT po_number FROM entries WHERE id=?').get(ids[0]).po_number,'PO-1042');});

test('stages are shared within job groups with nested rename/delete and isolated quoting/awarded settings',async()=>{
 for(const [job,category] of [['quote-two','quoting'],['award-one','awarded'],['award-two','awarded']])assert.equal((await post({kind:'folder',id:job,name:job,job_category:category})).status,200);
 for(const job of ['quote-two','award-one','award-two']){
  assert.equal((await post({kind:'folder',id:job+'-sub',parent:job,name:'Nested'})).status,200);
  assert.equal((await post({kind:'item',id:job+'-item',parent:job+'-sub',name:'Equipment',itemnumber:'1',stage:'Quoted'})).status,200);
 }
 assert.equal((await post({kind:'status',id:'quote-review',name:'Quote review',content:'Quoted',stage_scope:'quoting',color:'#123456'})).status,200);
 assert.equal(database.prepare('SELECT stage FROM entries WHERE id=?').get('quote-two-item').stage,'Quote review');
 assert.equal(database.prepare('SELECT stage FROM entries WHERE id=?').get('award-one-item').stage,'Quoted');
 assert.equal((await post({kind:'status',id:'award-review',name:'Award review',content:'Quoted',stage_scope:'awarded',color:'#654321'})).status,200);
 for(const job of ['award-one','award-two'])assert.equal(database.prepare('SELECT stage FROM entries WHERE id=?').get(job+'-item').stage,'Award review');
 assert.equal((await post({action:'edit',id:'award-review',name:'Ready for production',content:'Quoted',color:'#334455'})).status,200);
 let rows=database.prepare('SELECT * FROM entries').all();assert.equal(stageAPI.projectScope(rows,'award-two-item'),'awarded');
 assert.equal(stageAPI.statusesFor(rows,'awarded').find(s=>s.content==='Quoted').color,'#334455');
 assert.ok(stageAPI.statusesFor(rows,'quoting').some(s=>s.name==='Quote review'));
 assert.equal((await post({action:'deleteStatus',name:'Ready for production',replacement:'Pending quote',stage_scope:'awarded'})).status,200);
 for(const job of ['award-one','award-two'])assert.equal(database.prepare('SELECT stage FROM entries WHERE id=?').get(job+'-item').stage,'Pending quote');
 assert.equal(database.prepare('SELECT stage FROM entries WHERE id=?').get('quote-two-item').stage,'Quote review');
 assert.equal((await post({action:'jobCategory',id:'quote-two',job_category:'awarded'})).status,200);
 rows=database.prepare('SELECT * FROM entries').all();assert.equal(stageAPI.projectScope(rows,'quote-two-item'),'awarded');
 assert.equal(database.prepare('SELECT stage FROM entries WHERE id=?').get('quote-two-item').stage,'Awarded');
 assert.equal((await post({action:'jobCategory',id:parent,job_category:'bad'})).status,400);
});

test('project document uploads retain their section, filename, bytes and revisions',async()=>{
 for(const section of ['drawings','specifications','schedule','quote']){
  const payload=section==='drawings'?new Uint8Array(10019463):new TextEncoder().encode('Project '+section);
  const id='project-upload-'+section;
  const result=await post({id,kind:'file',parent,content:'project-document:'+section,file:new File([payload],section+'.pdf',{type:'application/pdf'})});
  assert.equal(result.status,200,JSON.stringify(result.body));
  const entry=database.prepare('SELECT * FROM entries WHERE id=?').get(id);
  assert.equal(entry.parent,parent);assert.equal(entry.content,'project-document:'+section);assert.equal(entry.name,section+'.pdf');assert.equal(entry.size,payload.length);
  const download=await API.pmFile(new Request('https://combined.test/api/pm/file?id='+id),env);assert.equal(download.status,200);assert.equal((await download.arrayBuffer()).byteLength,payload.length);
 }
 assert.equal((await post({id:'drawing-revision',kind:'file',parent,content:'project-document:drawings',file:new File(['revision 2'],'drawings.pdf')})).status,200);
 assert.equal(database.prepare("SELECT count(*) n FROM entries WHERE parent=? AND content='project-document:drawings'").get(parent).n,2);
});

test('item quote PO and drawing files persist and can be reclassified without losing bytes',async()=>{
 for(const section of ['quote','po','drawings']){
  const id='item-doc-'+section;
  const result=await post({id,kind:'file',parent:ids[0],content:'item-document:'+section,file:new File(['item bytes'],section+'.pdf',{type:'application/pdf'})});
  assert.equal(result.status,200,JSON.stringify(result.body));
  const row=database.prepare('SELECT * FROM entries WHERE id=?').get(id);assert.equal(row.content,'item-document:'+section);assert.equal(row.parent,ids[0]);
  assert.equal((await post({action:'edit',id,name:row.name,content:'item-document:drawings'})).status,200);
  const updated=database.prepare('SELECT * FROM entries WHERE id=?').get(id);assert.equal(updated.key,row.key);assert.equal(updated.content,'item-document:drawings');
  const file=await API.pmFile(new Request('https://combined.test/api/pm/file?id='+id),env);assert.equal(await file.text(),'item bytes');
 }
});

  test('shared-stage migration consolidates existing job settings and reconciles renamed item stages',()=>{
 const db=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&!f.startsWith('0008')).sort())db.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 const insert=db.prepare('INSERT INTO entries (id,owner,parent,kind,name,content,color,created,stage_scope,job_category,stage) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
 for(const [id,category] of [['q','quoting'],['a','awarded'],['b','awarded']])insert.run(id,'test',null,'folder',id,null,null,'2026-01-01',null,category,null);
 insert.run('older','test',null,'status','Old award review','Quoted','#111111','2026-01-01','a',null,null);
 insert.run('newer','test',null,'status','Award review','Quoted','#222222','2026-02-01','b',null,null);
 insert.run('quote-custom','test',null,'status','Quote approval','Quoted','#333333','2026-03-01','q',null,null);
 insert.run('deleted','test',null,'status_removed','Installed','Installed',null,'2026-01-01','a',null,null);
 insert.run('item-a','test','a','item','Equipment',null,null,'2026-01-01',null,null,'Old award review');
 db.exec(fs.readFileSync('drizzle/0008_shared_job_group_stages.sql','utf8'));
 const rows=db.prepare('SELECT * FROM entries').all();const award=stageAPI.statusesFor(rows,'awarded'),quote=stageAPI.statusesFor(rows,'quoting');
 assert.equal(award.filter(s=>(s.content||s.name)==='Quoted').length,1);assert.equal(award.find(s=>s.content==='Quoted').name,'Award review');
 assert.equal(quote.find(s=>s.content==='Quoted').name,'Quote approval');assert.ok(!award.some(s=>s.name==='Installed'));
 assert.equal(db.prepare('SELECT stage FROM entries WHERE id=?').get('item-a').stage,'Award review');assert.ok(db.prepare('SELECT id FROM entries WHERE id=?').get('older'));db.close();
});

test('duplicate item numbers create independent items and can be edited without merging children',async()=>{
 for(const id of ['same-one','same-two'])assert.equal((await post({kind:'item',id,parent,name:id,itemnumber:'DUP-1',quote_number:'Q-'+id})).status,200);
 assert.equal((await post({kind:'note',id:'same-note',parent:'same-one',name:'Update',content:'Only first item',date:'2026-10-14'})).status,200);
 assert.equal((await post({action:'edit',id:'same-two',name:'Second revised',itemnumber:'DUP-1',manufacturer:'Second maker'})).status,200);
 assert.equal(database.prepare('SELECT count(*) n FROM entries WHERE parent=? AND itemnumber=?').get(parent,'DUP-1').n,2);
 assert.equal(database.prepare('SELECT parent FROM entries WHERE id=?').get('same-note').parent,'same-one');
 assert.equal(database.prepare('SELECT name FROM entries WHERE id=?').get('same-one').name,'same-one');
 assert.equal(database.prepare('SELECT quote_number FROM entries WHERE id=?').get('same-two').quote_number,'Q-same-two');
});

test('quote numbers support individual and bulk edits independently from PO numbers',async()=>{
 const selected=['same-one','same-two'];
 assert.equal((await post({action:'metadata',id:selected[0],po_number:'PO-retained',quote_number:'Q-individual'})).status,200);
 assert.equal((await post({action:'bulkQuote',ids:JSON.stringify(selected),quote_number:'Q-shared'})).status,200);
 for(const id of selected)assert.equal(database.prepare('SELECT quote_number FROM entries WHERE id=?').get(id).quote_number,'Q-shared');
 assert.equal(database.prepare('SELECT po_number FROM entries WHERE id=?').get(selected[0]).po_number,'PO-retained');
 assert.equal((await post({action:'bulkStatus',ids:JSON.stringify(selected),stage:'Quoted',quote_number:'Q-status'})).status,200);
 assert.equal((await post({action:'metadata',id:selected[0],quote_number:'x'.repeat(101)})).status,400);
 assert.equal((await post({action:'bulkQuote',ids:JSON.stringify(selected),quote_number:''})).status,200);
 assert.equal(database.prepare('SELECT quote_number FROM entries WHERE id=?').get(selected[0]).quote_number,null);
 assert.equal(database.prepare('SELECT po_number FROM entries WHERE id=?').get(selected[0]).po_number,'PO-retained');
});

test('spreadsheet duplicates match distinct records and extra rows stay new',()=>{
 const imp={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/equipment-import.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:imp});
 const parsed=imp.parseEquipmentRows([['1',1,'Hood','A','M'],['1',2,'Sink','B','N'],['1',3,'Table','C','O']]);assert.equal(parsed.errors.length,0);assert.equal(parsed.rows.length,3);
 const existing=[{id:'sink',kind:'item',parent:'job',itemnumber:'1',name:'Sink',manufacturer:'B',model:'N'},{id:'hood',kind:'item',parent:'job',itemnumber:'1',name:'Hood',manufacturer:'A',model:'M'}];
 const matches=imp.matchEquipmentRows(parsed.rows,existing,'job');assert.equal(matches[0].id,'hood');assert.equal(matches[1].id,'sink');assert.equal(matches[2],undefined);
});

test('quote-number migration preserves quoting references without changing awarded PO numbers',()=>{
 const db=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&!f.startsWith('0009')).sort())db.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 db.exec("INSERT INTO entries(id,owner,kind,name,created,job_category) VALUES ('q','test','folder','Quote job','now','quoting'),('a','test','folder','Award job','now','awarded'); INSERT INTO entries(id,owner,parent,kind,name,created,po_number) VALUES ('qi','test','q','item','Quote item','now','Q-existing'),('ai','test','a','item','Award item','now','PO-existing');");
 db.exec(fs.readFileSync('drizzle/0009_item_quote_numbers.sql','utf8'));
 assert.equal(db.prepare('SELECT quote_number FROM entries WHERE id=?').get('qi').quote_number,'Q-existing');
 const award=db.prepare('SELECT quote_number,po_number FROM entries WHERE id=?').get('ai');assert.equal(award.quote_number,null);assert.equal(award.po_number,'PO-existing');db.close();
});

test('moving quoting jobs to awarded initializes nested items once and preserves their references and children',async()=>{
 assert.equal((await post({kind:'folder',id:'award-transition',name:'Transition',job_category:'quoting'})).status,200);
 assert.equal((await post({kind:'folder',id:'award-transition-sub',parent:'award-transition',name:'Nested'})).status,200);
 for(const [id,parentId] of [['transition-first','award-transition'],['transition-nested','award-transition-sub']])assert.equal((await post({kind:'item',id,parent:parentId,itemnumber:'1',name:id,stage:'Quoted',quote_number:'Q-keep',po_number:'PO-keep'})).status,200);
 assert.equal((await post({kind:'note',id:'transition-note',parent:'transition-first',name:'History',content:'Keep history',date:'2026-10-14'})).status,200);
 assert.equal((await post({action:'jobCategory',id:'award-transition',job_category:'awarded'})).status,200);
 for(const id of ['transition-first','transition-nested']){const row=database.prepare('SELECT * FROM entries WHERE id=?').get(id);assert.equal(row.stage,'Awarded');assert.equal(row.quote_number,'Q-keep');assert.equal(row.po_number,'PO-keep');}
 assert.equal(database.prepare('SELECT parent FROM entries WHERE id=?').get('transition-note').parent,'transition-first');
 assert.equal((await post({action:'status',id:'transition-first',stage:'Pending submittals'})).status,200);
 assert.equal((await post({action:'jobCategory',id:'award-transition',job_category:'awarded'})).status,200);
 assert.equal(database.prepare('SELECT stage FROM entries WHERE id=?').get('transition-first').stage,'Pending submittals');
});

test('awarding honors renamed Awarded stage and restores it if removed',async()=>{
 assert.equal((await post({kind:'status',id:'award-renamed',stage_scope:'awarded',name:'Contract awarded',content:'Awarded',color:'#123456'})).status,200);
 assert.equal((await post({kind:'folder',id:'award-edit-job',name:'Edit move',job_category:'quoting'})).status,200);
 assert.equal((await post({kind:'item',id:'award-edit-item',parent:'award-edit-job',name:'Equipment',itemnumber:'1',stage:'Quoted'})).status,200);
 assert.equal((await post({action:'edit',id:'award-edit-job',name:'Edit move',job_category:'awarded'})).status,200);
 assert.equal(database.prepare('SELECT stage FROM entries WHERE id=?').get('award-edit-item').stage,'Contract awarded');
 assert.equal((await post({action:'deleteStatus',stage_scope:'awarded',name:'Contract awarded',replacement:'Pending quote'})).status,200);
 assert.equal((await post({action:'jobCategory',id:'award-edit-job',job_category:'quoting'})).status,200);
 assert.equal((await post({action:'jobCategory',id:'award-edit-job',job_category:'awarded'})).status,200);
 assert.equal(database.prepare('SELECT stage FROM entries WHERE id=?').get('award-edit-item').stage,'Awarded');
 assert.ok(stageAPI.statusesFor(database.prepare('SELECT * FROM entries').all(),'awarded').some(s=>s.name==='Awarded'));
});

test('stage order persists by group, validates complete lists, and survives renames without changing item stages',async()=>{
 const rows=()=>database.prepare('SELECT * FROM entries').all();const names=stageAPI.statusesFor(rows(),'awarded').map(s=>s.name).reverse();const quoteBefore=stageAPI.statusesFor(rows(),'quoting').map(s=>s.name).join('|');const itemBefore=database.prepare('SELECT stage FROM entries WHERE id=?').get('transition-first').stage;
 assert.equal((await post({action:'reorderStatuses',stage_scope:'awarded',names:JSON.stringify(names)})).status,200);
 assert.equal(stageAPI.statusesFor(rows(),'awarded').map(s=>s.name).join('|'),names.join('|'));
 assert.equal(stageAPI.statusesFor(rows(),'quoting').map(s=>s.name).join('|'),quoteBefore);
 assert.equal(database.prepare('SELECT stage FROM entries WHERE id=?').get('transition-first').stage,itemBefore);
 assert.equal((await post({action:'reorderStatuses',stage_scope:'awarded',names:JSON.stringify(names.slice(1))})).status,409);
 assert.equal((await post({action:'reorderStatuses',stage_scope:'awarded',names:JSON.stringify([names[0],names[0]])})).status,400);
 const first=stageAPI.statusesFor(rows(),'awarded')[0];assert.equal((await post({action:'edit',id:first.id,name:'First stage renamed',content:first.content,color:first.color})).status,200);
 assert.equal(stageAPI.statusesFor(rows(),'awarded')[0].name,'First stage renamed');
});

test('shipping destination and receiving date persist and survive unrelated item edits',async()=>{
 assert.equal((await post({kind:'item',id:'shipping-item',parent:'award-one',name:'Shipped item',itemnumber:'S1',shipping_destination:'warehouse',expected_receiving_date:'2026-11-15',quote_number:'Q-shipping',po_number:'PO-shipping'})).status,200);
 let row=database.prepare('SELECT * FROM entries WHERE id=?').get('shipping-item');assert.equal(row.shipping_destination,'warehouse');assert.equal(row.expected_receiving_date,'2026-11-15');
 assert.equal((await post({action:'edit',id:'shipping-item',name:'Revised shipped item',itemnumber:'S1',manufacturer:'Maker'})).status,200);
 row=database.prepare('SELECT * FROM entries WHERE id=?').get('shipping-item');assert.equal(row.shipping_destination,'warehouse');assert.equal(row.expected_receiving_date,'2026-11-15');assert.equal(row.quote_number,'Q-shipping');assert.equal(row.po_number,'PO-shipping');
 assert.equal((await post({action:'metadata',id:'shipping-item',shipping_destination:'job_site',expected_receiving_date:'2026-12-01'})).status,200);
 row=database.prepare('SELECT * FROM entries WHERE id=?').get('shipping-item');assert.equal(row.shipping_destination,'job_site');assert.equal(row.expected_receiving_date,'2026-12-01');
 for(const destination of ['fabricator','installer']){assert.equal((await post({action:'metadata',id:'shipping-item',shipping_destination:destination})).status,200);assert.equal(database.prepare('SELECT shipping_destination FROM entries WHERE id=?').get('shipping-item').shipping_destination,destination);}
 assert.equal((await post({action:'metadata',id:'shipping-item',shipping_destination:'',expected_receiving_date:''})).status,200);
 row=database.prepare('SELECT * FROM entries WHERE id=?').get('shipping-item');assert.equal(row.shipping_destination,null);assert.equal(row.expected_receiving_date,null);
});

test('shipping validation rejects invalid destinations and calendar dates before saving',async()=>{
 for(const values of [{shipping_destination:'elsewhere'},{expected_receiving_date:'2026-02-30'},{expected_receiving_date:'11/15/2026'},{expected_receiving_date:'bad'}])assert.equal((await post({action:'metadata',id:'shipping-item',...values})).status,400);
 const row=database.prepare('SELECT * FROM entries WHERE id=?').get('shipping-item');assert.equal(row.shipping_destination,null);assert.equal(row.expected_receiving_date,null);
});

test('bulk shipping updates only selected items and validates the whole request',async()=>{
 for(const id of ['ship-one','ship-two','ship-three'])assert.equal((await post({kind:'item',id,parent:'award-one',name:id,itemnumber:'Ship'})).status,200);
 const selected=JSON.stringify(['ship-one','ship-two']);
 assert.equal((await post({action:'bulkShipping',ids:selected,shipping_destination:'warehouse',expected_receiving_date:'2026-11-20'})).status,200);
 for(const id of ['ship-one','ship-two']){const row=database.prepare('SELECT * FROM entries WHERE id=?').get(id);assert.equal(row.shipping_destination,'warehouse');assert.equal(row.expected_receiving_date,'2026-11-20');}
 assert.equal(database.prepare('SELECT shipping_destination FROM entries WHERE id=?').get('ship-three').shipping_destination,null);
 assert.equal((await post({action:'bulkShipping',ids:selected,shipping_destination:'job_site',expected_receiving_date:'2026-02-30'})).status,400);
 assert.equal(database.prepare('SELECT shipping_destination FROM entries WHERE id=?').get('ship-one').shipping_destination,'warehouse');
 for(const destination of ['fabricator','installer']){assert.equal((await post({action:'bulkShipping',ids:selected,shipping_destination:destination})).status,200);for(const id of ['ship-one','ship-two'])assert.equal(database.prepare('SELECT shipping_destination FROM entries WHERE id=?').get(id).shipping_destination,destination);}
});

test('board moves atomically update stage and manual ranks without changing shipping or child records',async()=>{
 const groupRows=database.prepare('SELECT * FROM entries').all();const active=stageAPI.statusesFor(groupRows,'awarded');const stage=active[0].name;
 const ids=database.prepare("SELECT id FROM entries WHERE kind='item' AND parent='award-one'").all().map(i=>i.id).reverse();
 const before=database.prepare('SELECT shipping_destination,expected_receiving_date FROM entries WHERE id=?').get('ship-one');
 assert.equal((await post({action:'boardMove',id:'ship-one',parent:'award-one',stage,ids:JSON.stringify(ids)})).status,200);
 assert.equal(database.prepare('SELECT stage FROM entries WHERE id=?').get('ship-one').stage,stage);
 assert.equal(database.prepare("SELECT id FROM entries WHERE kind='item' AND parent='award-one' ORDER BY order_position").all().map(i=>i.id).join(','),ids.join(','));
 const after=database.prepare('SELECT shipping_destination,expected_receiving_date FROM entries WHERE id=?').get('ship-one');assert.equal(after.shipping_destination,before.shipping_destination);assert.equal(after.expected_receiving_date,before.expected_receiving_date);
 const snapshot=JSON.stringify(database.prepare("SELECT id,stage,order_position FROM entries WHERE parent='award-one' ORDER BY id").all());
 for(const values of [{stage:'Not an active stage',ids},{stage,ids:ids.slice(1)},{stage,ids:ids.map((v,index)=>index===0?'same-one':v)}])assert.notEqual((await post({action:'boardMove',id:'ship-one',parent:'award-one',stage:values.stage,ids:JSON.stringify(values.ids)})).status,200);
 assert.equal(JSON.stringify(database.prepare("SELECT id,stage,order_position FROM entries WHERE parent='award-one' ORDER BY id").all()),snapshot);
 assert.equal((await post({action:'boardMove',id:'same-one',parent:'award-one',stage,ids:JSON.stringify(ids)})).status,400);
});

test('drawing review states persist independently per file and never change equipment stage or bytes',async()=>{
 const id='drawing-review-test';assert.equal((await post({id,kind:'file',parent:ids[0],content:'item-document:drawings',file:new File(['review bytes'],'drawing.pdf',{type:'application/pdf'})})).status,200);
 const item=database.prepare('SELECT * FROM entries WHERE id=?').get(ids[0]);const file=database.prepare('SELECT * FROM entries WHERE id=?').get(id);
 for(const stage of ['unsigned','revisions_needed','approved']){assert.equal((await post({action:'drawingStatus',id,stage})).status,200);assert.equal(database.prepare('SELECT stage FROM entries WHERE id=?').get(id).stage,stage);}
 assert.equal((await post({action:'drawingStatus',id,stage:'invalid'})).status,400);assert.equal(database.prepare('SELECT stage FROM entries WHERE id=?').get(id).stage,'approved');
 assert.equal((await post({action:'drawingStatus',id:ids[0],stage:'approved'})).status,400);
 assert.equal(database.prepare('SELECT stage FROM entries WHERE id=?').get(ids[0]).stage,item.stage);assert.equal(database.prepare('SELECT key FROM entries WHERE id=?').get(id).key,file.key);
 assert.equal(await (await API.pmFile(new Request('https://combined.test/api/pm/file?id='+id),env)).text(),'review bytes');
});

test('awarding removes only Not carried items and descendants, retaining other projects and shared files',async()=>{
 for(const action of ['jobCategory','edit']){
  const root='not-carried-'+action,drop=root+'-drop',keep=root+'-keep',other=root+'-other';
  await post({id:root,kind:'folder',name:root,job_category:'quoting'});await post({id:root+'-nested',kind:'folder',name:'Nested',parent:root});await post({id:other,kind:'folder',name:other,job_category:'quoting'});
  for(const [id,parentId,stage] of [[drop,root+'-nested','4). Not Carried'],[keep,root+'-nested','Quoted'],[other+'-item',other,'Not carried']])assert.equal((await post({id,kind:'item',parent:parentId,name:'Equipment',itemnumber:'1',stage,quote_number:'Q-keep'})).status,200);
  await post({id:drop+'-note',parent:drop,kind:'note',name:'History',content:'Removed item note',date:'2026-10-15'});
  await post({id:drop+'-folder',parent:drop,kind:'folder',name:'Drawings'});
  await post({id:drop+'-file',parent:drop+'-folder',kind:'file',file:new File(['unique bytes'],'unique.pdf')});
  const uniqueKey=database.prepare('SELECT key FROM entries WHERE id=?').get(drop+'-file').key;
  await post({action:'bulkDocument',ids:JSON.stringify([drop,keep]),document_section:'drawings',file:new File(['shared bytes'],'shared.pdf')});
  const sharedKey=database.prepare("SELECT key FROM entries WHERE parent=? AND kind='file'").get(drop).key;
  assert.equal((await post({action,id:root,name:root,job_category:'awarded'})).status,200);
  for(const id of [drop,drop+'-note',drop+'-folder',drop+'-file'])assert.equal(database.prepare('SELECT id FROM entries WHERE id=?').get(id),undefined);
  assert.equal(database.prepare('SELECT id FROM entries WHERE parent=?').get(drop),undefined);assert.equal(blobs.has(uniqueKey),false);assert.equal(blobs.has(sharedKey),true);
  assert.equal(database.prepare('SELECT quote_number FROM entries WHERE id=?').get(keep).quote_number,'Q-keep');assert.notEqual(database.prepare('SELECT stage FROM entries WHERE id=?').get(keep).stage,'Quoted');
  assert.equal(database.prepare('SELECT stage FROM entries WHERE id=?').get(other+'-item').stage,'Not carried');
  await post({action:'status',id:keep,stage:'Not carried'});await post({action,id:root,name:root,job_category:'awarded'});assert.ok(database.prepare('SELECT id FROM entries WHERE id=?').get(keep));
 }
});
test('shared documents save in each chosen item section for files and links and validate before uploading',async()=>{
 const parent='shared-sections';await post({id:parent,kind:'folder',name:'Shared sections'});const selected=['shared-first','shared-second'];for(const id of selected)await post({id,kind:'item',parent,name:'Equipment',itemnumber:'1'});
 for(const document_section of ['','quote','po','drawings'])for(const type of ['file','link']){
  const name=(document_section||'general')+'-'+type+'.pdf';const payload=type==='file'?{file:new File(['shared section bytes'],name)}:{name,url:'https://example.com/'+name};
  const result=await post({action:'bulkDocument',ids:JSON.stringify(selected),document_section,...payload});assert.equal(result.status,200,JSON.stringify(result.body));
  const rows=database.prepare('SELECT * FROM entries WHERE name=?').all(name);assert.equal(rows.length,2);for(const row of rows)assert.equal(row.content,document_section?'item-document:'+document_section:null);
  if(type==='file')assert.equal(new Set(rows.map(r=>r.key)).size,1);
 }
 const before=blobs.size;assert.equal((await post({action:'bulkDocument',ids:JSON.stringify(selected),document_section:'invalid',file:new File(['x'],'invalid.pdf')})).status,400);assert.equal(blobs.size,before);
});

test('AQ File text upserts per project separately from PDFs and notes and rejects item targets',async()=>{
 for(const id of ['aq-project-one','aq-project-two'])await post({kind:'folder',id,name:id});
 const content='AQ-123\nSecond line  <quote> & details';assert.equal((await post({action:'projectQuoteText',id:'aq-project-one',content})).status,200);
 const rows=()=>database.prepare("SELECT * FROM entries WHERE parent='aq-project-one' AND kind='project_text'").all();assert.equal(rows().length,1);assert.equal(rows()[0].content,content);
 assert.equal((await post({action:'projectQuoteText',id:'aq-project-one',content:'Updated'})).status,200);assert.equal(rows().length,1);assert.equal(rows()[0].content,'Updated');
 await post({action:'projectQuoteText',id:'aq-project-two',content:'Other project'});assert.equal((await post({action:'projectQuoteText',id:ids[0],content:'Wrong parent'})).status,400);
 assert.equal((await post({action:'projectQuoteText',id:'aq-project-one',content:'x'.repeat(20001)})).status,400);assert.equal(rows()[0].content,'Updated');
 await post({kind:'file',id:'aq-quote-pdf',parent:'aq-project-one',content:'project-document:quote',file:new File(['quote bytes'],'Quote.pdf')});await post({action:'projectQuoteText',id:'aq-project-one',content:''});assert.equal(rows()[0].content,'');assert.ok(database.prepare('SELECT id FROM entries WHERE id=?').get('aq-quote-pdf'));assert.equal(database.prepare("SELECT content FROM entries WHERE id='aq-file:aq-project-two'").get().content,'Other project');
});
