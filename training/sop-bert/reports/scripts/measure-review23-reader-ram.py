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
for name,p in protos.items():q8[name]=exp.quantize_memory(p);progress('q8-serialized-in-memory',component=name,bytes=len(q8[name]),sha256=hashlib.sha256(q8[name]).hexdigest())
opts=ort.SessionOptions();opts.intra_op_num_threads=2;opts.inter_op_num_threads=1;sessions={name:ort.InferenceSession(body,sess_options=opts,providers=['CPUExecutionProvider'])for name,body in q8.items()};progress('q8-cpu-sessions-ready')
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
 else:outputs=sessions['heads'].run(None,{'hidden':np.asarray(hidden,dtype=np.float32),'spans':np.asarray(spans,dtype=np.int64),'key_indices':np.asarray(indices,dtype=np.int64)})[0]
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
  hidden,bio,pres=sessions['encoder'].run(None,{k:v.numpy()for k,v in e.items()});hh=hidden[0];bb=bio[0];pp=pres[0]
 gl,ml,queries,outputs=runheads(hh,bb,off,seq,mask,text,backend);packet,_=normal.normalize(cfg,text,area,bb.tolist(),pp.tolist(),gl,ml,off,seq,mask,logical,prep.GLOBAL,prep.META,truncated)
 return packet,{'hidden':hh.detach().numpy()if backend=='torch'else hh,'bio':bb,'presence':pp,'queries':queries,'headLogits':outputs,'encoding':e,'offsets':off,'sequences':seq}
def cutterread(row,backend):
 e,off,seq,truncated=encode(row['text'])
 if backend=='torch':
  with torch.no_grad():logits=cutter(e['input_ids'],e['attention_mask'])[0].numpy()
 else:logits=sessions['cutter'].run(None,{k:v.numpy()for k,v in e.items()})[0][0]
 maxima=logits.max(-1,keepdims=True);labels=logits.argmax(-1);labels[(logits==maxima).sum(-1)!=1]=-1;spans,issues=cutmod.decode_bio(labels.tolist(),off,seq,e['attention_mask'][0].tolist(),len(row['text']),truncated);return spans,issues,logits,truncated

def diff(a,b,path=()):
 if type(a)is not type(b):return [list(path)]
 if isinstance(a,dict):return [p for k in sorted(set(a)|set(b))for p in ([[*path,k]]if k not in a or k not in b else diff(a[k],b[k],(*path,k)))]
 if isinstance(a,list):return [list(path)]if len(a)!=len(b)else[p for i,(x,y)in enumerate(zip(a,b))for p in diff(x,y,(*path,str(i)))]
 return []if a==b else[list(path)]
case_reports=[]
for row in cases:
 ts,ti,tl,tt=cutterread(row,'torch');qs,qi,ql,qt=cutterread(row,'q8');compare('cutter.bio',tl,ql);pipelines={};read_cache={}
 for backend,spans,issues,trunc in [('torch',ts,ti,tt),('q8',qs,qi,qt)]:
  requests=[]
  for a,b in spans:
   packet,details=keyread(row['text'][a:b],row['area'],row['context'],backend);requests.append({'sourceRange':[a,b],'packet':packet});read_cache[(backend,a,b)]=details
  pipelines[backend]={'cutter':{'spans':spans,'issues':issues,'truncated':trunc},'readings':requests}
 # Numeric probes compare same source-derived union of independent predicted cuts.
 for a,b in sorted(set(ts)|set(qs)):
  for backend in ['torch','q8']:
   if (backend,a,b)not in read_cache:_,read_cache[(backend,a,b)]=keyread(row['text'][a:b],row['area'],row['context'],backend)
  left=read_cache[('torch',a,b)];right=read_cache[('q8',a,b)];compare('key.bio',left['bio'],right['bio']);compare('key.presence',left['presence'],right['presence']);compare('key.hidden',left['hidden'],right['hidden'])
  # Same reference queries isolate head numerical effects, in addition to independent pipelines.
  queries=left['queries'];raw=sessions['heads'].run(None,{'hidden':right['hidden'].astype(np.float32),'spans':np.asarray([[x[1],x[2]]for x in queries],dtype=np.int64),'key_indices':np.asarray([x[0]for x in queries],dtype=np.int64)})[0]
  for k,(s,t)in bank.items():
   x=left['headLogits'][:,s:t];y=raw[:,s:t];z=headstats[k];z['queries']+=len(x);z['argmaxChanges']+=int(np.count_nonzero(x.argmax(-1)!=y.argmax(-1)));z['maxAbs']=max(z['maxAbs'],float(np.max(np.abs(x-y))))
 differences=diff(pipelines['torch'],pipelines['q8']);case_reports.append({'id':row['id'],'area':row['area'],'sourceTextSha256':hashlib.sha256(row['text'].encode()).hexdigest(),'torchCuts':len(ts),'q8Cuts':len(qs),'torchCutterIssues':ti,'q8CutterIssues':qi,'truncated':{'torch':tt,'q8':qt},'empty':{'torch':not ts,'q8':not qs},'torchRawComplete':sum(x['packet']['coverage']['complete']for x in pipelines['torch']['readings']),'q8RawComplete':sum(x['packet']['coverage']['complete']for x in pipelines['q8']['readings']),'completeRawPipelineEqual':not differences,'allRawDifferencePaths':differences,'torchRawSha256':hashlib.sha256(json.dumps(pipelines['torch'],sort_keys=True,separators=(',',':')).encode()).hexdigest(),'q8RawSha256':hashlib.sha256(json.dumps(pipelines['q8'],sort_keys=True,separators=(',',':')).encode()).hexdigest()});progress('actual-cal-case-complete',area=row['area'],cuts=[len(ts),len(qs)],rawEqual=not differences)
assert all(h(Path(p))==v for p,v in sources.items());assert all(h(cutfiles[k])==v for k,v in expected.items());assert all(h(Path(spec['paths'][k]))==v for k,v in spec['hashes'].items());report={'format':'sop.actual-reader-ram-parity/1','keyProofSha256':spec['hashes']['artifact'],'keyCheckpointSha256':spec['hashes']['checkpoint'],'keyLoaderProvenance':loaded['provenance'],'cutter':{'verified':expected,'proofSha256':h(cutfiles['proof']),'codecSha256':cutcfg['codecSha256']},'sources':sources,'models':{name:{'fp32OnnxBytes':len(protos[name].SerializeToString()),'q8Bytes':len(q8[name]),'q8Sha256':hashlib.sha256(q8[name]).hexdigest()}for name in q8},'totalQ8Bytes':sum(len(b)for b in q8.values()),'actualCalSource':{'path':str(rawsource),'sha256':h(rawsource),'selection':'first2source rows perarea; text/area/actualcontext ONLY; annotations/labels/counts notinput'},'caseCount':len(cases),'cases':case_reports,'numericComparisons':dict(stats),'allDeclaredHeadDecisionComparisons':dict(headstats),'rawEqualCases':sum(r['completeRawPipelineEqual']for r in case_reports),'levels':{'realWeightsSyntheticInputs':'not run in this actualweight probe','realCalTextPredictedQueries':'8boundedcases; bothfullRAWpipelines independentlypredictedcuts/queries; samequerynumeric probe separate','fullCalibrationOrAdmission':'notrun/notclaimed'},'peakRssBytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024,'seconds':time.time()-start,'onnxruntimeVersion':ort.__version__,'graphFilesWritten':False,'trainedWeightCopiesWritten':False,'gpu':False,'executionEligible':False,'graphConfidence':None,'boundary':'Actual frozenCPUFP32 vs q8ORT numerical/decision smoke only. Not calibrationaccuracy, canonicalgraphparity or empiricaladmission. Allq8bytes remainedRAM and will disappear atprocess exit.'};
# Root's later conditional authorization: only q8+metadata, never FP32 intermediates.
artifact=C/'review23-epoch1-q8-unpublished';reserve=303537434
assert not artifact.exists()
bodies={name+'.q8.onnx':body for name,body in q8.items()}
bodies['model-config.json']=Path(spec['paths']['config']).read_bytes();bodies['cutter-config.json']=cutfiles['config'].read_bytes();bodies['first-epoch-proof.json']=Path(spec['paths']['artifact']).read_bytes()
for name in ['tokenizer.json','tokenizer_config.json','special_tokens_map.json','vocab.txt','added_tokens.json']:
 if name in cfg['encoderFiles']:
  body=(Path(cfg['encoder'])/name).read_bytes();assert hashlib.sha256(body).hexdigest()==cfg['encoderFiles'][name];bodies[name]=body
binding=C/'structural-bindings-expanded.json';assert h(binding)=='07b8094f4c1ababffff579dfd0d249b597afcafcfb26c47bc776887ce03e0798';bodies['bindings.json']=binding.read_bytes()
files={name:{'path':name+'.q8.onnx','sha256':hashlib.sha256(q8[name]).hexdigest(),'bytes':len(q8[name])}for name in q8}
for keyname,filename in [('tokenizer','tokenizer.json'),('bindings','bindings.json')]:files[keyname]={'path':filename,'sha256':hashlib.sha256(bodies[filename]).hexdigest(),'bytes':len(bodies[filename])}
manifest={'format':'sop.key-reader-runtime/1','artifactRole':'trained-unverified','dtype':'fp32','weightRepresentation':'q8-dynamic','executionEligible':False,'graphConfidence':None,'configJSON':bodies['model-config.json'].decode(),'configSha256':spec['hashes']['config'],'checkpointSha256':spec['hashes']['checkpoint'],'encoderSha256':files['encoder']['sha256'],'headsSha256':files['heads']['sha256'],'cutterSha256':files['cutter']['sha256'],'tokenizerSha256':cfg['encoderFiles']['tokenizer.json'],'preparerSha256':spec['hashes']['preparer'],'trainerSha256':spec['hashes']['trainer'],'codecSha256':logical['codecSha256'],'hiddenWidth':key.key.embedding_dim,'rawRoutes':{'globals':prep.GLOBAL,'metadata':prep.META},'cutterConfigJSON':bodies['cutter-config.json'].decode(),'cutterConfigSha256':expected['config'],'cutterCheckpointSha256':expected['checkpoint'],'cutterTrainerSha256':expected['source'],'cutterCodecSha256':cutcfg['codecSha256'],'immutableProofSha256':spec['hashes']['artifact'],'firstEpochComplete':True,'runComplete':False,'files':files,'bindingsSha256':h(binding),'exporterSha256':h(exportpath),'layoutSourceSha256':h(exportpath.with_name('export-key-reader.py')),'normalizerSha256':h(normalpath),'bankLayout':layout['banks'],'runtimeBuildIdentity':'must be bound separately through root empirical gate','calibration':'none; bounded CPU parity only, no admission'}
bodies['manifest.json']=(json.dumps(manifest,indent=2)+'\n').encode();exact=sum(len(b)for b in bodies.values());margin=1048576;before=shutil.disk_usage(C).free;persist={'requestedByRoot':True,'exactBundleBytes':exact,'additionalMarginBytes':margin,'requiredRemainingReserveBytes':reserve,'freeBefore':before,'conditionPassed':before-exact-margin>=reserve,'path':str(artifact)}
if persist['conditionPassed']:
 artifact.mkdir()
 try:
  for name,body in bodies.items():
   if shutil.disk_usage(C).free-len(body)-margin<reserve:raise RuntimeError('conditional-persistence-reserve-refusal')
   (artifact/name).write_bytes(body);assert h(artifact/name)==hashlib.sha256(body).hexdigest()
  persist['freeAfter']=shutil.disk_usage(C).free;persist['manifestSha256']=h(artifact/'manifest.json');persist['files']={name:{'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest()}for name,body in bodies.items()};report['graphFilesWritten']=True;report['boundary']+=' Root conditionally authorized unpublished q8+metadata persistence after exact fullbundle/reserve check; no app assets or activation.'
 except Exception:
  shutil.rmtree(artifact);raise
report['conditionalPersistence']=persist
(C/'review23-reader-actual-ram-parity.json').write_text(json.dumps(report,indent=2,sort_keys=True)+'\n');progress('COMPLETE',totalQ8Bytes=report['totalQ8Bytes'],rawEqual=report['rawEqualCases'],peakRssBytes=report['peakRssBytes'],persistence=persist)

