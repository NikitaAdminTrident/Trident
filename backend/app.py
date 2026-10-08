import base64,io,json,logging,os
from urllib.parse import parse_qs
from core import Problem,decode,save_quote,workbook_info
from storage import BigQueryStore,CloudObjects
MAX_BODY=40*1024*1024
OWNER='nikita.trident2024@gmail.com'
def google_user(token):
 from google.auth.transport.requests import Request
 from google.oauth2.id_token import verify_oauth2_token
 try:claims=verify_oauth2_token(token,Request(),os.environ['GOOGLE_CLIENT_ID'])
 except Exception:raise Problem(401,'Sign in again with Google.')
 if claims.get('iss') not in ('accounts.google.com','https://accounts.google.com') or claims.get('email_verified') is not True:raise Problem(401,'Google account verification failed.')
 return claims.get('email','').lower()
class Application:
 def __init__(self,store=None,objects=None,verify=google_user,origin=None):self.store=store;self.objects=objects;self.verify=verify;self.origin=origin or os.environ.get('FRONTEND_ORIGIN','')
 def __call__(self,environ,start_response):
  status=200;headers=[('Cache-Control','no-store'),('X-Content-Type-Options','nosniff')];mime='application/json';payload=None
  origin=environ.get('HTTP_ORIGIN','');method=environ['REQUEST_METHOD'];path=environ['PATH_INFO']
  if origin==self.origin and origin:headers += [('Access-Control-Allow-Origin',origin),('Vary','Origin'),('Access-Control-Expose-Headers','ETag')]
  try:
   if method=='OPTIONS':
    if origin!=self.origin or not origin:raise Problem(403,'Origin is not allowed.')
    headers += [('Access-Control-Allow-Methods','GET,POST,OPTIONS'),('Access-Control-Allow-Headers','Authorization,Content-Type,If-Match,X-Quote-Token')];payload={}
   elif path=='/api/health':payload={'ok':True,'version':'C'}
   else:
    if origin and origin!=self.origin:raise Problem(403,'Origin is not allowed.')
    auth=environ.get('HTTP_AUTHORIZATION','')
    if not auth.startswith('Bearer '):raise Problem(401,'Sign in with Google to access your quotes.')
    email=self.verify(auth[7:])
    if email!=OWNER:raise Problem(403,'This account is not approved for Trident quotes.')
    if method=='POST' and origin!=self.origin:raise Problem(403,'Save requests must come from the approved website.')
    if path=='/api/session' and method=='GET':payload={'email':email,'token':'cloud','workbook':'Trident-Quote-Settings.xlsx'}
    else:
     if self.store is None:self.store=BigQueryStore()
     if self.objects is None:self.objects=CloudObjects()
     revision,state=self.store.read();headers.append(('ETag',f'"{revision}"'))
     if path=='/api/catalog' and method=='GET':payload={'quotes':list(state['quotes'].values()),'pdfs':list(state['pdfs'])}
     elif path=='/api/drafts' and method=='GET':payload={'drafts':[]}
     elif path=='/api/workbook' and method=='GET':payload=decode(state['workbook'],10*1024*1024);mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
     elif path=='/api/pdf' and method=='GET':
      name=parse_qs(environ.get('QUERY_STRING','')).get('name',[''])[0];key=state['pdfs'].get(name)
      if not key:raise Problem(404,'This PDF is unavailable or has been deleted.')
      payload=self.objects.get(key);mime='application/pdf'
     elif method=='POST' and path in ('/api/workbook','/api/quote-save'):
      if environ.get('HTTP_IF_MATCH')!=f'"{revision}"':raise Problem(409,'Another quote or Excel edit was saved. Refresh and try again.')
      length=int(environ.get('CONTENT_LENGTH') or 0)
      if length<1 or length>MAX_BODY:raise Problem(400,'Upload exceeds the allowed size.')
      body=environ['wsgi.input'].read(length)
      if len(body)!=length:raise Problem(400,'Incomplete upload.')
      upload=None;garbage=[]
      if path=='/api/workbook':
       if len(body)>10*1024*1024:raise Problem(400,'Workbook exceeds 10 MB.')
       _,old=workbook_info(decode(state['workbook'],10*1024*1024));_,new=workbook_info(body)
       if not set(old).issubset(new):raise Problem(400,'Keep all existing quote numbers, including deleted numbers, in the workbook.')
       for n in old:
        if any(old[n].get(c,'')!=new[n].get(c,'') for c in ('AE','AF','AG')):raise Problem(400,'Change quotes in the quote form. Keep register identities, revisions and status intact when editing Excel.')
       state['workbook']=base64.b64encode(body).decode();payload={'saved':True}
      else:
       try:p=json.loads(body)
       except Exception:raise Problem(400,'Invalid quote request.')
       state,entry,upload,garbage=save_quote(state,p,self.objects);payload={'saved':True,'quote':entry}
      try:committed=self.store.commit(revision,state)
      except Exception:
       # Commit outcome may be uncertain: keep staged PDF rather than risk
       # deleting one referenced by a completed database commit.
       raise
      if not committed:
       if upload:self.objects.delete(upload)
       raise Problem(409,'A newer change was saved. Return Home and reopen the quote.')
      headers=[h for h in headers if h[0]!='ETag'];headers.append(('ETag',f'"{revision+1}"'))
      for key in garbage:
       try:self.objects.delete(key)
       except Exception:logging.warning('An obsolete PDF needs storage cleanup.')
     else:raise Problem(404,'Not found.')
  except Problem as e:status=e.status;payload={'error':str(e)};mime='application/json'
  except Exception:logging.exception('Quote API request failed');status=500;payload={'error':'The online service could not complete this request. Refresh Home before retrying.'};mime='application/json'
  data=payload if isinstance(payload,bytes) else json.dumps(payload).encode();headers += [('Content-Type',mime),('Content-Length',str(len(data)))];start_response(f'{status} '+{200:'OK',400:'Bad Request',401:'Unauthorized',403:'Forbidden',404:'Not Found',409:'Conflict',413:'Too Large',500:'Internal Server Error',503:'Unavailable'}.get(status,'Error'),headers);return [data]
app=Application()
