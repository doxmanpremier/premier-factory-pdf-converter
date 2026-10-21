import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import assert from 'node:assert/strict';import test from 'node:test';import {DatabaseSync} from 'node:sqlite';
const database=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())database.exec(fs.readFileSync('drizzle/'+f,'utf8'));
const DB={prepare(sql){return {bind(...args){return {first:async()=>database.prepare(sql).get(...args)||null,all:async()=>({results:database.prepare(sql).all(...args)}),run:async()=>database.prepare(sql).run(...args),sql,args};}};},async batch(statements){database.exec('BEGIN');try{const result=statements.map(s=>database.prepare(s.sql).run(...s.args));database.exec('COMMIT');return result;}catch(e){database.exec('ROLLBACK');throw e;}}};
const stageAPI={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/stages.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:stageAPI});
const API={},blobs=new Map(),env={DB,BUCKET:{put:async(key,bytes)=>blobs.set(key,bytes),delete:async key=>blobs.delete(key)}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('worker/gmail-api.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:API,require:n=>{if(n==='../lib/stages')return stageAPI;throw Error(n);},Response,Request,URL,crypto,TextEncoder,atob});
const origin='https://desk.test',token='a'.repeat(64),headers={origin,'Content-Type':'application/json'},insert=database.prepare('INSERT INTO entries (id,owner,parent,kind,name,itemnumber,created) VALUES (?,?,?,?,?,?,?)');
for(const [id,parent,kind,owner]of [['p',null,'folder','premier-workspace'],['q',null,'folder','premier-workspace'],['sub','p','folder','premier-workspace'],['a','p','item','premier-workspace'],['b','sub','item','premier-workspace'],['c','q','item','premier-workspace'],['foreign',null,'folder','someone-else'],['foreign-item','p','item','someone-else']])insert.run(id,owner,parent,kind,id,id,'2026-10-19T12:00:00Z');
async function connect(data,requestOrigin=origin){return API.gmailConnection(new Request(origin+'/api/pm/gmail-connection',{method:'POST',headers:{...headers,origin:requestOrigin},body:JSON.stringify(data)}),env);}
async function api(path,data,credential=token){return API.gmailAPI(new Request(origin+'/api/pm/gmail/'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+credential},...(data?{body:JSON.stringify(data)}:{})}),env);}
const message={id:'<fixture@example.com>',subject:'Power requirements',from:'Sender <sender@example.com>',to:'Recipient <recipient@example.com>',body:'Please highlight required power and amperage. <script>literal text</script>',date:'2026-10-19T10:30:00Z',url:'https://mail.google.com/mail/u/0/#all/fixture',attachments:[{name:'spec.txt',mime:'text/plain',base64:btoa('fixture')} ]};
test('Gmail pairing requires session-route origin and bearer secret, reveals only permitted item metadata',async()=>{
 const hash=await API.gmailHash(token);assert.equal((await connect({action:'connect',hash},'https://attacker.test')).status,403);assert.equal((await api('projects')).status,401);
 assert.equal((await connect({action:'connect',hash:'invalid'})).status,400);assert.equal((await connect({action:'connect',hash})).status,200);
 assert.equal(database.prepare('SELECT id FROM pm_meta WHERE id=?').get('gmail-connection:'+hash).id.includes(token),false);
 assert.equal((await api('projects',null,hash)).status,401);
 const projects=await (await api('projects')).json();assert.deepEqual(projects.map(p=>p.id),['p','q']);
 const items=await (await api('items?project=p')).json();assert.deepEqual(items.map(i=>i.id),['a','b']);assert.equal(items[0].content,undefined);assert.equal((await api('items?project=foreign')).status,404);
});
test('Gmail log validates whole selection before writes, saves independent dated copies and deduplicates retries',async()=>{
 const payload={project:'p',items:['a','b'],message};
 for(const items of [[],['a','a'],['a','c'],['a','missing'],['foreign-item']]){assert.equal((await api('log',{...payload,items})).status,400);assert.equal(blobs.size,0);}
 assert.equal((await api('log',{...payload,message:{...message,date:'invalid'}})).status,400);
 assert.equal((await api('log',{...payload,message:{...message,attachments:[{name:'bad',mime:'text/plain',base64:'invalid'}]}})).status,400);
 const result=await (await api('log',payload)).json();assert.equal(result.added,2);assert.equal(blobs.size,2);
 const emails=database.prepare("SELECT * FROM entries WHERE kind='email' ORDER BY parent").all();assert.deepEqual(emails.map(e=>e.parent),['a','b']);assert.equal(emails[0].created,new Date(message.date).toISOString());assert.equal(JSON.parse(emails[0].content).body,message.body);
 assert.equal((await (await api('log',payload)).json()).added,0);assert.equal(blobs.size,2);
 assert.equal((await api('log',{...payload,message:{...message,body:'Do not overwrite'}})).status,200);assert.equal(JSON.parse(database.prepare('SELECT content FROM entries WHERE id=?').get(emails[0].id).content).body,message.body);
});
test('Gmail attachment failure cleans uploaded bytes and never inserts partial emails',async()=>{
 let count=0;const broken={...env,BUCKET:{...env.BUCKET,put:async(key,bytes)=>{if(++count===2)throw Error('fixture failure');blobs.set(key,bytes);}}},before=blobs.size;
 const data={project:'p',items:['a','b'],message:{...message,id:'<failure@example.com>'}};
 const response=await API.gmailAPI(new Request(origin+'/api/pm/gmail/log',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(data)}),broken);
 assert.equal(response.status,500);assert.equal(blobs.size,before);assert.equal(database.prepare("SELECT count(*) n FROM entries WHERE kind='email'").get().n,2);
});
test('Gmail item stages show current values and stage changes validate complete scope without logging email',async()=>{
 database.prepare("UPDATE entries SET stage='Quoted' WHERE id IN ('a','b','c')").run();
 database.prepare("INSERT INTO entries (id,owner,kind,name,content,stage_scope,created) VALUES ('custom-stage','premier-workspace','status','Waiting on power','Waiting on power','quoting','2026-10-19')").run();
 database.prepare("INSERT INTO entries (id,owner,kind,name,content,stage_scope,created) VALUES ('removed-stage','premier-workspace','status_removed','Installed','Installed','quoting','2026-10-19')").run();
 const items=await (await api('items?project=p')).json();assert.equal(items[0].stage,'Quoted');
 const stages=await (await api('stages?project=p')).json();assert.ok(stages.some(s=>s.name==='Waiting on power'));assert.ok(!stages.some(s=>s.name==='Installed'));assert.equal((await api('stages?project=foreign')).status,404);
 const before=database.prepare("SELECT count(*) n FROM entries WHERE kind='email'").get().n;
 for(const selection of [[],['a','a'],['a','c'],['a','foreign-item']])assert.equal((await api('stage',{project:'p',items:selection,stage:'Waiting on power'})).status,400);
 for(const stage of ['Installed','Not a stage'])assert.equal((await api('stage',{project:'p',items:['a','b'],stage})).status,400);
 assert.equal(database.prepare("SELECT stage FROM entries WHERE id='a'").get().stage,'Quoted');
 assert.equal((await api('stage',{project:'p',items:['a','b'],stage:'Waiting on power'})).status,200);
 assert.equal(database.prepare("SELECT stage FROM entries WHERE id='a'").get().stage,'Waiting on power');assert.equal(database.prepare("SELECT stage FROM entries WHERE id='b'").get().stage,'Waiting on power');assert.equal(database.prepare("SELECT stage FROM entries WHERE id='c'").get().stage,'Quoted');assert.equal(database.prepare("SELECT count(*) n FROM entries WHERE kind='email'").get().n,before);
});
test('conversation locations recognize older reply references, isolate threads and follow current item ancestry',async()=>{
 const lookup=data=>api('locations',data);
 assert.equal((await api('locations',{threadId:'t',messageIds:[]},'bad')).status,401);
 assert.equal((await lookup({threadId:'',messageIds:[]})).status,400);
 assert.equal((await lookup({threadId:'t',messageIds:Array(101).fill('x')})).status,400);
 assert.deepEqual(await (await lookup({threadId:'unrelated',messageIds:[]})).json(),[]);
 const legacy=await (await lookup({threadId:'reply-thread',messageIds:[message.id]})).json();
 assert.equal(legacy[0].name,'p');assert.deepEqual(legacy[0].items.map(i=>i.id).sort(),['a','b']);assert.equal(legacy[0].items[0].content,undefined);
 assert.equal((await api('log',{project:'q',items:['c'],message:{...message,id:'thread-new',threadId:'thread-f:12345',attachments:[]}})).status,200);
 let matched=await (await lookup({threadId:'thread-f:12345',messageIds:[]})).json();assert.equal(matched[0].id,'q');
 const second='b'.repeat(64);await connect({action:'connect',hash:await API.gmailHash(second)});
 assert.deepEqual(await (await api('locations',{threadId:'thread-f:12345',messageIds:[]},second)).json(),[]);
 database.prepare("UPDATE entries SET parent='p' WHERE id='c'").run();
 matched=await (await lookup({threadId:'thread-f:12345',messageIds:[]})).json();assert.equal(matched[0].id,'p');
 database.prepare("DELETE FROM entries WHERE kind='email' AND parent='c'").run();
 database.prepare("UPDATE entries SET parent='q' WHERE id='c'").run();
 assert.deepEqual(await (await lookup({threadId:'thread-f:12345',messageIds:[]})).json(),[]);
});
test('removing a saved email retains copies on other items; disconnect revokes access without deleting emails',async()=>{
 const email=database.prepare("SELECT id FROM entries WHERE kind='email' AND parent='a'").get();
 const remove=(id,requestOrigin=origin)=>API.removeEmail(new Request(origin+'/api/pm/email',{method:'POST',headers:{...headers,origin:requestOrigin},body:JSON.stringify({id})}),env);
 assert.equal((await remove(email.id,'https://attacker.test')).status,403);assert.equal((await remove('a')).status,404);
 assert.equal((await remove(email.id)).status,200);assert.equal(blobs.size,1);assert.equal(database.prepare("SELECT count(*) n FROM entries WHERE kind='email' AND parent='b'").get().n,1);
 assert.equal((await connect({action:'disconnect'})).status,200);assert.equal((await api('projects')).status,401);assert.equal(database.prepare("SELECT count(*) n FROM entries WHERE kind='email'").get().n,1);
});
test('Gmail routes have a separate narrow bearer boundary and destructive connection routes require normal login',()=>{
 const worker=fs.readFileSync('worker/index.ts','utf8'),auth=worker.indexOf('if (!(await isAuthenticated(request, env)))');assert.ok(worker.indexOf("if (url.pathname.startsWith('/api/pm/gmail/')) return gmailAPI(request,env)")<auth);assert.ok(worker.indexOf("if(url.pathname==='/api/pm/gmail-connection')")>auth);assert.ok(worker.indexOf("if(url.pathname==='/api/pm/email')")>auth);
 const manifest=JSON.parse(fs.readFileSync('gmail-addon/appsscript.json'));assert.equal(manifest.oauthScopes.some(s=>s.includes('mail.google.com/')),false);assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/script.external_request'));
});
