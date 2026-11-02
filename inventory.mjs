const modules={
 projects:{label:'Projects',fields:['project_name','project_prefix','project_number','project_description','project_due','project_manager','project_completed_at'],prefix:'project'},
 racks:{label:'Racks',fields:['rack_name','rack_type','rack_units','rack_description','rack_location_id'],prefix:'rack'},
 assets:{label:'Assets',fields:['asset_name','asset_type','asset_status','asset_make','asset_model','asset_serial','asset_os','interface_ip','interface_mac'],prefix:'asset'},
 networks:{label:'Networks',fields:['network_name','network','network_subnet','network_vlan','network_gateway','network_primary_dns','network_secondary_dns','network_dhcp_range'],prefix:'network'},
 domains:{label:'Domains',fields:['domain_name','domain_expire','domain_ip','domain_name_servers','domain_mail_servers'],prefix:'domain'},
 certificates:{label:'Certificates',fields:['certificate_name','certificate_domain','certificate_issued_by','certificate_expire'],prefix:'certificate'},
 software:{label:'Licensing',fields:['software_name','software_version','software_type','software_license_type','software_seats','software_purchase','software_expire'],prefix:'software'}
};
export const nativeResources=Object.keys(modules);
export function catalog(origin,clientId=null,extensions=[]) {
 return [...Object.entries(modules).map(([resource,m])=>({resource,label:m.label,native:!['projects','racks'].includes(resource)||extensions.includes(resource),url:`${origin}/agent/${resource}.php${clientId&&resource==='racks'?'?client_id='+encodeURIComponent(clientId):''}`})),...['Credentials','Services'].map(label=>({resource:label.toLowerCase(),label,native:false,url:`${origin}/agent/${label.toLowerCase()}.php${clientId&&label!=='Projects'?'?client_id='+encodeURIComponent(clientId):''}`}))];
}
export function inventoryRows(resource,rows) {
 const m=modules[resource];if(!m)throw new Error('Unsupported inventory');
 return rows.filter(r=>!r[`${m.prefix}_archived_at`]).map(r=>({id:String(r[`${m.prefix}_id`]),name:r[`${m.prefix}_name`]||'Unnamed record',fields:Object.fromEntries(m.fields.filter(f=>r[f]!==null&&r[f]!==undefined&&r[f]!=='').map(f=>[f.replace(m.prefix+'_','').replaceAll('_',' '),String(r[f])]))}));
}
