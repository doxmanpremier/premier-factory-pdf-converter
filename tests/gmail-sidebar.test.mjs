import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

test('Gmail sidebar shows exact conversation destinations and selects their items for a new reply',()=>{
 const widgets=[],requests=[];
 const builder=()=>new Proxy({}, {get:(_,name)=>(...args)=>{widgets.push([String(name),...args]);return builder();}});
 const context={CardService:new Proxy({SelectionInputType:{DROPDOWN:'dropdown',CHECK_BOX:'checkbox'}},{get:(target,name)=>target[name]||builder}),ScriptApp:{AuthMode:{FULL:'full'},requireAllScopes(){}},GmailApp:{setCurrentMessageAccessToken(){},getMessageById:()=>({getId:()=> 'reply',getHeader:name=>name==='Message-ID'?'<reply>':'',getThread:()=>({getMessages:()=>[{getHeader:()=>'<older>',getId:()=> 'older'}]})})}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('gmail-addon/Code.gs','utf8'),context);
 const saved=[{id:'z',name:'Hotel <North>',items:[{id:'equipment',itemnumber:'101',name:'Oven'}]}];
 context.api_=(path,data)=>{requests.push([path,data]);if(path==='locations')return saved;if(path==='projects')return [{id:'a',name:'Other'},{id:'z',name:'Hotel <North>'}];if(path.startsWith('items?'))return [{id:'equipment',itemnumber:'101',name:'Oven'}];if(path.startsWith('stages?'))return [];throw Error(path);};
 const e={gmail:{messageId:'reply',threadId:'thread1',accessToken:'fixture'},parameters:{messageId:'reply'},commonEventObject:{formInputs:{projectId:{stringInputs:{value:['z']}}}}};
 context.onGmailMessage(e);
 assert.ok(widgets.some(w=>w[0]==='setText'&&w[1]==='Project: Hotel &lt;North&gt;'));
 assert.ok(widgets.some(w=>w[0]==='setText'&&w[1]==='Items: 101 · Oven'));
 assert.ok(widgets.some(w=>w[0]==='addItem'&&w[2]==='z'&&w[3]===true));
 assert.ok(requests[0][1].messageIds.includes('<older>'));
 assert.equal(requests[0][1].body,undefined);
 context.chooseItems(e);
 assert.ok(widgets.some(w=>w[0]==='addItem'&&w[2]==='equipment'&&w[3]===true));
 const before=requests.length;e.gmail.messageId='different';context.chooseItems(e);assert.equal(requests.length,before);
});
