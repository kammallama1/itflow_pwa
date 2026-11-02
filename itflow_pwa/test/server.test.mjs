import test,{after,before} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let upstream,child,temp,base,upstreamCalls=0;
const key='synthetic-test-key';
const headers={host:'preview.example.test','x-forwarded-proto':'https','x-authentik-uid':'test-uid','x-authentik-username':'matt'};
// Use native HTTP so the fixture can set the proxy's preserved Host header.
function fetch(url,options={}) {return new Promise((resolve,reject)=>{const req=http.request(url,{method:options.method||'GET',headers:options.headers},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:{get:name=>res.headers[name]},json:async()=>JSON.parse(Buffer.concat(chunks).toString())}));});req.on('error',reject);req.end(options.body);});}
const records=Array.from({length:101},(_,i)=>({ticket_id:String(i+500),ticket_prefix:'TCK-',ticket_number:String(1800+i),ticket_subject:'Synthetic ticket '+i,ticket_status:'2',ticket_assigned_to:'1',ticket_details:'<p>Details</p>',ticket_url_key:'must-never-reach-browser',ticket_archived_at:null}));
before(async()=>{
 upstream=http.createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
  upstreamCalls++;assert.equal(req.method,'GET');const url=new URL(req.url,'http://localhost');assert.ok(!url.searchParams.has('api_key'));assert.equal(JSON.parse(body).api_key,key);
  let data=[];
  if(url.pathname.includes('/tickets/'))data=url.searchParams.has('ticket_id')?records.filter(r=>r.ticket_id===url.searchParams.get('ticket_id')).map(r=>({...r,ticket_status_name:'In progress'})):records.slice(Number(url.searchParams.get('offset')),Number(url.searchParams.get('offset'))+100);
  if(url.pathname.includes('/ticket_replies/')){assert.equal(url.searchParams.get('ticket_id'),'520');data=[{ticket_reply:'<p>Older note</p>',ticket_reply_type:'Internal',ticket_reply_by_name:'Example',ticket_reply_created_at:'2026-10-30 10:00:00',ticket_reply_id:'1'},{ticket_reply:'<p>Internal test note</p>',ticket_reply_type:'Internal',ticket_reply_by_name:'Example',ticket_reply_created_at:'2026-10-31 10:00:00',ticket_reply_id:'2'}];}
  if(url.pathname.includes('/clients/'))data=[{client_id:'1',client_name:'Allowed company'}];
  if(url.pathname.includes('/documents/'))data=[{document_id:'10',document_name:'Test article',document_content:'<p>Test body</p>'}];
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:'True',data}));
 });});await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 const slot=http.createServer();await new Promise(r=>slot.listen(0,'127.0.0.1',r));const port=slot.address().port;await new Promise(r=>slot.close(r));base='http://127.0.0.1:'+port;
 temp=await mkdtemp(path.join(os.tmpdir(),'itw-test-'));const configFile=path.join(temp,'config.json');await writeFile(path.join(temp,'metadata.json'),JSON.stringify({updatedAt:new Date().toISOString(),projects:[{project_id:'1',project_name:'Allowed project',project_client_id:'1'},{project_id:'2',project_name:'Denied project',project_client_id:'2'}]}));await writeFile(configFile,JSON.stringify({admin:{directory:temp,uids:['different-admin']},apiKey:key,csrfSecret:'synthetic-csrf-secret',origin:'https://preview.example.test',itflowOrigin:'http://127.0.0.1:'+upstream.address().port,itflowWebOrigin:'https://itflow.example.test',trustedProxy:'127.0.0.1',allowedUsers:[{uid:'test-uid',username:'matt'}]}));
 child=spawn(process.execPath,[path.join(root,'server.mjs')],{env:{...process.env,PORT:String(port),CONFIG_FILE:configFile},stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('exit',()=>reject(new Error('Server exited')))});
});
after(async()=>{child?.kill();if(upstream)await new Promise(r=>upstream.close(r));if(temp)await rm(temp,{recursive:true,force:true});});
test('Unauthenticated requests fail closed; forwarded headers alone are insufficient',async()=>{
 for(const h of [{},{...headers,'x-authentik-uid':'wrong'},{...headers,'x-authentik-username':'someone-else'},{...headers,host:'wrong.example.test'},{...headers,'x-forwarded-proto':'http'}]){const r=await fetch(base+'/api/tickets',{headers:h});assert.equal(r.status,403);assert.equal(r.headers.get('cache-control'),'no-store');}
});
test('Non-GET writes and unknown API resources never reach ITFlow',async()=>{const before=upstreamCalls;const write=await fetch(base+'/api/tickets',{method:'POST',headers,body:'{}'});assert.equal(write.status,405);const unknown=await fetch(base+'/api/credentials',{headers});assert.equal(unknown.status,404);assert.equal(upstreamCalls,before);});
test('All pages load and ticket numbers remain independent of API record IDs',async()=>{const r=await fetch(base+'/api/tickets',{headers});assert.equal(r.status,200);const rows=await r.json();assert.equal(rows.length,101);assert.equal(rows[20].key,'TCK-1820');assert.equal(rows[20].ticket_status_name,'In progress');assert.ok(!JSON.stringify(rows).includes('must-never-reach-browser'));assert.ok(!JSON.stringify(rows).includes('ticket_id'));});
test('TCK deep link maps to the correct upstream record and its replies',async()=>{const r=await fetch(base+'/api/tickets/TCK-1820',{headers});assert.equal(r.status,200);const data=await r.json();assert.equal(data.key,'TCK-1820');assert.equal(data.originalUrl,'https://itflow.example.test/agent/ticket.php?ticket_id=520');assert.equal(data.replies[0].ticket_reply_type,'Internal');assert.equal(data.replies[0].ticket_reply,'<p>Internal test note</p>');assert.ok(!JSON.stringify(data).includes('must-never-reach-browser'));});
test('Unknown ticket fails without fetching another ticket’s replies',async()=>{const r=await fetch(base+'/api/tickets/TCK-9999',{headers});assert.equal(r.status,404);});
test('Documents use a fixed read endpoint; no secret appears in browser response',async()=>{const r=await fetch(base+'/api/docs/10',{headers});assert.equal(r.status,200);const data=await r.json();assert.equal(data.document_name,'Test article');assert.ok(!JSON.stringify(data).includes(key));});
test('Push mutations require both exact Origin and a signed identity-bound CSRF token',async()=>{const session=await (await fetch(base+'/api/session',{headers})).json();for(const h of [{...headers,origin:'https://preview.example.test'},{...headers,origin:'https://evil.example','x-csrf-token':session.csrfToken},{...headers,origin:'https://preview.example.test','x-csrf-token':'forged'}])assert.equal((await fetch(base+'/api/push/preferences',{method:'POST',headers:h,body:'{}'})).status,403);const valid=await fetch(base+'/api/push/preferences',{method:'POST',headers:{...headers,origin:'https://preview.example.test','x-csrf-token':session.csrfToken},body:'{}'});assert.equal(valid.status,503);});

test('Synced Projects retain API company scope and administration requires its own allowed identity',async()=>{const r=await fetch(base+'/api/inventory/projects',{headers});assert.equal(r.status,200);const projects=await r.json();assert.equal(projects.length,1);assert.equal(projects[0].name,'Allowed project');assert.equal((await fetch(base+'/api/admin',{headers})).status,403);assert.equal((await fetch(base+'/api/admin/sync',{method:'POST',headers,body:'{}'})).status,403);assert.equal((await fetch(base+'/api/calendar/sync',{method:'POST',headers,body:'{}'})).status,403);});
test('Microsoft connection and callback routes require the owner identity',async()=>{
 for(const route of ['/api/microsoft/admin','/api/microsoft/status','/api/microsoft/callback?state=synthetic&code=synthetic']){const r=await fetch(base+route,{headers});assert.equal(r.status,403)}
 const r=await fetch(base+'/api/microsoft/configure',{method:'POST',headers,body:'{}'});assert.equal(r.status,403);
});
