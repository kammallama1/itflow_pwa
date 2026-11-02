import {scopedPush} from './scoped-push.mjs';
import {AsyncLocalStorage} from 'node:async_hooks';
import {connections} from './connections.mjs';
import {localAuthentication} from './local-auth.mjs';
import http from 'node:http';
import {microsoftCalendar} from './microsoft-calendar.mjs';
import {calendarEvents} from './calendar.mjs';
import {administration} from './administration.mjs';
import {sendEmail,defaultTemplates} from './email.mjs';
import {safeText,htmlText,noteHtml,replyType,vendorReference,vendorReferencePreserved,optionId} from './ticket-actions.mjs';
import https from 'node:https';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {catalog,inventoryRows,nativeResources} from './inventory.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const baseConfig = JSON.parse(await readFile(process.env.CONFIG_FILE || '/run/secrets/config.json', 'utf8'));
const requestContext=new AsyncLocalStorage();let integration=null;
function activeContext(){return requestContext.getStore()||(integration?.owner()?integration.context(integration.owner()):null)}
const config=new Proxy(baseConfig,{get(target,key){const ctx=target.perUserConnections?activeContext():null;if(ctx){if(key==='apiKey')return ctx.credential?.key;if(key==='itflowOrigin')return ctx.instance?.apiOrigin||target.itflowOrigin;if(key==='itflowWebOrigin')return ctx.instance?.webOrigin||target.itflowWebOrigin;if(key==='writes')return {...target.writes,userId:ctx.credential?.claimed_id};}return target[key]}});
if ((!config.apiKey&&!config.perUserConnections) || !config.origin || !config.allowedUsers?.length || !config.trustedProxy) throw new Error('Missing deployment configuration');
if(config.push?.enabled&&!config.csrfSecret)throw new Error('Push requires CSRF configuration');
const admin=await administration(config);
const localAuth=config.authMode==='local'?localAuthentication(config):null;
if(config.perUserConnections){if(!localAuth)throw Error('Per-user connections require local authentication.');integration=connections(localAuth.store,baseConfig);await integration.seed();}
function administrator(uid){return integration?integration.admin(integration.byUid(uid)):admin.isAdmin(uid)}
let metadata=await admin.metadata();
if(integration&&!localAuth.store.setting('microsoftPolicy'))localAuth.store.set('microsoftPolicy',{enabled:true,timezone:metadata.timezone||'UTC'});
const metadataTimer=setInterval(async()=>{try{metadata=await admin.metadata();if(metadata.users)config.agents=metadata.users.map(({id,name})=>({id,name}));if(metadata.statuses)config.statuses=metadata.statuses.filter(s=>String(s.id)!=='5');}catch{}},10000);metadataTimer.unref();
if(metadata.users)config.agents=metadata.users.map(({id,name})=>({id,name}));
if(metadata.statuses)config.statuses=metadata.statuses.filter(s=>String(s.id)!=='5');
config.email={address:()=>admin.emailAddress(),enabled:()=>!!admin.settings().smtp?.enabled,send:async(to,event)=>sendEmail(admin.settings(),to,event,config.origin,await emailContext(event),metadata.mailTemplates||defaultTemplates,metadata.mailBranding)};
const security = {
  'Strict-Transport-Security':'max-age=31536000', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; worker-src 'self'; manifest-src 'self'"
};
function send(res, status, data, type='application/json; charset=utf-8') {
  res.writeHead(status, {...security, 'Content-Type':type});
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}
// Fixed read endpoints only. GET authentication lives in the JSON body, never URL/logs.
function upstream(resource, params={}, writeAction=null) {
  const ctx=integration?activeContext():null;if(integration&&(!ctx?.credential||!integration.valid(ctx)))throw Error('Link your personal ITFlow API key first.');
  if (!['tickets','ticket_replies','documents','clients','contacts',...nativeResources].includes(resource)) throw new Error('Unsupported resource');
  if(writeAction&&!['tickets/create','tickets/update','ticket_replies/create'].includes(resource+'/'+writeAction))throw Error('Unsupported action');
  const url = new URL(`/api/v1/${resource}/${writeAction||'read'}.php`, config.itflowOrigin);
  if(!writeAction)for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const body = JSON.stringify({api_key:config.apiKey,...(writeAction?params:{})});
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve,reject) => {
    const req = transport.request(url, {method:writeAction?'POST':'GET', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'User-Agent':'ITW-PWA/0.1'}}, res => {
      let size=0; const chunks=[];
      res.on('data', chunk => {size+=chunk.length; if(size>16*1024*1024) req.destroy(new Error('Response too large')); else chunks.push(chunk);});
      res.on('end', () => {try {const data=JSON.parse(Buffer.concat(chunks).toString());if(res.statusCode===200&&String(data.success).toLowerCase()==='false'&&/^No resource .*specified parameter/.test(data.message||'')&&(!data.data||Array.isArray(data.data)&&data.data.length===0))return resolve([]);if(res.statusCode !== 200 || String(data.success).toLowerCase()!=='true' || (!writeAction&&!Array.isArray(data.data))) throw new Error(writeAction?'The submission result is uncertain. Check ITFlow before retrying.':'Upstream unavailable');if(integration&&!integration.valid(ctx))throw Error();resolve(data.data||[]);} catch {reject(new Error('Upstream unavailable'));}});
    });
    req.setTimeout(12000,()=>req.destroy(new Error('Upstream timeout')));req.on('error',()=>reject(new Error('Upstream unavailable')));req.end(body);
  });
}
async function all(resource, params={}) {
  const result=[];
  for(let offset=0;offset<10000;offset+=100) {const rows=await upstream(resource,{...params,limit:100,offset}); result.push(...rows); if(rows.length<100)return result;}
  throw new Error('Result limit exceeded');
}
const ticketKey = t => `${t.ticket_prefix || 'TCK-'}${t.ticket_number}`;
const pick = (row, keys) => Object.fromEntries(keys.map(k=>[k,row[k] ?? null]));
function ticket(t, detail=false) {
  return {...pick(t,['ticket_subject','ticket_priority','ticket_status','ticket_status_name','ticket_assigned_to','ticket_created_at','ticket_updated_at']), key:ticketKey(t),ticket_client_id:String(t.ticket_client_id||'0'),ticket_contact_id:String(t.ticket_contact_id||'0'),ticket_billable:String(t.ticket_billable||'0'),
    ...(detail?{ticket_details:t.ticket_details,originalUrl:`${config.itflowWebOrigin}/agent/ticket.php?ticket_id=${encodeURIComponent(t.ticket_id)}`}:{})};
}
// In-flight coalescing reduces API load without caching ticket data on disk.
let ticketRequest;
function tickets() {
  if(integration)return all('tickets');
  if(!ticketRequest)ticketRequest=(async()=>{
    const rows=await all('tickets');
    const representatives=[...new Map(rows.map(row=>[row.ticket_status,row])).values()];
    const labels=new Map(await Promise.all(representatives.map(async row=>{
      const details=await upstream('tickets',{ticket_id:row.ticket_id});
      return [row.ticket_status,details[0]?.ticket_status_name];
    })));
    return rows.map(row=>({...row,ticket_status_name:labels.get(row.ticket_status)}));
  })().finally(()=>ticketRequest=undefined);
  return ticketRequest;
}
function proxyIdentity(req){const ip=req.socket.remoteAddress?.replace(/^::ffff:/,'');return ip===config.trustedProxy&&req.headers.host===new URL(config.origin).host&&(req.headers['x-forwarded-proto']||(config.trustedProxyScheme==='https'?'https':''))==='https'}
function identity(req) {
  if(localAuth)return proxyIdentity(req)&&!!req.localSession?.user;
  const ip=req.socket.remoteAddress?.replace(/^::ffff:/,'');
  if(ip!==config.trustedProxy)return false;
  if(req.headers.host!==new URL(config.origin).host || req.headers['x-forwarded-proto']!=='https')return false;
  return config.allowedUsers.some(user=>req.headers['x-authentik-uid']===user.uid && req.headers['x-authentik-username']===user.username);
}
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const push=config.push?.enabled?(integration?scopedPush({config,baseConfig,integration,context:requestContext,readAll:all,settings:()=>admin.settings()}):(await import('./push.mjs')).startPush({...config,notificationTitleTemplate:()=>admin.settings().notificationTitleTemplate,notificationRequireInteraction:()=>admin.settings().notificationRequireInteraction===true},all)):null;
const release='0.12.0';
function calendarAllowed(uid){if(!integration)return administrator(uid);const u=integration.byUid(uid),ctx=u?integration.context(u):null;return !!ctx&&integration.valid(ctx)&&integration.reviewed(ctx)&&integration.view(u).microsoftPolicy.enabled;}
const microsoft=config.microsoft?.encryptionKey?microsoftCalendar({directory:config.admin.directory,encryptionKey:config.microsoft.encryptionKey,origin:config.origin,allowedUid:calendarAllowed,source:async uid=>{
 const u=integration?.byUid(uid),ctx=u?integration.context(u):null;
 const source=async()=>{const m=await admin.metadata();return {events:calendarEvents(!integration||u?.role==='owner'?m.calendar||[]:[],(await all('tickets')).filter(t=>String(t.ticket_assigned_to)===String(config.writes?.userId))),timezone:integration?integration.view(u).microsoftPolicy.timezone:m.timezone||'UTC',updatedAt:m.updatedAt,isCurrent:()=>!integration||integration.valid(ctx)&&calendarAllowed(uid)}};
 return integration?requestContext.run(ctx,source):source();
}}):null;
const mutations=new Map();
const writeEnabled=!!config.writes?.enabled;
async function mutate(req,url,uid){
 const data=await body(req);const requestId=req.headers['x-request-id'];
 if(typeof requestId!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(requestId))throw Error('Invalid request identity.');
 const token=uid+':'+requestId;
 // An uncertain write is never retried automatically, including across process restarts.
 const fs=await import('node:fs/promises');const journal=config.writes.journal;
 const signature=createHmac('sha256',config.csrfSecret).update(JSON.stringify([url.pathname,data])).digest('hex');
 const lines=(await fs.readFile(journal,'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e})).trim().split('\n').filter(Boolean).map(x=>JSON.parse(x));
 const prior=lines.find(x=>x.token===token);
 if(prior){if(prior.signature!==signature)throw Error('Request identity was reused.');throw Error('This submission was already attempted. Refresh the ticket to check its result before making another change.');}
 const agents=[{id:0,name:'Unassigned'},...(config.agents||[])];
 let resource,action,params,current;
 if(url.pathname==='/api/tickets/create'){if(config.writes.testOnly&&!String(data.subject).startsWith('[PWA TEST]'))throw Error('Candidate validation is restricted to labelled test tickets.');const choices=await customers();const clientId=optionId(data.clientId??(await admin.preferences(uid)).defaultClientId??'',choices.clients.map(c=>({id:c.id})));const contactId=optionId(data.contactId||0,[{id:0},...choices.contacts.filter(c=>String(c.clientId)===String(clientId))]);resource='tickets';action='create';params={client_id:clientId,ticket_contact_id:contactId,ticket_subject:safeText(data.subject,200),ticket_details:noteHtml(data.details,data.images),ticket_priority:['Low','Medium','High','Urgent'].includes(data.priority)?data.priority:'Medium',ticket_assigned_to:optionId(data.assignedTo,agents)};}
 else {const match=url.pathname.match(/^\/api\/tickets\/([^/]+)\/(note|assignment|contact|billing|asset|document)$/);if(!match)throw Error('Unsupported ticket action.');const rows=(await tickets()).filter(t=>ticketKey(t)===decodeURIComponent(match[1])&&!t.ticket_archived_at);if(rows.length!==1)throw Error('Ticket not found.');current=(await upstream('tickets',{ticket_id:rows[0].ticket_id}))[0];if(!current)throw Error('Ticket not found.');if(config.writes.testOnly&&!String(current.ticket_subject).startsWith('[PWA TEST]'))throw Error('Candidate validation is restricted to labelled test tickets.');
 if(data.expectedUpdatedAt!==current.ticket_updated_at)throw Error('The ticket changed. Refresh it before saving.');
 params={ticket_id:current.ticket_id,client_id:current.ticket_client_id};
 if(match[2]==='document'){const docs=await all('documents');const doc=docs.find(d=>String(d.document_id)===String(data.documentId)&&(!Number(d.document_client_id)||String(d.document_client_id)===String(current.ticket_client_id)));if(!doc)throw Error('Choose a document available to this company.');resource='ticket_replies';action='create';params.ticket_reply='<p>Linked document: <a href="'+config.itflowWebOrigin+'/agent/document.php?document_id='+Number(doc.document_id)+'">'+safeText(doc.document_name,500).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')+'</a></p>';params.ticket_reply_type='Internal';}
 else if(match[2]==='note'){resource='ticket_replies';action='create';params.ticket_reply=noteHtml(data.text,data.images);if(data.timeWorked){if(!/^\d{2}:[0-5]\d:[0-5]\d$/.test(data.timeWorked)||Number(data.timeWorked.slice(0,2))>23)throw Error('Time must be HH:MM:SS, under 24 hours.');params.ticket_reply_time_worked=data.timeWorked;}params.ticket_reply_type=replyType(data.visibility,data.confirmEmail,!!config.writes.publicNoEmail);if(data.visibility==='public')params.ticket_reply_send_email=0;if(data.status)params.ticket_status=optionId(data.status,config.statuses||[]);}
 else {resource='tickets';action='update';if(match[2]==='assignment')params.ticket_assigned_to=optionId(data.assignedTo,agents);if(match[2]==='contact'){const choices=await customers();params.ticket_contact_id=optionId(data.contactId,[{id:0},...choices.contacts.filter(c=>String(c.clientId)===String(current.ticket_client_id))]);}if(match[2]==='asset'){const assets=await all('assets');params.ticket_asset_id=optionId(data.assetId,[{id:0},...assets.filter(a=>!a.asset_archived_at&&String(a.asset_client_id)===String(current.ticket_client_id)).map(a=>({id:a.asset_id}))]);}if(match[2]==='billing'){if(typeof data.billable!=='boolean')throw Error('Select billing status.');params.ticket_billable=data.billable?1:0;}params.ticket_vendor_ticket_id=vendorReference(current);}}
 await fs.appendFile(journal,JSON.stringify({token,signature,time:new Date().toISOString()})+'\n',{mode:0o600});
 const result=await upstream(resource,params,action);ticketRequest=undefined;
 const id=action==='create'&&resource==='tickets'?result[0]?.insert_id:current.ticket_id;
 const updated=(await upstream('tickets',{ticket_id:id}))[0];if(!updated)throw Error('Submission may have completed. Refresh ITFlow before trying again.');
 if(resource==='ticket_replies'){const replies=await all('ticket_replies',{ticket_id:id});if(!replies.some(r=>String(r.ticket_reply_id)===String(result[0]?.insert_id)&&String(r.ticket_reply_by)===String(config.writes.userId)))throw Error('Note may have saved, but attribution verification failed. Check ITFlow before retrying.');}
 if(action==='update'&&((params.ticket_assigned_to!==undefined&&String(updated.ticket_assigned_to)!==String(params.ticket_assigned_to))||!vendorReferencePreserved(current,updated)))throw Error('Update requires review in ITFlow before another edit.');
 if(action==='update'&&params.ticket_contact_id!==undefined&&String(updated.ticket_contact_id)!==String(params.ticket_contact_id))throw Error('Contact update needs review in ITFlow.');if(params.ticket_billable!==undefined&&String(updated.ticket_billable)!==String(params.ticket_billable))throw Error('Billing update needs review in ITFlow.');if(params.ticket_asset_id!==undefined&&String(updated.ticket_asset_id)!==String(params.ticket_asset_id))throw Error('Asset update requires review in ITFlow.');return {key:ticketKey(updated),message:'Saved in ITFlow.'};
}
async function emailContext(event){
 const agentName=(metadata.users||[]).find(u=>String(u.id)===String(config.writes?.userId))?.name||'ITFlow user';if(event.kind==='test')return {agentName};
 const rows=(await tickets()).filter(t=>ticketKey(t)===event.key&&!t.ticket_archived_at&&String(t.ticket_assigned_to)===String(config.writes?.userId||config.push.itflowUserId));if(rows.length!==1)throw Error('Ticket notification no longer available.');
 const t=(await upstream('tickets',{ticket_id:rows[0].ticket_id}))[0];if(!t||String(t.ticket_assigned_to)!==String(config.writes?.userId||config.push.itflowUserId))throw Error('Ticket access changed.');const clients=await all('clients');
 let content=t.ticket_details,actor='ITFlow';if(['replies','ownReplies'].includes(event.kind)){const replyId=String(event.id).split(':').pop();const r=(await all('ticket_replies',{ticket_id:t.ticket_id})).find(r=>String(r.ticket_reply_id)===replyId);content=r?.ticket_reply||'Reply is no longer available.';actor=r?.ticket_reply_by_name||'ITFlow';}
 return {agentName,clientName:clients.find(c=>String(c.client_id)===String(t.ticket_client_id))?.client_name||'Unassigned',subject:t.ticket_subject,status:t.ticket_status_name||(config.statuses||[]).find(s=>String(s.id)===String(t.ticket_status))?.name||String(t.ticket_status),content,actor};
}
async function linkedRecords(t){
 const [assets,documents,replies]=await Promise.all([all('assets'),all('documents'),all('ticket_replies',{ticket_id:t.ticket_id})]);
 const availableAssets=assets.filter(a=>!a.asset_archived_at&&String(a.asset_client_id)===String(t.ticket_client_id)).map(a=>({id:String(a.asset_id),name:a.asset_name}));
 const availableDocuments=documents.filter(d=>!d.document_archived_at&&(!Number(d.document_client_id)||String(d.document_client_id)===String(t.ticket_client_id))).map(d=>({id:String(d.document_id),name:d.document_name}));
 const ids=new Set([String(t.ticket_asset_id||0),...(metadata.ticketAssets||[]).filter(a=>String(a.ticket_id)===String(t.ticket_id)).map(a=>String(a.asset_id))]);
 const linkedAssets=availableAssets.filter(a=>ids.has(a.id)).map(a=>({...a,primary:a.id===String(t.ticket_asset_id)}));
 const referenced=new Set();for(const html of [t.ticket_details,...replies.map(r=>r.ticket_reply)])for(const m of String(html||'').matchAll(/document\.php\?document_id=(\d+)/g))referenced.add(m[1]);
 const associated=new Set((metadata.assetDocuments||[]).filter(d=>ids.has(String(d.asset_id))).map(d=>String(d.document_id)));
 return {primaryAssetId:String(t.ticket_asset_id||0),assets:linkedAssets,documents:availableDocuments.filter(d=>referenced.has(d.id)||associated.has(d.id)).map(d=>({...d,source:referenced.has(d.id)?'Ticket reference':'Linked asset'})),availableAssets,availableDocuments};
}
async function customers(){const [clients,contacts]=await Promise.all([all('clients'),all('contacts')]);return {clients:clients.filter(c=>!c.client_archived_at).map(c=>({id:String(c.client_id),name:c.client_name})),contacts:contacts.filter(c=>!c.contact_archived_at).map(c=>({id:String(c.contact_id),name:c.contact_name,clientId:String(c.contact_client_id),email:c.contact_email||'',phone:c.contact_phone||c.contact_mobile||''}))};}
function csrf(uid,expires=Date.now()+3600000){return `${expires}.${createHmac('sha256',config.csrfSecret||'disabled').update(uid+'.'+expires).digest('hex')}`;}
function validCsrf(req){const token=req.headers['x-csrf-token'];if(!config.csrfSecret||typeof token!=='string'||!/^\d{13}\.[a-f0-9]{64}$/.test(token))return false;const expires=Number(token.split('.')[0]);if(expires<Date.now()||expires>Date.now()+3600000)return false;const expected=csrf(req.authUid||req.headers['x-authentik-uid'],expires);return timingSafeEqual(Buffer.from(token),Buffer.from(expected));}
async function body(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>3*1024*1024)throw new Error('Request too large');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString());}
const testLimits=new Map();
const server=http.createServer((req,res)=>requestContext.run(null,async()=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/healthz' && req.method==='GET')return send(res,200,{status:'ok',release,mode:writeEnabled?'ticket-workflows':'read-only',push:!!push});
    if(!['GET','HEAD','POST'].includes(req.method))return send(res,405,{error:'Method not allowed.'});
    if(localAuth){
      if(!proxyIdentity(req))return send(res,403,{error:'Use the configured HTTPS PWA URL.'});
      req.localSession=localAuth.session(req);localAuth.renew(req,res,req.localSession);req.authUid=req.localSession?.user?(integration?integration.uid(req.localSession.user):localAuth.uid()):null;
      if(await localAuth.handle(req,res,url,{send,body,publicBranding:()=>admin.publicInfo(),disableDevices:ids=>push?.disableDevices(ids)}))return;
      const publicAsset=url.pathname==='/'||url.pathname==='/index.html'||url.pathname==='/sw.js'||url.pathname==='/offline.html'||url.pathname==='/manifest.webmanifest'||url.pathname.startsWith('/assets/')||/^\/icon(?:-\d+)?\.(?:svg|png)$/.test(url.pathname);
      if(!req.localSession?.user&&!publicAsset)return send(res,401,{error:'Sign in to the PWA.'});
      if(req.localSession?.user&&localAuth.enrollmentRequired(req.localSession.user.id)&&!publicAsset)return send(res,403,{error:'Complete authenticator enrollment before continuing.',mfaEnrollmentRequired:true});
      req.publicLocalAsset=publicAsset;
    }
    // The static offline notice contains no private information and supports SW fallback.
    if((url.pathname!=='/offline.html'||req.method==='POST') && !req.publicLocalAsset&&!identity(req))return send(res,403,{error:'Sign in through the configured Authentik application.'});
    const uid=req.authUid||req.headers['x-authentik-uid'];
    if(integration&&req.localSession?.user){requestContext.enterWith(integration.context(req.localSession.user));
      if(url.pathname==='/api/connections'&&req.method==='GET')return send(res,200,integration.view(req.localSession.user));
      if(url.pathname.startsWith('/api/connections/')&&req.method==='POST'){
        if(req.headers.origin!==config.origin||!validCsrf(req))return send(res,403,{error:'Refresh your session.'});
        try{const data=await body(req),action=url.pathname.split('/').pop();if(['instance','policy'].includes(action)&&!administrator(uid))return send(res,403,{error:'Administrator access required.'});const result=await integration.save(req.localSession.user,action,data);return send(res,200,result)}catch(e){return send(res,400,{error:e.message})}
      }
      if(['/api/tickets','/api/docs'].includes(url.pathname)&&!activeContext()?.credential)return send(res,200,[]);
    }

    if(url.pathname.startsWith('/api/microsoft/')){
      if(!integration&&!administrator(uid))return send(res,403,{error:'Calendar export is unavailable.'});
      if(['/api/microsoft/admin','/api/microsoft/configure'].includes(url.pathname)&&!administrator(uid))return send(res,403,{error:'Administrator access required.'});
      if(!microsoft)return send(res,503,{error:'Microsoft calendar storage has not been initialized.'});
      if(req.method==='GET'&&url.pathname==='/api/microsoft/callback'){
        const cookie=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('__Host-itf-ms-state='))?.split('=')[1];let outcome='connected';
        try{await microsoft.finish(uid,{state:url.searchParams.get('state'),code:url.searchParams.get('code'),browser:cookie,error:url.searchParams.get('error')})}catch{outcome='failed'}
        res.writeHead(303,{...security,Location:'/?microsoft='+outcome+(administrator(uid)?'#microsoft':'#more'),'Set-Cookie':'__Host-itf-ms-state=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'});return res.end();
      }
      try{
        if(req.method==='GET'){
          if(url.pathname==='/api/microsoft/admin'&&!administrator(uid))return send(res,403,{error:'Administrator access required.'});
          if(url.pathname==='/api/microsoft/admin')return send(res,200,microsoft.adminView());
          if(url.pathname==='/api/microsoft/status')return send(res,200,microsoft.status(uid));
          if(url.pathname==='/api/microsoft/calendars')return send(res,200,await microsoft.calendars(uid));
        }
        if(req.method==='POST'){
          if(req.headers.origin!==config.origin||!validCsrf(req))return send(res,403,{error:'Refresh your session.'});
          const data=await body(req);
          if(url.pathname==='/api/microsoft/configure'&&!administrator(uid))return send(res,403,{error:'Administrator access required.'});
          if(url.pathname==='/api/microsoft/configure')return send(res,200,await microsoft.configure(data));
          if(url.pathname==='/api/microsoft/connect'){
            const result=await microsoft.begin(uid);res.setHeader('Set-Cookie','__Host-itf-ms-state='+result.browser+'; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=600');return send(res,200,{url:result.url});
          }
          if(url.pathname==='/api/microsoft/options')return send(res,200,await microsoft.select(uid,data));
          if(url.pathname==='/api/microsoft/preview')return send(res,200,await microsoft.preview(uid,{appointments:data.appointments===true,duration:Number.isInteger(data.duration)&&data.duration>=15&&data.duration<=480?data.duration:60}));
          if(url.pathname==='/api/microsoft/pause')return send(res,200,await microsoft.pause(uid));
          if(url.pathname==='/api/microsoft/disconnect')return send(res,200,await microsoft.disconnect(uid));
          if(url.pathname==='/api/microsoft/sync'){if(!microsoft.status(uid).enabled)return send(res,400,{error:'Choose a calendar and enable export first.'});if(Date.parse(microsoft.status(uid).nextSync||'')>Date.now())return send(res,400,{error:'Wait until the next sync time before running another pass.'});void microsoft.sync(uid).catch(()=>{});return send(res,202,{queued:true});}
        }
        return send(res,404,{error:'Not found.'});
      }catch(e){return send(res,400,{error:e.message||'Microsoft calendar operation failed.'})}
    }
    if(req.method==='POST'){
      if(url.pathname==='/api/preferences'){if(req.headers.origin!==config.origin||!validCsrf(req))return send(res,403,{error:'Refresh your session.'});try{const d=await body(req);const c=await customers();if(d.defaultClientId!==''&&!c.clients.some(x=>x.id===d.defaultClientId))throw Error('Choose an available company.');return send(res,200,await admin.savePreferences(uid,d.defaultClientId))}catch(e){return send(res,400,{error:e.message})}}
      if(url.pathname.startsWith('/api/admin/')||url.pathname==='/api/calendar/sync'){if(!administrator(uid))return send(res,403,{error:'Administrator access required.'});if(req.headers.origin!==config.origin||!validCsrf(req))return send(res,403,{error:'Refresh your session.'});try{const data=await body(req);if(url.pathname==='/api/admin/metadata'){if(integration&&req.localSession.user.role!=='owner')throw Error('Owner access required.');return send(res,200,await admin.importMetadata(data));}if(url.pathname==='/api/admin/settings')return send(res,200,await admin.save(data));if(url.pathname==='/api/admin/sync'||url.pathname==='/api/calendar/sync')return send(res,202,await admin.requestSync());return send(res,404,{error:'Not found.'})}catch(e){return send(res,400,{error:e.message})}}
      if(!url.pathname.startsWith('/api/push/')){
        if(!writeEnabled||integration&&!integration.reviewed(activeContext()))return send(res,405,{error:'Ticket writes are not enabled.'});
        if(req.headers.origin!==config.origin||!validCsrf(req))return send(res,403,{error:'Refresh this page before trying again.'});
        if(!url.pathname.startsWith('/api/tickets/'))return send(res,404,{error:'Not found.'});
        const previous=mutations.get(uid)||Promise.resolve();let release;const next=new Promise(r=>release=r);mutations.set(uid,next);await previous;
        try{return send(res,200,await mutate(req,url,uid))}catch(e){return send(res,400,{error:e.message||'Check ITFlow before retrying this submission.'})}finally{release();if(mutations.get(uid)===next)mutations.delete(uid)}
      }
      if(req.headers.origin!==config.origin||!validCsrf(req))return send(res,403,{error:'Refresh this page before trying again.'});
      if(!push)return send(res,503,{error:'Push is not configured.'});
      try{
        const data=await body(req);
        if(url.pathname==='/api/push/email-test'){if(Date.now()-(testLimits.get(uid+':email')||0)<60000)return send(res,429,{error:'Wait one minute before another email test.'});testLimits.set(uid+':email',Date.now());return send(res,202,await push.testEmail(uid));}
        if(url.pathname==='/api/push/email-preferences')return send(res,200,push.emailPreferences(uid,data));
        if(url.pathname==='/api/push/preferences')return send(res,200,push.preferences(uid,data));
        if(url.pathname==='/api/push/subscribe'){const result=push.subscribe(uid,data);if(localAuth&&req.localSession?.user)localAuth.registerDevice(result.id,req.localSession.user);return send(res,200,result);}
        if(url.pathname==='/api/push/unsubscribe')return send(res,200,push.unsubscribe(uid,data));
        if(url.pathname==='/api/push/test'){
          if(Date.now()-(testLimits.get(uid)||0)<60000)return send(res,429,{error:'Wait one minute before another test.'});
          testLimits.set(uid,Date.now());return send(res,202,push.test(uid,data));
        }
        return send(res,404,{error:'Not found.'});
      }catch{return send(res,400,{error:'Could not save notification settings. Check this device subscription and retry.'});}
    }
    if(url.pathname==='/api/session')return send(res,200,{authMode:localAuth?'local':'authentik',name:req.localSession?.user?.name||(config.agents||[]).find(a=>String(a.id)===String(config.writes?.userId))?.name||'ITFlow user',isAdmin:administrator(uid),branding:await admin.publicInfo(),mode:writeEnabled?'ticket-workflows':'read-only',itflowUrl:config.itflowWebOrigin,release,csrfToken:csrf(uid),canWrite:writeEnabled&&(!integration||integration.reviewed(activeContext())),perUserConnections:!!integration,publicNoEmail:!!config.writes?.publicNoEmail,agents:config.agents||[],statuses:config.statuses||[],myUserId:String(config.writes?.userId||config.push?.itflowUserId||'1')});
    if(url.pathname==='/api/preferences')return send(res,200,await admin.preferences(uid));
    if(url.pathname==='/api/calendar'){if(!integration&&!administrator(uid))return send(res,403,{error:'Calendar is unavailable.'});return send(res,200,{events:calendarEvents(!integration||req.localSession?.user?.role==='owner'?metadata.calendar||[]:[],await all('tickets')),timezone:metadata.timezone||'UTC',updatedAt:metadata.updatedAt});}
    const linkMatch=url.pathname.match(/^\/api\/tickets\/([^/]+)\/links$/);if(linkMatch){const rows=(await tickets()).filter(t=>ticketKey(t)===decodeURIComponent(linkMatch[1])&&!t.ticket_archived_at);if(rows.length!==1)return send(res,404,{error:'Ticket not found.'});return send(res,200,await linkedRecords(rows[0]));}
    if(url.pathname==='/api/admin'){if(!administrator(uid))return send(res,403,{error:'Administrator access required.'});return send(res,200,await admin.view())}
    if(url.pathname==='/api/customers')return send(res,200,await customers());
    if(url.pathname==='/api/push/email-status')return send(res,200,push?await push.emailStatus(uid):{enabled:false});
    if(url.pathname==='/api/push/status')return send(res,200,push?push.status(uid):{enabled:false});
    if(url.pathname==='/api/catalog')return send(res,200,catalog(config.itflowWebOrigin,config.writes?.clientId||config.clientId,[...(config.apiExtensions||[]),...(metadata.projects?['projects']:[]),...(metadata.racks?['racks']:[])]));
    if(url.pathname.startsWith('/api/inventory/')){const resource=url.pathname.split('/').pop();if(['projects','racks'].includes(resource)&&metadata[resource]){const allowed=new Set((await all('clients')).map(c=>String(c.client_id)));return send(res,200,inventoryRows(resource,metadata[resource].filter(r=>allowed.has(String(r[resource==='projects'?'project_client_id':'rack_client_id'])))));}if(!nativeResources.includes(resource)||(['projects','racks'].includes(resource)&&!(config.apiExtensions||[]).includes(resource)))return send(res,404,{error:'This module requires an ITFlow API extension.'});return send(res,200,inventoryRows(resource,await all(resource)));}
    if(url.pathname==='/api/tickets') {
      const rows=(await tickets()).filter(t=>!t.ticket_archived_at);
      return send(res,200,rows.map(t=>ticket(t)).sort((a,b)=>String(b.ticket_updated_at||b.ticket_created_at).localeCompare(String(a.ticket_updated_at||a.ticket_created_at))));
    }
    if(url.pathname.startsWith('/api/tickets/')) {
      const key=decodeURIComponent(url.pathname.slice('/api/tickets/'.length));
      const matches=(await tickets()).filter(t=>ticketKey(t)===key && !t.ticket_archived_at);
      if(matches.length!==1)return send(res,404,{error:'Ticket not found.'});
      const t=matches[0];const choices=await customers();const client=choices.clients.find(c=>c.id===String(t.ticket_client_id)),contact=choices.contacts.find(c=>c.id===String(t.ticket_contact_id)&&c.clientId===String(t.ticket_client_id));const replies=await all('ticket_replies',{ticket_id:t.ticket_id});
      return send(res,200,{...ticket(t,true),client:client||null,contact:contact||null,replies:[...replies].sort((a,b)=>String(b.ticket_reply_created_at||'').localeCompare(String(a.ticket_reply_created_at||''))||Number(b.ticket_reply_id)-Number(a.ticket_reply_id)).map(r=>pick(r,['ticket_reply','ticket_reply_type','ticket_reply_by_name','ticket_reply_created_at','ticket_reply_time_worked']))});
    }
    if(url.pathname==='/api/docs') {const rows=await all('documents');return send(res,200,rows.map(r=>({...pick(r,['document_id','document_name','document_description','document_updated_at']),title:r.document_name||'Untitled article'})));}
    if(/^\/api\/docs\/\d+$/.test(url.pathname)) {const id=url.pathname.split('/').pop();const rows=await upstream('documents',{document_id:id});if(rows.length!==1)return send(res,404,{error:'Article not found.'});return send(res,200,pick(rows[0],['document_name','document_description','document_content','document_updated_at']));}
    if(url.pathname.startsWith('/api/'))return send(res,404,{error:'Not found.'});
    let filename=url.pathname==='/'?'/index.html':url.pathname;
    if(!/^\/(?:assets\/[a-zA-Z0-9._-]+|index\.html|icon\.svg|icon-(?:192|512)\.png|manifest\.webmanifest|sw\.js|offline\.html)$/.test(filename))return send(res,404,{error:'Not found.'});
    let data=await readFile(path.join(ROOT,'dist',filename));
    if(filename==='/index.html'){const b=await admin.publicInfo();const title=b.siteTitle.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');data=Buffer.from(data.toString().replace(/<title>[^<]*<\/title>/,()=>'<title>'+title+'</title>'));}
    if(filename==='/manifest.webmanifest'){const manifest=JSON.parse(data.toString()),b=await admin.publicInfo();manifest.name=b.siteTitle;manifest.short_name=b.brand.slice(0,24);data=Buffer.from(JSON.stringify(manifest));}
    res.writeHead(200,{...security,'Content-Type':mime[path.extname(filename)]||'application/octet-stream',...(filename==='/sw.js'?{'Service-Worker-Allowed':'/'}:{})});res.end(req.method==='HEAD'?undefined:data);
  } catch {send(res,502,{error:'ITFlow could not be reached. Please try again.'});}
}));
server.requestTimeout=20000;server.headersTimeout=10000;server.maxHeadersCount=50;
server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.log('ITFlow PWA listening'));
