import type {ScheduleRow} from './schedule';
export type OCRWord={text:string,confidence:number,bbox:{x0:number,y0:number,x1:number,y1:number}};
export type ScheduleColumns={quantity:number,name:number,manufacturer:number,model:number};
export const defaultScheduleColumns:ScheduleColumns={quantity:10,name:14,manufacturer:52,model:77};
export function removeScheduleRules(data:Uint8ClampedArray|Uint8Array,width:number,height:number){
 const rowCounts=new Uint32Array(height),colCounts=new Uint32Array(width);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=(y*width+x)*4;if(data[p]+data[p+1]+data[p+2]<700){rowCounts[y]++;colCounts[x]++;}}
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(rowCounts[y]>width*.7||colCounts[x]>height*.8){const p=(y*width+x)*4;data[p]=data[p+1]=data[p+2]=255;}
 return data;
}
const spare=(name:string)=>/\bspare\s+(?:item\s+)?number\b/i.test(name);
export function extractScheduleWords(blocks:any[]){return blocks.flatMap(block=>(block.paragraphs||[]).flatMap((p:any)=>(p.lines||[]).flatMap((line:any)=>line.words||[]))) as OCRWord[];}
export function inferScheduleColumns(words:OCRWord[],width:number){
 const headers=[[/^(qty|quantity)$/i,'quantity'],[/^(description|category)$/i,'name'],[/^(manufacturer|mfr|factory)$/i,'manufacturer'],[/^model$/i,'model']] as const;
 const detected:any={};let bottom=0;
 for(const [pattern,field]of headers){const word=words.find(w=>pattern.test(w.text.replace(/[^a-z]/gi,'')));if(word){detected[field]=Math.max(0,(word.bbox.x0-5)/width*100);bottom=Math.max(bottom,word.bbox.y1);}}
 const valid=Object.keys(detected).length===4&&detected.quantity<detected.name&&detected.name<detected.manufacturer&&detected.manufacturer<detected.model;
 return {columns:valid?detected as ScheduleColumns:defaultScheduleColumns,headerBottom:valid?bottom:0,detected:valid};
}
export function parseScheduleWords(words:OCRWord[],width:number,columns:ScheduleColumns,headerBottom=0){
 const rows:ScheduleRow[]=[],warnings:string[]=[];let skipped=0;
 if(!width||![columns.quantity,columns.name,columns.manufacturer,columns.model].every(v=>Number.isFinite(v)&&v>0&&v<100)||!(columns.quantity<columns.name&&columns.name<columns.manufacturer&&columns.manufacturer<columns.model))throw Error('Column starts must increase from Quantity through Model, between 0% and 100%.');
 const sorted=words.filter(w=>w.text.trim()&&w.bbox.y0>=headerBottom).sort((a,b)=>(a.bbox.y0+a.bbox.y1)-(b.bbox.y0+b.bbox.y1)||a.bbox.x0-b.bbox.x0);
 const lines:{center:number,height:number,words:OCRWord[]}[]=[];
 for(const word of sorted){const center=(word.bbox.y0+word.bbox.y1)/2,height=word.bbox.y1-word.bbox.y0;const line=lines.find(l=>Math.abs(l.center-center)<Math.max(3,Math.min(height,l.height)*0.6));if(line)line.words.push(word);else lines.push({center,height,words:[word]});}
 let last:ScheduleRow|null=null,skipContinuation=false;
 for(const line of lines){const cells:OCRWord[][]=[[],[],[],[],[]];for(const word of line.words.sort((a,b)=>a.bbox.x0-b.bbox.x0)){const x=(word.bbox.x0+word.bbox.x1)/2/width*100;const index=x<columns.quantity?0:x<columns.name?1:x<columns.manufacturer?2:x<columns.model?3:4;cells[index].push(word);}
  const values=cells.map(cell=>cell.map(w=>w.text).join(' ').trim());
  if(/^item(?:\s*(?:no|number))?$/i.test(values[0])||/^(description|category)$/i.test(values[2]))continue;
  if(!values[0]){if(last&&!skipContinuation){for(const [field,index]of [['name',2],['manufacturer',3],['model',4]] as const)if(values[index])last[field]+=' '+values[index];if(line.words.some(w=>w.confidence<85))last.warning+=' Wrapped text needs checking.';}continue;}
  if(spare(values[2])){skipped++;skipContinuation=true;last=null;continue;}
  skipContinuation=false;
  const quantity=/^\d+(?:\.\d+)?$/.test(values[1])?Number(values[1]):null;
  const issues:string[]=[];if(line.words.some(w=>w.confidence<85))issues.push('OCR confidence is low; compare this row with the screenshot.');if(!values[2])issues.push('Category was not read.');if(!values[3]||!values[4])issues.push('Manufacturer or model is blank; confirm whether it is missing in the source.');if(quantity===null)issues.push('Quantity is blank or nonnumeric; confirm the source value.');
  last={itemnumber:values[0],quantity,name:values[2],manufacturer:values[3],model:values[4],details:values[1]&&quantity===null?'Printed quantity: '+values[1]:'',warning:issues.join(' ')};rows.push(last);
 }
 if(!rows.length)warnings.push('No item rows found. Check the column positions or use a clearer screenshot.');
 return {rows,skipped,warnings};
}
