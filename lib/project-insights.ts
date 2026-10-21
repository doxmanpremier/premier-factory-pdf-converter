import {itemPricing,pricingTotals} from './pricing';
import {projectScope,statusesFor} from './stages';
export function isImportedSpecification(entry:any){return entry.kind==='note'&&(String(entry.id).startsWith('awarded-import-details:')||entry.name==='Imported specification & accessories');}
export function descendants(entries:any[],parent:string){const children=new Map<string,any[]>();for(const entry of entries){const list=children.get(entry.parent)||[];list.push(entry);children.set(entry.parent,list);}const seen=new Set([parent]),result:any[]=[],queue=[parent];for(let i=0;i<queue.length;i++)for(const entry of children.get(queue[i])||[]){if(seen.has(entry.id))continue;seen.add(entry.id);result.push(entry);queue.push(entry.id);}return result;}
export function itemWorkFlags(item:any,entries:any[],today:string,installed='Installed',received='Received at warehouse'){
 const price=itemPricing(item,entries),done=item.stage===installed,arrived=done||item.stage===received;
 const drawings=entries.filter(e=>e.parent===item.id&&['file','link'].includes(e.kind)&&e.content==='item-document:drawings');
 // Only the newest revision for each filename can satisfy approval.
 const latest=new Map<string,any>();for(const drawing of drawings){const previous=latest.get(drawing.name);if(!previous||drawing.created>previous.created||drawing.created===previous.created&&drawing.id>previous.id)latest.set(drawing.name,drawing);}
 const awaitingDrawings=item.shop_drawings==='yes'&&(!latest.size||[...latest.values()].some(d=>d.stage!=='approved'));
 const overdueTask=entries.some(e=>e.parent===item.id&&e.kind==='task'&&e.stage!=='done'&&e.date&&e.date<today);
 return {done,arrived,missingPricing:price.total===null||price.cost===null,awaitingDrawings,overdue:overdueTask||!arrived&&!!item.expected_receiving_date&&item.expected_receiving_date<today};
}
export function projectInsights(entries:any[],parent:string,today:string,direct=false){
 const scoped=descendants(entries,parent),items=scoped.filter(e=>e.kind==='item'&&(!direct||e.parent===parent)),stages=statusesFor(entries,projectScope(entries,parent));
 const installed=stages.find(s=>(s.content||s.name)==='Installed')?.name||'Installed',received=stages.find(s=>(s.content||s.name)==='Received at warehouse')?.name||'Received at warehouse';
 const flags=items.map(item=>itemWorkFlags(item,scoped,today,installed,received)),tasks=scoped.filter(e=>e.kind==='task'&&e.stage!=='done');
 const deliveries=items.filter((item,index)=>!flags[index].arrived&&item.expected_receiving_date&&item.expected_receiving_date>=today).map(e=>e.expected_receiving_date).sort();
 const dates=[entries.find(e=>e.id===parent)?.created,...scoped.map(e=>e.created)].filter(Boolean).sort();
 return {items:items.length,installed:flags.filter(f=>f.done).length,missingPricing:flags.filter(f=>f.missingPricing).length,awaitingDrawings:flags.filter(f=>f.awaitingDrawings).length,overdueItems:flags.filter(f=>f.overdue).length,openTasks:tasks.length,overdueTasks:tasks.filter(e=>e.date&&e.date<today).length,nextDelivery:deliveries[0]||null,lastActivity:dates.at(-1)||null,totals:pricingTotals(items,scoped)};
}
