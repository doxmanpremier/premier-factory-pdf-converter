import {useEffect,useRef,useState} from 'react';
import {createScheduleReader} from './browser-ocr';

export default function NoteScreenshot({file,onFile,onText,onReading,disabled}:{file:File|null,onFile:(file:File|null)=>void,onText:(text:string)=>void,onReading:(reading:boolean)=>void,disabled:boolean}){
 const [url,setUrl]=useState(''),[status,setStatus]=useState('');const alive=useRef(true),worker=useRef<any>(null);
 useEffect(()=>{alive.current=true;return ()=>{alive.current=false;void worker.current?.terminate();onReading(false);};},[]);
 useEffect(()=>{if(!file){setUrl('');return;}const value=URL.createObjectURL(file);setUrl(value);return ()=>URL.revokeObjectURL(value);},[file]);
 function choose(image:File){if(!['image/png','image/jpeg','image/webp'].includes(image.type)||!image.size||image.size>10*1024*1024){setStatus('Choose a PNG, JPEG or WebP screenshot up to 10 MB.');return;}onFile(image);setStatus('Screenshot attached. Read its text, then review and edit the note before saving.');}
 async function read(){if(!file||disabled)return;onReading(true);setStatus('Starting text recognition…');let reader:any;try{reader=await createScheduleReader(message=>{if(alive.current)setStatus(message);});worker.current=reader;if(!alive.current)return;
  const bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>20000000){bitmap.close();throw Error('Screenshot is too large to read. Crop it and try again.');}const scale=Math.min(3,Math.max(1,2200/bitmap.width)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const context=canvas.getContext('2d')!;context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const result=await reader.recognize(canvas);if(!alive.current)return;const text=result.data.text.trim();if(!text)throw Error('No text found. Try a clearer screenshot or type the note below.');onText(text);setStatus('Text added below. Check it against the screenshot and edit as needed.');
 }catch(e:any){if(alive.current)setStatus(e.message||'Could not read this screenshot. You can still type the note and save the image.');}finally{await reader?.terminate();worker.current=null;if(alive.current)onReading(false);}}
 return <div className="note-image-tools" tabIndex={0} aria-label="Paste email screenshot here" onPaste={e=>{if(disabled)return;const image=Array.from(e.clipboardData.files).find(value=>value.type.startsWith('image/'));if(image){e.preventDefault();choose(image);}}}>
  <label>Add email screenshot<input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} onChange={e=>{const image=e.target.files?.[0];if(image)choose(image);e.target.value='';}}/></label>
  <small>Upload an image or click here and paste a screenshot. Text recognition runs in your browser.</small>
  {file&&<><img className="note-screenshot" src={url} alt="Email screenshot to attach"/><div><button type="button" disabled={disabled} onClick={read}>Read text into note</button><button type="button" disabled={disabled} onClick={()=>{onFile(null);setStatus('Screenshot removed. Any extracted text remains in your note.');}}>Remove screenshot</button></div><small>Screenshots are saved to this note only. Shared PO/quote notes support text only.</small></>}
  {status&&<p role="status">{status}</p>}
 </div>;
}
