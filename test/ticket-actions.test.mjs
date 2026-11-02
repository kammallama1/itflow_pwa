import test from 'node:test';import assert from 'node:assert/strict';
import {htmlText,vendorReference,vendorReferencePreserved,optionId} from '../ticket-actions.mjs';
test('Plain-text note input is escaped and retains line breaks',()=>{assert.equal(htmlText('<script>\nhello & goodbye'),'<p>&lt;script&gt;<br>hello &amp; goodbye</p>');assert.throws(()=>htmlText(' '));});
test('Unsafe vendor references fail closed instead of being integer-coerced',()=>{for(const v of ['','ABC-123','0012',null,'1e3'])assert.throws(()=>vendorReference({ticket_vendor_id:8,ticket_vendor_ticket_number:v}));assert.equal(vendorReference({ticket_vendor_ticket_number:'123'}),123);});
test('Assignments and statuses must come from configured options',()=>{assert.equal(optionId('1',[{id:'1'}]),1);assert.throws(()=>optionId('99',[{id:'1'}]));assert.throws(()=>optionId('1.5',[{id:'1'}]));});

test('Inline note images accept bounded raster data and reject SVG or forged files',async()=>{const {noteHtml}=await import('../ticket-actions.mjs');const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOU8AAAAASUVORK5CYII=';assert.ok(noteHtml('',[png]).includes('<img src="data:image/png'));assert.throws(()=>noteHtml('test',['data:image/svg+xml;base64,PHN2Zz4=']));assert.throws(()=>noteHtml('test',['data:image/png;base64,ZmFrZQ==']));assert.throws(()=>noteHtml('',[]));assert.throws(()=>noteHtml('test',Array(5).fill(png)));});

test('Public email requires explicit confirmation; silent-public cannot fall through to email',async()=>{const {replyType}=await import('../ticket-actions.mjs');assert.equal(replyType(undefined,false),'Internal');assert.equal(replyType('internal',true),'Internal');assert.throws(()=>replyType('public-email',false));assert.equal(replyType('public-email',true),'Public');assert.throws(()=>replyType('public',true));});

test('Absent references normalize only for tickets without a vendor',()=>{
 for(const value of ['',null]){const before={ticket_vendor_id:'0',ticket_vendor_ticket_number:value};assert.equal(vendorReference(before),0);assert.ok(vendorReferencePreserved(before,{ticket_vendor_id:'0',ticket_vendor_ticket_number:'0'}));assert.throws(()=>vendorReference({...before,ticket_vendor_id:'8'}));assert.ok(!vendorReferencePreserved(before,{ticket_vendor_id:'8',ticket_vendor_ticket_number:'0'}));}
 assert.ok(!vendorReferencePreserved({ticket_vendor_id:'8',ticket_vendor_ticket_number:'123'},{ticket_vendor_id:'8',ticket_vendor_ticket_number:'0'}));
});
