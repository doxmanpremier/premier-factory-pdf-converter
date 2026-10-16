'use client';
import {useState} from 'react';
export default function AQFile({parent,entry,save,busy}:any){
 const [draft,setDraft]=useState<string|null>(null),[message,setMessage]=useState('');
 const saved=entry?.content||'',text=draft??saved;
 return <form className="aq-file" onSubmit={async e=>{e.preventDefault();setMessage('');if(await save({action:'projectQuoteText',id:parent,content:text})){setDraft(null);setMessage('AQ File saved.');}}}>
  <label>AQ File<textarea aria-label="AQ File" placeholder="Type or paste your AQ File text here…" rows={4} maxLength={20000} value={text} disabled={busy} onChange={e=>{setDraft(e.target.value);setMessage('');}}/></label>
  <button disabled={busy||text===saved}>{busy?'Saving…':'Save AQ File'}</button>{message&&<small role="status">{message}</small>}
 </form>;
}
