export function aqLinks(raw:string){
 const text=raw.replace(/&#(?:x20|32|160);|&nbsp;/gi,' ').replace(/\\[ \t]*\r?\n/g,'\n');
 const parts:{text:string,href?:string}[]=[];let start=0;
 const pattern=/\[([^\]]+)\]\((https?:\/\/[^\s<>]+?)\)|(https?:\/\/[^\s<>\\]+)/gi;
 for(const match of text.matchAll(pattern)){
  const index=match.index!;if(index>start)parts.push({text:text.slice(start,index)});
  const href=(match[2]||match[3]).replace(/[.,;!?)\]]+$/,'');
  try{const url=new URL(href);if(!['https:','http:'].includes(url.protocol))throw Error();parts.push({text:match[1]||href,href});if(!match[2]&&href.length<match[0].length)parts.push({text:match[0].slice(href.length)});}catch{parts.push({text:match[0]});}
  start=index+match[0].length;
 }
 if(start<text.length)parts.push({text:text.slice(start)});return parts;
}
