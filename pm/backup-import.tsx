'use client';
import {useRef,useState} from 'react';
export default function BackupImport({save,busy}:any){
 const picker=useRef<HTMLInputElement>(null);const [running,setRunning]=useState(false),[message,setMessage]=useState('');
 async function restore(file?:File){if(!file)return;setRunning(true);setMessage('');try{
  const data=JSON.parse(await file.text());if(data.format!=='project-desk-backup'||!Array.isArray(data.entries)||data.entries.length>10000)throw Error('Choose a Project Desk export backup.');
  const pending=[...data.entries];const ids=new Set<string>();
  for(const r of pending){if(typeof r.id!=='string'||ids.has(r.id)||!['folder','item','stage','status','file','link','note','task'].includes(r.kind))throw Error('This backup contains invalid records.');ids.add(r.id);}
  if(pending.some(r=>r.parent&&!ids.has(r.parent)))throw Error('This backup is missing a parent folder.');
  if(!confirm(`Import ${pending.length} records into this live workspace? Existing matching IDs are kept. No existing records will be removed.`))return;
  const complete=new Set<string>();let count=0;
  while(pending.length){const index=pending.findIndex(r=>!r.parent||complete.has(r.parent));if(index<0)throw Error('The backup contains a folder cycle.');const row=pending.splice(index,1)[0];let upload:File|undefined;
   if(row.kind==='file'){if(typeof row.fileData!=='string'||!/^data:[^,]*;base64,/.test(row.fileData))throw Error('A file is missing its backup contents.');const raw=atob(row.fileData.slice(row.fileData.indexOf(',')+1));upload=new File([Uint8Array.from(raw,c=>c.charCodeAt(0))],row.name,{type:row.mime||'application/octet-stream'});}
   const {fileData,fileBlob,...values}=row;delete values.owner;delete values.key;
   if(!await save({...values,action:'create'},upload))throw Error(`Stopped at ${row.name}. Saved records are kept; you can retry this backup.`);
   complete.add(row.id);setMessage(`Imported ${++count} of ${data.entries.length} records…`);
  }setMessage(`Imported ${count} records. Your projects, equipment, notes, tasks, and files are now saved online.`);
 }catch(e:any){setMessage(e.message||'Could not read the backup.');}finally{setRunning(false);if(picker.current)picker.current.value='';}}
 return <div className="backup-import"><button disabled={busy||running} onClick={()=>picker.current?.click()}>{running?'Importing backup…':'Import preview backup'}</button><input hidden ref={picker} type="file" accept=".json" onChange={e=>restore(e.target.files?.[0])}/>{message&&<p role="status">{message}</p>}</div>;
}
