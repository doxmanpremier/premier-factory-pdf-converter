import {statusesFor} from '../lib/stages';
type GmailEnv={DB:D1Database;BUCKET:R2Bucket};
const owner='premier-workspace',prefix='gmail-connection:';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function gmailHash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
// Only invoked behind the normal Project Desk session check.
export async function gmailConnection(req:Request,env:GmailEnv){
 if(req.method==='GET')return reply({connected:!!await env.DB.prepare('SELECT id FROM pm_meta WHERE id LIKE ? LIMIT 1').bind(prefix+'%').first()});
 if(req.method!=='POST'||req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Invalid request.'},403);
 const data:any=await req.json().catch(()=>null);if(!data)return reply({error:'Invalid request.'},400);
 if(data.action==='disconnect'){await env.DB.prepare('DELETE FROM pm_meta WHERE id LIKE ?').bind(prefix+'%').run();return reply({connected:false});}
 if(data.action!=='connect'||!/^[a-f0-9]{64}$/.test(data.hash||''))return reply({error:'Open the connection link from the Gmail add-on.'},400);
 await env.DB.prepare('INSERT OR IGNORE INTO pm_meta (id) VALUES (?)').bind(prefix+data.hash).run();return reply({connected:true});
}
export async function gmailAPI(req:Request,env:GmailEnv){
 const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
 if(!/^[a-f0-9]{64}$/.test(token)||!await env.DB.prepare('SELECT id FROM pm_meta WHERE id=?').bind(prefix+await gmailHash(token)).first())return reply({error:'Connect Gmail to Project Desk first, or reconnect if access was revoked.'},401);
 const url=new URL(req.url),route=url.pathname;
 if(req.method==='POST'&&route==='/api/pm/gmail/locations')return gmailLocations(req,env,token);
 if(req.method==='GET'&&route==='/api/pm/gmail/projects'){
  const rows=await env.DB.prepare("SELECT id,name,job_category FROM entries WHERE owner=? AND kind='folder' AND parent IS NULL ORDER BY name").bind(owner).all();return reply(rows.results);
 }
 if(req.method==='GET'&&route==='/api/pm/gmail/items'){
  const project=url.searchParams.get('project')||'';
  if(!await env.DB.prepare("SELECT id FROM entries WHERE id=? AND owner=? AND kind='folder' AND parent IS NULL").bind(project,owner).first())return reply({error:'Project not found.'},404);
  const rows=await env.DB.prepare("WITH RECURSIVE scope(id) AS (SELECT id FROM entries WHERE id=? AND owner=? UNION SELECT e.id FROM entries e JOIN scope s ON e.parent=s.id WHERE e.owner=? AND e.kind='folder') SELECT id,parent,name,itemnumber,manufacturer,model,stage FROM entries WHERE owner=? AND kind='item' AND parent IN (SELECT id FROM scope) ORDER BY itemnumber,name").bind(project,owner,owner,owner).all();return reply(rows.results);
 }
 if(req.method==='GET'&&route==='/api/pm/gmail/stages'){
  const stages=await gmailStages(env,url.searchParams.get('project')||'');return stages?reply(stages):reply({error:'Project not found.'},404);
 }
 if(req.method==='POST'&&route==='/api/pm/gmail/stage')return gmailStage(req,env);
 if(req.method!=='POST'||route!=='/api/pm/gmail/log')return reply({error:'Not found.'},404);
 const body=await req.text();if(body.length>16*1024*1024)return reply({error:'Email upload is too large. Turn off attachments and try again.'},413);
 let data:any;try{data=JSON.parse(body);}catch{return reply({error:'Invalid email.'},400);}
 const {project,items,message}=data;
 if(!Array.isArray(items)||!items.length||items.length>50||new Set(items).size!==items.length||items.some(id=>typeof id!=='string'))return reply({error:'Choose between 1 and 50 distinct items.'},400);
 if(!message||typeof message.id!=='string'||!message.id||message.id.length>500||typeof message.subject!=='string'||message.subject.length>1000||typeof message.body!=='string'||message.body.length>200000||typeof message.from!=='string'||message.from.length>2000||typeof message.to!=='string'||message.to.length>4000||!Number.isFinite(Date.parse(message.date)))return reply({error:'Invalid email details or message too long.'},400);
 if(message.threadId!==undefined&&(typeof message.threadId!=='string'||!/^[a-zA-Z0-9_:-]{1,200}$/.test(message.threadId)))return reply({error:'Invalid conversation.'},400);
 const threadKey=message.threadId?await gmailHash(token+'\n'+message.threadId):undefined;
 const stamp=new Date(message.date).toISOString(),attachments=message.attachments||[];
 if(!Array.isArray(attachments)||attachments.length>10)return reply({error:'Up to 10 attachments supported. Turn off attachments and try again.'},400);
 let bytes=0;const decoded:{name:string,mime:string,bytes:Uint8Array}[]=[];
 try{for(const a of attachments){if(typeof a.name!=='string'||!a.name||a.name.length>300||typeof a.mime!=='string'||a.mime.length>150||typeof a.base64!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(a.base64))throw Error();const value=Uint8Array.from(atob(a.base64),c=>c.charCodeAt(0));bytes+=value.length;if(bytes>10*1024*1024)throw Error();decoded.push({name:a.name,mime:a.mime,bytes:value});}}catch{return reply({error:'Invalid attachments or more than 10 MB total. Turn off attachments and try again.'},400);}
 if(!await env.DB.prepare("SELECT id FROM entries WHERE id=? AND owner=? AND kind='folder' AND parent IS NULL").bind(project,owner).first())return reply({error:'Project not found.'},404);
 const targets=await env.DB.prepare("WITH RECURSIVE scope(id) AS (SELECT id FROM entries WHERE id=? AND owner=? UNION SELECT e.id FROM entries e JOIN scope s ON e.parent=s.id WHERE e.owner=? AND e.kind='folder') SELECT id FROM entries WHERE owner=? AND kind='item' AND parent IN (SELECT id FROM scope)").bind(project,owner,owner,owner).all<{id:string}>();
 const allowed=new Set(targets.results.map(i=>i.id));if(items.some(id=>!allowed.has(id)))return reply({error:'Every selected item must belong to this project.'},400);
 const source=await gmailHash(message.from+'\n'+message.id),content=JSON.stringify({from:message.from,to:message.to,date:stamp,body:message.body,source,threadKey,loggedAt:new Date().toISOString()});
 const messageURL=typeof message.url==='string'&&/^https:\/\/mail\.google\.com\//.test(message.url)?message.url:null;
 const statements:D1PreparedStatement[]=[],newKeys:string[]=[];let added=0;
 try{for(const target of items){const id='gmail:'+await gmailHash(target+'\n'+source);if(await env.DB.prepare('SELECT id FROM entries WHERE id=? AND owner=?').bind(id,owner).first())continue;
   statements.push(env.DB.prepare('INSERT OR IGNORE INTO entries (id,owner,parent,kind,name,content,url,date,created) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,owner,target,'email',message.subject||'(No subject)',content,messageURL,stamp.slice(0,10),stamp));
   for(let index=0;index<decoded.length;index++){const a=decoded[index],fileId=id+':attachment:'+index,key=owner+'/gmail/'+crypto.randomUUID();await env.BUCKET.put(key,a.bytes,{httpMetadata:{contentType:a.mime||'application/octet-stream'}});newKeys.push(key);statements.push(env.DB.prepare('INSERT OR IGNORE INTO entries (id,owner,parent,kind,name,content,key,mime,size,created) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(fileId,owner,id,'file',a.name,'gmail-attachment',key,a.mime||'application/octet-stream',a.bytes.length,stamp));}added++;
  }if(statements.length)await env.DB.batch(statements);
  // A concurrent retry can win the INSERT OR IGNORE race. Keep only referenced blobs.
  for(const key of newKeys){if(!await env.DB.prepare('SELECT id FROM entries WHERE key=? LIMIT 1').bind(key).first())await env.BUCKET.delete(key);}
  return reply({ok:true,added,selected:items.length,message:'Email is saved to all selected items. Previously logged copies were kept.'});
 }catch{for(const key of newKeys){try{if(!await env.DB.prepare('SELECT id FROM entries WHERE key=? LIMIT 1').bind(key).first())await env.BUCKET.delete(key);}catch{}}return reply({error:'Could not save the email. Retry safely; existing copies will not be duplicated.'},500);}
}
async function gmailLocations(req:Request,env:GmailEnv,token:string){
 const data:any=await req.json().catch(()=>null);
 if(!data||typeof data.threadId!=='string'||!/^[a-zA-Z0-9_:-]{1,200}$/.test(data.threadId)||!Array.isArray(data.messageIds)||data.messageIds.length>100||data.messageIds.some((id:any)=>typeof id!=='string'||!id||id.length>500))return reply({error:'Invalid conversation lookup.'},400);
 const threadKey=await gmailHash(token+'\n'+data.threadId);
 // Resolve current project ancestry, so moved items and deleted copies stay accurate.
 const rows=await env.DB.prepare("WITH RECURSIVE tree(id,project,projectName) AS (SELECT id,id,name FROM entries WHERE owner=? AND kind='folder' AND parent IS NULL UNION ALL SELECT e.id,t.project,t.projectName FROM entries e JOIN tree t ON e.parent=t.id WHERE e.owner=? AND e.kind IN ('folder','item')) SELECT e.content,i.id itemId,i.name itemName,i.itemnumber,t.project projectId,t.projectName FROM entries e JOIN entries i ON e.parent=i.id JOIN tree t ON i.id=t.id WHERE e.owner=? AND i.owner=? AND e.kind='email' AND i.kind='item'").bind(owner,owner,owner,owner).all<any>();
 const hashes=new Map<string,Promise<string[]>>(),projects=new Map<string,any>();
 for(const row of rows.results){let meta:any;try{meta=JSON.parse(row.content);}catch{continue;}
  let matches=meta.threadKey===threadKey;
  if(!matches&&typeof meta.from==='string'&&typeof meta.source==='string'){
   if(!hashes.has(meta.from))hashes.set(meta.from,Promise.all(data.messageIds.map((id:string)=>gmailHash(meta.from+'\n'+id))));
   matches=(await hashes.get(meta.from)!).includes(meta.source);
  }
  if(!matches)continue;
  if(!projects.has(row.projectId))projects.set(row.projectId,{id:row.projectId,name:row.projectName,items:[]});
  const project=projects.get(row.projectId);if(!project.items.some((item:any)=>item.id===row.itemId))project.items.push({id:row.itemId,name:row.itemName,itemnumber:row.itemnumber});
 }
 return reply([...projects.values()].sort((a,b)=>a.name.localeCompare(b.name)));
}
async function gmailStages(env:GmailEnv,project:string){
 const root=await env.DB.prepare("SELECT id,job_category FROM entries WHERE id=? AND owner=? AND kind='folder' AND parent IS NULL").bind(project,owner).first<any>();if(!root)return null;
 const group=root.job_category||'quoting',rows=await env.DB.prepare("SELECT * FROM entries WHERE owner=? AND stage_scope=? AND kind IN ('status','status_removed')").bind(owner,group).all<any>();return statusesFor(rows.results,group).map(stage=>({name:stage.name}));
}
async function gmailStage(req:Request,env:GmailEnv){
 const data:any=await req.json().catch(()=>null);if(!data||!Array.isArray(data.items)||!data.items.length||data.items.length>50||new Set(data.items).size!==data.items.length||data.items.some((id:any)=>typeof id!=='string')||typeof data.project!=='string'||typeof data.stage!=='string')return reply({error:'Choose a project, stage and between 1 and 50 distinct items.'},400);
 const stages=await gmailStages(env,data.project);if(!stages)return reply({error:'Project not found.'},404);if(!stages.some(stage=>stage.name===data.stage))return reply({error:'Choose an active stage for this project.'},400);
 const targets=await env.DB.prepare("WITH RECURSIVE scope(id) AS (SELECT id FROM entries WHERE id=? AND owner=? UNION SELECT e.id FROM entries e JOIN scope s ON e.parent=s.id WHERE e.owner=? AND e.kind='folder') SELECT id FROM entries WHERE owner=? AND kind='item' AND parent IN (SELECT id FROM scope)").bind(data.project,owner,owner,owner).all<{id:string}>();const allowed=new Set(targets.results.map(item=>item.id));if(data.items.some((id:string)=>!allowed.has(id)))return reply({error:'Every selected item must belong to this project.'},400);
 await env.DB.batch(data.items.map((id:string)=>env.DB.prepare("UPDATE entries SET stage=? WHERE id=? AND owner=? AND kind='item'").bind(data.stage,id,owner)));
 return reply({ok:true,count:data.items.length,stage:data.stage});
}
export async function removeEmail(req:Request,env:GmailEnv){
 if(req.method!=='POST'||req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Invalid request.'},403);
 const data:any=await req.json().catch(()=>null);if(!data||!await env.DB.prepare("SELECT id FROM entries WHERE id=? AND owner=? AND kind='email'").bind(data.id||'',owner).first())return reply({error:'Email not found.'},404);
 const files=await env.DB.prepare('SELECT key FROM entries WHERE parent=? AND owner=? AND key IS NOT NULL').bind(data.id,owner).all<{key:string}>();
 await env.DB.batch([env.DB.prepare('DELETE FROM entries WHERE parent=? AND owner=?').bind(data.id,owner),env.DB.prepare("DELETE FROM entries WHERE id=? AND owner=? AND kind='email'").bind(data.id,owner)]);
 for(const f of files.results){try{if(!await env.DB.prepare('SELECT id FROM entries WHERE key=? LIMIT 1').bind(f.key).first())await env.BUCKET.delete(f.key);}catch{}}
 return reply({ok:true});
}
