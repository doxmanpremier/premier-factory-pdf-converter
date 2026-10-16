'use client';
import {useState} from 'react';
import {aqLinks} from '../lib/aq-links';
export default function AQFile({parent,entry,save,busy}:any){
 const [draft,setDraft]=useState<string|null>(null),[message,setMessage]=useState('');
 const saved=entry?.content||'',text=draft??saved;
 if(saved&&draft===null)return <div className="aq-file"><strong>AQ File</strong><div className="aq-file-content">{aqLinks(saved).map((part,index)=>part.href?<a key={index} href={part.href} target="_blank" rel="noopener noreferrer">{part.text}</a>:<span key={index}>{part.text}</span>)}</div><button disabled={busy} onClick={()=>{setDraft(saved);setMessage('');}}>Edit AQ File</button>{message&&<small role="status">{message}</small>}</div>;
 return <form className="aq-file" onSubmit={async e=>{e.preventDefault();setMessage('');if(await save({action:'projectQuoteText',id:parent,content:text})){setDraft(null);setMessage('AQ File saved.');}}}>
  <label>AQ File<textarea aria-label="AQ File" placeholder="Type or paste your AQ File text here…" rows={4} maxLength={20000} value={text} disabled={busy} onChange={e=>{setDraft(e.target.value);setMessage('');}}/></label>
  <button disabled={busy||text===saved}>{busy?'Saving…':'Save AQ File'}</button>{saved&&<button type="button" disabled={busy} onClick={()=>setDraft(null)}>Cancel</button>}{message&&<small role="status">{message}</small>}
 </form>;
}
