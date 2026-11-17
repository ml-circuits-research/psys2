import hashlib,importlib.util,json,os,resource,time,collections,shutil
from pathlib import Path
import numpy as np,torch,onnxruntime as ort
from transformers import AutoTokenizer
C=Path('/home/salboaie/work/sopworlds/.session-control');ROOT=C.parent;h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();start=time.time();torch.set_num_threads(2);torch.set_num_interop_threads(1)
def load(p,n):
 s=importlib.util.spec_from_file_location(n,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
def progress(stage,**extra):
 print(json.dumps({'stage':stage,'seconds':time.time()-start,**extra}),flush=True)
loaderpath=ROOT/'psys2/training/sop-bert/candidates/target-type/load-artifact.py';assert h(loaderpath)=='10638c9fbb87a1af38eddc2642568ec9bceb8a6911ef15e14efb973a1457c2a1';spec=json.loads((C/'review23-epoch1-loader-input.json').read_text());loaded=load(loaderpath,'verified_loader').load_verified_artifact(**spec);key=loaded['model'];cfg=loaded['config'];progress('verified-key-loaded',parameters=sum(p.numel()for p in key.parameters()))
cutdir=C/'calendar-training/training/sop-bert/runs/owner-20261116/request-cutter-full-v1';cutsource=C/'request-cutter/training/sop-bert/train-request-cutter.py';cutfiles={'checkpoint':cutdir/'best.pt','config':cutdir/'model-config.json','source':cutsource,'proof':cutdir/'final-verification.json'};expected={'checkpoint':'85d1d2ee1e03ee22c355077cf6248fba30cb14c2195151deb36f68cffbe758e0','config':'64f3e284f6c901329956351e1077a479102683ffd043b6dabda755a739863ad9','source':'d9422af7ad75e9053f5dfc86c36b0a49ac8f6b52099aa49ac02d95925db1a445'};assert all(h(cutfiles[k])==v for k,v in expected.items());cutproof=json.loads(cutfiles['proof'].read_text());cutcfg=json.loads(cutfiles['config'].read_text());assert cutproof['complete']and cutproof['checkpointSha256']==expected['checkpoint']and cutproof['configSha256']==expected['config']and cutproof['trainerSha256']==expected['source'];assert cutcfg['encoderFiles']==cfg['encoderFiles'];cutmod=load(cutsource,'verified_cutter_source');assert hashlib.sha256(cutmod.canonical(cutmod.CODEC).encode()).hexdigest()==cutcfg['codecSha256'];payload=torch.load(cutfiles['checkpoint'],map_location='cpu',weights_only=True);assert payload['config']==cutcfg and payload['optimizerStored']is False and payload['epoch']==cutproof['bestEpoch'];cutter=cutmod.build_model(cfg['encoder']);cutter.load_state_dict(payload['model'],strict=True);cutter.eval().requires_grad_(False);del payload;assert all(p.device.type=='cpu'and p.dtype==torch.float32 for p in cutter.parameters());progress('verified-cutter-loaded',parameters=sum(p.numel()for p in cutter.parameters()))
exportpath=C/'calendar-training/training/sop-bert/export-reader-onnx.py';exp=load(exportpath,'real_memory_export');normalpath=ROOT/'psys2/training/sop-bert/candidates/target-type/predict-key-reader.py';normal=load(normalpath,'frozen_raw_normalizer');prep=load(Path(spec['paths']['preparer']),'frozen_key_routes');sources={str(p):h(p)for p in [loaderpath,exportpath,exportpath.with_name('export-key-reader.py'),normalpath,Path(spec['paths']['preparer']),cutsource]};tokenizer=AutoTokenizer.from_pretrained(cfg['encoder'],local_files_only=True);cases=[];areas=collections.Counter();rawsource=C/'structural-gold-review23-full/calibration.jsonl'
for line in rawsource.open():
 r=json.loads(line);area=r['world']
 if areas[area]<2:cases.append({'id':r['id'],'text':r['source']['text'],'area':area,'context':r.get('context')});areas[area]+=1
 if len(areas)==4 and all(v==2 for v in areas.values()):break
assert len(cases)==8

def encode(text,area=None,context=None):
 args=(text,)if area is None else(text,json.dumps({'area':area,'context':context},ensure_ascii=False,sort_keys=True));full=tokenizer(*args,truncation=False);e=tokenizer(*args,truncation='longest_first',max_length=192,padding='max_length',return_offsets_mapping=True,return_tensors='pt');offsets=e.pop('offset_mapping')[0].tolist();seq=e.sequence_ids();e.pop('token_type_ids',None);return e,offsets,seq,len(full['input_ids'])>192
first=cases[0];e,offsets,seq,_=encode(first['text'],first['area'],first['context']);source_mask=[s==0 and b>a for s,(a,b)in zip(seq,offsets)];protos=exp.graphs(key,cfg,cutter,e['input_ids'],e['attention_mask'],torch.tensor([[0,1]]),torch.tensor([-1]),source_mask);progress('fp32-protos-in-memory',bytes={k:len(p.SerializeToString())for k,p in protos.items()});q8={}
artifact=C/'review23-epoch1-q8-unpublished';assert h(artifact/'manifest.json')=='aa4a549bda7727a24dcef74a0d0a801d5bba277f93498324aa071986e8200c6c';artifact_manifest=json.loads((artifact/'manifest.json').read_text())
for name in protos:
 q8[name]=(artifact/(name+'.q8.onnx')).read_bytes();assert hashlib.sha256(q8[name]).hexdigest()==artifact_manifest['files'][name]['sha256']
opts=ort.SessionOptions();opts.intra_op_num_threads=2;opts.inter_op_num_threads=1;sessions={name:ort.InferenceSession(body,sess_options=opts,providers=['CPUExecutionProvider'])for name,body in q8.items()};fullsessions={name:ort.InferenceSession(proto.SerializeToString(),sess_options=opts,providers=['CPUExecutionProvider'])for name,proto in protos.items()};progress('fp32-and-q8-cpu-sessions-ready')
layout=exp.prototype().layout(exp.layout_view(cfg));bank={r['key']:(r['start'],r['end'])for r in layout['banks']};stats=collections.defaultdict(lambda:{'calls':0,'maxAbs':0.0,'argmaxChanges':0,'signChanges':0});headstats=collections.defaultdict(lambda:{'queries':0,'argmaxChanges':0,'maxAbs':0.0})
def compare(name,a,b):
 a=np.asarray(a);b=np.asarray(b);assert a.shape==b.shape and np.isfinite(a).all()and np.isfinite(b).all();s=stats[name];s['calls']+=1;s['maxAbs']=max(s['maxAbs'],float(np.max(np.abs(a-b))));s['argmaxChanges']+=int(np.count_nonzero(a.argmax(-1)!=b.argmax(-1)));s['signChanges']+=int(np.count_nonzero((a>0)!=(b>0)))
def runheads(hidden,bio,offsets,seq,attention,text,backend):
 queries=[(-1,0,1,None)];bykey={}
 for k,logits in zip(cfg['bioKeys'],bio):
  spans,error=normal.key_spans(logits.tolist(),offsets,seq,attention,len(text));bykey[k]=spans
  if cfg['registry'][k]['role']=='domain':
   for item in spans:queries.append((cfg['keys'].index(k),*item['tokens'],k))
 source_mask=[s==0 and bool(m)and b>a for s,m,(a,b)in zip(seq,attention,offsets)];spans=[[a,b]for _,a,b,_ in queries];indices=[i for i,_,_,_ in queries];exp.prototype().validate_queries(exp.layout_view(cfg),spans,indices,source_mask)
 if backend=='torch':
  rows=[]
  with torch.no_grad():
   for i,a,b,_ in queries:
    f=hidden[0]if i==-1 else hidden[a:b].mean(0)+key.key.weight[i];rows.append(torch.cat([key.classes[str(r['keyIndex'])](f)for r in layout['banks']]).numpy())
  outputs=np.stack(rows)
 else:outputs=(fullsessions if backend=='fp32'else sessions)['heads'].run(None,{'hidden':np.asarray(hidden,dtype=np.float32),'spans':np.asarray(spans,dtype=np.int64),'key_indices':np.asarray(indices,dtype=np.int64)})[0]
 globals={k:outputs[0,a:b].tolist()for k,(a,b)in bank.items()if cfg['registry'][k]['role']=='global'};mentions={}
 for ri,(index,a,b,k)in enumerate(queries[1:],1):mentions[(k,a,b)]={head:outputs[ri,s:t].tolist()for head,(s,t)in bank.items()if head==k or head in cfg['metadataKeys']}
 return globals,mentions,queries,outputs
logical={'sha256':spec['hashes']['checkpoint'],'tokenizerSha256':cfg['encoderFiles']['tokenizer.json'],'codecSha256':hashlib.sha256(json.dumps({'normalizer':sources[str(normalpath)],'routes':sources[str(Path(spec['paths']['preparer']))],'format':cfg['rawCodecFormat']},sort_keys=True).encode()).hexdigest(),'decoderVersion':2}
def keyread(text,area,context,backend):
 e,off,seq,truncated=encode(text,area,context);mask=e['attention_mask'][0].tolist()
 if backend=='torch':
  with torch.no_grad():hidden,bio,pres=key(e['input_ids'],e['attention_mask'])
  hh=hidden[0];bb=bio[0].numpy();pp=pres[0].numpy()
 else:
  hidden,bio,pres=(fullsessions if backend=='fp32'else sessions)['encoder'].run(None,{k:v.numpy()for k,v in e.items()});hh=hidden[0];bb=bio[0];pp=pres[0]
 gl,ml,queries,outputs=runheads(hh,bb,off,seq,mask,text,backend);packet,_=normal.normalize(cfg,text,area,bb.tolist(),pp.tolist(),gl,ml,off,seq,mask,logical,prep.GLOBAL,prep.META,truncated)
 return packet,{'hidden':hh.detach().numpy()if backend=='torch'else hh,'bio':bb,'presence':pp,'queries':queries,'headLogits':outputs,'encoding':e,'offsets':off,'sequences':seq}
def cutterread(row,backend):
 e,off,seq,truncated=encode(row['text'])
 if backend=='torch':
  with torch.no_grad():logits=cutter(e['input_ids'],e['attention_mask'])[0].numpy()
 else:logits=(fullsessions if backend=='fp32'else sessions)['cutter'].run(None,{k:v.numpy()for k,v in e.items()})[0][0]
 maxima=logits.max(-1,keepdims=True);labels=logits.argmax(-1);labels[(logits==maxima).sum(-1)!=1]=-1;spans,issues=cutmod.decode_bio(labels.tolist(),off,seq,e['attention_mask'][0].tolist(),len(row['text']),truncated);return spans,issues,logits,truncated

def diff(a,b,path=()):
 if type(a)is not type(b):return [list(path)]
 if isinstance(a,dict):return [p for k in sorted(set(a)|set(b))for p in ([[*path,k]]if k not in a or k not in b else diff(a[k],b[k],(*path,k)))]
 if isinstance(a,list):return [list(path)]if len(a)!=len(b)else[p for i,(x,y)in enumerate(zip(a,b))for p in diff(x,y,(*path,str(i)))]
 return []if a==b else[list(path)]

active_stats=collections.defaultdict(lambda:{'calls':0,'values':0,'labelSupport':0,'argmaxChanges':0,'maxAbs':0.0})
presence_stats=collections.defaultdict(lambda:{'calls':0,'headDecisions':0,'signChanges':0,'maxAbs':0.0})
hidden_stats=collections.defaultdict(lambda:{'calls':0,'values':0,'maxAbs':0.0})
role_heads=collections.defaultdict(lambda:{'queries':0,'argmaxChanges':0,'maxAbs':0.0})
def groups(enc,off,seq):
 mask=enc['attention_mask'][0].tolist();return {'sourceActive':np.asarray([bool(m)and q==0 and b>a for m,q,(a,b)in zip(mask,seq,off)]),'contextActive':np.asarray([bool(m)and q==1 and b>a for m,q,(a,b)in zip(mask,seq,off)]),'special':np.asarray([bool(m)and q is None for m,q in zip(mask,seq)]),'padding':np.asarray([not bool(m)for m in mask])}
def bio_compare(stage,pair,left,right,masks):
 for group,mask in masks.items():
  a=left[:,mask,:]if left.ndim==3 else left[mask];b=right[:,mask,:]if right.ndim==3 else right[mask];stat=active_stats[stage+':'+pair+':'+group];stat['calls']+=1;stat['values']+=a.size;stat['labelSupport']+=a.size//3
  if a.size:stat['maxAbs']=max(stat['maxAbs'],float(np.max(np.abs(a-b))));stat['argmaxChanges']+=int(np.count_nonzero(a.argmax(-1)!=b.argmax(-1)))
case_reports=[]
for row in cases:
 cutresults={backend:cutterread(row,backend)for backend in ['torch','fp32','q8']};enc,off,seq,_=encode(row['text']);masks=groups(enc,off,seq)
 for left,right in [('torch','fp32'),('torch','q8'),('fp32','q8')]:bio_compare('cutter',left+'-vs-'+right,cutresults[left][2],cutresults[right][2],masks)
 pipelines={};cache={}
 for backend,(spans,issues,logits,trunc)in cutresults.items():
  readings=[]
  for a,b in spans:
   packet,details=keyread(row['text'][a:b],row['area'],row['context'],backend);readings.append({'sourceRange':[a,b],'packet':packet});cache[(backend,a,b)]=details
  pipelines[backend]={'cutter':{'spans':spans,'issues':issues,'truncated':trunc},'readings':readings}
 for a,b in sorted(set(span for values in cutresults.values()for span in values[0])):
  for backend in ['torch','fp32','q8']:
   if(backend,a,b)not in cache:_,cache[(backend,a,b)]=keyread(row['text'][a:b],row['area'],row['context'],backend)
  ref=cache[('torch',a,b)];mask=groups(ref['encoding'],ref['offsets'],ref['sequences']);query=ref['queries'];head_values={'torch':ref['headLogits']}
  for backend in ['fp32','q8']:
   target=cache[(backend,a,b)];head_values[backend]=(fullsessions if backend=='fp32'else sessions)['heads'].run(None,{'hidden':target['hidden'].astype(np.float32),'spans':np.asarray([[q[1],q[2]]for q in query],dtype=np.int64),'key_indices':np.asarray([q[0]for q in query],dtype=np.int64)})[0]
  for left,right in [('torch','fp32'),('torch','q8'),('fp32','q8')]:
   x=cache[(left,a,b)];y=cache[(right,a,b)];pair=left+'-vs-'+right;bio_compare('key',pair,x['bio'],y['bio'],mask);z=presence_stats[pair];z['calls']+=1;z['headDecisions']+=len(x['presence']);z['signChanges']+=int(np.count_nonzero((x['presence']>0)!=(y['presence']>0)));z['maxAbs']=max(z['maxAbs'],float(np.max(np.abs(x['presence']-y['presence']))));hh=hidden_stats[pair];hh['calls']+=1;hh['values']+=x['hidden'].size;hh['maxAbs']=max(hh['maxAbs'],float(np.max(np.abs(x['hidden']-y['hidden']))))
   for ri,(index,qa,qb,keyname)in enumerate(query):
    applicable=[k for k in bank if cfg['registry'][k]['role']=='global']if index==-1 else([keyname]if keyname in bank else[])+cfg['metadataKeys']
    for k in applicable:
     lo,hi=bank[k];xx=head_values[left][ri,lo:hi];yy=head_values[right][ri,lo:hi];rr=role_heads[pair+':'+k];rr['queries']+=1;rr['argmaxChanges']+=int(xx.argmax()!=yy.argmax());rr['maxAbs']=max(rr['maxAbs'],float(np.max(np.abs(xx-yy))))
 differences={pair:diff(pipelines[left],pipelines[right])for left,right,pair in [('torch','fp32','torch-vs-fp32'),('torch','q8','torch-vs-q8'),('fp32','q8','fp32-vs-q8')]};case_reports.append({'id':row['id'],'area':row['area'],'sourceTextSha256':hashlib.sha256(row['text'].encode()).hexdigest(),'cuts':{k:len(v[0])for k,v in cutresults.items()},'cutterIssues':{k:v[1]for k,v in cutresults.items()},'truncation':{k:v[3]for k,v in cutresults.items()},'empty':{k:not v[0]for k,v in cutresults.items()},'allIndependentRawDifferencePaths':differences,'rawEqual':{k:not v for k,v in differences.items()}});progress('diagnostic-case-complete',area=row['area'],equal=case_reports[-1]['rawEqual'])
assert all(h(Path(p))==v for p,v in sources.items());assert all(h(cutfiles[k])==v for k,v in expected.items());assert all(h(Path(spec['paths'][k]))==v for k,v in spec['hashes'].items());report={'format':'sop.reader-fp32-export-q8-diagnostic/1','keyProofSha256':spec['hashes']['artifact'],'keyCheckpointSha256':spec['hashes']['checkpoint'],'sources':sources,'loaderProvenance':loaded['provenance'],'q8ArtifactManifestSha256':h(artifact/'manifest.json'),'models':{name:{'fp32Bytes':len(protos[name].SerializeToString()),'fp32Sha256':hashlib.sha256(protos[name].SerializeToString()).hexdigest(),'q8Bytes':len(q8[name]),'q8Sha256':hashlib.sha256(q8[name]).hexdigest()}for name in protos},'caseCount':len(cases),'cases':case_reports,'bioBySourceContextSpecialPadding':dict(active_stats),'presenceIndividualSignDecisions':dict(presence_stats),'hiddenNumericalOnly':dict(hidden_stats),'sameReferenceQueryApplicableHeadDecisions':dict(role_heads),'rawEqualCounts':{pair:sum(case['rawEqual'][pair]for case in case_reports)for pair in ['torch-vs-fp32','torch-vs-q8','fp32-vs-q8']},'seconds':time.time()-start,'peakRssBytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024,'scriptSha256':h(Path(__file__)),'command':"CUDA_VISIBLE_DEVICES='' OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 .venv/bin/python .session-control/diagnose-review23-reader-ram.py",'level':'actual8CALtexts/context/tokenizer/predictedcuts+queries, no goldinputs; notfullCAL/accuracy/admission/canonicalgraphparity','newGraphFilesWritten':False,'gpu':False,'executionEligible':False,'graphConfidence':None};(C/'review23-reader-fp32-q8-focused-diagnostic.json').write_text(json.dumps(report,indent=2,sort_keys=True)+'\n');progress('FOCUSED_COMPLETE',rawEqualCounts=report['rawEqualCounts'],peakRssBytes=report['peakRssBytes'])
