<?php
// Optional local CLI metadata exporter. No ITFlow source files are modified.
if (PHP_SAPI !== 'cli' || empty($argv[1])) {fwrite(STDERR, "Usage: php export-metadata.php /path/to/itflow > metadata.json\n"); exit(1);}
chdir($argv[1]);
require 'functions.php';
require 'config.php';
require_once 'includes/inc_set_timezone.php';
mysqli_begin_transaction($mysqli, MYSQLI_TRANS_START_READ_ONLY);
$queries = [
 'users'=>"SELECT user_id AS id,user_name AS name,user_email AS email FROM users WHERE user_type=1 AND user_status=1 AND user_archived_at IS NULL",
 'statuses'=>"SELECT ticket_status_id AS id,ticket_status_name AS name FROM ticket_statuses WHERE ticket_status_active=1 ORDER BY ticket_status_order",
 'projects'=>"SELECT project_id,project_prefix,project_number,project_name,project_description,project_due,project_manager,project_completed_at,project_updated_at,project_client_id FROM projects WHERE project_archived_at IS NULL",
 'ticketAssets'=>"SELECT ticket_id,asset_id FROM ticket_assets",
 'assetDocuments'=>"SELECT asset_id,document_id FROM asset_documents",
 'racks'=>"SELECT rack_id,rack_name,rack_type,rack_units,rack_description,rack_location_id,rack_client_id FROM racks WHERE rack_archived_at IS NULL"
];
$result=['updatedAt'=>gmdate('c')];
foreach($queries as $name=>$query){$rows=mysqli_query($mysqli,$query);if(!$rows)exit(1);$result[$name]=mysqli_fetch_all($rows,MYSQLI_ASSOC);}
$result['calendar']=[];$result['timezone']=date_default_timezone_get();
$rows=mysqli_query($mysqli,"SELECT event_id,event_title,event_location,event_start,event_end,event_all_day,event_repeat,calendar_name FROM calendar_events LEFT JOIN calendars ON event_calendar_id=calendar_id WHERE event_archived_at IS NULL AND calendar_archived_at IS NULL");
if(!$rows)exit(1);
$window_start=date('Y-m-d H:i:s',strtotime('-1 month'));$window_end=date('Y-m-d H:i:s',strtotime('+6 months'));
while($event=mysqli_fetch_assoc($rows))foreach(expandRecurringEvent($event,$window_start,$window_end) as $occurrence){$result['calendar'][]=['id'=>$event['event_id'],'title'=>$event['event_title'],'location'=>$event['event_location'],'calendar'=>$event['calendar_name'],'start'=>str_replace(' ','T',$occurrence['start']),'end'=>empty($occurrence['end'])?null:str_replace(' ','T',$occurrence['end']),'allDay'=>!empty($event['event_all_day']),'repeat'=>$event['event_repeat']];}
usort($result['calendar'],fn($a,$b)=>strcmp($a['start'],$b['start']));
// Pull installed, inline email templates as data; never evaluate their PHP.
$assignment=file_get_contents('agent/post/ticket.php');$reply=file_get_contents('api/v1/ticket_replies/create.php');
$result['mailTemplates']=[];
foreach(['assignment'=>[$assignment,'$config_app_name - Ticket '],'reply'=>[$reply,'Ticket update - [']] as $kind=>$input){
 $lines=explode("\n",$input[0]);foreach($lines as $i=>$line){if(str_contains($line,'$subject = "'.$input[1])){for($j=$i+1;$j<min($i+5,count($lines));$j++){ $candidate=trim($lines[$j]);if(str_starts_with($candidate,'$body = "')&&str_ends_with($candidate,'";')){$subject=trim($line);$result['mailTemplates'][$kind]=['subject'=>stripcslashes(substr($subject,strlen('$subject = "'),-2)),'html'=>stripcslashes(substr($candidate,strlen('$body = "'),-2))];break 2;}}}}
}
$settings=mysqli_fetch_assoc(mysqli_query($mysqli,"SELECT config_ticket_from_email,config_ticket_from_name FROM settings WHERE company_id=1"));
$company=mysqli_fetch_assoc(mysqli_query($mysqli,"SELECT company_name,company_phone,company_phone_country_code FROM companies WHERE company_id=1"));
$result['mailBranding']=['appName'=>$config_app_name??'ITFlow','supportEmail'=>$settings['config_ticket_from_email'],'fromName'=>$settings['config_ticket_from_name'],'company'=>$company['company_name'],'phone'=>formatPhoneNumber($company['company_phone'],$company['company_phone_country_code'])];
mysqli_rollback($mysqli);
echo json_encode($result, JSON_THROW_ON_ERROR);
