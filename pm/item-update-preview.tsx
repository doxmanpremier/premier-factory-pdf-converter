import {emailDetails} from '../lib/latest-notes';

export default function ItemUpdatePreview({entry,itemNumber,entries}:{entry:any,itemNumber:string,entries:any[]}){
 const email=entry.kind==='email',data=email?emailDetails(entry):null,body=email?data!.body:String(entry.content||'');
 const line=(email?[entry.name,body||'(No message text)'].filter(Boolean).join(' · '):body).replace(/\s+/g,' ').trim();
 const files=email?entries.filter(file=>file.kind==='file'&&file.parent===entry.id):[];
 return <details className="item-update-preview" aria-label={(email?'Latest email':'Latest note')+' for item '+itemNumber}>
  <summary><span className="item-update-label">{email?'Latest email':'Latest note'}</span><span className="item-update-line">{line}</span><time dateTime={entry.created}>{new Date(entry.created).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</time></summary>
  <div className="item-update-expanded">
   {email&&<><strong>{entry.name}</strong><div className="item-update-parties">From: {data!.from}<br/>To: {data!.to}<br/>Sent: <time dateTime={entry.created}>{new Date(entry.created).toLocaleString()}</time></div></>}
   <p>{body||'(No message text)'}</p>
   {files.length>0&&<div className="item-update-files"><strong>Attachments</strong>{files.map(file=><a key={file.id} href={'/api/pm/file?id='+encodeURIComponent(file.id)} target="_blank" rel="noopener noreferrer">{file.name}</a>)}</div>}
   {email&&entry.url&&/^https:\/\/mail\.google\.com\//.test(entry.url)&&<a href={entry.url} target="_blank" rel="noopener noreferrer">Open original in Gmail</a>}
  </div>
 </details>;
}
