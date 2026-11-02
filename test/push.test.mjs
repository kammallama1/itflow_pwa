import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import webpush from 'web-push';
import {startPush} from '../push.mjs';
import {defaultPreferences} from '../events.mjs';
test('Durable baseline, event deduplication, preferences, restart recovery and expired subscriptions',async()=>{
 const tmp=await mkdtemp(path.join(os.tmpdir(),'itf-push-test-'));
 const keys=webpush.generateVAPIDKeys(),database=path.join(tmp,'push.sqlite');const config={origin:'https://preview.example.test',push:{database,publicKey:keys.publicKey,privateKey:keys.privateKey,itflowUserId:1}};
 const t={ticket_id:115,ticket_prefix:'TCK-',ticket_number:1821,ticket_assigned_to:'2',ticket_subject:'Synthetic'};
 let rows=[t],replies=[],sent=[],failure=null,readFailure=false;
 const read=async r=>{if(readFailure)throw Error('Synthetic read failure');return r==='tickets'?rows:replies};
 const send=async(s,p)=>{if(failure)throw failure;sent.push(JSON.parse(p))};
 let push=startPush(config,read,{send,autoStart:false});
 const sub={endpoint:'https://web.push.apple.com/test',keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}};
 try{
  push.subscribe('matt',sub);await push.reconcile();assert.equal(sent.length,0);
  rows=[{...t,ticket_assigned_to:'1'}];await push.reconcile();assert.equal(sent.length,1);assert.equal(sent[0].title,'ITF · TCK-1821');assert.equal(sent[0].url,'/?ticket=TCK-1821');assert.equal(push.status('matt').intervalSeconds,10);await push.reconcile();assert.equal(sent.length,1);
  replies=[{ticket_reply_id:1,ticket_reply_ticket_id:115,ticket_reply_type:'Internal',ticket_reply_by:1}];await push.reconcile();assert.equal(sent.length,1);
  replies.push({ticket_reply_id:2,ticket_reply_ticket_id:115,ticket_reply_type:'Internal',ticket_reply_by:2});await push.reconcile();assert.equal(sent.length,2);
  push.preferences('matt',{...defaultPreferences,replies:false});replies.push({ticket_reply_id:3,ticket_reply_ticket_id:115,ticket_reply_type:'Internal',ticket_reply_by:2});await push.reconcile();assert.equal(sent.length,2);
  readFailure=true;await push.reconcile();assert.equal(push.status('matt').health.pollError,'1');readFailure=false;
  push.close();push=startPush(config,read,{send,autoStart:false});await push.reconcile();assert.equal(sent.length,2);assert.equal(push.status('matt').preferences.replies,false);
  // A delivery failure stays queued across a restart, then succeeds once due.
  failure={statusCode:503};push.test('matt',sub);await new Promise(r=>setTimeout(r,20));push.close();
  const db=new DatabaseSync(database);db.exec("UPDATE deliveries SET next=0 WHERE state='pending'");db.close();
  config.notificationTitleTemplate=()=> 'Llama Desk · {ticket}';config.notificationRequireInteraction=()=>true;
  failure=null;push=startPush(config,read,{send,autoStart:false});await push.drain();assert.equal(sent.at(-1).title,'Llama Desk · Notification test');assert.equal(sent.at(-1).requireInteraction,true);
  failure={statusCode:410};push.test('matt',sub);await new Promise(r=>setTimeout(r,20));assert.equal(push.status('matt').devices,0);
 }finally{push.close();await rm(tmp,{recursive:true,force:true})}
});
test('Email options are independent of push devices, deduplicate events and do not retry uncertain SMTP sends',async()=>{
 const tmp=await mkdtemp(path.join(os.tmpdir(),'itf-email-test-')),keys=webpush.generateVAPIDKeys();let email=[],failure=false;
 const cfg={origin:'https://preview.example.test',allowedUsers:[{uid:'owner'}],push:{database:path.join(tmp,'push.sqlite'),publicKey:keys.publicKey,privateKey:keys.privateKey,itflowUserId:1},email:{enabled:()=>true,address:async()=>'owner@example.test',send:async(to,event)=>{email.push({to,event});if(failure)throw Error('Ambiguous SMTP outcome')}}};
 let rows=[{ticket_id:1,ticket_prefix:'TCK-',ticket_number:1823,ticket_assigned_to:'2'}];const p=startPush(cfg,async r=>r==='tickets'?rows:[],{autoStart:false});
 try{p.emailPreferences('owner',{...defaultPreferences});await p.reconcile();assert.equal(email.length,0);rows=[{...rows[0],ticket_assigned_to:'1'}];await p.reconcile();assert.equal(email.length,1);assert.equal(email[0].to,'owner@example.test');await p.reconcile();assert.equal(email.length,1);failure=true;await p.testEmail('owner');await new Promise(r=>setTimeout(r,20));assert.equal(email.length,2);await p.drain();assert.equal(email.length,2);assert.equal((await p.emailStatus('owner')).health.emailError,'1');}finally{p.close();await rm(tmp,{recursive:true,force:true})}
});
