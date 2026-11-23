const fileTypes:Record<string,string>={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',xls:'application/vnd.ms-excel',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',csv:'text/csv',txt:'text/plain'};
export function downloadDetails(name:string,mime?:string|null){
 const clean=(name||'Document').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g,'-').trim().replace(/[. ]+$/,'')||'Document';
 const supplied=(mime||'').split(';')[0].trim().toLowerCase();
 const extension=clean.match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase();
 const type=supplied&&supplied!=='application/octet-stream'?supplied:fileTypes[extension||'']||'application/octet-stream';
 const suffix=Object.keys(fileTypes).find(key=>fileTypes[key]===type);
 const filename=suffix&&fileTypes[extension||'']!==type?clean+'.'+suffix:clean;
 return {filename,type};
}
export function downloadDisposition(filename:string,inline:boolean){
 const fallback=filename.replace(/[^\x20-\x7e]|["\\]/g,'_');
 const encoded=encodeURIComponent(filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
 return `${inline?'inline':'attachment'}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
