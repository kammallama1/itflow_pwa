export function calendarEvents(appointments,tickets){
 const scheduled=tickets.filter(t=>!t.ticket_archived_at&&typeof t.ticket_schedule==='string'&&/^[1-9]\d{3}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(t.ticket_schedule)).map(t=>{const key=`${t.ticket_prefix||'TCK-'}${t.ticket_number}`;return {id:'ticket:'+key,ticketKey:key,title:key+' · '+t.ticket_subject,start:t.ticket_schedule.replace(' ','T'),end:null,allDay:false,repeat:'',calendar:'Scheduled tickets'}});
 return [...appointments,...scheduled].sort((a,b)=>a.start.localeCompare(b.start));
}
