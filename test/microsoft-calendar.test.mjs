import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {randomBytes} from 'node:crypto';
import {microsoftCalendar,exportEvents} from '../microsoft-calendar.mjs';
const tenant='11111111-1111-1111-1111-111111111111',clientId='22222222-2222-2222-2222-222222222222',origin='https://preview.example.test';
const time=Date.parse('2026-11-01T12:00:00Z');
const ticket={id:'ticket:TCK-1821',ticketKey:'TCK-1821',title:'TCK-1821 · Scheduled work',start:'2026-11-02T10:00:00',end:null};
test('Export filtering, stable identities, duration, timezone and all-day dates exclude private ticket content',()=>{
 const source={timezone:'America/Phoenix',events:[{...ticket,details:'PRIVATE SECRET'},{id:'10',title:'All-day',start:'2026-11-03T09:00:00',end:null,allDay:true},{...ticket,ticketKey:'TCK-1',start:'2027-11-01T10:00:00'}]};
 let rows=exportEvents(source,{origin,now:time});assert.equal(rows.length,1);assert.equal(rows[0].payload.end.dateTime,'2026-11-02T11:00:00');assert.equal(rows[0].payload.start.timeZone,'America/Phoenix');assert.ok(!JSON.stringify(rows).includes('PRIVATE SECRET'));assert.ok(!('attendees' in rows[0].payload));
 rows=exportEvents(source,{origin,now:time,appointments:true});assert.equal(rows.length,2);assert.equal(rows[1].payload.start.dateTime,'2026-11-03T00:00:00');assert.equal(rows[1].payload.end.dateTime,'2026-11-04T00:00:00');
 const moved=exportEvents({...source,events:[{...ticket,start:'2026-11-04T11:00:00'}]},{origin,now:time})[0];assert.equal(moved.id,rows[0].id);assert.notEqual(moved.revision,rows[0].revision);
 assert.throws(()=>exportEvents({...source,events:[ticket,ticket]},{origin,now:time}));
});
function mockClient(){let data={accounts:[],secret:'synthetic-cache-token'};return {getTokenCache:()=>({serialize:()=>JSON.stringify(data),deserialize:s=>data=JSON.parse(s),getAllAccounts:async()=>data.accounts}),getAuthCodeUrl:async p=>'https://login.microsoftonline.com/'+tenant+'/oauth2/v2.0/authorize?state='+p.state+'&code_challenge='+p.codeChallenge,acquireTokenByCode:async p=>{assert.ok(p.codeVerifier);const account={homeAccountId:p.code,tenantId:tenant,username:p.code+'@example.test'};data.accounts=[account];return {account,scopes:['Calendars.ReadWrite']}},acquireTokenSilent:async p=>({accessToken:'synthetic-access-'+p.account.homeAccountId})}}
async function fixture(){const directory=await mkdtemp(path.join(os.tmpdir(),'itf-ms-'));let clock=time,events=[ticket],posts=0,patches=0,failCreate=false,loseCreate=false,nextId=0;const remote=new Map();
 const fetchImpl=async(url,opts)=>{const parsed=new URL(url),token=opts.headers.Authorization,data=opts.body?JSON.parse(opts.body):null;assert.equal(parsed.origin,'https://graph.microsoft.com');const json=value=>({ok:true,status:200,json:async()=>value});
 if(parsed.pathname.endsWith('/calendars'))return json({value:[{id:'calendar-1',name:'ITFlow',canEdit:true}]});
 if(opts.method==='GET'&&parsed.searchParams.has('$filter')){const filter=parsed.searchParams.get('$filter');return json({value:[...remote.values()].filter(e=>e.token===token&&filter.includes(e.singleValueExtendedProperties[0].value))})}
 if(opts.method==='POST'){posts++;if(loseCreate)throw Error('Network failed before response');const item={...data,id:'event-'+(++nextId),token,attendees:[],type:'singleInstance','@odata.etag':'test-etag'};remote.set(item.id,item);if(failCreate)throw Error('Lost response after commit');return json(item)}
 const id=decodeURIComponent(parsed.pathname.split('/').pop()),item=remote.get(id);if(!item||item.token!==token)return {ok:false,status:404,headers:new Headers()};
 if(opts.method==='GET')return json(item);
 if(opts.method==='PATCH'){patches++;assert.equal(opts.headers['If-Match'],'test-etag');Object.assign(item,data);return json(item)}
 throw Error('Unexpected Graph call')};
 const options={directory,encryptionKey:randomBytes(32).toString('base64'),origin,source:async()=>({events,timezone:'America/Phoenix',updatedAt:new Date(clock).toISOString()}),allowedUid:u=>['owner','other'].includes(u),fetchImpl,makeClient:mockClient,now:()=>clock,autoStart:false};let ms=microsoftCalendar(options);
 return {directory,options,get ms(){return ms},remote,get posts(){return posts},get patches(){return patches},move:()=>{events=[{...ticket,start:'2026-11-05T12:00:00'}];clock+=61000},advance:()=>clock+=61000,failCreate:v=>failCreate=v,loseCreate:v=>loseCreate=v,setEvents:e=>events=e,restart:()=>{ms.close();ms=microsoftCalendar(options)},close:async()=>{ms.close();await rm(directory,{recursive:true,force:true})}};
}
async function configure(f){await f.ms.configure({tenantId:tenant,clientId,clientSecret:'synthetic-client-secret'})}
async function connect(f,uid='owner'){const b=await f.ms.begin(uid),state=new URL(b.url).searchParams.get('state');await f.ms.finish(uid,{state,code:uid,browser:b.browser});return {b,state}}
async function enable(f,uid='owner'){await f.ms.select(uid,{calendarId:'calendar-1',enabled:true,appointments:false,duration:60})}
test('OAuth state binds browser and identity, expires/replay denied; secrets never exposed and tenant changes blocked',async()=>{const f=await fixture();try{
 await assert.rejects(f.ms.begin('stranger'));await assert.rejects(f.ms.configure({tenantId:'common',clientId,clientSecret:'secret'}));await configure(f);const b=await f.ms.begin('owner'),state=new URL(b.url).searchParams.get('state');
 await assert.rejects(f.ms.finish('other',{state,code:'owner',browser:b.browser}));await assert.rejects(f.ms.finish('owner',{state,code:'owner',browser:'wrong'}));await f.ms.finish('owner',{state,code:'owner',browser:b.browser});await assert.rejects(f.ms.finish('owner',{state,code:'owner',browser:b.browser}));
 assert.equal(f.ms.status('owner').connected,true);assert.equal(f.ms.status('other').connected,false);assert.ok(!JSON.stringify(f.ms.adminView()).includes('synthetic-client-secret'));assert.ok(!JSON.stringify(f.ms.status('owner')).includes('synthetic-cache-token'));
 await assert.rejects(f.ms.configure({tenantId:'33333333-3333-3333-3333-333333333333',clientId,clientSecret:'new'}));f.restart();assert.equal(f.ms.status('owner').connected,true);
 const raw=await readFile(path.join(f.directory,'microsoft-calendar.sqlite'));assert.ok(!raw.includes(Buffer.from('synthetic-client-secret')));assert.ok(!raw.includes(Buffer.from('synthetic-cache-token')));
 const flow=await f.ms.begin('other');for(let i=0;i<11;i++)f.advance();await assert.rejects(f.ms.finish('other',{state:new URL(flow.url).searchParams.get('state'),code:'other',browser:flow.browser}));
 }finally{await f.close()}});
test('Sync requires explicit enable; no duplicate on repeat/restart/reconnect, updates only its events and isolates accounts',async()=>{const f=await fixture();try{
 await configure(f);await connect(f);await assert.rejects(f.ms.sync('owner'));assert.equal(f.posts,0);await enable(f);let result=await f.ms.sync('owner');assert.equal(result.created,1);f.advance();result=await f.ms.sync('owner');assert.equal(result.unchanged,1);assert.equal(f.posts,1);f.restart();f.move();result=await f.ms.sync('owner');assert.equal(result.updated,1);assert.equal(f.patches,1);
 await connect(f,'other');await enable(f,'other');assert.equal((await f.ms.sync('other')).created,1);assert.equal(f.posts,2);
 await f.ms.disconnect('owner');assert.equal(f.ms.status('owner').connected,false);await connect(f);await enable(f);assert.equal((await f.ms.sync('owner')).unchanged,1);assert.equal(f.posts,2);
 f.remote.get('event-1').attendees=[{emailAddress:{address:'someone@example.test'}}];f.setEvents([{...ticket,start:'2026-11-06T10:00:00'}]);f.advance();assert.equal((await f.ms.sync('owner')).review,1);assert.equal(f.patches,1);
 }finally{await f.close()}});
test('Lost create response is reconciled, unresolved creates never retried; batches advance past unchanged exports',async()=>{const f=await fixture();try{
 await configure(f);await connect(f);await enable(f);f.failCreate(true);await assert.rejects(f.ms.sync('owner'));assert.equal(f.posts,1);f.failCreate(false);f.advance();assert.equal((await f.ms.sync('owner')).updated,1);assert.equal(f.posts,1);
 f.setEvents([{...ticket,ticketKey:'TCK-1822',id:'ticket:TCK-1822'}]);f.loseCreate(true);f.advance();await assert.rejects(f.ms.sync('owner'));const attempts=f.posts;f.loseCreate(false);f.advance();assert.equal((await f.ms.sync('owner')).review,1);assert.equal(f.posts,attempts);
 f.setEvents(Array.from({length:12},(_,i)=>({...ticket,ticketKey:'TCK-'+(1900+i),id:'ticket:TCK-'+(1900+i)})));f.advance();assert.equal((await f.ms.sync('owner')).created,10);f.advance();assert.equal((await f.ms.sync('owner')).created,2);
 }finally{await f.close()}});
