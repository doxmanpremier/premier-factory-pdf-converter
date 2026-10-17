 'use client';
import {useState} from 'react';
import {pricingFields,pricingSnapshot,moneyCents,markupNeedsRecalculation,landedSell,itemPricing,dollars} from '../lib/pricing';
export default function InlinePricing({item,entries,save,busy}:any){
 const snapshot=pricingSnapshot(item);
 const initialDraft=()=>Object.fromEntries(pricingFields.map(f=>[f,snapshot[f]===null?'':(snapshot[f]/100).toFixed(2)]));
 const [draft,setDraft]=useState<Record<string,string>>(initialDraft),[mode,setMode]=useState(snapshot.pricing_mode),[markup,setMarkup]=useState(snapshot.markup_percent==null?'':String(snapshot.markup_percent)),[dirty,setDirty]=useState(false),[sellDirty,setSellDirty]=useState(false),[error,setError]=useState(''),[requestID,setRequestID]=useState('');
 function changed(){setDirty(true);setError('');setRequestID(crypto.randomUUID());}
 const parsed=()=>Object.fromEntries(pricingFields.map(f=>[f,moneyCents(draft[f])]));
 let recalculate=false,sell:number|null=itemPricing(item,[]).total;try{recalculate=markupNeedsRecalculation(snapshot,{...parsed(),pricing_mode:mode,markup_percent:mode==='markup'?Number(markup):null},sellDirty);if(recalculate)sell=markup.trim()?landedSell({...parsed(),quantity:item.quantity},Number(markup)):null;else if(sellDirty)sell=moneyCents(draft.quoted_total_cents);}catch{sell=null;}
 const input=(field:string,label:string,caption?:string)=><label>{caption&&<span>{caption}</span>}<input aria-label={label+' for item '+item.itemnumber} title={label} type="number" min="0" step="0.01" placeholder="Not entered" disabled={busy} value={draft[field]} onChange={e=>{setDraft(d=>({...d,[field]:e.target.value}));changed();}}/></label>;
 async function apply(){try{
  const values=parsed();if((sellDirty||recalculate)&&sell===null)throw Error('Enter valid pricing, quantity and markup.');
  const ok=await save({action:'pricing',id:item.id,type:'pricing_update',...draft,...((sellDirty||recalculate)?{quoted_total_cents:sell===null?'':(sell/100).toFixed(2)}:{}),pricing_mode:mode,markup_percent:markup,expected:JSON.stringify(snapshot),recalculate_sell:recalculate?'yes':'no',landed_markup:'yes',request_id:requestID});
  if(ok)setDirty(false);else setError('Not saved. Review the message above.');
 }catch(e:any){setError(e.message);}}
 return <><td className="price-cell inline-price my-net-pair">{input('unit_cost_cents','Pre-award unit net','Pre')}{input('post_award_cost_cents','Post-award unit net','Post')}</td>
 <td className="price-cell inline-price">{input('freight_cost_cents','Freight net (whole line)')}</td>
 <td className="price-cell inline-price">{input('install_cost_cents','Install net (whole line)')}</td>
 <td className="price-cell inline-price"><input aria-label={'Markup percentage for item '+item.itemnumber} title="Markup on quantity x my unit net + freight + install" type="number" min="0" step="any" placeholder="Optional" disabled={busy} value={mode==='markup'?markup:''} onChange={e=>{setMarkup(e.target.value);setSellDirty(true);setMode(e.target.value===''?'manual':'markup');changed();}}/></td>
 <td className="price-cell inline-price"><input aria-label={'Sell net for item '+item.itemnumber} title="Sell net for the whole line" type="number" min="0" step="0.01" placeholder="Not entered" disabled={busy} value={sell===null?'':(sell/100).toFixed(2)} onChange={e=>{setDraft(d=>({...d,quoted_total_cents:e.target.value}));setMode('manual');setSellDirty(true);changed();}}/>
 {dirty&&<div className="inline-price-save"><button type="button" className="primary" disabled={busy} onClick={apply}>Apply</button><button type="button" disabled={busy} onClick={()=>{setDraft(initialDraft());setMode(snapshot.pricing_mode);setMarkup(snapshot.markup_percent==null?'':String(snapshot.markup_percent));setDirty(false);setSellDirty(false);setError('');}}>Cancel</button></div>}{error&&<small role="alert" className="error">{error}</small>}</td></>;
}
