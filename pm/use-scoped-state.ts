import {useState} from 'react';
export function useScopedState<T extends object>(scope:string,initial:T){
 const [states,setStates]=useState<Record<string,T>>({});
 const value=states[scope]||initial;
 function update(patch:Partial<T>){setStates(previous=>({...previous,[scope]:{...initial,...previous[scope],...patch}}));}
 return [value,update] as const;
}
