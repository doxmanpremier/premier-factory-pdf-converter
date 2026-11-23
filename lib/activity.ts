export function cleanExcerpt(body:string){return body.replace(/\[cid:[^\]]*\]|\[image:[^\]]*\]|<https?:[^>]*>/gi,'').split(/(?:\n\s*(?:From:|_{5,}|>{1,}|Sent from|Get Outlook)|\bOn [\s\S]{0,300}?wrote:)/i)[0].replace(/\s+/g,' ').trim().slice(0,220);}
export function activityEntries(entries:any[],parent:string,kind='all'){return projectActivityRows(entries,parent).filter(e=>['email','note'].includes(e.kind)&&!String(e.id).startsWith('awarded-import-details:')&&(kind==='all'||kind==='documents'&&['file','link'].includes(e.kind)||e.kind===kind)).sort((a,b)=>String(b.created).localeCompare(String(a.created))||b.id.localeCompare(a.id));}
export function nextTask(entries:any[],parent:string){return entries.filter(e=>e.parent===parent&&e.kind==='task'&&e.stage!=='done').sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||String(a.created).localeCompare(String(b.created)))[0];}

// Project feeds include emails linked to equipment, without copying or moving records.
export function projectActivityRows(entries:any[],parent:string){
 const scope=new Set([parent]);let changed=true;
 while(changed){changed=false;for(const e of entries)if(['folder','item'].includes(e.kind)&&scope.has(e.parent)&&!scope.has(e.id)){scope.add(e.id);changed=true;}}
 const groups=new Map<string,any>(),rows:any[]=[];
 for(const e of entries){
  if(e.kind!=='email'){if(e.parent===parent)rows.push(e);continue;}
  if(!scope.has(e.parent))continue;
  let source;try{source=JSON.parse(e.content||'{}').source;}catch{}
  const key=typeof source==='string'&&source?source:e.id;
  let row=groups.get(key);if(!row){row={...e,linkedParents:[],emailCopyIds:[]};groups.set(key,row);rows.push(row);}
  if(!row.linkedParents.includes(e.parent))row.linkedParents.push(e.parent);
  row.emailCopyIds.push(e.id);
 }
 return rows;
}
export function activityEmailFiles(entries:any[],row:any){const ids=new Set(row.emailCopyIds||[row.id]),seen=new Set<string>();return entries.filter(e=>{if(e.kind!=='file'||!ids.has(e.parent))return false;const key=JSON.stringify([e.name,e.size,e.mime]);if(seen.has(key))return false;seen.add(key);return true;});}
