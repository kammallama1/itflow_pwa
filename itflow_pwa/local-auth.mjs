import QRCode from 'qrcode';import path from 'node:path';import {isIP} from 'node:net';
import {openStore,passwordHash,passwordMatches,digest} from './local-auth-store.mjs';
import {createHmac} from 'node:crypto';
export function localAuthentication(config){
 const options=config.localAuth;if(!options?.integrationUid||!(config.admin?.uids||[]).includes(options.integrationUid)||!/[a-f0-9]{64}/.test(options.bootstrapDigest||''))throw Error('Local authentication configuration is incomplete.');const cookie='__Host-itf-local',store=openStore(path.join(config.admin.directory,'local-auth.sqlite'),createHmac('sha256',config.csrfSecret).update('private-local-auth-v1').digest());
 const devices=store.db;devices.exec('CREATE TABLE IF NOT EXISTS local_devices(id TEXT PRIMARY KEY,user_id TEXT NOT NULL)');
 const safe=u=>u?{id:u.id,name:u.name,email:u.email,role:u.role,status:u.status}:null;
 const value=req=>(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookie+'='))?.slice(cookie.length+1);
 const session=req=>store.session(value(req));
 function issue(req,res,id,remember=true){store.logout(value(req));const s=store.newSession(id,remember,req.headers['user-agent']||'Browser');res.setHeader('Set-Cookie',`${cookie}=${s.token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${id?(remember?34560000:28800):1800}`);return s}
 const client=req=>(req.headers['x-forwarded-for']||'').split(',').map(s=>s.trim()).filter(isIP).at(-1)||req.socket.remoteAddress;
 const rates=new Map();let hashing=0;
 function throttle(key,max=10){const now=Date.now(),r=rates.get(key);if(!r||r.until<now){rates.set(key,{n:1,until:now+300000});return}if(++r.n>max)throw Error('Too many attempts. Try again in five minutes.')}
 async function hash(fn){if(hashing>=2)throw Error('Sign-in is busy. Try again shortly.');hashing++;try{return await fn()}finally{hashing--}}
 return {store,session,enrollmentRequired:id=>store.mfaInfo(id).requireEnrollment,renew(req,res,s){if(s?.user&&s.expires===0)res.setHeader('Set-Cookie',`${cookie}=${value(req)}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=34560000`)},initialized:()=>store.initialized(),uid:()=>options.integrationUid,
 devicesFor:id=>devices.prepare('SELECT id FROM local_devices WHERE user_id=?').all(id).map(r=>r.id),
 registerDevice(id,user){devices.prepare('INSERT INTO local_devices VALUES(?,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id').run(id,user.id)},
 async handle(req,res,url,{send,body,disableDevices=()=>{},publicBranding=async()=>({})}){
  if(!url.pathname.startsWith('/api/auth/'))return false;
  let current=session(req);const user=current?.user;if(user&&current.expires===0)res.setHeader('Set-Cookie',`${cookie}=${value(req)}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=34560000`);
  if(user&&store.mfaInfo(user.id).requireEnrollment&&!['/api/auth/status','/api/auth/mfa/setup','/api/auth/mfa/enable','/api/auth/logout','/api/auth/password','/api/auth/sessions'].includes(url.pathname)){send(res,403,{error:'Complete authenticator enrollment before continuing.',mfaEnrollmentRequired:true});return true}
  if(req.method==='GET'){
   if(url.pathname==='/api/auth/status'){if(!current){throttle('anon:'+client(req),60);current={...issue(req,res,null),user:null}}const branding=await publicBranding();send(res,200,{branding:{siteTitle:branding.siteTitle||'Service desk',brand:branding.brand||'Service desk'},mode:'local',perUserConnections:!!config.perUserConnections,initialized:store.initialized(),csrfToken:current.csrf,user:safe(current.user),persistent:current.expires===0,mfa:current.user?store.mfaInfo(current.user.id):null});return true}
   if(url.pathname==='/api/auth/sessions'&&user){send(res,200,{sessions:store.sessions(user.id,current.hash)});return true}
   if(url.pathname==='/api/auth/users'&&['owner','admin'].includes(user?.role)){send(res,200,{users:store.users().map(u=>({...u,mfaEnabled:store.mfaInfo(u.id).enabled,mfaEnrollmentRequired:store.mfaInfo(u.id).requireEnrollment})),audit:store.db.prepare('SELECT action,created FROM audit ORDER BY id DESC LIMIT 30').all()});return true}
   send(res,user?403:401,{error:'Owner access required.'});return true;
  }
  if(req.method!=='POST'){send(res,405,{error:'Method not allowed.'});return true}
  if(req.headers.origin!==config.origin||!current||req.headers['x-csrf-token']!==current.csrf){send(res,403,{error:'Refresh the sign-in page before submitting.'});return true}
  try{const data=await body(req);
   if(url.pathname==='/api/auth/setup'){
    throttle('setup:'+client(req),8);if(store.initialized())throw Error('Setup is complete. Sign in.');if(digest(String(data.bootstrapToken||''))!==options.bootstrapDigest)throw Error('Deployment verification is required.');
    const password=await hash(()=>passwordHash(data.password));const id=store.transaction(()=>{if(store.initialized())throw Error('Setup is already complete.');return store.createUser({email:String(data.email||''),name:String(data.name||'').trim(),role:'owner',password,status:'active'})});issue(req,res,id,data.remember!==false);store.audit(id,'owner.created',id);send(res,201,{created:true});return true;
   }
   if(url.pathname==='/api/auth/login'){
    throttle('login:'+client(req),15);throttle('email:'+digest(String(data.email||'').toLowerCase()),8);const u=store.byEmail(String(data.email||''));const ok=await hash(()=>passwordMatches(data.password,u?.password));if(!ok||u.status!=='active')throw Error('Email or password is incorrect.');if(store.mfaInfo(u.id).enabled){send(res,200,store.challenge(current.hash,u.id,data.remember!==false));return true}issue(req,res,u.id,data.remember!==false);store.audit(u.id,'login.succeeded');send(res,200,{signedIn:true});return true;
   }
   if(url.pathname==='/api/auth/mfa-login'){throttle('factor:'+client(req),10);const r=store.completeChallenge(current.hash,data.code);issue(req,res,r.id,r.remember);store.audit(r.id,'login.mfa');send(res,200,{signedIn:true});return true}
   if(url.pathname==='/api/auth/accept'){
    throttle('invite:'+client(req),10);const password=await hash(()=>passwordHash(data.password)),id=store.transaction(()=>store.accept(String(data.token||''),password));if(store.mfaInfo(id).enabled){send(res,200,store.challenge(current.hash,id,data.remember!==false));return true}issue(req,res,id,data.remember!==false);store.audit(id,'invitation.accepted');send(res,200,{accepted:true});return true;
   }
   if(url.pathname==='/api/auth/logout'){store.logout(value(req));res.setHeader('Set-Cookie',`${cookie}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`);send(res,200,{signedOut:true});return true}
   if(!user){send(res,401,{error:'Sign in first.'});return true}
   if(url.pathname==='/api/auth/revoke-session'){store.revokeSession(user.id,String(data.id||''));store.audit(user.id,'session.revoked');send(res,200,{saved:true});return true}
   if(url.pathname==='/api/auth/revoke-others'){store.revokeOthers(user.id,current.hash);store.audit(user.id,'sessions.revoked');send(res,200,{saved:true});return true}
   if(url.pathname.startsWith('/api/auth/mfa/')){
    throttle('mfa:'+user.id,10);if(!await hash(()=>passwordMatches(data.currentPassword,user.password)))throw Error('Current password is incorrect.');let result;
    if(url.pathname==='/api/auth/mfa/setup'){result=store.beginMfa(user.id,(await publicBranding()).siteTitle||'Service desk');result.qr=await QRCode.toDataURL(result.uri,{width:240,margin:2});}
    else if(url.pathname==='/api/auth/mfa/enable'){result=store.enableMfa(user.id,data.code);store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);issue(req,res,user.id,current.expires===0);store.audit(user.id,'mfa.enabled');}
    else if(url.pathname==='/api/auth/mfa/disable'){result=store.disableMfa(user.id,data.code);store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);issue(req,res,user.id,current.expires===0);store.audit(user.id,'mfa.disabled');}
    else if(url.pathname==='/api/auth/mfa/recovery'){result=store.regenerateRecovery(user.id,data.code);store.audit(user.id,'mfa.recovery.rotated');}
    else throw Error('Unknown MFA action.');send(res,200,result);return true;
   }
   if(url.pathname==='/api/auth/password'){
    throttle('mfa:'+user.id,10);if(!await hash(()=>passwordMatches(data.currentPassword,user.password)))throw Error('Current password is incorrect.');if(store.mfaInfo(user.id).enabled&&!store.verifyFactor(user.id,data.code))throw Error('Enter a fresh authenticator code or unused recovery code.');const password=await hash(()=>passwordHash(data.password));store.db.prepare('UPDATE users SET password=? WHERE id=?').run(password,user.id);store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);issue(req,res,user.id,current.expires===0);store.audit(user.id,'password.changed');send(res,200,{saved:true});return true;
   }
   if(['/api/auth/reset-mfa','/api/auth/reset-access'].includes(url.pathname)){
    if(!['owner','admin'].includes(user.role)){send(res,403,{error:'Administrator access required.'});return true}
    throttle('account-reset:'+user.id,8);const target=store.user(String(data.id||''));if(!target||target.id===user.id){send(res,403,{error:'Use your own account security controls for this account.'});return true;}
    if(!store.mfaInfo(user.id).enabled)throw Error('Enable MFA on your administrator account before resetting another user.');if(!await hash(()=>passwordMatches(data.currentPassword,user.password)))throw Error('Current password is incorrect.');if(!store.verifyFactor(user.id,data.code))throw Error('Enter a fresh authenticator code or unused recovery code.');
    let result;
    if(url.pathname==='/api/auth/reset-mfa'){result=store.resetMfa(target.id);store.audit(user.id,'mfa.admin.reset',target.id)}
    else {result=store.transaction(()=>{store.db.prepare("UPDATE users SET status='invited',password=NULL WHERE id=?").run(target.id);store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);store.db.prepare('DELETE FROM mfa_challenges WHERE user_id=?').run(target.id);return {saved:true,invitationUrl:config.origin+'/#local-invite/'+store.invite(target.id)}});store.audit(user.id,'password.admin.reset',target.id)}
    disableDevices(this.devicesFor(target.id));send(res,200,result);return true;
   }
   if(user.role!=='owner'&&!(config.perUserConnections&&user.role==='admin'&&['/api/auth/invite','/api/auth/user-status'].includes(url.pathname))){send(res,403,{error:'Owner access required.'});return true}
   if(url.pathname==='/api/auth/invite'){const id=store.createUser({email:String(data.email||''),name:String(data.name||'').trim(),role:config.perUserConnections?(data.role==='admin'&&user.role==='owner'?'admin':'technician'):'admin'});const token=store.invite(id);store.audit(user.id,'operator.invited',id);send(res,201,{invitationUrl:config.origin+'/#local-invite/'+token});return true}
   if(url.pathname==='/api/auth/user-status'){
    const target=store.user(String(data.id||''));if(!target||target.role==='owner'||target.id===user.id||target.role==='admin'&&user.role!=='owner')throw Error('This account cannot be changed.');
    store.setStatus(target.id,data.status);disableDevices(this.devicesFor(target.id));store.audit(user.id,'operator.access.changed',target.id);send(res,200,{saved:true});return true;
   }
   send(res,404,{error:'Not found.'});return true;
  }catch(e){send(res,400,{error:e.message||'Account action failed.'});return true}
 },close:()=>store.close()};
}
