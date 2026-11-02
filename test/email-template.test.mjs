import test from 'node:test';import assert from 'node:assert/strict';import {renderEmail} from '../email.mjs';
test('Installed-style mail templates interpolate escaped details and sanitized reply without guest links or active content',()=>{
 const templates={reply:{subject:'Ticket update - [$ticket_prefix$ticket_number] - $ticket_subject',html:'Hello $contact_name,<br>$reply<br>Ticket: $ticket_prefix$ticket_number<br>Status: $ticket_status_name<br><a href=\'https://$config_base_url/guest/guest_view_ticket.php?ticket_id=$ticket_id&url_key=$ticket_url_key\'>View ticket</a><br>$company_name'}};
 const message=renderEmail({kind:'replies',key:'TCK-1854'},'https://pwa.example.test',{agentName:'Example',subject:'A < B',status:'Open',content:'<b>Reply</b><script>alert(1)</script><img src="https://tracking.example/x"><a href="javascript:alert(1)">bad</a>'},templates,{company:'Company & Co'});
 assert.equal(message.subject,'Ticket update - [TCK-1854] - A < B');assert.ok(message.html.includes('<b>Reply</b>'));assert.ok(message.html.includes('https://pwa.example.test/#ticket/TCK-1854'));assert.ok(message.html.includes('Company &amp; Co'));for(const forbidden of ['guest_view_ticket','url_key','javascript:','<script','tracking.example','$ticket'])assert.ok(!message.html.includes(forbidden),forbidden);
 assert.throws(()=>renderEmail({kind:'assignment',key:'TCK-1'},'https://pwa.example.test',{},{}));
});
test('Notification sender uses configured display name and keeps the address separate',async()=>{
 const {default:mail}=await import('nodemailer');const {sendEmail}=await import('../email.mjs');const original=mail.createTransport;let captured;
 mail.createTransport=()=>({sendMail:async value=>{captured=value},close(){}});
 try{await sendEmail({smtp:{enabled:true,host:'smtp.example.test',port:587,security:'starttls',from:'itflow@example.test',fromName:'IT Flow Notifications'}},'owner@example.test',{kind:'test'},'https://pwa.example.test',{}, {},{fromName:'ITFlow default'});assert.deepEqual(captured.from,{name:'IT Flow Notifications',address:'itflow@example.test'});}finally{mail.createTransport=original}
});
