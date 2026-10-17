export function moneyCents(value:string,allowNegative=false){
 const text=String(value).trim();if(!text)return null;if(!/^-?\d+(?:\.\d{1,2})?$/.test(text))throw Error('Enter a price with no more than two decimal places.');const cents=Math.round(Number(text)*100);if(!Number.isSafeInteger(cents)||Math.abs(cents)>100000000000||(!allowNegative&&cents<0))throw Error('Enter a valid price.');return cents;
}
export function priceEvents(entries:any[],id:string){return entries.filter(e=>e.kind==='price_event'&&e.parent===id).map(e=>{try{return {...e,data:JSON.parse(e.content)}}catch{return null}}).filter(Boolean).sort((a,b)=>a.created.localeCompare(b.created)||a.id.localeCompare(b.id));}
export const pricingFields=['unit_price_cents','unit_cost_cents','freight_cost_cents','freight_charge_cents','post_award_cost_cents','install_cost_cents','quoted_total_cents'] as const;
export function pricingSnapshot(item:any):any{return {...Object.fromEntries(pricingFields.map(f=>[f,item[f]??null])),pricing_mode:item.pricing_mode||'manual',markup_percent:item.markup_percent??null};}
export function itemPricing(item:any,entries:any[]){
 const events=priceEvents(entries,item.id);const orders=events.filter(e=>e.data.type==='change_order');const absorbed=events.filter(e=>e.data.type==='absorbed').reduce((n,e)=>n+e.data.cost_cents,0);
 const charges=orders.reduce((n,e)=>n+e.data.amount_cents,0),extraCost=orders.reduce((n,e)=>n+e.data.cost_cents,0)+absorbed;
 const qty=item.quantity;const base=item.unit_price_cents!=null&&qty!=null?Math.round(item.unit_price_cents*qty):null;const net=item.post_award_cost_cents??item.unit_cost_cents;const baseCost=net!=null&&qty!=null?Math.round(net*qty):null;
 const total=item.quoted_total_cents!=null?item.quoted_total_cents+charges:base===null?null:base+(item.freight_charge_cents||0)+charges,cost=baseCost===null?null:baseCost+(item.freight_cost_cents||0)+(item.install_cost_cents||0)+extraCost;const profit=total===null||cost===null?null:total-cost;
 return {events,absorbed,charges,extraCost,base,baseCost,total,cost,profit,margin:profit===null||total===null||total===0?null:profit/total};
}
export const dollars=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
export function markedUpCents(cost:number,percent:number){if(!Number.isFinite(percent)||percent<0||percent>100000)throw Error('Enter a valid markup percentage.');const value=Math.round(cost*(1+percent/100));if(!Number.isSafeInteger(value)||value>100000000000)throw Error('Price is too large.');return value;}

export function landedSell(item:any,percent:number){const net=item.post_award_cost_cents??item.unit_cost_cents;if(net==null||item.quantity==null)throw Error('Enter my net and quantity first.');return markedUpCents(Math.round(net*item.quantity)+(item.freight_cost_cents||0)+(item.install_cost_cents||0),percent);}
export function pricingTotals(items:any[],entries:any[]){
 let preNet=0,net=0,freight=0,install=0,sell=0,cost=0,priced=0,costed=0;
 for(const item of items){if(item.unit_cost_cents!=null&&item.quantity!=null)preNet+=Math.round(item.unit_cost_cents*item.quantity);const p=itemPricing(item,entries);if(p.baseCost!==null)net+=p.baseCost;freight+=item.freight_cost_cents||0;install+=item.install_cost_cents||0;if(p.total!==null){sell+=p.total;priced++;}if(p.cost!==null){cost+=p.cost;costed++;}}
 const complete=items.length>0&&priced===items.length&&costed===items.length;
 return {preNet,postNet:net,net,freight,install,sell,cost,priced,costed,complete,profit:complete?sell-cost:null,markup:complete&&cost>0?(sell-cost)/cost*100:null};
}
export function matchesFactories(item:any,factories:string[]){return !factories.length||factories.includes(item.manufacturer||'');}

export function markupNeedsRecalculation(before:any,after:any,explicit=false){
 return after.pricing_mode==='markup'&&(explicit||before.unit_price_cents==null&&before.quoted_total_cents==null||before.pricing_mode!=='markup'||before.markup_percent!==after.markup_percent||['unit_cost_cents','freight_cost_cents','install_cost_cents'].some(field=>(before[field]??null)!==(after[field]??null)));
}
