export function safeText(value,max=12000){if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('Enter text within the permitted length.');return value.trim();}
export function htmlText(value){return '<p>'+safeText(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;').replaceAll('\n','<br>')+'</p>';}
// The installed API coerces an absent reference to 0. Only a ticket without a
// vendor may normalize an empty reference; real vendor references stay exact.
export function emptyVendorReference(ticket){return String(ticket.ticket_vendor_id??'0')==='0'&&(ticket.ticket_vendor_ticket_number===null||ticket.ticket_vendor_ticket_number==='');}
export function vendorReference(ticket){if(emptyVendorReference(ticket))return 0;const value=String(ticket.ticket_vendor_ticket_number??'');if(!/^(0|[1-9][0-9]{0,8})$/.test(value))throw Error('This ticket’s vendor reference cannot safely be preserved by this ITFlow API. Edit assignment in ITFlow.');return Number(value);}
export function vendorReferencePreserved(before,after){return String(before.ticket_vendor_id??'0')===String(after.ticket_vendor_id??'0')&&(String(after.ticket_vendor_ticket_number)===String(before.ticket_vendor_ticket_number)||(emptyVendorReference(before)&&String(after.ticket_vendor_ticket_number)==='0'));}
export function optionId(value,options){const id=Number(value);if(!Number.isInteger(id)||!options.some(o=>Number(o.id)===id))throw Error('Choose a valid option.');return id;}

export function noteHtml(text,images=[]){
 if(!Array.isArray(images)||images.length>4)throw Error('Attach up to four PNG, JPEG or WebP images.');
 let total=0;const tags=images.map(value=>{
  if(typeof value!=='string')throw Error('Invalid image.');
  const match=value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);if(!match)throw Error('Only PNG, JPEG and WebP images are allowed.');
  const bytes=Buffer.from(match[2],'base64');total+=bytes.length;
  const valid=match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):match[1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  if(!valid||bytes.length>1024*1024||total>2*1024*1024)throw Error('Images must be valid and under 1 MiB each, 2 MiB total.');
  return '<p><img src="'+value+'" alt="Attached image"></p>';
 });
 if(typeof text!=='string'||text.length>12000||(!text.trim()&&!tags.length))throw Error('Enter a note or attach an image.');
 return (text.trim()?htmlText(text):'')+tags.join('');
}

export function replyType(visibility,confirmEmail,allowSilent=false){if(!['internal','public-email',undefined,...(allowSilent?['public']:[])].includes(visibility))throw Error('Public without email needs the proposed ITFlow API update.');if(visibility==='public-email'&&confirmEmail!==true)throw Error('Confirm emailing the ticket contact and watchers.');return visibility==='public-email'||visibility==='public'?'Public':'Internal';}
