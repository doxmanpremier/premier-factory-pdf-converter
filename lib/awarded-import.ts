import type {EquipmentRow} from './equipment-import';
const key=(value:unknown)=>String(value??'').toLowerCase().replace(/[^a-z0-9]/g,'');
export const awardedImportHeaders=['ItemNo','Mfr','Model','Qty','Unit','Category','Spec','Markup','Sell','SellTotal','List','Discount','Net','Weight','Net Freight','Net Install','Class','Case Cube','Spreadsheet Notes','Taxable','Units Per Case','Special'];
export function isAwardedSpreadsheet(grid:unknown[][]){const row=grid.find(r=>r.some(v=>String(v??'').trim()));const keys=new Set((row||[]).map(key));return ['itemno','mfr','model','qty','category'].every(k=>keys.has(k))&&(keys.has('spec')||keys.has('selltotal')||keys.has('net'));}
export function shortAwardedCategory(value:string){const text=value.replace(/\s+/g,' ').trim();return text.length>45?text.split(' ').slice(0,5).join(' ').slice(0,80):text;}
export function parseAwardedRows(grid:unknown[][]){
 const rows:EquipmentRow[]=[],errors:string[]=[];
 if(!isAwardedSpreadsheet(grid))return {rows,errors:['Use an awarded spreadsheet with ItemNo, Mfr, Model, Qty and Category headers.']};
 const start=grid.findIndex(r=>r.some(v=>String(v??'').trim())),columns=new Map<string,number>();
 grid[start].forEach((v,i)=>{const k=key(v);if(!k)return;if(columns.has(k))errors.push('Duplicate column: '+String(v));columns.set(k,i);});
 let group:{row:EquipmentRow,parts:unknown[][],source:number}|null=null;
 const get=(cells:unknown[],name:string)=>String(cells[columns.get(name)??-1]??'').trim();
 const number=(text:string,label:string)=>{const cleaned=text.replace(/[$,]/g,'');if(!/^\d+(?:\.\d+)?$/.test(cleaned))throw Error('Enter a nonnegative '+label+'.');const value=Number(cleaned);if(!Number.isFinite(value)||value>1000000000)throw Error(label+' is too large.');return value;};
 const money=(text:string,label:string)=>{const value=Math.round(number(text,label)*100);if(!Number.isSafeInteger(value)||value>100000000000)throw Error(label+' is too large.');return value;};
 function finish(){
  if(!group)return;
  const {row,parts,source}=group;
  try{
   const qty=row.quantity!;let net=0,sell=0,freight=0,install=0,hasNet=false,hasSell=false,hasFreight=false,hasInstall=false;
   const notes=[`Imported equipment details — item ${row.itemnumber}`,`Category: ${get(parts[0],'category')}`];
   parts.forEach((cells,index)=>{
    const spec=get(cells,'spec'),model=get(cells,'model'),mfr=get(cells,'mfr'),partQty=get(cells,'qty');
    const q=partQty?number(partQty,'quantity'):null;
    const n=get(cells,'net'),total=get(cells,'selltotal'),unitSell=get(cells,'sell');
    if(n){if(q===null)throw Error('Enter Qty for each priced equipment/accessory row.');net+=Math.round(money(n,'Net')*q);hasNet=true;}
    let partSell:number|null=null;
    if(total)partSell=money(total,'SellTotal');else if(unitSell){if(q===null)throw Error('Enter Qty to extend Sell.');partSell=Math.round(money(unitSell,'Sell')*q);}
    if(partSell!==null){sell+=partSell;hasSell=true;}
    const f=get(cells,'netfreight'),i=get(cells,'netinstall');if(f){freight+=money(f,'Net Freight');hasFreight=true;}if(i){install+=money(i,'Net Install');hasInstall=true;}
    const details=[spec,...['spreadsheetnotes','special'].map(k=>get(cells,k)).filter(Boolean)].filter(Boolean).join('\n');
    if(index===0){if(details)notes.push('Specification:\n'+details);}else{
     const label=[q===null?'':`Qty ${q}`,mfr,model].filter(Boolean).join(' · ');
     notes.push(`Accessory / option${label?' ('+label+')':''}: ${details||'No description provided'}${partSell===null?'':`\nIncluded line sell: $${(partSell/100).toFixed(2)}`}`);
    }
    const discount=get(cells,'discount');if(discount)notes.push(`Factory discount${index?' for accessory':''}: ${discount}`);
   });
   const pricing:Record<string,string>={};
   if(hasNet)pricing.unit_cost_cents=(Math.round(net/qty)/100).toFixed(2);
   if(hasSell)pricing.quoted_total_cents=(sell/100).toFixed(2);
   if(hasFreight)pricing.freight_cost_cents=(freight/100).toFixed(2);
   if(hasInstall)pricing.install_cost_cents=(install/100).toFixed(2);
   if(Object.keys(pricing).length)row.pricing=pricing;
   row.import_details=notes.join('\n\n');row.accessory_count=parts.length-1;
   if(row.import_details.length>20000)throw Error('Combined specifications exceed 20,000 characters. Split this item before importing.');
   for(const [field,max] of [['itemnumber',50],['name',300],['manufacturer',200],['model',200]] as const)if(String(row[field]||'').length>max)throw Error(field+' is too long.');
   rows.push(row);
  }catch(e:any){errors.push(`Row ${source}, item ${row.itemnumber}: ${e.message}`);}
  group=null;
 }
 grid.slice(start+1).forEach((cells,offset)=>{
  if(cells.every(v=>!String(v??'').trim()))return;
  const source=start+offset+2,item=get(cells,'itemno');
  if(item){finish();try{const category=get(cells,'category')||get(cells,'spec');if(!category)throw Error('Category or Spec is required.');const qty=number(get(cells,'qty'),'Qty');if(qty<=0)throw Error('Main item Qty must be greater than zero.');group={row:{itemnumber:item,quantity:qty,name:shortAwardedCategory(category),manufacturer:get(cells,'mfr'),model:get(cells,'model')},parts:[cells],source};}catch(e:any){errors.push(`Row ${source}: ${e.message}`);}return;}
  if(!group){errors.push(`Row ${source}: accessory row has no preceding item number.`);return;}
  if(!['spec','model','mfr','spreadsheetnotes','special'].some(k=>get(cells,k))){errors.push(`Row ${source}: unnamed accessory or total row. Remove totals before importing.`);return;}
  group.parts.push(cells);
 });
 finish();if(rows.length>2000)errors.push('Import up to 2,000 items at a time.');return {rows,errors};
}
