import os,sys,unittest,tempfile,base64,json,io,zipfile,uuid,copy,threading
from pathlib import Path
from xml.etree import ElementTree as ET
sys.path.insert(0,str(Path(__file__).resolve().parent))
from app import Application
from storage import SQLiteStore,LocalObjects
from core import workbook_info
NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
def write_row(book,n,id,revision,status,name):
 with zipfile.ZipFile(io.BytesIO(book)) as zin:entries={p:zin.read(p) for p in zin.namelist()}
 wb=ET.fromstring(entries['xl/workbook.xml']);sheet=next(s for s in wb.find('{'+NS+'}sheets') if s.get('name')=='Quote Register');rid=sheet.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id');rel=next(r for r in ET.fromstring(entries['xl/_rels/workbook.xml.rels']) if r.get('Id')==rid);target=rel.get('Target');target=target.lstrip('/') if target.startswith('/') else 'xl/'+target
 doc=ET.fromstring(entries[target]);rows=doc.find('{'+NS+'}sheetData');row=None
 for r in rows:
  a=r.find("{*}c[@r='A"+r.get('r')+"']")
  if a is not None and ''.join(a.itertext())==str(n):row=r;break
 if row is None:row=ET.SubElement(rows,'{'+NS+'}row',r=str(max(int(r.get('r')) for r in rows)+1))
 row.clear();row.set('r',str(max([5,*[int(r.get('r')) for r in rows if r is not row]])+1));rn=row.get('r')
 for col,value in {'A':str(n),'AE':status,'AF':id,'AG':str(revision),'AC':name}.items():
  c=ET.SubElement(row,'{'+NS+'}c',r=col+rn,t='inlineStr');s=ET.SubElement(c,'{'+NS+'}is');ET.SubElement(s,'{'+NS+'}t').text=value
 entries[target]=ET.tostring(doc,encoding='utf-8');out=io.BytesIO()
 with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
  for p,data in entries.items():z.writestr(p,data)
 return out.getvalue()
class TestAPI(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.store=SQLiteStore(str(Path(self.tmp.name)/'state.db'));self.objects=LocalObjects(Path(self.tmp.name)/'pdfs');self.book=Path(os.environ['TEST_WORKBOOK']).read_bytes();self.store.initialise({'workbook':base64.b64encode(self.book).decode(),'quotes':{},'pdfs':{}});self.app=Application(self.store,self.objects,lambda token:'nikita.trident2024@gmail.com' if token=='owner' else 'other@gmail.com',origin='https://trident.nikita-trident2024.workers.dev');start,rows=workbook_info(self.book);self.n=max([start-1,*rows])+1
 def tearDown(self):self.tmp.cleanup()
 def call(self,path,method='GET',body=None,revision=None,token='owner',origin='https://trident.nikita-trident2024.workers.dev'):
  b=json.dumps(body).encode() if isinstance(body,dict) else body or b'';e={'REQUEST_METHOD':method,'PATH_INFO':path.split('?')[0],'QUERY_STRING':path.partition('?')[2],'HTTP_ORIGIN':origin,'HTTP_AUTHORIZATION':'Bearer '+token if token else '', 'CONTENT_LENGTH':str(len(b)),'wsgi.input':io.BytesIO(b)}
  if revision is not None:e['HTTP_IF_MATCH']=f'"{revision}"'
  meta=[];result=b''.join(self.app(e,lambda status,headers:meta.append((int(status[:3]),dict(headers)))));return meta[0][0],meta[0][1],result
 def payload(self,status='Draft',id=None,revision=0,n=None):
  n=n or self.n;id=id or str(uuid.uuid4());book=base64.b64decode(self.store.read()[1]['workbook']);filename=f'Client - Repair - Scooter - {n} - 09-10-2026.pdf';p={'id':id,'revision':revision,'state':status,'data':{'version':1,'fields':{'number':str(n),'client':'Test client','date':'2026-10-09','job':'Repair'},'lines':[{'description':'Repairs','qty':1,'rate':100}]},'workbook':base64.b64encode(write_row(book,n,id,revision+1,status,filename)).decode()}
  if status=='Finalised':p.update(filename=filename,pdf=base64.b64encode(b'%PDF-test-fixture').decode())
  return p
 def test_auth_and_origin(self):
  self.assertEqual(self.call('/api/catalog',token='')[0],401);self.assertEqual(self.call('/api/catalog',token='wrong')[0],403);self.assertEqual(self.call('/api/catalog',origin='https://evil.example')[0],403);self.assertEqual(self.call('/api/catalog',method='OPTIONS')[0],200);self.assertEqual(self.call('/api/session')[0],200)
 def test_draft_finalise_edit_delete_reserved(self):
  p=self.payload();self.assertEqual(self.call('/api/quote-save','POST',p,1)[0],200)
  p=self.payload('Finalised',p['id'],1);self.assertEqual(self.call('/api/quote-save','POST',p,2)[0],200);self.assertEqual(self.call('/api/pdf?name='+p['filename'])[2],b'%PDF-test-fixture')
  stale=copy.deepcopy(p);p=self.payload('Finalised',p['id'],2);self.assertEqual(self.call('/api/quote-save','POST',p,3)[0],200);self.assertEqual(self.call('/api/quote-save','POST',stale,4)[0],409)
  p=self.payload('Deleted',p['id'],3);self.assertEqual(self.call('/api/quote-save','POST',p,4)[0],200);self.assertEqual(len(self.store.read()[1]['pdfs']),0);self.assertEqual(self.call('/api/quote-save','POST',self.payload(),5)[0],409);self.assertEqual(self.call('/api/quote-save','POST',self.payload(n=self.n+1),5)[0],200)
 def test_workbook_conflict_and_history(self):
  self.assertEqual(self.call('/api/quote-save','POST',self.payload(),99)[0],409);p=self.payload();self.assertEqual(self.call('/api/quote-save','POST',p,1)[0],200);self.assertEqual(self.call('/api/workbook','POST',self.book,2)[0],400)
 def test_staged_pdf_cleanup_after_cas_conflict(self):
  old=self.store.commit;self.store.commit=lambda *args:False;p=self.payload('Finalised');self.assertEqual(self.call('/api/quote-save','POST',p,1)[0],409);self.assertEqual(len(list(Path(self.tmp.name).rglob('*.pdf'))),0);self.store.commit=old
 def test_atomic_compare_and_swap(self):
  revision,state=self.store.read();results=[];threads=[threading.Thread(target=lambda:results.append(self.store.commit(revision,state))) for _ in range(2)]
  for t in threads:t.start()
  for t in threads:t.join()
  self.assertEqual(sorted(results),[False,True])
if __name__=='__main__':unittest.main()
