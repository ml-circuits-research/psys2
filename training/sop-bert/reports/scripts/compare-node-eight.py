import json,hashlib
from pathlib import Path
base=Path(__file__).resolve().parent
np=base/'actual-node-eight-probe.json';pp=base/'review23-node-reference-packets.json';n=json.loads(np.read_text());p=json.loads(pp.read_text());by={r['id']:r for r in p['cases']}
def diff(a,b,path='$'):
 if type(a)!=type(b):return [path+':type']
 if isinstance(a,dict):return [path+'.'+k+':missing' for k in a.keys()^b.keys()]+sum((diff(a[k],b[k],path+'.'+k) for k in a.keys()&b.keys()),[])
 if isinstance(a,list):return ([path+':length'] if len(a)!=len(b) else [])+sum((diff(x,y,path+'['+str(i)+']') for i,(x,y) in enumerate(zip(a,b))),[])
 return [] if a==b else [path]
rows=[]
for row in n['rows']:
 ds=row['result']['diagnostics'];cut=next(d['result']['packet'] for d in ds if d['component']=='cutter');reads=[d['result']['raw'] for d in ds if d['component']=='key-reader'];ref=by[row['id']]['pipeline'];js={'cutter':{'spans':cut['spans'],'issues':cut['unresolved'],'truncated':cut['coverage']['truncated']},'readings':[{'sourceRange':cut['spans'][i],'packet':{k:v for k,v in r.items() if k!='model'}} for i,r in enumerate(reads)]};py={**ref,'readings':[{**r,'packet':{k:v for k,v in r['packet'].items() if k!='model'}} for r in ref['readings']]};differences=diff(js,py)
 rows.append({'id':row['id'],'equal':not differences,'allDifferencePaths':differences,'cuts':len(cut['spans']),'rawComplete':sum(r['coverage']['complete'] for r in reads),'canonicalCandidates':len(row['result']['proposal']['candidates'])})
report={'format':'psys2.actual-node-python-q8-parity/1','nodeReportSha256':hashlib.sha256(np.read_bytes()).hexdigest(),'pythonReportSha256':hashlib.sha256(pp.read_bytes()).hexdigest(),'nodeVerified':n['verified'],'pythonModelIdentity':p['logicalModelIdentity'],'excludedFields':['per-packet model identity only; identities retained separately'],'rows':rows,'equal':sum(r['equal'] for r in rows),'cases':len(rows),'semanticAccuracy':None,'calibration':None,'executionEligible':False}
(base/'actual-node-python-eight-comparison.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'equal':report['equal'],'rows':rows},indent=2))
