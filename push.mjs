import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import webpush from 'web-push';
import {snapshot,changes,defaultPreferences,validateSubscription} from './events.mjs';

export function startPush(config,readAll,{send=webpush.sendNotification,autoStart=true}={}) {
  const intervalSeconds=Math.max(5,Math.min(300,Number(config.push.intervalSeconds)||10));
  const db=new DatabaseSync(config.push.database);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS settings(uid TEXT PRIMARY KEY,json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS subscriptions(id TEXT PRIMARY KEY,uid TEXT NOT NULL,json TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS snapshots(key TEXT PRIMARY KEY,json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS deliveries(id TEXT PRIMARY KEY,sub TEXT NOT NULL,event TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL DEFAULT 'pending');
    CREATE TABLE IF NOT EXISTS email_settings(uid TEXT PRIMARY KEY,json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS email_deliveries(id TEXT PRIMARY KEY,uid TEXT NOT NULL,event TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending');
    CREATE TABLE IF NOT EXISTS health(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
  webpush.setVapidDetails(config.push.subject||new URL(config.origin).origin,config.push.publicKey,config.push.privateKey);
  const preferences=uid=>({...defaultPreferences,...JSON.parse(db.prepare('SELECT json FROM settings WHERE uid=?').get(uid)?.json||'{}')});
  const emailPreferences=uid=>({assignment:false,replies:false,ownReplies:false,edits:false,...JSON.parse(db.prepare('SELECT json FROM email_settings WHERE uid=?').get(uid)?.json||'{}')});
  const mark=(key,value)=>db.prepare('INSERT INTO health VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,String(value));
  const stat=()=>Object.fromEntries(db.prepare('SELECT key,value FROM health').all().map(r=>[r.key,r.value]));
  let closing=false;const current=()=>!closing&&config.isCurrent?.()!==false;
  let busy=false;
  async function reconcile() {
    if(busy||!current())return;busy=true;
    try {
      // A failed page leaves the entire previous snapshot/checkpoint intact.
      const [tickets,replies]=await Promise.all([readAll('tickets'),readAll('ticket_replies')]);
      if(!current())return;
      const grouped=new Map();for(const r of replies){const id=String(r.ticket_reply_ticket_id);if(!grouped.has(id))grouped.set(id,[]);grouped.get(id).push(r);}
      const baseline=!!db.prepare("SELECT value FROM health WHERE key='baseline'").get();
      db.exec('BEGIN IMMEDIATE');
      try {
        for(const t of tickets) {
          if(t.ticket_archived_at)continue;
          const rs=grouped.get(String(t.ticket_id))||[],now=snapshot(t,rs);
          const saved=db.prepare('SELECT json FROM snapshots WHERE key=?').get(now.key);
          now.revision=(saved?JSON.parse(saved.json).revision||0:0)+1;
          // A newly created ticket after baseline may be a new assignment.
          const prev=saved?JSON.parse(saved.json):(baseline?{...now,assigned:'0',replyIds:now.replyIds}:null);
          const events=changes(prev,now,rs,config.push.itflowUserId);
          for(const sub of db.prepare('SELECT id,uid FROM subscriptions WHERE active=1').all()) {
            const prefs=preferences(sub.uid);
            for(const event of events)if(prefs[event.kind])db.prepare('INSERT OR IGNORE INTO deliveries(id,sub,event) VALUES(?,?,?)').run(createHash('sha256').update(sub.id+event.id).digest('hex'),sub.id,JSON.stringify(event));
          }
          for(const user of config.allowedUsers||[]){const prefs=emailPreferences(user.uid);for(const event of events)if(prefs[event.kind])db.prepare('INSERT OR IGNORE INTO email_deliveries(id,uid,event) VALUES(?,?,?)').run(createHash('sha256').update(user.uid+event.id).digest('hex'),user.uid,JSON.stringify(event));}
          db.prepare('INSERT INTO snapshots VALUES(?,?) ON CONFLICT(key) DO UPDATE SET json=excluded.json').run(now.key,JSON.stringify(now));
        }
        mark('baseline',1);mark('lastPoll',new Date().toISOString());mark('pollError',0);db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e;}
      await deliver();
    }catch {mark('pollError',1);}finally{busy=false;}
  }
  async function drainEmail() {
    if(!current())return;
    for(const row of db.prepare("SELECT * FROM email_deliveries WHERE state='pending' LIMIT 20").all()){
      const event=JSON.parse(row.event),live=event.key?db.prepare('SELECT json FROM snapshots WHERE key=?').get(event.key):null;
      if(!config.email?.enabled()||event.kind!=='test'&&!emailPreferences(row.uid)[event.kind]||event.kind!=='test'&&(!live||JSON.parse(live.json).assigned!==String(config.push.itflowUserId))){db.prepare("UPDATE email_deliveries SET state='cancelled' WHERE id=?").run(row.id);continue;}
      const to=await config.email.address();if(!current())return;if(!to){db.prepare("UPDATE email_deliveries SET state='failed' WHERE id=?").run(row.id);continue;}
      // Record the attempt before SMTP: ambiguous deliveries are not retried automatically.
      db.prepare("UPDATE email_deliveries SET state='sending' WHERE id=?").run(row.id);
      try{await config.email.send(to,event);db.prepare("UPDATE email_deliveries SET state='sent' WHERE id=?").run(row.id);mark('lastEmail',new Date().toISOString())}catch{db.prepare("UPDATE email_deliveries SET state='uncertain' WHERE id=?").run(row.id);mark('emailError',1)}
    }
  }
  let emailBusy=false;async function deliverEmail(){if(emailBusy)return;emailBusy=true;try{await drainEmail()}catch{mark('emailError',1)}finally{emailBusy=false}}
  async function drain() {
    if(!current())return;
    void deliverEmail();
    for(const row of db.prepare("SELECT d.*,s.json,s.uid,s.active FROM deliveries d JOIN subscriptions s ON s.id=d.sub WHERE d.state='pending' AND d.next<=? LIMIT 30").all(Date.now())) {
      if(!current())return;
      const event=JSON.parse(row.event);
      const live=event.key?db.prepare('SELECT json FROM snapshots WHERE key=?').get(event.key):null;
      if(event.kind!=='test'&&(!live||JSON.parse(live.json).assigned!==String(config.push.itflowUserId))){db.prepare("UPDATE deliveries SET state='cancelled' WHERE id=?").run(row.id);continue;}
      if(!row.active||!preferences(row.uid)[event.kind]&&event.kind!=='test'){db.prepare("UPDATE deliveries SET state='cancelled' WHERE id=?").run(row.id);continue;}
      const body=event.kind==='assignment'?'A ticket has been assigned to you.':event.kind==='test'?'Notifications are connected on this device.':event.kind==='edits'?'A ticket you follow has changed.':'A ticket you follow has a new reply.';
      const title=(config.notificationTitleTemplate?.()||'ITF · {ticket}').replaceAll('{ticket}',event.key||'Notification test');
      const payload=JSON.stringify({title,body,requireInteraction:config.notificationRequireInteraction?.()===true,tag:row.id,url:event.key?`/?ticket=${encodeURIComponent(event.key)}`:'/'});
      try {
        await send(JSON.parse(row.json),payload,{TTL:3600,timeout:10000});
        db.prepare("UPDATE deliveries SET state='sent',attempts=attempts+1 WHERE id=?").run(row.id);mark('lastDelivery',new Date().toISOString());
      }catch(error) {
        if([404,410].includes(error.statusCode)){db.prepare('UPDATE subscriptions SET active=0 WHERE id=?').run(row.sub);db.prepare("UPDATE deliveries SET state='expired' WHERE id=?").run(row.id);}
        else db.prepare('UPDATE deliveries SET attempts=attempts+1,state=?,next=? WHERE id=?').run(row.attempts>=4?'failed':'pending',Date.now()+Math.min(3600000,30000*2**row.attempts),row.id);
        // Never log endpoints, subscription keys, provider response bodies or JWTs.
      }
    }
  }
  let deliveryBusy=false;const deliver=async()=>{if(deliveryBusy)return;deliveryBusy=true;try{await drain();}finally{deliveryBusy=false;}};
  const pollTimer=autoStart?setInterval(reconcile,intervalSeconds*1000):null,deliveryTimer=autoStart?setInterval(deliver,15000):null;pollTimer?.unref();deliveryTimer?.unref();if(autoStart)reconcile();
  return {
    disableDevices(ids){for(const id of ids)db.prepare('UPDATE subscriptions SET active=0 WHERE id=?').run(id)},
    reconcile,drain:deliver,close(){closing=true;if(pollTimer)clearInterval(pollTimer);if(deliveryTimer)clearInterval(deliveryTimer);return new Promise(resolve=>{const finish=()=>{if(busy||deliveryBusy||emailBusy){setTimeout(finish,20);return}db.close();resolve()};finish()})},
    status(uid){return {enabled:true,publicKey:config.push.publicKey,preferences:preferences(uid),devices:db.prepare('SELECT count(*) AS n FROM subscriptions WHERE uid=? AND active=1').get(uid).n,health:stat(),intervalSeconds};},
    async testEmail(uid){if(!config.email?.enabled()||!await config.email.address())throw Error('Configure SMTP and sync the ITFlow email first.');db.prepare('INSERT INTO email_deliveries(id,uid,event) VALUES(?,?,?)').run(randomUUID(),uid,JSON.stringify({kind:'test'}));deliver();return {queued:true}},
    async emailStatus(uid){return {enabled:!!config.email?.enabled(),address:await config.email?.address(),preferences:emailPreferences(uid),health:stat()}},
    emailPreferences(uid,value){const safe={};for(const key of Object.keys(defaultPreferences)){if(typeof value[key]!=='boolean')throw Error('Invalid preferences');safe[key]=value[key];}db.prepare('INSERT INTO email_settings VALUES(?,?) ON CONFLICT(uid) DO UPDATE SET json=excluded.json').run(uid,JSON.stringify(safe));return safe;},
    preferences(uid,value){const safe={};for(const key of Object.keys(defaultPreferences)){if(typeof value[key]!=='boolean')throw new Error('Invalid preferences');safe[key]=value[key];}db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(uid) DO UPDATE SET json=excluded.json').run(uid,JSON.stringify(safe));return safe;},
    subscribe(uid,value){const sub=validateSubscription(value);const id=createHash('sha256').update(sub.endpoint).digest('hex');const old=db.prepare('SELECT uid FROM subscriptions WHERE id=?').get(id);if(old&&old.uid!==uid)throw new Error('Subscription belongs to another identity');if(db.prepare('SELECT count(*) AS n FROM subscriptions WHERE uid=? AND active=1').get(uid).n>=12&&!old)throw new Error('Device limit reached');db.prepare('INSERT INTO subscriptions(id,uid,json,active) VALUES(?,?,?,1) ON CONFLICT(id) DO UPDATE SET json=excluded.json,active=1').run(id,uid,JSON.stringify(sub));return {id};},
    unsubscribe(uid,value){const sub=validateSubscription(value);const id=createHash('sha256').update(sub.endpoint).digest('hex');db.prepare('UPDATE subscriptions SET active=0 WHERE id=? AND uid=?').run(id,uid);return {disabled:true};},
    test(uid,value){const sub=validateSubscription(value);const id=createHash('sha256').update(sub.endpoint).digest('hex');if(!db.prepare('SELECT id FROM subscriptions WHERE id=? AND uid=? AND active=1').get(id,uid))throw new Error('Enable this device first');db.prepare('INSERT INTO deliveries(id,sub,event) VALUES(?,?,?)').run(randomUUID(),id,JSON.stringify({kind:'test'}));deliver();return {queued:true};}
  };
}
