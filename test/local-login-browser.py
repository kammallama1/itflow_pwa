import functools,http.server,json,pathlib,threading
from playwright.sync_api import sync_playwright,expect
ROOT=pathlib.Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'dist')));threading.Thread(target=server.serve_forever,daemon=True).start();origin=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as p:
  browser=p.chromium.launch()
  for width in [390,1440]:
   auth={'mode':'local','initialized':False,'csrfToken':'auth-csrf','user':None,'branding':{'siteTitle':'Local ITF'},'mfa':{'enabled':False},'persistent':True}
   def mock(route):
    path=route.request.url.split('/api/',1)[1];data=route.request.post_data_json if route.request.method=='POST' else {};status=200
    if path=='auth/status':result=auth
    elif path=='auth/setup':
     assert data['bootstrapToken']=='synthetic-verification';auth.update(initialized=True,user={'id':'owner','name':'Example','email':'owner@example.test','role':'owner'});result={'created':True}
    elif path=='auth/login':
     if auth['mfa']['enabled']:result={'mfaRequired':True}
     else:auth['user']={'id':'owner','name':'Example','email':'owner@example.test','role':'owner'};result={'signedIn':True}
    elif path=='auth/mfa-login':assert data['code']=='123456';auth['user']={'id':'owner','name':'Example','email':'owner@example.test','role':'owner'};result={'signedIn':True}
    elif path=='auth/mfa/setup':result={'secret':'SYNTHETICSECRET','qr':'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8xkAAAAASUVORK5CYII='}
    elif path=='auth/mfa/enable':assert data['code']=='123456';auth['mfa'].update(enabled=True,requireEnrollment=False);result={'enabled':True,'recoveryCodes':['synthetic-recovery-code']}
    elif path=='auth/sessions':result={'sessions':[{'id':'current','current':True,'persistent':True,'label':'Chromium'}]}
    elif path=='auth/revoke-others':result={'saved':True}
    elif path=='auth/logout':auth['user']=None;result={'signedOut':True}
    elif path=='auth/users':result={'users':[auth['user']]}
    elif path=='auth/invite':result={'invitationUrl':origin+'/#local-invite/synthetic'}
    elif path=='auth/password':result={'saved':True}
    elif path=='session':result={'authMode':'local','branding':{'siteTitle':'Local ITF','brand':'ITF'},'name':'Example','isAdmin':True,'canWrite':False,'csrfToken':'business-csrf','agents':[],'statuses':[]}
    elif path=='admin':result={'authMode':'local','branding':{'siteTitle':'Local ITF','brand':'ITF','subtitle':'SERVICE DESK','welcome':'Hi','logo':'/icon.svg'},'notifications':{'titleTemplate':'ITF · {ticket}'},'smtp':{},'sync':{'periodSeconds':300},'users':[],'identityMappings':[],'apiKeyConfigured':True}
    elif path=='microsoft/admin':result={'configured':False,'tenantId':'','clientId':'','secretSet':False}
    elif path=='microsoft/status':result={'connected':False,'calendarId':'','duration':60}
    elif path=='push/email-status':result={'enabled':False,'preferences':{}}
    elif path=='push/status':result={'enabled':False}
    elif path=='customers':result={'clients':[],'contacts':[]}
    elif path=='preferences':result={'defaultClientId':''}
    else:result=[]
    if path.startswith('auth/') and route.request.method=='POST':assert route.request.headers['x-csrf-token']=='auth-csrf'
    route.fulfill(status=status,content_type='application/json',body=json.dumps(result))
   context=browser.new_context(viewport={'width':width,'height':950});context.route('**/api/**',mock);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(origin)
   page.get_by_label('Deployment verification',exact=True).fill('synthetic-verification');page.get_by_label('Your name',exact=True).fill('Example');page.get_by_label('Email',exact=True).fill('owner@example.test');page.get_by_label('New password',exact=True).fill('Synthetic owner password');page.get_by_label('Confirm password',exact=True).fill('Synthetic owner password');page.get_by_role('button',name='Create owner account',exact=True).click();expect(page.get_by_role('heading',name='Good to see you, Example.')).to_be_visible()
   page.get_by_role('button',name='Account menu',exact=True).click();page.get_by_role('button',name='Admin settings',exact=True).click();expect(page.get_by_role('heading',name='Trusted operators',exact=True)).to_be_visible();page.get_by_label('Current password for security changes',exact=True).fill('Synthetic owner password');page.get_by_role('button',name='Set up authenticator MFA',exact=True).click();expect(page.get_by_alt_text('Authenticator enrollment QR code')).to_be_visible();page.get_by_label('Authenticator or recovery code',exact=True).fill('123456');page.get_by_role('button',name='Confirm code and enable MFA',exact=True).click();expect(page.get_by_text('synthetic-recovery-code',exact=True)).to_be_visible();page.get_by_role('button',name='I saved my recovery codes',exact=True).click();expect(page.get_by_label('MFA code for password change',exact=True)).to_be_visible();page.get_by_role('button',name='Sign out all other devices',exact=True).click();page.get_by_label('Operator name',exact=True).fill('Other');page.get_by_label('Operator email',exact=True).fill('other@example.test');page.get_by_role('button',name='Invite trusted operator',exact=True).click();expect(page.get_by_role('link',name=origin+'/#local-invite/synthetic',exact=True)).to_be_visible()
   page.get_by_role('button',name='More',exact=True).click();expect(page.get_by_text('Signed in with a local PWA account',exact=True)).to_be_visible();page.get_by_role('button',name='Sign out',exact=True).click();expect(page.get_by_role('heading',name='Sign in to Local ITF',exact=True)).to_be_visible();page.get_by_label('Email',exact=True).fill('owner@example.test');page.get_by_label('Password',exact=True).fill('Synthetic owner password');expect(page.get_by_label('Stay signed in until I sign out or revoke this device',exact=True)).to_be_checked();page.get_by_role('button',name='Sign in',exact=True).click();expect(page.get_by_role('heading',name='Verify your sign-in',exact=True)).to_be_visible();expect(page.get_by_role('heading',name='Good to see you, Example.')).to_have_count(0);page.get_by_label('Authenticator or recovery code',exact=True).fill('123456');page.get_by_role('button',name='Verify and sign in',exact=True).click();expect(page.get_by_role('heading',name='Good to see you, Example.')).to_be_visible();assert not errors,errors
   auth['user']={'id':'operator','name':'Operator','email':'operator@example.test','role':'admin'};auth['mfa']={'enabled':False,'requireEnrollment':True};page.reload();expect(page.get_by_role('heading',name='Authenticator enrollment required',exact=True)).to_be_visible();expect(page.get_by_role('heading',name='Good to see you, Example.')).to_have_count(0);page.get_by_label('Current password for security changes',exact=True).fill('Synthetic operator password');page.get_by_role('button',name='Set up authenticator MFA',exact=True).click();page.get_by_label('Authenticator or recovery code',exact=True).fill('123456');page.get_by_role('button',name='Confirm code and enable MFA',exact=True).click();expect(page.get_by_text('synthetic-recovery-code',exact=True)).to_be_visible();page.get_by_role('button',name='I saved my recovery codes',exact=True).click();page.get_by_role('button',name='Continue to app',exact=True).click();expect(page.get_by_role('heading',name='Good to see you, Example.')).to_be_visible();assert not errors,errors
   context.close()
  browser.close()
 print('PASS: branded local login, MFA enrollment/recovery/challenge, persistent choice and session controls at 390/1440px')
finally:server.shutdown()
