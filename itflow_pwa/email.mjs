import nodemailer from 'nodemailer';
import sanitize from 'sanitize-html';
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const safeHtml=value=>sanitize(String(value||''),{allowedTags:['p','br','b','strong','i','em','u','ul','ol','li','blockquote','pre','code','table','thead','tbody','tr','th','td','hr','a','img'],allowedAttributes:{a:['href'],img:['src','alt']},allowedSchemes:['https','http'],allowedSchemesByTag:{img:['data']},allowProtocolRelative:false,exclusiveFilter:frame=>frame.tag==='img'&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(frame.attribs.src||'')});
export function renderEmail(event,origin,context={},templates={},branding={}){
 const url=origin+(event.key?'/#ticket/'+encodeURIComponent(event.key):'/');
 if(event.kind==='test')return {subject:'ITFlow notification test',html:`Hello ${escape(context.agentName||'')},<br><br>Email notifications are connected.<br><br><a href="${escape(url)}">Open ITFlow PWA</a>`,text:'Email notifications are connected.\n\n'+url};
 const source=event.kind==='assignment'?templates.assignment:templates.reply;
 if(!source?.subject||!source?.html)throw Error('ITFlow mail templates have not synced.');
 let html=source.html.replace(/href=(['"])[^'"]*(?:guest_view_ticket|ticket\.php)[^'"]*\1/g,'href="'+escape(url)+'"').replaceAll('https://$config_base_url/agent/ticket.php?ticket_id=$ticket_id$client_uri',escape(url));
 const values={config_app_name:branding.appName||'ITFlow',agent_name:context.agentName,contact_name:context.agentName,client_name:context.clientName,ticket_prefix:'',ticket_number:event.key,ticket_subject:context.subject,ticket_status_name:context.status,session_name:context.actor||'ITFlow',company_name:branding.company||'Support',company_phone:branding.phone||'',from_email:branding.supportEmail||'',reply:context.content||''};
 const replace=(text,isHtml)=>text.replace(/\$([A-Za-z_][A-Za-z_0-9]*)/g,(_,key)=>key==='reply'&&isHtml?safeHtml(values[key]):isHtml?escape(values[key]):String(values[key]??''));
 html=replace(html,true);const subject=replace(source.subject,false).replace(/[\r\n]/g,' ');
 const text=sanitize(html.replace(/<br\s*\/?>/gi,'\n').replace(/<\/p>/gi,'\n'),{allowedTags:[],allowedAttributes:{}})+'\n\n'+url;
 return {subject,html,text};
}
export async function sendEmail(settings,to,event,origin,context={},templates={},branding={}){
 const s=settings.smtp;if(!s?.enabled||!to)throw Error('Email is not configured.');
 const transport=nodemailer.createTransport({host:s.host,port:s.port,secure:s.security==='tls',requireTLS:s.security==='starttls',auth:s.username?{user:s.username,pass:s.password}:undefined,connectionTimeout:45000,greetingTimeout:30000,socketTimeout:45000,disableFileAccess:true,disableUrlAccess:true});
 const body=renderEmail(event,origin,context,templates,branding);
 try{await transport.sendMail({from:{name:s.fromName||branding.fromName||'ITFlow',address:s.from},to,...body,...(branding.supportEmail&&/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(branding.supportEmail)?{replyTo:branding.supportEmail}:{})})}finally{transport.close()}
}

// Standalone fallback; an imported ITFlow template takes precedence.
export const defaultTemplates={assignment:{subject:'$config_app_name - Ticket $ticket_number - $ticket_subject',html:'<p>Hello $agent_name,</p><p>A ticket has been assigned to you.</p><p><strong>$ticket_number — $ticket_subject</strong><br>Company: $client_name<br>Status: $ticket_status_name</p>$reply<p><a href="https://$config_base_url/agent/ticket.php?ticket_id=$ticket_id$client_uri">Open ticket</a></p>'},reply:{subject:'Ticket update - [$ticket_number] - $ticket_subject',html:'<p>Hello $contact_name,</p><p>$session_name updated <strong>$ticket_number — $ticket_subject</strong>.</p>$reply<p>Status: $ticket_status_name</p><p><a href="https://$config_base_url/agent/ticket.php?ticket_id=$ticket_id$client_uri">Open ticket</a></p>'}};
