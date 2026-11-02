import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
test('Push worker shows generic malformed-payload fallback and refuses foreign navigation',async()=>{
 const handlers={},shown=[],opened=[];
 const self={location:{origin:'https://preview.example.test'},addEventListener:(name,fn)=>handlers[name]=fn,registration:{showNotification:async(title,options)=>shown.push({title,...options})},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
 vm.runInNewContext(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'),{self,URL});
 let pending;handlers.push({data:{json:()=>{throw Error('Malformed')}},waitUntil:p=>pending=p});await pending;assert.equal(shown[0].title,'ITF · Ticket update');assert.equal(shown[0].data.url,'/');
 handlers.push({data:{json:()=>({title:'ITF · TCK-1821',url:'https://evil.example/'})},waitUntil:p=>pending=p});await pending;assert.equal(shown[1].data.url,'/');
 handlers.notificationclick({notification:{close(){},data:{url:'https://evil.example/'}},waitUntil:p=>pending=p});await pending;assert.equal(opened.length,0);
 handlers.notificationclick({notification:{close(){},data:{url:'/?ticket=TCK-1821'}},waitUntil:p=>pending=p});await pending;assert.equal(opened[0],'https://preview.example.test/?ticket=TCK-1821');
 handlers.push({data:{json:()=>({url:'/#ticket/TCK-1823',requireInteraction:true})},waitUntil:p=>pending=p});await pending;assert.equal(shown.at(-1).data.url,'/#ticket/TCK-1823');assert.equal(shown.at(-1).requireInteraction,true);
 handlers.notificationclick({notification:{close(){},data:shown.at(-1).data},waitUntil:p=>pending=p});await pending;assert.equal(opened.at(-1),'https://preview.example.test/?ticket=TCK-1823');
});

test('Notification clicks focus and navigate existing PWA, falling back if navigation fails',async()=>{
 const handlers={},calls=[];let fail=false;
 const self={location:{origin:'https://preview.example.test'},addEventListener:(n,f)=>handlers[n]=f,clients:{matchAll:async()=>[{url:'https://preview.example.test/',focus:async()=>calls.push('focus'),navigate:async url=>{calls.push(url);if(fail)throw Error('closed');return {}}}],openWindow:async url=>calls.push('open:'+url)}};
 vm.runInNewContext(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'),{self,URL});let pending;
 const click=()=>{handlers.notificationclick({notification:{close(){},data:{url:'/#ticket/TCK-1821'}},waitUntil:p=>pending=p});return pending};
 await click();assert.deepEqual(calls,['focus','https://preview.example.test/?ticket=TCK-1821']);fail=true;await click();assert.equal(calls.at(-1),'open:https://preview.example.test/?ticket=TCK-1821');
});
test('Push reuses the cached app logo with safe fallback and no authenticated fetch',async()=>{
 const handlers={},shown=[];let saved=null;
 const cache={put:async(k,r)=>{saved=await r.text()},match:async()=>saved?new Response(saved):undefined};
 const self={location:{origin:'https://preview.example.test'},addEventListener:(n,f)=>handlers[n]=f,registration:{showNotification:async(t,o)=>shown.push(o)}};
 vm.runInNewContext(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'),{self,URL,Response,caches:{open:async()=>cache}});
 let pending;const message=logo=>{handlers.message({data:{type:'APP_LOGO',logo},waitUntil:p=>pending=p});return pending};
 const push=()=>{handlers.push({data:{json:()=>({})},waitUntil:p=>pending=p});return pending};
 await push();assert.equal(shown.at(-1).icon,'/icon-192.png');
 const logo='data:image/png;base64,iVBORw0KGgo=';await message(logo);await push();assert.equal(shown.at(-1).icon,logo);
 await message('https://foreign.example/logo.png');await push();assert.equal(shown.at(-1).icon,'/icon-192.png');
});
