export function sortEquipment(items:any[],sort:string){
 const result=[...items];if(!sort||sort==='manual')return result;const [field,direction]=sort.split(':');const sign=direction==='desc'?-1:1;
 return result.sort((a,b)=>{const av=a[field],bv=b[field];const emptyA=av===null||av===undefined||av==='',emptyB=bv===null||bv===undefined||bv==='';if(emptyA!==emptyB)return emptyA?1:-1;return sign*String(av??'').localeCompare(String(bv??''),undefined,{numeric:true,sensitivity:'base'});});
}
export function applyVisibleOrder(allIDs:string[],visibleIDs:string[]){const visible=new Set(visibleIDs);let index=0;return allIDs.map(id=>visible.has(id)?visibleIDs[index++]:id);}
export function dropBoardItem(ids:string[],source:string,target:string|null,edge:'before'|'after'='before'){if(source===target||!ids.includes(source)||target&&!ids.includes(target))return ids;const next=ids.filter(id=>id!==source);const index=target?next.indexOf(target)+(edge==='after'?1:0):next.length;next.splice(index,0,source);return next;}

// List order deliberately ignores the board's saved ranks and column sort preferences.
export function sortListEquipment(items:any[],statuses:{name:string}[],sort='itemnumber'){
 const ranks=new Map(statuses.map((s,i)=>[s.name,i]));
 const base=[...items].sort((a,b)=>String(a.itemnumber||'').localeCompare(String(b.itemnumber||''),undefined,{numeric:true,sensitivity:'base'})||a.id.localeCompare(b.id));
 const within=sortEquipment(base,sort==='manual'||sort==='stage'?'itemnumber':sort);
 return within.sort((a,b)=>(ranks.get(a.stage)??statuses.length)-(ranks.get(b.stage)??statuses.length));
}
