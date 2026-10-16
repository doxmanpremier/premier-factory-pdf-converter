'use client';
import {useEffect,useRef,useState} from 'react';
import {Plus} from 'lucide-react';

export default function QuickAdd({parent,statuses,entries,save,busy}:any){
 const empty={itemnumber:'',name:'',quantity:'1',manufacturer:'',model:'',stage:statuses[0]?.name||''};
 const [draft,setDraft]=useState(empty),[message,setMessage]=useState('');
 const first=useRef<HTMLInputElement>(null),focusNext=useRef(false);
 useEffect(()=>{if(!busy&&focusNext.current){focusNext.current=false;first.current?.focus();}},[busy]);
 const field=(key:string,value:string)=>setDraft(d=>({...d,[key]:value}));
 const stage=statuses.some((s:any)=>s.name===draft.stage)?draft.stage:statuses[0]?.name||'';
 return <form className="quick-add" aria-label="Quick add item" onSubmit={async e=>{e.preventDefault();if(busy)return;setMessage('');const ok=await save({action:'create',kind:'item',parent,...draft,stage});if(ok){setMessage('Item '+draft.itemnumber+' added. Ready for the next item.');setDraft({...empty,manufacturer:draft.manufacturer,stage});focusNext.current=true;requestAnimationFrame(()=>{if(first.current&&!first.current.disabled){focusNext.current=false;first.current.focus();}});}}}>
  <div className="quick-add-heading"><h3>Quick add item</h3><small>Tab between fields. Press Enter to save and add the next item.</small></div>
  <div className="quick-add-fields"><label>Item number<input ref={first} aria-label="New item number" required maxLength={50} value={draft.itemnumber} disabled={busy} onChange={e=>field('itemnumber',e.target.value)} placeholder="A70"/></label>
  <label>Category<input aria-label="New item category" required maxLength={300} list="quick-categories" value={draft.name} disabled={busy} onChange={e=>field('name',e.target.value)} placeholder="Walk-in cooler"/></label>
  <label>Qty<input aria-label="New item quantity" type="number" min="0" step="any" value={draft.quantity} disabled={busy} onChange={e=>field('quantity',e.target.value)}/></label>
  <label>Manufacturer<input aria-label="New item manufacturer" maxLength={200} list="quick-manufacturers" value={draft.manufacturer} disabled={busy} onChange={e=>field('manufacturer',e.target.value)} placeholder="Manufacturer"/></label>
  <label>Model<input aria-label="New item model" maxLength={200} value={draft.model} disabled={busy} onChange={e=>field('model',e.target.value)} placeholder="Model number"/></label>
  <label>Stage<select aria-label="New item stage" value={stage} disabled={busy} onChange={e=>field('stage',e.target.value)}>{statuses.map((s:any)=><option key={s.name}>{s.name}</option>)}</select></label>
  <button className="primary" disabled={busy}><Plus size={16}/>{busy?'Saving…':'Add item'}</button></div>
  <datalist id="quick-categories">{Array.from(new Set<string>(entries.filter((i:any)=>i.kind==='item').map((i:any)=>i.name))).map(v=><option key={v} value={v}/>)}</datalist>
  <datalist id="quick-manufacturers">{Array.from(new Set<string>(entries.filter((i:any)=>i.kind==='item'&&i.manufacturer).map((i:any)=>i.manufacturer))).map(v=><option key={v} value={v}/>)}</datalist>
  {message&&<p role="status" className="quick-add-message">{message}</p>}
 </form>;
}
