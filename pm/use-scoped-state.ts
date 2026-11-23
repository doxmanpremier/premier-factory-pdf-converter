import {useState} from 'react';
export function useScopedState<T extends object>(scope:string,initial:T){
 const [states,setStates]=useState<Record<string,T>>({});
 function stored(){try{return JSON.parse(localStorage.getItem('premier-view:'+scope)||'{}');}catch{return {};}}
 const value=states[scope]||{...initial,...stored()};
 function update(patch:Partial<T>){setStates(previous=>{const next={...initial,...stored(),...previous[scope],...patch};try{const {view,filters}=next as any;localStorage.setItem('premier-view:'+scope,JSON.stringify({view,filters}));}catch{}return {...previous,[scope]:next};});}
 return [value,update] as const;
}
