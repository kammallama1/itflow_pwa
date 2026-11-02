import test from 'node:test';import assert from 'node:assert/strict';import {calendarEvents} from '../calendar.mjs';
test('Scheduled tickets join appointments without changing ITFlow local time or emitting archived/invalid schedules',()=>{
 const appointment={id:'1',title:'Appointment',start:'2026-10-31T23:00:00'};const tickets=[{ticket_prefix:'TCK-',ticket_number:1821,ticket_subject:'Scheduled work',ticket_schedule:'2026-10-31 22:00:00'},{ticket_number:2,ticket_schedule:null},{ticket_number:3,ticket_schedule:'0000-00-00 00:00:00'},{ticket_number:4,ticket_schedule:'2026-10-31 20:00:00',ticket_archived_at:'2026-10-30'}];
 const result=calendarEvents([appointment],tickets);assert.equal(result.length,2);assert.equal(result[0].ticketKey,'TCK-1821');assert.equal(result[0].start,'2026-10-31T22:00:00');assert.equal(result[0].id,'ticket:TCK-1821');assert.equal(result[1],appointment);assert.equal(tickets[0].ticket_schedule,'2026-10-31 22:00:00');
});
