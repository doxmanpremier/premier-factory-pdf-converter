export function latestNotes(entries:any[]){const notes=new Map<string,any>();for(const entry of entries){if(String(entry.id).startsWith('awarded-import-details:')||entry.name==='Imported specification & accessories'||entry.kind!=='note'||!entry.parent||!entry.content?.trim())continue;const previous=notes.get(entry.parent);if(!previous||entry.created>previous.created||(entry.created===previous.created&&entry.id>previous.id))notes.set(entry.parent,entry);}return notes;}

export function emailDetails(entry:any):{body:string,from:string,to:string,loggedAt:string}{
 try{const data=JSON.parse(entry.content||'{}');return {body:typeof data.body==='string'?data.body:'',from:typeof data.from==='string'?data.from:'',to:typeof data.to==='string'?data.to:'',loggedAt:typeof data.loggedAt==='string'&&Number.isFinite(Date.parse(data.loggedAt))?new Date(data.loggedAt).toISOString():entry.created};}
 catch{return {body:entry.content||'',from:'',to:'',loggedAt:entry.created};}
}
// Compare email sent times with note creation times; logging an old email does not make it newer.
export function latestItemUpdates(entries:any[]){
 const updates=latestNotes(entries);
 for(const entry of entries){
  if(entry.kind!=='email'||!entry.parent)continue;
  const previous=updates.get(entry.parent),date=Date.parse(entry.created),previousDate=previous?Date.parse(previous.created):0;
  if(!previous||date>previousDate||date===previousDate&&entry.id>previous.id)updates.set(entry.parent,entry);
 }
 return updates;
}
