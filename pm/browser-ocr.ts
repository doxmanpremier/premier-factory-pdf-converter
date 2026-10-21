import {createWorker} from 'tesseract.js';
import {extractScheduleWords,inferScheduleColumns,removeScheduleRules} from '../lib/schedule-ocr';
export async function createScheduleReader(progress:(status:string)=>void){return createWorker('eng',1,{workerPath:'/ocr/worker.min.js',corePath:'/ocr/core',langPath:'/ocr/lang',logger:(message:any)=>progress(message.status+(message.progress!=null?' '+Math.round(message.progress*100)+'%':''))});}
export async function readScheduleImage(worker:any,file:File){
 const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas');const scale=Math.min(3,Math.max(1,2200/bitmap.width));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const context=canvas.getContext('2d')!;context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 const pixels=context.getImageData(0,0,canvas.width,canvas.height),data=pixels.data;
 // Remove long table rules, which otherwise get read as letters or punctuation.
 removeScheduleRules(data,canvas.width,canvas.height);
 context.putImageData(pixels,0,0);
 const result=await worker.recognize(canvas,{}, {blocks:true});const words=extractScheduleWords(result.data.blocks||[]);return {words,width:canvas.width,...inferScheduleColumns(words,canvas.width)};
}
