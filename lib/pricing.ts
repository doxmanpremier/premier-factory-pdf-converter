export function moneyCents(value:string,allowNegative=false){
 const text=String(value).trim();if(!text)return null;if(!/^-?\d+(?:\.\d{1,2})?$/.test(text))throw Error('Enter a price with no more than two decimal places.');const cents=Math.round(Number(text)*100);if(!Number.isSafeInteger(cents)||Math.abs(cents)>100000000000||(!allowNegative&&cents<0))throw Error('Enter a valid price.');return cents;
}
export function discountedPostAward(pre:number|null,raw:string){
 const text=String(raw).trim(),percent=Number(text);
 if(pre==null||!Number.isSafeInteger(pre)||pre<0)throw Error('Enter pre-award unit net before applying a discount.');
 if(!text||!Number.isFinite(percent)||percent<0||percent>100)throw Error('Enter a post-award discount between 0% and 100%.');
 return Math.round(pre*(1-percent/100));
}
export function priceEvents(entries:any[],id:string){return entries.filter(e=>e.kind==='price_event'&&e.parent===id).map(e=>{try{return {...e,data:JSON.parse(e.content)}}catch{return null}}).filter(Boolean).sort((a,b)=>a.created.localeCompare(b.created)||a.id.localeCompare(b.id));}
export const pricingFields=['unit_price_cents','unit_cost_cents','freight_cost_cents','freight_charge_cents','post_award_cost_cents','install_cost_cents','quoted_total_cents'] as const;
export function pricingSnapshot(item:any):any{return {...Object.fromEntries(pricingFields.map(f=>[f,item[f]??null])),pricing_mode:item.pricing_mode||'manual',markup_percent:item.markup_percent??null,install_mode:item.install_mode||'manual',install_percent:item.install_percent??null};}
function lineCost(equipment:number|null,item:any){
 const {freight_cost_cents:freight,install_cost_cents:install}=item;
 if(equipment===null&&freight==null&&install==null)return null;
 return (equipment??0)+(freight??0)+(install??0);
}
export function itemPricing(item:any,entries:any[],calculateSell=false){
 const events=priceEvents(entries,item.id);const orders=events.filter(e=>e.data.type==='change_order');const absorbed=events.filter(e=>e.data.type==='absorbed').reduce((n,e)=>n+e.data.cost_cents,0);
 const charges=orders.reduce((n,e)=>n+e.data.amount_cents,0),extraCost=orders.reduce((n,e)=>n+e.data.cost_cents,0)+absorbed;
 const qty=item.quantity;const base=item.unit_price_cents!=null&&qty!=null?Math.round(item.unit_price_cents*qty):null;const net=item.post_award_cost_cents??item.unit_cost_cents;const baseCost=net!=null&&qty!=null?Math.round(net*qty):null;
 const landedCost=lineCost(baseCost,item);
 const quoteCost=calculateSell?lineCost(itemNetTotals(item).pre,item):null;
 const total=calculateSell
  ? quoteCost===null?null:Math.round(quoteCost*(1+(item.markup_percent??0)/100))
  : item.quoted_total_cents!=null?item.quoted_total_cents+charges:base===null?null:base+(item.freight_charge_cents||0)+charges;
 const cost=landedCost===null?null:landedCost+extraCost;
 const profitCost=calculateSell?landedCost:cost;
 const profit=total===null||profitCost===null?null:total-profitCost;
 return {events,absorbed,charges,extraCost,base,baseCost,total,quoteCost,landedCost,cost,profit,margin:profit===null||total===null||total===0?null:profit/total};
}
const currencyFormat=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
export const dollars=(cents:number)=>currencyFormat.format(cents/100);
export function markedUpCents(cost:number,percent:number){if(!Number.isFinite(percent)||percent<0||percent>100000)throw Error('Enter a valid markup percentage.');const value=Math.round(cost*(1+percent/100));if(!Number.isSafeInteger(value)||value>100000000000)throw Error('Price is too large.');return value;}

export function landedSell(item:any,percent:number){const cost=markupLineCost(item);if(cost===null)throw Error('Enter pre-award net and quantity, freight, or installation first.');return markedUpCents(cost,percent);}
function markupLineCost(item:any){
 const net=item.unit_cost_cents;
 if(net!=null&&item.quantity==null)return null;
 return lineCost(net==null?null:Math.round(net*item.quantity),item);
}
export function pricingTotals(items:any[],entries:any[],calculateSell=false){
 let preNet=0,net=0,freight=0,install=0,sell=0,cost=0,landedCost=0,priced=0,costed=0,equipmentCosted=0,profit=0,profitItems=0,markupCost=0,markupSell=0,markupItems=0,profitSell=0,discountBase=0,discountAmount=0,discountItems=0;
 for(const item of items){if(item.unit_cost_cents!=null&&item.post_award_cost_cents!=null&&item.quantity!=null){discountBase+=Math.round(item.unit_cost_cents*item.quantity);discountAmount+=Math.round(item.unit_cost_cents*item.quantity)-Math.round(item.post_award_cost_cents*item.quantity);discountItems++;}if(item.unit_cost_cents!=null&&item.quantity!=null)preNet+=Math.round(item.unit_cost_cents*item.quantity);const p=itemPricing(item,entries,calculateSell);const markupBase=calculateSell?p.quoteCost:markupLineCost(item);if(markupBase!==null&&p.total!==null){markupCost+=markupBase+(calculateSell?0:p.extraCost);markupSell+=p.total;markupItems++;}if(p.profit!==null){profit+=p.profit;profitSell+=p.total!;profitItems++;}if(p.baseCost!==null){net+=p.baseCost;equipmentCosted++;}freight+=item.freight_cost_cents||0;install+=item.install_cost_cents||0;if(p.total!==null){sell+=p.total;priced++;}if(p.cost!==null){cost+=p.cost;landedCost+=p.landedCost!;costed++;}}
 const complete=items.length>0&&priced===items.length&&costed===items.length;
 if(calculateSell&&priced){profit=sell-landedCost;profitSell=sell;}
 return {discountItems,discountAmount,discountPercent:discountItems&&discountBase>0?discountAmount/discountBase*100:null,profitPercent:profitItems&&profitSell>0?profit/profitSell*100:null,preEntered:items.filter(i=>i.unit_cost_cents!=null&&i.quantity!=null).length,freightEntered:items.filter(i=>i.freight_cost_cents!=null).length,installEntered:items.filter(i=>i.install_cost_cents!=null).length,preNet,postNet:net,net,freight,install,sell,cost,landedCost,priced,costed,equipmentCosted,complete,profitItems,profit:(calculateSell?priced:profitItems)?profit:null,markupItems,markup:markupItems&&markupCost>0?(markupSell-markupCost)/markupCost*100:null};
}
export function matchesFactories(item:any,factories:string[]){return !factories.length||factories.includes(item.manufacturer||'');}

export function markupNeedsRecalculation(before:any,after:any,explicit=false){
 const postOnlyInstall=after.install_mode==='percent'&&before.install_mode==='percent'&&after.install_percent===before.install_percent&&after.post_award_cost_cents!==before.post_award_cost_cents;
 const changed=['unit_cost_cents','freight_cost_cents','install_mode','install_percent',...(!postOnlyInstall?['install_cost_cents']:[])].some(field=>(before[field]??null)!==(after[field]??null));
 return after.pricing_mode==='markup'&&(explicit||before.unit_price_cents==null&&before.quoted_total_cents==null||before.pricing_mode!=='markup'||before.markup_percent!==after.markup_percent||changed);
}

export function installationCost(item:any,percent:number){
 const net=item.post_award_cost_cents??item.unit_cost_cents;if(net==null||item.quantity==null)throw Error('Enter my net and quantity for installation percentage.');
 if(!Number.isFinite(percent)||percent<0||percent>100000)throw Error('Enter a valid install percentage.');
 const value=Math.round(Math.round(net*item.quantity)*percent/100);if(!Number.isSafeInteger(value)||value>100000000000)throw Error('Installation cost is too large.');return value;
}

export function pricingAfterQuantity(item:any,quantity:any){
 const after={...item,quantity};
 if(quantity===item.quantity)return after;
 if(item.install_mode==='percent')after.install_cost_cents=installationCost(after,item.install_percent);
 if(item.pricing_mode==='markup'&&(item.quoted_total_cents!=null||item.install_mode==='percent'))after.quoted_total_cents=markupLineCost(after)===null?null:landedSell(after,item.markup_percent);
 return after;
}

export function itemNetTotals(item:any){
 const quantity=item.quantity;const valid=typeof quantity==='number'&&Number.isFinite(quantity)&&quantity>=0;
 const extend=(unit:any)=>valid&&unit!=null&&Number.isSafeInteger(unit)&&unit>=0?Math.round(unit*quantity):null;
 return {pre:extend(item.unit_cost_cents),post:extend(item.post_award_cost_cents)};
}

export function itemDiscountPercent(item:any){return item.unit_cost_cents>0&&item.post_award_cost_cents!=null?(1-item.post_award_cost_cents/item.unit_cost_cents)*100:null;}
export const percentLabel=(percent:number)=>Number(percent.toFixed(2)).toString()+'%';
