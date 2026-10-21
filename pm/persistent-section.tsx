'use client';
import {useEffect,useState,ReactNode} from 'react';
export default function PersistentSection({scope,title,children}: {scope:string,title:string,children:ReactNode}){
 const [open,setOpen]=useState(false),[ready,setReady]=useState(false);
 useEffect(()=>{setReady(false);try{setOpen(localStorage.getItem('pm-section:'+scope)==='open');}catch{setOpen(false);}setReady(true);},[scope]);
 return <section className="collapsible-section"><button className="section-toggle" aria-expanded={open} onClick={()=>{const next=!open;setOpen(next);if(ready)try{localStorage.setItem('pm-section:'+scope,next?'open':'closed');}catch{}}}><span>{title}</span><span aria-hidden="true">{open?'−':'+'}</span></button>{open&&<div className="section-content">{children}</div>}</section>;
}
