
import transfer from './pm-transfer.json';
import {defaultStatuses,statusesFor} from '../lib/stages';
type PMEnv={DB:D1Database;BUCKET:R2Bucket};
export async function initializePM(env:PMEnv){
 if(await env.DB.prepare("SELECT id FROM pm_meta WHERE id='initial-transfer-v1'").first())return;
 const columns=['id','parent','kind','name','content','url','key','mime','size','date','stage','created','itemnumber','manufacturer','model','color','quantity'];
 const statements=transfer.map((row:any)=>env.DB.prepare(`INSERT OR IGNORE INTO entries (owner,${columns.join(',')}) VALUES (${['?',...columns.map(()=>'?')].join(',')})`).bind('premier-workspace',...columns.map(k=>row[k]??null)));
 statements.push(env.DB.prepare("INSERT OR IGNORE INTO pm_meta (id) VALUES ('initial-transfer-v1')"));
 await env.DB.batch(statements);
}
function validShipping(destination:string,date:string){if(!['','warehouse','job_site','fabricator','installer'].includes(destination))return false;if(!date)return true;if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;const parsed=new Date(date+'T00:00:00Z');return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date;}
const out=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function pmGet(req:Request,env:PMEnv){
 const owner='premier-workspace'; if(!owner)return out({error:'Please sign in to open your projects.'},401);
 const rows=await env.DB!.prepare('SELECT * FROM entries WHERE owner = ? ORDER BY created DESC LIMIT 10000').bind(owner).all(); return out(rows.results);
}
export async function pmPost(req:Request,env:PMEnv){
 const owner='premier-workspace';if(!owner)return out({error:'Please sign in.'},401);
 if(req.headers.get('origin')!==new URL(req.url).origin)return out({error:'Invalid request origin.'},403);
 try {
 const form=await req.formData();const action=String(form.get('action')||'create');const id=String(form.get('id')||crypto.randomUUID());
 const existing=await env.DB!.prepare('SELECT * FROM entries WHERE id=? AND owner=?').bind(id,owner).first<any>();
 let scope=String(existing?.kind==='status'?existing.stage_scope||'':form.get('stage_scope')||'')||null;
 if(scope&&!['quoting','awarded'].includes(scope)){const job=await env.DB.prepare("SELECT job_category FROM entries WHERE id=? AND owner=? AND kind='folder' AND parent IS NULL").bind(scope,owner).first<any>();if(!job)return out({error:'Job not found.'},404);scope=job.job_category||'quoting';}
 if((['deleteStatus','reorderStatuses'].includes(action)||existing?.kind==='status'||form.get('kind')==='status')&&!scope)return out({error:'Open a job to change its stages.'},400);

 const scopeSQL=scope?" AND id IN (WITH RECURSIVE job(id) AS (SELECT id FROM entries WHERE kind='folder' AND parent IS NULL AND COALESCE(job_category,'quoting')=? AND owner=? UNION ALL SELECT e.id FROM entries e JOIN job j ON e.parent=j.id WHERE e.owner=?) SELECT id FROM job)":"";
 const scopedArgs=scope?[scope,owner,owner]:[];
 const removedFileKeys=new Set<string>();
 async function cleanRemovedFiles(){for(const key of removedFileKeys){try{if(!await env.DB.prepare('SELECT id FROM entries WHERE key=? LIMIT 1').bind(key).first())await env.BUCKET.delete(key);}catch{ /* Keep storage if cleanup is temporarily unavailable. */ }}}
 async function categoryItemChanges(category:string){
  if(!existing||existing.kind!=='folder'||existing.parent||category===(existing.job_category||'quoting'))return [];
  const rows=await env.DB.prepare("SELECT * FROM entries WHERE owner=? AND kind IN ('status','status_removed') AND stage_scope IN ('quoting','awarded')").bind(owner).all<any>();
  const previous=statusesFor(rows.results,existing.job_category||'quoting'),next=statusesFor(rows.results,category);const statements:any[]=[];
  let awarded=category==='awarded'?next.find(s=>(s.content||s.name)==='Awarded')||next.find(s=>s.name==='Awarded'):null;
  if(category==='awarded'&&!awarded){awarded=defaultStatuses.find(s=>s.name==='Awarded')!;statements.push(env.DB.prepare("INSERT INTO entries (id,owner,kind,name,content,color,created,stage_scope) VALUES (?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),owner,'status','Awarded','Awarded',awarded.color,new Date().toISOString(),'awarded'));}
  const children=await env.DB.prepare("WITH RECURSIVE job(id) AS (SELECT id FROM entries WHERE id=? AND owner=? UNION ALL SELECT e.id FROM entries e JOIN job j ON e.parent=j.id WHERE e.owner=?) SELECT * FROM entries WHERE kind='item' AND id IN (SELECT id FROM job) AND owner=?").bind(id,owner,owner,owner).all<any>();
  for(const item of children.results){const original=previous.find(s=>s.name===item.stage);
   const notCarried=(name:string)=>String(name||'').replace(/^\s*\d+\s*[).:\-]*\s*/,'').trim().toLowerCase().replace(/[\s_-]+/g,' ')==='not carried';
   if(category==='awarded'&&(existing.job_category||'quoting')==='quoting'&&(notCarried(item.stage)||notCarried(original?.content||''))){
    const tree="WITH RECURSIVE removed(id) AS (SELECT id FROM entries WHERE id=? AND owner=? UNION SELECT e.id FROM entries e JOIN removed r ON e.parent=r.id WHERE e.owner=?)";
    const files=await env.DB.prepare(tree+" SELECT key FROM entries WHERE id IN (SELECT id FROM removed) AND owner=? AND key IS NOT NULL").bind(item.id,owner,owner,owner).all<any>();for(const file of files.results)removedFileKeys.add(file.key);
    statements.push(env.DB.prepare(tree+" DELETE FROM entries WHERE id IN (SELECT id FROM removed) AND owner=?").bind(item.id,owner,owner,owner));continue;
   }
   const mapped=awarded||next.find(s=>s.name===item.stage)||next.find(s=>(s.content||s.name)===(original?.content||original?.name||item.stage))||next[0];statements.push(env.DB.prepare('UPDATE entries SET stage=? WHERE id=? AND owner=?').bind(mapped.name,item.id,owner));}return statements;
 }
 if(action==='reorderStatuses'){
  const names=JSON.parse(String(form.get('names')||'[]'));if(!scope||!Array.isArray(names)||!names.length||names.length>500||names.some(n=>typeof n!=='string')||new Set(names).size!==names.length)return out({error:'Invalid stage order.'},400);
  const rows=await env.DB.prepare("SELECT * FROM entries WHERE owner=? AND stage_scope=? AND kind IN ('status','status_removed')").bind(owner,scope).all<any>();const active=statusesFor(rows.results,scope);
  if(active.length!==names.length||names.some(name=>!active.some(s=>s.name===name)))return out({error:'The stage list changed. Refresh and try again.'},409);
  const statements=names.map((name,index)=>{const stage=active.find(s=>s.name===name)!;const stored=rows.results.find(s=>s.kind==='status'&&s.name===name);return stored?env.DB.prepare('UPDATE entries SET order_position=? WHERE id=? AND owner=?').bind(index,stored.id,owner):env.DB.prepare("INSERT INTO entries (id,owner,kind,name,content,color,created,stage_scope,order_position) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),owner,'status',name,stage.content||name,stage.color,new Date().toISOString(),scope,index);});
  await env.DB.batch(statements);return out({ok:true});
 }
 if(action==='projectQuoteText'){
  if(!existing||existing.kind!=='folder'||existing.parent)return out({error:'Open a project to save AQ File text.'},400);
  const content=String(form.get('content')||'').replace(/\r\n?/g,'\n');if(content.length>20000)return out({error:'AQ File text can be up to 20,000 characters.'},400);
  await env.DB.prepare("INSERT INTO entries (id,owner,parent,kind,name,content,created) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content WHERE entries.owner=? AND entries.parent=? AND entries.kind='project_text'").bind('aq-file:'+id,owner,id,'project_text','AQ File',content,new Date().toISOString(),owner,id).run();return out({ok:true});
 }
 if(action==='jobCategory'){
  const category=String(form.get('job_category')||'');if(!existing||existing.kind!=='folder'||existing.parent||!['quoting','awarded'].includes(category))return out({error:'Choose a valid job section.'},400);
  await env.DB.batch([env.DB.prepare('UPDATE entries SET job_category=? WHERE id=? AND owner=?').bind(category,id,owner),...await categoryItemChanges(category)]);await cleanRemovedFiles();return out({ok:true});
 }
 if(action==='deleteStatus'){
  const name=String(form.get('name')||''),replacement=String(form.get('replacement')||'');
  const rows=await env.DB.prepare("SELECT * FROM entries WHERE owner=? AND kind IN ('status','status_removed') AND stage_scope IS ?").bind(owner,scope).all<any>();
  const active=statusesFor(rows.results,scope);if(!active.some(s=>s.name===name))return out({error:'Stage not found.'},404);
  if(active.length<2||replacement===name||!active.some(s=>s.name===replacement))return out({error:'Choose another active stage for these items.'},400);
  const stored=rows.results.find(s=>s.kind==='status'&&s.name===name);const source=stored?.content||name;
  const statements=[env.DB.prepare(("UPDATE entries SET stage=? WHERE owner=? AND kind='item' AND stage=?"+scopeSQL)).bind(replacement,owner,name,...scopedArgs)];
  if(defaultStatuses.some(s=>s.name===source)){
   if(stored)statements.push(env.DB.prepare("UPDATE entries SET kind='status_removed',content=? WHERE id=? AND owner=?").bind(source,stored.id,owner));
   else statements.push(env.DB.prepare("INSERT INTO entries (id,owner,kind,name,content,created,stage_scope) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(),owner,'status_removed',name,source,new Date().toISOString(),scope));
  }else if(stored)statements.push(env.DB.prepare('DELETE FROM entries WHERE id=? AND owner=?').bind(stored.id,owner));
  await env.DB.batch(statements);return out({ok:true});
 }
 if(action==='boardMove'){
  const parent=String(form.get('parent')||''),stage=String(form.get('stage')||'');const ids=JSON.parse(String(form.get('ids')||'[]'));
  if(!existing||existing.kind!=='item'||existing.parent!==parent||!Array.isArray(ids)||!ids.length||ids.length>2000||ids.some(i=>typeof i!=='string')||new Set(ids).size!==ids.length||!ids.includes(id))return out({error:'Invalid board move.'},400);
  const current=await env.DB.prepare("SELECT id FROM entries WHERE owner=? AND parent=? AND kind='item'").bind(owner,parent).all<any>();const valid=new Set(current.results.map(i=>i.id));if(valid.size!==ids.length||ids.some(i=>!valid.has(i)))return out({error:'The item list changed. Refresh and try again.'},409);
  let root=await env.DB.prepare("SELECT * FROM entries WHERE id=? AND owner=? AND kind='folder'").bind(parent,owner).first<any>();let depth=0;while(root?.parent&&depth++<100)root=await env.DB.prepare('SELECT * FROM entries WHERE id=? AND owner=?').bind(root.parent,owner).first<any>();if(!root||root.parent)return out({error:'Project not found.'},400);
  const group=root.job_category||'quoting';const stages=await env.DB.prepare("SELECT * FROM entries WHERE owner=? AND stage_scope=? AND kind IN ('status','status_removed')").bind(owner,group).all<any>();if(!statusesFor(stages.results,group).some(s=>s.name===stage))return out({error:'Choose an active stage for this job.'},400);
  await env.DB.batch([env.DB.prepare('UPDATE entries SET stage=? WHERE id=? AND owner=? AND parent=?').bind(stage,id,owner,parent),...ids.map((itemID,index)=>env.DB.prepare('UPDATE entries SET order_position=? WHERE id=? AND owner=? AND parent=?').bind(index,itemID,owner,parent))]);return out({ok:true});
 }
 if(action==='reorder'){
  const parent=String(form.get('parent')||'');const ids=JSON.parse(String(form.get('ids')||'[]'));
  if(!parent||!Array.isArray(ids)||!ids.length||ids.length>2000||ids.some(i=>typeof i!=='string')||new Set(ids).size!==ids.length)return out({error:'Invalid equipment order.'},400);
  const rows=await env.DB.prepare("SELECT id FROM entries WHERE owner=? AND parent=? AND kind='item'").bind(owner,parent).all<{id:string}>();
  const valid=new Set(rows.results.map(r=>r.id));if(valid.size!==ids.length||ids.some(i=>!valid.has(i)))return out({error:'The item list changed. Refresh the project and try again.'},409);
  await env.DB.batch(ids.map((itemId,index)=>env.DB.prepare('UPDATE entries SET order_position=? WHERE id=? AND owner=? AND parent=?').bind(index,itemId,owner,parent)));
  return out({ok:true});
 }
 if(['bulkStatus','bulkNote','bulkPO','bulkQuote','bulkShipping','bulkDrawings','bulkDocument','metadata'].includes(action)){
  const ids=action==='metadata'?[id]:JSON.parse(String(form.get('ids')||'[]'));
  if(!Array.isArray(ids)||!ids.length||ids.length>500||ids.some(i=>typeof i!=='string')||new Set(ids).size!==ids.length)return out({error:'Select between 1 and 500 different items.'},400);
  const targets=await Promise.all(ids.map(i=>env.DB.prepare("SELECT * FROM entries WHERE id=? AND owner=? AND kind='item'").bind(i,owner).first()));
  if(targets.some(i=>!i)||targets.some(i=>i?.parent!==targets[0]?.parent))return out({error:'Select equipment items in the same project folder.'},400);
  const statements:any[]=[];
  if(action==='bulkDocument'){
   const section=String(form.get('document_section')||'');if(!['','quote','po','drawings'].includes(section))return out({error:'Choose Quote, PO, Drawings, or Files & folders.'},400);const content=section?'item-document:'+section:null;
   const file=form.get('file');const url=String(form.get('url')||'').trim();
   let key:string|null=null,mime:string|null=null,size:number|null=null,name=String(form.get('name')||'').trim().slice(0,300);
   const kind=file instanceof File?'file':'link';
   if(kind==='file'){
    if(!(file instanceof File)||!file.size||file.size>25*1024*1024)return out({error:'Choose a file between 1 byte and 25 MB.'},400);
    name=file.name.slice(0,300);mime=file.type||'application/octet-stream';size=file.size;key=owner+'/shared/'+crypto.randomUUID();
    await env.BUCKET.put(key,file.stream(),{httpMetadata:{contentType:mime}});
   }else{
    try{if(new URL(url).protocol!=='https:'||!name)throw 0;}catch{return out({error:'Enter a document name and valid HTTPS link.'},400);}
   }
   for(const target of targets)statements.push(env.DB.prepare('INSERT INTO entries (id,owner,parent,kind,name,url,key,mime,size,created,content) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),owner,target!.id,kind,name,kind==='link'?url:null,key,mime,size,new Date().toISOString(),content));
   try{await env.DB.batch(statements);}catch(error){if(key)await env.BUCKET.delete(key);throw error;}
   return out({ok:true,count:targets.length});
  }else if(action==='bulkNote'){
   const content=String(form.get('content')||'').trim(),date=String(form.get('date')||'');
   if(!content||content.length>20000||!/^\d{4}-\d{2}-\d{2}$/.test(date))return out({error:'Enter a note and date.'},400);
   for(const target of targets)statements.push(env.DB.prepare("INSERT INTO entries (id,owner,parent,kind,name,content,date,created) VALUES (?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),owner,target!.id,'note','Shared item update',content,date,new Date().toISOString()));
  }else{
   const shipping=String(form.get('shipping_destination')||''),receiving=String(form.get('expected_receiving_date')||'');
   if(!validShipping(shipping,receiving))return out({error:'Choose a valid shipping destination and receiving date.'},400);
   if(action==='bulkShipping'&&!form.has('shipping_destination')&&!form.has('expected_receiving_date'))return out({error:'Enter shipping details.'},400);
   const quote=String(form.get('quote_number')||'').trim();
   const po=String(form.get('po_number')||'').trim(),drawings=String(form.get('shop_drawings')||'');
   if(quote.length>100||po.length>100||form.has('shop_drawings')&&!['yes','no',''].includes(drawings))return out({error:'Enter a valid PO number or drawing requirement.'},400);
   const stage=String(form.get('stage')||'').trim();if(action==='bulkStatus'&&(!stage||stage.length>100))return out({error:'Choose a status.'},400);
   if(action==='bulkQuote'&&!form.has('quote_number'))return out({error:'Enter a quote number.'},400);
   if(action==='bulkPO'&&!form.has('po_number'))return out({error:'Enter a PO number.'},400);
   if(action==='bulkDrawings'&&!['yes','no'].includes(drawings))return out({error:'Choose Yes or No for shop drawings.'},400);
   for(const target of targets){
    if(action==='bulkStatus')statements.push(env.DB.prepare('UPDATE entries SET stage=? WHERE id=? AND owner=?').bind(stage,target!.id,owner));
    if(form.has('shipping_destination'))statements.push(env.DB.prepare('UPDATE entries SET shipping_destination=? WHERE id=? AND owner=?').bind(shipping||null,target!.id,owner));
    if(form.has('expected_receiving_date'))statements.push(env.DB.prepare('UPDATE entries SET expected_receiving_date=? WHERE id=? AND owner=?').bind(receiving||null,target!.id,owner));
    if(form.has('quote_number'))statements.push(env.DB.prepare('UPDATE entries SET quote_number=? WHERE id=? AND owner=?').bind(quote||null,target!.id,owner));
    if(form.has('po_number'))statements.push(env.DB.prepare('UPDATE entries SET po_number=? WHERE id=? AND owner=?').bind(po||null,target!.id,owner));
    if(form.has('shop_drawings'))statements.push(env.DB.prepare('UPDATE entries SET shop_drawings=? WHERE id=? AND owner=?').bind(drawings||null,target!.id,owner));
   }
  }
  if(statements.length)await env.DB.batch(statements);return out({ok:true,count:targets.length});
 }
 if(action==='move'){
  if(!existing||existing.kind==='stage'||(existing.kind==='folder'&&!existing.parent))return out({error:'This item cannot be moved here.'},400);
  const parent=String(form.get('parent')||'');
  let target=await env.DB!.prepare("SELECT * FROM entries WHERE id=? AND owner=? AND kind IN ('folder','item')").bind(parent,owner).first<any>();if(!target)return out({error:'Folder not found.'},404);
  let guard=0;while(target){if(target.id===id)return out({error:'A folder cannot be moved inside itself.'},400);if(!target.parent)break;target=await env.DB!.prepare('SELECT * FROM entries WHERE id=? AND owner=?').bind(target.parent,owner).first<any>();if(++guard>100)return out({error:'Folder tree too deep.'},400);}
  await env.DB!.prepare('UPDATE entries SET parent=? WHERE id=? AND owner=?').bind(parent,id,owner).run();return out({ok:true});
 }
 if(action==='drawingStatus'){
  if(!existing||!['file','link'].includes(existing.kind)||existing.content!=='item-document:drawings')return out({error:'Choose an item drawing.'},400);
  const parentItem=await env.DB.prepare("SELECT id FROM entries WHERE id=? AND owner=? AND kind='item'").bind(existing.parent,owner).first();if(!parentItem)return out({error:'Item not found.'},404);
  const status=String(form.get('stage')||'');if(!['unsigned','revisions_needed','approved'].includes(status))return out({error:'Choose Unsigned, Revisions needed, or Approved.'},400);
  await env.DB.prepare('UPDATE entries SET stage=? WHERE id=? AND owner=?').bind(status,id,owner).run();return out({ok:true});
 }
 if(action==='status'){
  if(!existing||existing.kind!=='item')return out({error:'Item not found.'},404);
  const status=String(form.get('stage')||'Pending quote').slice(0,100);
  await env.DB!.prepare('UPDATE entries SET stage=? WHERE id=? AND owner=?').bind(status,id,owner).run();return out({ok:true});
 }
 if(action==='stage'||action==='done'){
  if(!existing)return out({error:'Item not found.'},404);
  let stage=String(form.get('stage')||'')||null;
  if(action==='stage'){
   if(existing.kind!=='folder'||existing.parent)return out({error:'Only projects have stages.'},400);
   if(stage&&!await env.DB!.prepare("SELECT id FROM entries WHERE id=? AND owner=? AND kind='stage'").bind(stage,owner).first())return out({error:'Stage not found.'},404);
  }else{if(existing.kind!=='task')return out({error:'Invalid task.'},400);stage=stage==='done'?'done':null;}
  await env.DB!.prepare('UPDATE entries SET stage=? WHERE id=? AND owner=?').bind(stage,id,owner).run();return out({ok:true});
 }
 if(action==='delete'){
  if(!existing)return out({error:'Item not found.'},404);
  if(existing.kind==='stage'&&await env.DB!.prepare('SELECT id FROM entries WHERE stage=? AND owner=? LIMIT 1').bind(id,owner).first())return out({error:'Move projects out of this stage before removing it.'},409);
  const children=await env.DB!.prepare('SELECT id FROM entries WHERE parent=? AND owner=? LIMIT 1').bind(id,owner).first();if(children)return out({error:'Remove the contents before deleting this folder.'},409);
  if(existing.key&&!await env.DB.prepare('SELECT id FROM entries WHERE key=? AND id!=? LIMIT 1').bind(existing.key,id).first())await env.BUCKET!.delete(existing.key);
  await env.DB!.prepare('DELETE FROM entries WHERE id=? AND owner=?').bind(id,owner).run();return out({ok:true});
 }
 const category=String(form.get('job_category')||existing?.job_category||'quoting');if(!['quoting','awarded'].includes(category))return out({error:'Invalid job section.'},400);
 const rawQuantity=String(form.get('quantity')||'').trim();const quantity=rawQuantity===''?null:Number(rawQuantity);
 if(quantity!==null&&(!Number.isFinite(quantity)||quantity<0))return out({error:'Quantity must be a nonnegative number.'},400);
 const shipping=form.has('shipping_destination')?String(form.get('shipping_destination')||''):existing?.shipping_destination||'';const receiving=form.has('expected_receiving_date')?String(form.get('expected_receiving_date')||''):existing?.expected_receiving_date||'';
 if(!validShipping(shipping,receiving))return out({error:'Choose a valid shipping destination and receiving date.'},400);
 const quoteNumber=form.has('quote_number')?String(form.get('quote_number')||'').trim():existing?.quote_number||null;
 const poNumber=form.has('po_number')?String(form.get('po_number')||'').trim():existing?.po_number||null;
 const shopDrawings=form.has('shop_drawings')?String(form.get('shop_drawings')||''):existing?.shop_drawings||null;
 if((quoteNumber?.length||0)>100||(poNumber?.length||0)>100||shopDrawings&&!['yes','no'].includes(shopDrawings))return out({error:'Invalid quote/PO number or shop drawing requirement.'},400);
 const name=String(form.get('name')||'').trim().slice(0,300);const content=String(form.get('content')||'').trim().slice(0,20000);const date=String(form.get('date')||'');
 const itemnumber=String(form.get('itemnumber')||'').trim().slice(0,50),manufacturer=String(form.get('manufacturer')||'').trim().slice(0,200),model=String(form.get('model')||'').trim().slice(0,200),color=String(form.get('color')||'#607d8b');
 if(!/^#[0-9a-fA-F]{6}$/.test(color))return out({error:'Choose a valid color.'},400);
 if(action==='edit'){
  if(!existing)return out({error:'Item not found.'},404);
  if(!name)return out({error:'Enter a name or note.'},400);
  if(existing.kind==='status'&&await env.DB.prepare("SELECT id FROM entries WHERE owner=? AND kind='status' AND lower(name)=lower(?) AND id!=? AND stage_scope IS ?").bind(owner,name,id,scope).first())return out({error:'A stage with this name already exists.'},409);
  if(existing.kind==='item'){
   if(!itemnumber)return out({error:'Enter an item number.'},400);
  }
  const update=env.DB!.prepare('UPDATE entries SET name=?,content=?,date=?,itemnumber=?,manufacturer=?,model=?,quantity=?,color=?,po_number=?,quote_number=?,shipping_destination=?,expected_receiving_date=?,shop_drawings=?,job_category=? WHERE id=? AND owner=?').bind(name,content,date,itemnumber||null,manufacturer||null,model||null,quantity,color,poNumber||null,quoteNumber||null,shipping||null,receiving||null,shopDrawings||null,existing.kind==='folder'&&!existing.parent?category:null,id,owner);
  if(existing.kind==='status'&&existing.name!==name)await env.DB.batch([update,env.DB.prepare(("UPDATE entries SET stage=? WHERE owner=? AND kind='item' AND stage=?"+scopeSQL)).bind(name,owner,existing.name,...scopedArgs)]);else if(existing.kind==='folder'&&!existing.parent)await env.DB.batch([update,...await categoryItemChanges(category)]);else await update.run();await cleanRemovedFiles();return out({ok:true});
 }
 if(existing)return out({ok:true});
 const parent=String(form.get('parent')||'')||null;const kind=String(form.get('kind')||'folder');
 if(parent){const folder=await env.DB!.prepare("SELECT id FROM entries WHERE id=? AND owner=? AND kind IN ('folder','item')").bind(parent,owner).first();if(!folder)return out({error:'Folder not found.'},404);}
 if(!['folder','link','note','file','task','stage','item','status'].includes(kind))return out({error:'Invalid item type.'},400);
 if(!['folder','stage','status'].includes(kind)&&!parent)return out({error:'Open a project folder first.'},400);
 if(kind==='item'){
  if(!itemnumber)return out({error:'Enter an item number.'},400);
 }
 if(kind==='status'&&await env.DB.prepare("SELECT id FROM entries WHERE owner=? AND kind='status' AND stage_scope IS ? AND (lower(name)=lower(?) OR (?!='' AND content=?))").bind(owner,scope,name,content,content).first())return out({error:'This stage already exists. Select it to edit it.'},409);
 let url=String(form.get('url')||'').trim();let key=null;let mime=null;let size=null;let title=name;
 if(kind==='link'){try{if(new URL(url).protocol!=='https:')throw 0;}catch{return out({error:'Enter a valid HTTPS document link.'},400);}}
 if(kind==='file'){
  const file=form.get('file');if(!(file instanceof File))return out({error:'Choose a file.'},400);if(file.size>25*1024*1024)return out({error:'Files can be up to 25 MB. Use a Drive link for larger files.'},400);
  title=file.name.slice(0,300);mime=file.type||'application/octet-stream';size=file.size;key=owner+'/'+id;await env.BUCKET!.put(key,file.stream(),{httpMetadata:{contentType:mime}});
 }
 if(!title || (kind==='note'&&!content))return out({error:'Enter the required fields.'},400);
 if(kind==='note'&&!/^\d{4}-\d{2}-\d{2}$/.test(date))return out({error:'Choose a date.'},400);
 const insert=env.DB!.prepare('INSERT INTO entries (id,owner,parent,kind,name,content,url,key,mime,size,date,stage,itemnumber,manufacturer,model,quantity,color,created,po_number,quote_number,shipping_destination,expected_receiving_date,shop_drawings,job_category,stage_scope) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,owner,parent,kind,title,content,url||null,key,mime,size,date||null,kind==='item'?String(form.get('stage')||'Pending quote'):null,itemnumber||null,manufacturer||null,model||null,quantity,color,new Date().toISOString(),poNumber||null,quoteNumber||null,shipping||null,receiving||null,shopDrawings||null,kind==='folder'&&!parent?category:null,kind==='status'?scope:null);
 if(kind==='status'&&content&&content!==title)await env.DB.batch([insert,env.DB.prepare(("UPDATE entries SET stage=? WHERE owner=? AND kind='item' AND stage=?"+scopeSQL)).bind(title,owner,content,...scopedArgs)]);else await insert.run();return out({ok:true});
 }catch{return out({error:'Could not save. Please try again.'},500);}
}



export async function pmFile(req:Request,env:PMEnv){const owner='premier-workspace';if(!owner)return new Response('Sign in required',{status:401});const id=new URL(req.url).searchParams.get('id');const row=await env.DB!.prepare('SELECT * FROM entries WHERE id=? AND owner=?').bind(id,owner).first<any>();if(!row?.key)return new Response('Not found',{status:404});const file=await env.BUCKET!.get(row.key);if(!file)return new Response('Not found',{status:404});return new Response(file.body,{headers:{'Content-Type':row.mime==='application/pdf'?'application/pdf':'application/octet-stream','Content-Disposition':(row.mime==='application/pdf'?'inline':'attachment')+"; filename*=UTF-8''"+encodeURIComponent(row.name),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}

