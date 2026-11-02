import {createHash} from 'node:crypto';

export function snapshot(ticket,replies=[]) {
  const values=['ticket_subject','ticket_details','ticket_priority','ticket_status','ticket_assigned_to','ticket_contact_id','ticket_asset_id'].map(k=>ticket[k]??null);
  return {key:`${ticket.ticket_prefix||'TCK-'}${ticket.ticket_number}`,assigned:String(ticket.ticket_assigned_to||'0'),digest:createHash('sha256').update(JSON.stringify(values)).digest('hex'),replyIds:replies.map(r=>String(r.ticket_reply_id))};
}
export function changes(previous,current,replies,userId) {
  if(!previous)return []; // Baseline first; never flood a new installation.
  const events=[];
  if(current.assigned===String(userId)&&previous.assigned!==String(userId))events.push({kind:'assignment',id:`assignment:${current.key}:${current.revision??current.digest}`,key:current.key});
  if(current.assigned!==String(userId))return events;
  if(current.digest!==previous.digest&&current.assigned===previous.assigned)events.push({kind:'edits',id:`edit:${current.key}:${current.revision??current.digest}`,key:current.key});
  const known=new Set(previous.replyIds);
  for(const r of replies)if(!known.has(String(r.ticket_reply_id))) {
    const own=r.ticket_reply_type!=='Client'&&String(r.ticket_reply_by)===String(userId);
    events.push({kind:own?'ownReplies':'replies',id:`reply:${current.key}:${r.ticket_reply_id}`,key:current.key});
  }
  return events;
}
export const defaultPreferences={assignment:true,replies:true,ownReplies:false,edits:true};
export function validateSubscription(value) {
  if(!value||typeof value.endpoint!=='string'||value.endpoint.length>4096)throw new Error('Invalid subscription');
  const url=new URL(value.endpoint);
  const hosts=['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'];
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!hosts.includes(url.hostname))throw new Error('Unsupported push service');
  if(!value.keys||!/^[-_a-zA-Z0-9]{87}$/.test(value.keys.p256dh||'')||!/^[-_a-zA-Z0-9]{22}$/.test(value.keys.auth||''))throw new Error('Invalid subscription keys');
  return {endpoint:value.endpoint,keys:{p256dh:value.keys.p256dh,auth:value.keys.auth}};
}
