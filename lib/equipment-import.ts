import {moneyCents,pricingFields,pricingSnapshot,pricingAfterQuantity,itemPricing} from './pricing';
export type EquipmentRow={itemnumber:string,quantity?:number|null,name:string,manufacturer?:string,model?:string,pricing?:Record<string,string>,stage?:string,item_id?:string,[key:string]:any};
export const equipmentImportColumns=[['Item number','itemnumber'],['Quantity','quantity'],['Category / Description','name'],['Manufacturer','manufacturer'],['Model number','model'],['Pre-award unit net','unit_cost_cents'],['Post-award unit net','post_award_cost_cents'],['Freight net','freight_cost_cents'],['Install net','install_cost_cents'],['Install %','install_percent'],['Markup %','markup_percent'],['Sell net','quoted_total_cents'],['Quote number','quote_number'],['PO number','po_number'],['Shipping to','shipping_destination'],['Expected receiving date','expected_receiving_date'],['Shop drawings needed','shop_drawings'],['Status','stage'],['Item ID','item_id']];
const normalize=(s:any)=>String(s??'').toLowerCase().replace(/%/g,'percent').replace(/[^a-z0-9]/g,'');
const aliases:Record<string,string>=Object.fromEntries(equipmentImportColumns.flatMap(([label,key])=>[[normalize(label),key],[normalize(key),key]]));
Object.assign(aliases,{netprice:'unit_cost_cents',unitnet:'unit_cost_cents',net:'unit_cost_cents',savedsellnet:'saved_sell_net',item:'itemnumber',itemno:'itemnumber',itemnum:'itemnumber',qty:'quantity',category:'name',description:'name',categorydescription:'name',factory:'manufacturer',model:'model',myunitnet:'unit_cost_cents',preawardnet:'unit_cost_cents',postawardnet:'post_award_cost_cents',freight:'freight_cost_cents',install:'install_cost_cents',markup:'markup_percent',shipping:'shipping_destination',receivingdate:'expected_receiving_date',stage:'stage'});
export function parseEquipmentRows(grid:unknown[][],pricingOnly=false){
 const rows:EquipmentRow[]=[],errors:string[]=[];let header:Record<string,number>|null=null;
 const first=grid.findIndex(cells=>cells.some(c=>c!=null&&String(c).trim()!==''));
 if(first>=0&&grid[first].some(cell=>aliases[normalize(cell)]==='itemnumber')){header={};grid[first].forEach((cell,index)=>{const key=aliases[normalize(cell)];if(key){if(header![key]!==undefined)errors.push('Duplicate column: '+String(cell));header![key]=index;}});}
 grid.forEach((cells,index)=>{
  if(index===first&&header||cells.every(c=>c==null||String(c).trim()===''))return;
  const get=(key:string)=>String(cells[header?header[key]:(pricingOnly?['itemnumber','unit_cost_cents']:['itemnumber','quantity','name','manufacturer','model']).indexOf(key)]??'').trim();
  const itemnumber=get('itemnumber'),name=get('name');if(!itemnumber||!header&&!pricingOnly&&!name){errors.push(`Row ${index+1}: item number${header?'':' and category'} required.`);return;}
  const row:EquipmentRow={itemnumber,name};
  try{
   for(const key of ['name','manufacturer','model','quote_number','po_number','item_id','stage'])if(get(key))row[key]=get(key);
   for(const [key,max] of [['itemnumber',50],['name',300],['manufacturer',200],['model',200],['quote_number',100],['po_number',100]] as const)if((row[key]||'').length>max)throw Error(key+' is too long.');
   const qty=get('quantity');if(qty){row.quantity=Number(qty.replace(/,/g,''));if(!Number.isFinite(row.quantity)||row.quantity!<0)throw Error('Quantity must be a nonnegative number.');}else if(!header&&!pricingOnly)row.quantity=null;
   const pricing:Record<string,string>={};for(const key of ['unit_cost_cents','post_award_cost_cents','freight_cost_cents','install_cost_cents','quoted_total_cents']){const value=get(key);if(value){const cents=moneyCents(value.replace(/[$,]/g,''));pricing[key]=(cents!/100).toFixed(2);}}
   const markup=get('markup_percent');if(markup){const percent=Number(markup.replace(/%$/,''));if(!Number.isFinite(percent)||percent<0||percent>100000)throw Error('Enter a valid markup percentage, including 0.');pricing.markup_percent=String(percent);}
   if(pricing.markup_percent!==undefined&&pricing.quoted_total_cents!==undefined)throw Error('Fill Markup % OR Sell net, not both.');
   const installPercent=get('install_percent');if(installPercent){const percent=Number(installPercent.replace(/%$/,''));if(!Number.isFinite(percent)||percent<0||percent>100000)throw Error('Enter a valid install percentage.');if(pricing.install_cost_cents!==undefined)throw Error('Fill Install % OR Install net, not both.');pricing.install_percent=String(percent);}
   const saved=get('saved_sell_net');if(saved){const cents=moneyCents(saved.replace(/[$,]/g,''));pricing.saved_sell_net=(cents!/100).toFixed(2);}
   if(Object.keys(pricing).length)row.pricing=pricing;
   const shipping=get('shipping_destination');if(shipping){const value=normalize(shipping),dest=({warehouse:'warehouse',jobsite:'job_site',fabricator:'fabricator',installer:'installer'} as any)[value];if(!dest)throw Error('Shipping to must be Warehouse, Job site, Fabricator, or Installer.');row.shipping_destination=dest;}
   const date=get('expected_receiving_date');if(date){const us=date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);const iso=us?`${us[3]}-${us[1].padStart(2,'0')}-${us[2].padStart(2,'0')}`:date;const parsed=new Date(iso+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==iso)throw Error('Use YYYY-MM-DD for receiving date.');row.expected_receiving_date=iso;}
   const drawings=get('shop_drawings');if(drawings){if(!['yes','no'].includes(drawings.toLowerCase()))throw Error('Shop drawings needed must be Yes or No.');row.shop_drawings=drawings.toLowerCase();}
   rows.push(row);
  }catch(e:any){errors.push(`Row ${index+1}: ${e.message}`);}
 });
 if(rows.length>2000)errors.push('Import up to 2,000 items at a time.');return {rows,errors};
}
export function equipmentIdentityIssues(rows:EquipmentRow[],entries:any[],parent:string){
 const counts=new Map<string,number>();for(const row of rows)if(row.item_id)counts.set(row.item_id,(counts.get(row.item_id)||0)+1);
 const seen=new Map<string,number>(),errors:string[]=[];let fallback=0;
 rows.forEach((row,index)=>{if(!row.item_id)return;const key=JSON.stringify([row.item_id,row.itemnumber.toLowerCase(),row.name,row.manufacturer||'',row.model||'']);if(seen.has(key))errors.push(`Rows ${seen.get(key)!+1} and ${index+1}: the same saved item is repeated. Keep one row per item.`);else seen.set(key,index);if(counts.get(row.item_id)!>1||!entries.some(i=>i.kind==='item'&&i.parent===parent&&i.id===row.item_id))fallback++;});
 return {errors,fallback};
}
export function matchEquipmentRows(rows:EquipmentRow[],entries:any[],parent:string){
 const items=entries.filter(i=>i.kind==='item'&&i.parent===parent).sort((a,b)=>(a.created||'').localeCompare(b.created||'')||a.id.localeCompare(b.id));
 const byID=new Map(items.map(i=>[i.id,i])),used=new Set<string>(),matched:any[]=Array(rows.length).fill(undefined),pending:number[]=[],counts=new Map<string,number>();
 for(const row of rows)if(row.item_id)counts.set(row.item_id,(counts.get(row.item_id)||0)+1);
 rows.forEach((row,index)=>{const exact=row.item_id&&counts.get(row.item_id)===1?byID.get(row.item_id):undefined;if(exact){matched[index]=exact;used.add(exact.id);}else pending.push(index);});
 const sameNumber=(item:any,row:EquipmentRow)=>String(item.itemnumber||'').trim().toLowerCase()===row.itemnumber.trim().toLowerCase();
 const specificity=(row:EquipmentRow)=>[row.name,row.manufacturer,row.model].filter(Boolean).length;
 for(const index of [...pending].sort((a,b)=>specificity(rows[b])-specificity(rows[a])||a-b)){
  const row=rows[index];if(!specificity(row))continue;
  const exact=items.find(i=>!used.has(i.id)&&sameNumber(i,row)&&(!row.name||i.name===row.name)&&(!row.manufacturer||i.manufacturer===row.manufacturer)&&(!row.model||i.model===row.model));
  if(exact){matched[index]=exact;used.add(exact.id);}
 }
 for(const index of pending){if(matched[index])continue;const match=items.find(i=>!used.has(i.id)&&sameNumber(i,rows[index]));if(match){matched[index]=match;used.add(match.id);}}
 return matched;
}

export function equipmentImportPricing(row:EquipmentRow,old:any={}){
 if(!row.pricing)return null;old=pricingAfterQuantity(old,row.quantity??old.quantity);const snapshot=pricingSnapshot(old),values:any=Object.fromEntries(pricingFields.map(field=>[field,snapshot[field]===null?'':(snapshot[field]/100).toFixed(2)]));
 Object.assign(values,row.pricing);delete values.markup_percent;delete values.install_percent;delete values.saved_sell_net;if(row.pricing.saved_sell_net!==undefined&&row.pricing.quoted_total_cents===undefined)values.quoted_total_cents=row.pricing.saved_sell_net;
 const explicitSell=row.pricing.quoted_total_cents!==undefined,explicitMarkup=row.pricing.markup_percent!==undefined;
 return {action:'pricing',type:'pricing_update',...values,install_mode:row.pricing.install_percent!==undefined?'percent':row.pricing.install_cost_cents!==undefined?'manual':snapshot.install_mode,install_percent:row.pricing.install_percent??snapshot.install_percent??'',pricing_mode:explicitSell?'manual':explicitMarkup?'markup':snapshot.pricing_mode,markup_percent:explicitMarkup?row.pricing.markup_percent:snapshot.markup_percent??'',expected:JSON.stringify(snapshot),landed_markup:'yes',preserve_import_sell:row.pricing.saved_sell_net!==undefined&& !explicitSell?'yes':'no',recalculate_sell:explicitMarkup&&row.pricing.saved_sell_net===undefined?'yes':'no'};
}

export function equipmentExportGrid(items:any[]){
 const headers=[...equipmentImportColumns.map(([label])=>label),'Saved Sell net'];
 const money=(item:any,field:string)=>item[field]==null?'':item[field]/100;
 const rows=items.map(item=>{const sell=itemPricing(item,[]).total;const values:any={itemnumber:item.itemnumber||'',quantity:item.quantity??'',name:item.name,manufacturer:item.manufacturer||'',model:item.model||'',unit_cost_cents:money(item,'unit_cost_cents'),post_award_cost_cents:money(item,'post_award_cost_cents'),freight_cost_cents:money(item,'freight_cost_cents'),install_cost_cents:item.install_mode==='percent'?'':money(item,'install_cost_cents'),install_percent:item.install_mode==='percent'?item.install_percent??'':'',markup_percent:item.pricing_mode==='markup'?item.markup_percent??'':'',quoted_total_cents:item.pricing_mode==='markup'||sell===null?'':sell/100,quote_number:item.quote_number||'',po_number:item.po_number||'',shipping_destination:({warehouse:'Warehouse',job_site:'Job site',fabricator:'Fabricator',installer:'Installer'} as any)[item.shipping_destination]||'',expected_receiving_date:item.expected_receiving_date||'',shop_drawings:item.shop_drawings==='yes'?'Yes':item.shop_drawings==='no'?'No':'',stage:item.stage||'',item_id:item.id};return [...equipmentImportColumns.map(([,field])=>values[field]??''),item.pricing_mode==='markup'&&sell!==null?sell/100:''];});
 return [headers,...rows];
}

export function bulkPricingIssues(rows:EquipmentRow[],entries:any[],parent:string){
 const matches=matchEquipmentRows(rows,entries,parent);
 return rows.flatMap((row,index)=>{
  const candidates=entries.filter(i=>i.kind==='item'&&i.parent===parent&&String(i.itemnumber||'').trim().toLowerCase()===row.itemnumber.toLowerCase());
  const exactID=row.item_id&&candidates.some(i=>i.id===row.item_id);
  const specific=candidates.filter(i=>(!row.name||i.name===row.name)&&(!row.manufacturer||i.manufacturer===row.manufacturer)&&(!row.model||i.model===row.model));
  if(!matches[index])return ['Item '+row.itemnumber+': no matching item in this folder. Import items first.'];
  if(!exactID&&candidates.length>1&&specific.length!==1)return ['Item '+row.itemnumber+': duplicate item number. Add Item ID or category, manufacturer and model to identify one item.'];
  if(!row.pricing)return ['Item '+row.itemnumber+': enter at least one pricing value.'];
  return [];
 });
}
