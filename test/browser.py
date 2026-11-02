"""Synthetic-data browser checks. Run with Playwright's Python environment."""
import functools, http.server, json, pathlib, threading
from playwright.sync_api import sync_playwright, expect

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'verification'
OUT.mkdir(exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'dist')))
threading.Thread(target=server.serve_forever,daemon=True).start()
origin=f'http://127.0.0.1:{server.server_port}'
ticket={'key':'TCK-1821','ticket_subject':'Implement PWA App for Testing','ticket_priority':'High','ticket_status':'2','ticket_status_name':'Open','ticket_assigned_to':'1','ticket_created_at':'2026-10-31 10:20:00','ticket_updated_at':'2026-10-31 14:25:00','ticket_client_id':'1','ticket_contact_id':'10','ticket_billable':'0'}
other={**ticket,'key':'TCK-1820','ticket_subject':'Review the mobile companion design','ticket_priority':'Medium','ticket_status':'9','ticket_status_name':'AI Updated'}
doc={'document_id':'1','title':'Getting started with your workspace','document_name':'Getting started with your workspace','document_description':'A short guide to finding tickets and documentation.'}
detail={**ticket,'ticket_details':'<p>Use this preview to review layout and navigation.</p><img src="x" onerror="window.compromised=true"><script>window.compromised=true</script>','originalUrl':'https://itflow.example.test/ticket.php?ticket_id=115','replies':[{'ticket_reply':'<p>The test VM is ready for the first preview.</p>','ticket_reply_type':'Internal','ticket_reply_by_name':'Example Operator','ticket_reply_created_at':'2026-10-31 14:25:00'}]}
assignment_attempts=0
ms_status={'available':True,'configured':True,'connected':True,'username':'example@example.test','calendarId':'','calendarName':'','enabled':False,'appointments':False,'duration':60,'exports':0}
def mock(route):
    global assignment_attempts
    path=route.request.url.split('/api/',1)[1]
    if path=='tickets/TCK-1821/assignment':
        assignment_attempts+=1
        if assignment_attempts%2:
            route.fulfill(status=400,content_type='application/json',body=json.dumps({'error':'Synthetic assignment failure'}))
        else:
            detail['ticket_assigned_to']=route.request.post_data_json['assignedTo']
            route.fulfill(status=200,content_type='application/json',body=json.dumps({'saved':True}))
        return
    if path.startswith('microsoft/'):

        action=path.split('/')[1]
        if action=='admin':data={'available':True,'configured':True,'tenantId':'11111111-1111-1111-1111-111111111111','clientId':'22222222-2222-2222-2222-222222222222','secretSet':True,'redirectUri':origin+'/api/microsoft/callback'}
        elif action=='status':data=ms_status
        elif action=='calendars':data={'calendars':[{'id':'trial-calendar','name':'ITFlow Trial'}]}
        elif action=='options':ms_status.update(route.request.post_data_json);ms_status['calendarName']='ITFlow Trial';data={'saved':True}
        elif action=='pause':ms_status['enabled']=False;data={'paused':True}
        elif action=='preview':data={'count':1,'window':'7 days back, 90 days forward','timezone':'America/Phoenix','events':[{'title':'Synthetic export','start':'2026-11-02T10:00:00','end':'2026-11-02T11:00:00'}]}
        else:data={'queued':True,'saved':True}
        route.fulfill(status=200,content_type='application/json',body=json.dumps(data));return
    data={'session':{'branding':{'siteTitle':'ITF Test Desk','logo':'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8xkAAAAASUVORK5CYII='},'name':'Example','isAdmin':True,'canWrite':True,'agents':[{'id':'1','name':'Example'},{'id':'2','name':'Claude'}],'statuses':[{'id':'3','name':'On Hold'}],'mode':'ticket-workflows','release':'0.3.0','csrfToken':'synthetic','itflowUrl':'https://itflow.example.test'},'preferences':{'defaultClientId':''},'calendar':{'events':[{'id':'ticket:TCK-1821','ticketKey':'TCK-1821','title':'TCK-1821 · Scheduled work','start':'2026-10-31T22:00:00','end':None,'allDay':False,'calendar':'Scheduled tickets'},{'id':'1','title':'Synthetic appointment','start':'2026-10-31T10:00:00','end':'2026-10-31T11:00:00','calendar':'Service','allDay':False}],'timezone':'America/Phoenix','updatedAt':'2026-10-31T00:00:00Z'},'tickets/TCK-1821/links':{'primaryAssetId':'0','assets':[],'documents':[],'availableAssets':[],'availableDocuments':[]},'customers':{'clients':[{'id':'1','name':'Company A'},{'id':'2','name':'Company B'}],'contacts':[{'id':'10','name':'Contact A','clientId':'1','email':'a@example.test','phone':'555-0100'},{'id':'20','name':'Contact B','clientId':'2','email':'b@example.test','phone':'555-0200'}]},'push/email-status':{'enabled':False,'address':'example@example.test','preferences':{'assignment':False,'replies':False,'ownReplies':False,'edits':False}},'admin':{'notifications':{'titleTemplate':'ITF · {ticket}'},'branding':{'siteTitle':'ITF Test Desk','brand':'ITF','subtitle':'SERVICE DESK','welcome':'Hello','logo':'/icon.svg'},'smtp':{},'sync':{'updatedAt':'2026-10-31T00:00:00Z','periodSeconds':300},'users':[{'id':'1','name':'Example','email':'example@example.test'}],'identityMappings':[{'username':'matt','uid':'owner','itflowUserId':'1'}],'apiKeyConfigured':True},'calendar/sync':{'queued':True},'admin/sync':{'queued':True,'message':'Sync requested.'},'tickets':[ticket,other],'tickets/TCK-1821':detail,'push/status':{'enabled':True,'publicKey':'synthetic','preferences':{'assignment':True,'replies':True,'ownReplies':False,'edits':False},'devices':0,'health':{}},'push/preferences':{'saved':True},'catalog':[{'resource':'assets','label':'Assets','native':True,'url':'https://itflow.example.test/agent/assets.php'},{'resource':'projects','label':'Projects','native':True,'url':'https://itflow.example.test/agent/projects.php'}],'inventory/projects':[{'id':'1','name':'Synthetic project','fields':{'description':'Project preview'}}],'inventory/assets':[{'id':'1','name':'Synthetic router','fields':{'type':'Router','interface ip':'192.0.2.1'}}],'docs':[doc],'docs/1':{**doc,'document_content':'<h2>Your tickets, together</h2><p>Search by TCK number or subject.</p>'}}.get(path)
    route.fulfill(status=200 if data is not None else 404,content_type='application/json',body=json.dumps(data))
try:
 with sync_playwright() as p:
    browser=p.chromium.launch()
    for width,height,scheme in [(390,844,'light'),(320,740,'light'),(1440,1000,'light'),(390,844,'dark')]:
        context=browser.new_context(viewport={'width':width,'height':height},color_scheme=scheme)
        context.route('**/api/**',mock)
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(origin);expect(page.get_by_role('heading',name='Good to see you, Example.')).to_be_visible()
        expect(page).to_have_title('ITF Test Desk')
        assert page.locator('link[rel=manifest]').get_attribute('crossorigin')=='use-credentials'
        if width==1440:
            page.evaluate("()=>{const e=new Event('beforeinstallprompt');e.prompt=async()=>{window.installPromptUsed=true};window.dispatchEvent(e)}")
            page.get_by_role('button',name='Install app',exact=True).click();assert page.evaluate('window.installPromptUsed===true')
        if width==1440:assert page.locator('.bottom-nav').bounding_box()['width']<250
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Horizontal overflow'
        search=page.get_by_role('textbox',name='Search tickets');search.fill('TCK-1821');expect(page.locator('.ticket-card')).to_have_count(1);search.fill('')
        page.screenshot(path=str(OUT/f'tickets-{width}-{scheme}.png'),full_page=True)
        page.get_by_role('button',name='New ticket',exact=True).click();expect(page.get_by_role('combobox',name='Company',exact=True)).to_be_visible();company_box=page.get_by_role('combobox',name='Company',exact=True).bounding_box();contact_box=page.get_by_role('combobox',name='Contact',exact=True).bounding_box();assert (abs(company_box['y']-contact_box['y'])<2) if width==1440 else (company_box['y']<contact_box['y']);page.get_by_role('combobox',name='Company',exact=True).select_option('2');expect(page.get_by_role('combobox',name='Contact',exact=True).get_by_role('option',name='Contact B')).to_have_count(1);expect(page.get_by_role('combobox',name='Contact',exact=True).get_by_role('option',name='Contact A')).to_have_count(0);page.screenshot(path=str(OUT/'new-ticket-desktop.png'),full_page=True) if width==1440 else None;page.get_by_role('button',name='Cancel',exact=True).click()
        page.locator('.ticket-card').first.click();expect(page.get_by_role('heading',name=ticket['ticket_subject'])).to_be_visible();expect(page.get_by_role('heading',name='Work this ticket')).to_be_visible();expect(page.get_by_role('textbox',name='Comment')).to_be_visible();
        assigned=page.get_by_role('combobox',name='Assigned to',exact=True)
        assigned.select_option('2' if detail['ticket_assigned_to']=='1' else '1')
        page.get_by_role('button',name='Save assignment',exact=True).click()
        expect(page.locator('.assignment-form').get_by_role('alert')).to_have_text('Synthetic assignment failure')
        page.get_by_role('button',name='Save assignment',exact=True).click()
        expect(page.locator('.assignment-form').get_by_role('status')).to_have_text('Assignment saved in ITFlow.')
        expect(page.get_by_role('button',name='Save assignment',exact=True)).to_be_disabled()
        page.evaluate("""()=>{const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOU8AAAAASUVORK5CYII='),c=>c.charCodeAt(0));const f=new File([bytes],'synthetic.png',{type:'image/png'});const dt=new DataTransfer();dt.items.add(f);document.querySelector('textarea').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));}""")
        expect(page.locator('.attachment-preview img')).to_have_count(1)
        expect(page.get_by_role('option',name='Public with email updates',exact=True)).to_have_count(1)
        expect(page.locator('option[value=public]')).to_have_count(0)
        assert page.get_by_role('heading',name='Company and contact').bounding_box()['y'] < page.get_by_role('heading',name='Description',exact=True).bounding_box()['y']
        field=page.get_by_role('textbox',name='Comment');colors=field.evaluate('(e)=>({fg:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor})');assert colors['fg']!=colors['bg']
        field.fill('Unsaved draft survives session recovery')
        page.route('**/api/session',lambda route:route.fulfill(status=403,content_type='application/json',body='{"error":"expired"}'),times=1)
        page.evaluate("window.dispatchEvent(new Event('focus'))")
        expect(page.get_by_role('alert').filter(has_text='session expired')).to_be_visible()
        expect(field).to_have_value('Unsaved draft survives session recovery')
        page.evaluate("window.dispatchEvent(new Event('focus'))")
        expect(page.get_by_role('alert').filter(has_text='session expired')).to_have_count(0)
        expect(field).to_have_value('Unsaved draft survives session recovery')
        page.route('**/api/session',lambda route:route.abort('failed'),times=1)
        page.evaluate("window.dispatchEvent(new Event('focus'))")
        expect(page.get_by_role('alert').filter(has_text='connection or sign-in')).to_be_visible()
        page.evaluate("window.dispatchEvent(new Event('focus'))")
        expect(page.get_by_role('alert').filter(has_text='connection or sign-in')).to_have_count(0)
        page.route('**/api/session',lambda route:route.fulfill(status=302,headers={'Location':'https://identity.example.test/login'}),times=1)
        page.evaluate("window.dispatchEvent(new Event('focus'))")
        expect(page.get_by_role('alert').filter(has_text='session expired')).to_be_visible()
        expect(field).to_have_value('Unsaved draft survives session recovery')
        page.evaluate("window.dispatchEvent(new Event('focus'))")
        expect(page.get_by_role('alert').filter(has_text='session expired')).to_have_count(0)
        expect(page.locator('.visibility.internal')).to_be_visible()
        time_box=page.get_by_role('heading',name='Time tracking',exact=True).bounding_box();note_box=page.get_by_role('heading',name='Work this ticket',exact=True).bounding_box();assert (abs(time_box['y']-note_box['y'])<2 and time_box['x']<note_box['x']) if width==1440 else time_box['y']<note_box['y']
        if width==1440:page.screenshot(path=str(OUT/'ticket-form-desktop.png'),full_page=True)
        page.get_by_role('button',name='Start timer',exact=True).click();expect(page.get_by_role('button',name='Stop timer',exact=True)).to_be_visible();page.get_by_role('button',name='Stop timer',exact=True).click()
        assert page.evaluate('window.compromised !== true')
        assert page.locator('.prose img,.prose script').count()==0
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        if width==390:page.screenshot(path=str(OUT/f'detail-{scheme}.png'),full_page=True)
        page.get_by_role('button',name='Knowledge',exact=True).click();expect(page.get_by_role('heading',name='Find your answer.')).to_be_visible();page.locator('.doc-card').click();expect(page.get_by_role('heading',name=doc['title'],exact=True)).to_be_visible()
        page.get_by_role('button',name='Calendar',exact=True).click();expect(page.get_by_role('heading',name='Calendar',exact=True)).to_be_visible();expect(page.locator('.quiet').filter(has_text='Includes appointments and scheduled tickets')).to_be_visible();page.get_by_label('Day',exact=True).fill('2026-10-31');expect(page.get_by_role('link',name='TCK-1821 · Scheduled work →')).to_be_visible();page.get_by_role('button',name='Next day',exact=True).click();expect(page.get_by_label('Day',exact=True)).to_have_value('2026-11-01');expect(page.get_by_role('link',name='TCK-1821 · Scheduled work →')).to_have_count(0);page.get_by_role('button',name='Previous day',exact=True).click();expect(page.get_by_label('Day',exact=True)).to_have_value('2026-10-31');expect(page.get_by_role('link',name='TCK-1821 · Scheduled work →')).to_be_visible();page.get_by_role('button',name='Sync calendar',exact=True).click();expect(page.get_by_text('Sync queued. Checking for completion…',exact=True)).to_be_visible()
        page.get_by_role('button',name='More',exact=True).click();expect(page.get_by_role('heading',name='A little more.')).to_be_visible()
        push_panel=page.locator('section').filter(has=page.get_by_role('heading',name='Push Notifications',exact=True));email_panel=page.locator('section').filter(has=page.get_by_role('heading',name='Email Notifications',exact=True));expect(email_panel.get_by_role('checkbox').first).to_be_visible();assert push_panel.locator('fieldset').evaluate('e=>getComputedStyle(e).gridTemplateColumns')==email_panel.locator('fieldset').evaluate('e=>getComputedStyle(e).gridTemplateColumns')
        expect(page.get_by_role('heading',name='Push Notifications',exact=True)).to_be_visible();expect(page.get_by_role('button',name='Send test',exact=True)).to_be_visible()
        expect(page.locator('section').filter(has=page.get_by_role('heading',name='Push Notifications',exact=True)).get_by_label('A ticket is assigned to me',exact=True)).to_be_checked()
        page.locator('section').filter(has=page.get_by_role('heading',name='Push Notifications',exact=True)).get_by_label('My own replies',exact=True).check()
        page.get_by_role('button',name='Save preferences',exact=True).click()
        expect(page.get_by_text('Preferences saved for your account on all connected devices.')).to_be_visible()
        page.get_by_role('button',name='Account menu',exact=True).click();page.get_by_role('button',name='Admin settings',exact=True).click();expect(page.get_by_role('heading',name='Administration',exact=True)).to_be_visible();expect(page.get_by_role('textbox',name='App/site title',exact=True)).to_be_visible();expect(page.get_by_role('textbox',name='From name',exact=True)).to_be_visible();expect(page.get_by_role('textbox',name='Title template',exact=True)).to_have_value('ITF · {ticket}');expect(page.get_by_role('heading',name='Microsoft 365 calendar export',exact=True)).to_be_visible();page.get_by_text('Microsoft Entra registration instructions',exact=True).click();expect(page.get_by_role('textbox',name='Directory (tenant) ID',exact=True)).to_be_visible();page.get_by_role('textbox',name='Microsoft client secret',exact=True).fill('synthetic-secret-value');page.get_by_role('button',name='Save Microsoft application',exact=True).click();expect(page.get_by_role('textbox',name='Microsoft client secret',exact=True)).to_have_value('');page.get_by_role('button',name='Load Microsoft calendars',exact=True).click();page.locator('.microsoft-settings select').select_option('trial-calendar');page.get_by_role('button',name='Preview ITFlow export',exact=True).click();expect(page.get_by_text('2026-11-02T10:00:00 · Synthetic export',exact=True)).to_be_visible();page.get_by_label('Enable ITFlow → Microsoft export',exact=True).check();page.get_by_role('button',name='Save calendar export options',exact=True).click();expect(page.get_by_role('button',name='Sync to Microsoft now',exact=True)).to_be_enabled();page.get_by_role('button',name='Sync to Microsoft now',exact=True).click();expect(page.get_by_text('Sync queued. Status refreshes automatically; retry times are respected.',exact=True)).to_be_visible();page.get_by_role('button',name='Pause Microsoft export',exact=True).click();expect(page.get_by_role('button',name='Sync to Microsoft now',exact=True)).to_be_disabled();expect(page.get_by_label('Keep notifications visible when supported',exact=True)).to_be_visible();page.get_by_role('button',name='Sync now',exact=True).click();expect(page.get_by_text('Sync requested.',exact=True)).to_be_visible()
        expect(page.locator('.admin-navigation')).to_be_visible()
        expect(page.locator('.admin-card')).to_have_count(6)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Admin horizontal overflow'
        page.screenshot(path=str(OUT/f'admin-{width}-{scheme}.png'),full_page=True)
        page.get_by_role('button',name='More',exact=True).click()
        page.get_by_role('button',name='Projects Browse records →').click();page.get_by_role('button',name='Synthetic project').click();expect(page.get_by_text('Project preview',exact=True)).to_be_visible();page.get_by_role('button',name='← All workspace tools').click()
        page.get_by_role('button',name='Assets Browse records →').click()
        expect(page.get_by_role('button',name='Synthetic router')).to_be_visible()
        page.get_by_role('button',name='Synthetic router').click()
        expect(page.get_by_text('192.0.2.1',exact=True)).to_be_visible()
        page.get_by_role('button',name='← All workspace tools').click()
        if width==390:page.screenshot(path=str(OUT/f'more-{scheme}.png'),full_page=True)
        assert not errors,errors
        context.close()
    context=browser.new_context();context.route('**/api/**',mock);page=context.new_page();page.goto(origin+'/?ticket=TCK-1821');expect(page.locator('.detail-title')).to_have_text('Implement PWA App for Testing');assert page.url.endswith('#ticket/TCK-1821');page.goto(origin)
    page.evaluate('navigator.serviceWorker.ready')
    page.wait_for_function("caches.open('itw-branding-v1').then(async c=>!!(await c.match('/notification-logo')))")
    assert page.evaluate("caches.open('itw-branding-v1').then(async c=>(await (await c.match('/notification-logo')).text()).startsWith('data:image/png;base64,'))")
    caches=page.evaluate('caches.keys().then(async keys => Promise.all(keys.map(async k => ({name:k,urls:(await (await caches.open(k)).keys()).map(r=>r.url)}))))')
    assert all(all(url.endswith('/offline.html') or url.endswith('/notification-logo') for url in cache['urls']) for cache in caches)
    context.set_offline(True);page.goto(origin+'/');expect(page.get_by_role('heading',name='You’re offline')).to_be_visible();context.close()
    context=browser.new_context()
    def default_logo_mock(route):
        if route.request.url.endswith('/api/session'):route.fulfill(status=200,content_type='application/json',body=json.dumps({'branding':{'siteTitle':'ITF Test Desk','logo':'/icon.svg'},'name':'Example','isAdmin':False,'canWrite':False,'csrfToken':'synthetic'}))
        else:mock(route)
    context.route('**/api/**',default_logo_mock);page=context.new_page();page.goto(origin)
    page.wait_for_function("caches.open('itw-branding-v1').then(async c=>{const r=await c.match('/notification-logo');return r&&(await r.text()).startsWith('data:image/png;base64,')})")
    context.close();browser.close()
 print('PASS: 320/390/1440px, dark mode, search, ticket/document navigation, HTML sanitization, offline fallback, cache exclusion; screenshots use synthetic data.')
finally:server.shutdown()
