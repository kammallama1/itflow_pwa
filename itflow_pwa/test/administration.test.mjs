import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {administration} from '../administration.mjs';
test('Administration restricts identity, persists settings atomically and never returns SMTP passwords',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'itf-admin-'));try{
 const cfg={admin:{directory,uids:['owner']},apiKey:'synthetic',allowedUsers:[{uid:'owner',username:'matt'}],writes:{userId:1}};
 const admin=await administration(cfg);assert.equal(admin.isAdmin('owner'),true);assert.equal(admin.isAdmin('other'),false);
 await writeFile(path.join(directory,'metadata.json'),JSON.stringify({updatedAt:new Date().toISOString(),users:[{id:'1',email:'owner@example.test'}]}));assert.equal(await admin.emailAddress(),'owner@example.test');
 await admin.save({smtp:{enabled:true,host:'smtp.example.test',port:587,security:'starttls',from:'desk@example.test',password:'synthetic-secret'}});const view=await admin.view();assert.equal(view.smtp.password,undefined);assert.equal(view.smtp.passwordSet,true);assert.ok(!JSON.stringify(view).includes('synthetic-secret'));
 await admin.save({smtp:{...view.smtp,username:'desk'}});assert.equal(admin.settings().smtp.password,'synthetic-secret');
 await assert.rejects(admin.save({smtp:{...view.smtp,from:'a@example.test\nBcc:evil@example.test'}}));
 await admin.savePreferences('owner','1');assert.equal((await admin.preferences('owner')).defaultClientId,'1');assert.notEqual((await admin.preferences('other')).defaultClientId,'1');
 await admin.save({branding:{brand:'ITF',subtitle:'DESK',welcome:'Welcome',siteTitle:'My service desk'}});assert.equal((await admin.publicInfo()).siteTitle,'My service desk');
 await admin.save({smtp:{...view.smtp,fromName:'IT Flow Notifications'}});assert.equal(admin.settings().smtp.fromName,'IT Flow Notifications');await assert.rejects(admin.save({smtp:{...view.smtp,fromName:'Bad\nBcc: other@example.test'}}));
 await admin.save({notifications:{titleTemplate:'Service Desk · {ticket}',requireInteraction:true}});assert.equal((await admin.view()).notifications.titleTemplate,'Service Desk · {ticket}');assert.equal((await admin.view()).notifications.requireInteraction,true);await assert.rejects(admin.save({notifications:{titleTemplate:'Bad\nTitle'}}));
 await admin.requestSync();assert.ok(JSON.parse(await readFile(path.join(directory,'sync-request.json'),'utf8')).requestedAt);
 const restored=await administration(cfg);assert.equal(restored.settings().smtp.password,'synthetic-secret');
 }finally{await rm(directory,{recursive:true,force:true})}
});
