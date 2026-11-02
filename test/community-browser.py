"""Synthetic unified onboarding / personal connection UI checks."""
import functools,http.server,json,pathlib,threading
from playwright.sync_api import sync_playwright,expect
ROOT=pathlib.Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'dist')));threading.Thread(target=server.serve_forever,daemon=True).start();origin=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as p:
  browser=p.chromium.launch()
  for role in ['owner','technician']:
   for width in [390,1440]:
    user={'id':role,'role':role,'name':'Example Operator','email':role+'@example.test'};link={'configured':False};instance=None;calls=[]
    def mock(route):
     global instance,link
     key=route.request.url.split('/api/',1)[1];calls.append(key);d=route.request.post_data_json if route.request.method=='POST' else {}
     if key=='auth/status':result={'mode':'local','initialized':True,'user':user,'csrfToken':'auth','perUserConnections':True,'mfa':{'enabled':False}}
     elif key=='auth/users':result={'users':[user]}
     elif key=='auth/sessions':result={'sessions':[]}
     elif key=='session':result={'authMode':'local','perUserConnections':True,'name':'Example Operator','isAdmin':role=='owner','branding':{'siteTitle':'Example Desk','brand':'Example Desk'},'canWrite':False,'csrfToken':'app','agents':[],'statuses':[]}
     elif key=='connections':result={'instance':instance,'link':link,'isOwner':role=='owner','isAdmin':role=='owner','users':[],'microsoftPolicy':{'enabled':True,'timezone':'UTC'}}
     elif key=='connections/instance':instance={'apiOrigin':d['apiUrl'],'webOrigin':d['webUrl']};result={'saved':True}
     elif key=='connections/link':link={'configured':True,'state':'owner-reviewed' if role=='owner' else 'unverified','claimed_id':'1' if role=='owner' else ''};result={'saved':True}
     elif key=='connections/unlink':link={'configured':False};result={'saved':True}
     elif key=='admin':result={'authMode':'local','branding':{'siteTitle':'Example Desk','brand':'Example Desk','subtitle':'SERVICE DESK','welcome':'Hi','logo':'/icon.svg'},'notifications':{'titleTemplate':'Desk · {ticket}'},'smtp':{},'sync':{'periodSeconds':300},'users':[],'identityMappings':[],'apiKeyConfigured':False}
     elif key=='microsoft/admin':result={'configured':True,'tenantId':'example-tenant','clientId':'example-app','secretSet':True}
     elif key=='microsoft/status':result={'configured':True,'connected':False,'calendarId':'','duration':60}
     elif key=='push/status':result={'enabled':False}
     elif key=='push/email-status':result={'enabled':False,'preferences':{}}
     elif key=='preferences':result={'defaultClientId':''}
     elif key=='customers':result={'clients':[],'contacts':[]}
     else:result=[]
     route.fulfill(status=200,content_type='application/json',body=json.dumps(result))
    context=browser.new_context(viewport={'width':width,'height':950});context.route('**/api/**',mock);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(origin);expect(page.get_by_text('TEST PREVIEW',exact=True)).to_have_count(0)
    if role=='owner':
     page.get_by_role('button',name='Account menu',exact=True).click();page.get_by_role('button',name='Admin settings',exact=True).click();page.get_by_label('ITFlow API origin',exact=True).fill('https://itflow.example.test');page.get_by_label('ITFlow browser origin',exact=True).fill('https://itflow.example.test');page.get_by_role('button',name='Save ITFlow instance',exact=True).click();expect(page.get_by_label('Personal ITFlow API key',exact=True)).to_be_enabled();page.get_by_label('Personal ITFlow API key',exact=True).fill('synthetic-example-key');page.get_by_label('Your ITFlow user ID',exact=True).fill('1');page.get_by_label('I reviewed this key’s ITFlow user mapping',exact=True).check();page.get_by_role('button',name='Test and save my API key',exact=True).click();expect(page.get_by_text('Key configured · owner-reviewed · ITFlow user 1',exact=True)).to_be_visible()
    else:instance={'apiOrigin':'https://itflow.example.test','webOrigin':'https://itflow.example.test'}
    page.get_by_role('button',name='More',exact=True).click();expect(page.get_by_role('heading',name='My ITFlow API connection',exact=True)).to_be_visible();expect(page.get_by_role('button',name='Connect Microsoft 365',exact=True)).to_be_visible();expect(page.get_by_label('Directory (tenant) ID',exact=True)).to_have_count(0)
    if role=='technician':
     assert 'microsoft/admin' not in calls;expect(page.get_by_label('Your ITFlow user ID',exact=True)).to_have_count(0);page.get_by_label('Personal ITFlow API key',exact=True).fill('synthetic-technician-key');page.get_by_role('button',name='Test and save my API key',exact=True).click();expect(page.get_by_text('Key configured · unverified',exact=True)).to_be_visible()
    assert not errors,errors;assert page.evaluate('document.documentElement.scrollWidth <= innerWidth');context.close()
  browser.close()
 print('PASS: owner instance/API setup, technician API linking, personal Microsoft UI and no preview banner at 390/1440px')
finally:server.shutdown()
