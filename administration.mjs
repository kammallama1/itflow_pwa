import {readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {noteHtml} from './ticket-actions.mjs';
export async function administration(config){
 const directory=config.admin?.directory;let settings={};
 const read=async name=>{try{return JSON.parse(await readFile(path.join(directory,name),'utf8'))}catch(e){if(e.code==='ENOENT')return {};throw e}};
 if(directory)settings=await read('settings.json');
 const atomic=async(name,data)=>{if(!directory)throw Error('Administration storage is not configured.');const file=path.join(directory,name);await writeFile(file+'.tmp',JSON.stringify(data),{mode:0o600});await rename(file+'.tmp',file)};
 const meta=async()=>directory?read('metadata.json'):{};
 return {
 settings:()=>settings,metadata:meta,
 async preferences(uid){return directory?read('preferences-'+createHash('sha256').update(uid).digest('hex')+'.json'):{defaultClientId:''}},
 async savePreferences(uid,value){await atomic('preferences-'+createHash('sha256').update(uid).digest('hex')+'.json',{defaultClientId:value});return {saved:true}},
 isAdmin:uid=>!!directory&&(config.admin?.uids||[]).includes(uid),
 async publicInfo(){return {siteTitle:settings.siteTitle||(settings.brand||'ITF')+' · Your service desk',brand:settings.brand||'ITF',subtitle:settings.subtitle||'SERVICE DESK',welcome:settings.welcome||'A clear view of what needs your attention.',logo:settings.logo||'/icon.svg'}},
 async view(){const m=await meta(),smtp=settings.smtp||{};return {authMode:config.authMode||'authentik',branding:await this.publicInfo(),notifications:{titleTemplate:settings.notificationTitleTemplate||'ITF · {ticket}',requireInteraction:settings.notificationRequireInteraction===true},smtp:{...smtp,password:undefined,passwordSet:!!smtp.password},users:m.users||[],identityMappings:(config.authMode==='local'?[{uid:config.localAuth.integrationUid,username:'Local operator accounts'}]:config.allowedUsers).map(u=>({username:u.username,itflowUserId:config.writes?.userId,disabled:settings.disabledUsers?.includes(u.uid)||false,uid:u.uid})),apiKeyConfigured:!!config.apiKey,sync:{updatedAt:m.updatedAt||null,error:m.error||null,periodSeconds:300},limitations:['ITFlow user accounts and API keys are managed in ITFlow. This panel does not grant new PWA identities.',config.authMode==='local'?'Local PWA accounts authenticate this instance.':'Direct ITFlow login is unavailable; the configured identity provider remains required.']};},
 async save(data){
 const next={...settings};
 if(data.notifications){const value=data.notifications.titleTemplate;if(typeof value!=='string'||!value.trim()||value.length>120||/[\r\n]/.test(value)||/\{(?!ticket\})[^}]*\}/.test(value))throw Error('Enter a notification title under 120 characters. Use {ticket} for the ticket number.');next.notificationTitleTemplate=value.trim();if(data.notifications.requireInteraction!==undefined&&typeof data.notifications.requireInteraction!=='boolean')throw Error('Choose a valid notification visibility option.');if(data.notifications.requireInteraction!==undefined)next.notificationRequireInteraction=data.notifications.requireInteraction;}
 if(data.branding){const b=data.branding;if(b.siteTitle!==undefined){if(typeof b.siteTitle!=='string'||!b.siteTitle.trim()||b.siteTitle.length>120||/[\r\n]/.test(b.siteTitle))throw Error('Enter a site title under 120 characters.');next.siteTitle=b.siteTitle.trim();}for(const [key,max] of [['brand',40],['subtitle',60],['welcome',200]]){if(typeof b[key]!=='string'||b[key].length>max)throw Error('Invalid branding text.');next[key]=b[key].trim()}
 if(b.logo&&b.logo!=='/icon.svg'){noteHtml('',[b.logo]);next.logo=b.logo}else next.logo='/icon.svg';}
 if(data.smtp){const s=data.smtp;if(typeof s.host!=='string'||s.host.length>200||!Number.isInteger(Number(s.port))||Number(s.port)<1||Number(s.port)>65535||!['starttls','tls'].includes(s.security)||typeof s.from!=='string'||!/^\S+@[^\s@]+\.[^\s@]+$/.test(s.from)||/[\r\n]/.test(s.from))throw Error('Enter valid SMTP settings.');
 if(s.fromName!==undefined&&(typeof s.fromName!=='string'||s.fromName.length>120||/[\r\n]/.test(s.fromName)))throw Error('Enter a sender name under 120 characters.');
 next.smtp={fromName:s.fromName===undefined?settings.smtp?.fromName||'':s.fromName.trim(),enabled:s.enabled===true,host:s.host.trim(),port:Number(s.port),security:s.security,from:s.from.trim(),username:String(s.username||'').slice(0,200),password:s.clearPassword?'':s.password?String(s.password):settings.smtp?.password||''};}
 await atomic('settings.json',next);settings=next;return {saved:true};
 },
 async importMetadata(value){const allowed=['users','statuses','projects','racks','ticketAssets','assetDocuments','calendar'];if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Import a metadata JSON object.');for(const key of allowed)if(value[key]!==undefined&&!Array.isArray(value[key]))throw Error('Metadata lists must be arrays.');if(value.timezone)new Intl.DateTimeFormat('en',{timeZone:value.timezone}).format();const result={updatedAt:new Date().toISOString(),...Object.fromEntries([...allowed,'timezone','mailTemplates','mailBranding'].filter(k=>value[k]!==undefined).map(k=>[k,value[k]]))};await atomic('metadata.json',result);return {saved:true,message:'Metadata imported. Lists refresh within ten seconds.'}},
 async requestSync(){await atomic('sync-request.json',{requestedAt:new Date().toISOString()});return {queued:true,message:'Sync requested. The metadata bridge checks requests every minute.'}},
 async emailAddress(){const m=await meta();if(!m.updatedAt||Date.now()-Date.parse(m.updatedAt)>86400000)return null;const email=(m.users||[]).find(u=>String(u.id)===String(config.writes?.userId))?.email;return typeof email==='string'&&/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)?email:null}
 };
}
