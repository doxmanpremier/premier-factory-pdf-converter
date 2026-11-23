'use client';
import {useState} from 'react';
export default function DocumentRevisionNote({document,save,busy}:any){
 const [draft,setDraft]=useState<string|null>(null),[message,setMessage]=useState('');
 const saved=document.revision_note||'',text=draft??saved;
 if(saved&&draft===null)return <div className="document-revision-note"><strong>Revision note</strong><p>{saved}</p><button type="button" disabled={busy} aria-label={'Edit revision note for '+document.name} onClick={()=>{setDraft(saved);setMessage('');}}>Edit note</button>{message&&<small role="status">{message}</small>}</div>;
 return <form className="document-revision-note" onSubmit={async e=>{e.preventDefault();setMessage('');if(await save({action:'documentRevisionNote',id:document.id,revision_note:text})){setDraft(null);setMessage('Revision note saved.');}else setMessage('Could not save. Your note is still here; please try again.');}}>
 <label>Revision note<textarea aria-label={'Revision note for '+document.name} placeholder="What changed in this revision?" rows={2} maxLength={2000} value={text} disabled={busy} onChange={e=>{setDraft(e.target.value);setMessage('');}}/></label>
 <div><button type="submit" disabled={busy||text===saved}>{busy?'Saving…':'Save note'}</button>{draft!==null&&<button type="button" disabled={busy} onClick={()=>{setDraft(null);setMessage('');}}>Cancel</button>}{draft!==null&&text!==saved&&<small>Unsaved note</small>}{message&&<small role="status">{message}</small>}</div></form>;
}
