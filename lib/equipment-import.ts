export type EquipmentRow={itemnumber:string,quantity:number|null,name:string,manufacturer:string,model:string};
export function parseEquipmentRows(grid:unknown[][]){
 const rows:EquipmentRow[]=[];const errors:string[]=[];
 grid.forEach((cells,index)=>{
  if(cells.every(c=>c==null||String(c).trim()===''))return;
  const values=Array.from({length:5},(_,i)=>String(cells[i]??'').trim());
  if(index===0&&/^(item\s*(number|#|no\.?|num)?|itemnumber)$/i.test(values[0]))return;
  const [itemnumber,rawQuantity,name,manufacturer,model]=values;
  const quantity=rawQuantity===''?null:Number(rawQuantity);
  if(!itemnumber||!name){errors.push(`Row ${index+1}: item number and category are required.`);return;}
  if(itemnumber.length>50||name.length>300||manufacturer.length>200||model.length>200){errors.push(`Row ${index+1}: a field is too long.`);return;}
  if(quantity!==null&&(!Number.isFinite(quantity)||quantity<0)){errors.push(`Row ${index+1}: quantity must be a nonnegative number.`);return;}
  rows.push({itemnumber,quantity,name,manufacturer,model});
 });
 if(rows.length>2000)errors.push('Import up to 2,000 items at a time.');
 return {rows,errors};
}

export function matchEquipmentRows(rows:EquipmentRow[],entries:any[],parent:string){const used=new Set<string>();return rows.map(row=>{const candidates=entries.filter(i=>i.kind==='item'&&i.parent===parent&&i.itemnumber?.toLowerCase()===row.itemnumber.toLowerCase()&&!used.has(i.id)).sort((a,b)=>(a.created||'').localeCompare(b.created||'')||a.id.localeCompare(b.id));const match=candidates.find(i=>i.name===row.name&&i.manufacturer===row.manufacturer&&i.model===row.model)||candidates[0];if(match)used.add(match.id);return match;});}
