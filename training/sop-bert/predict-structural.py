"""Frozen source/context-only structural inference. No annotation or field-query input."""
import argparse,hashlib,importlib.util,json,math,time
from pathlib import Path
FORMAT='psys2.raw-structural-predictions/1'
def sha(path):
 h=hashlib.sha256()
 with Path(path).open('rb')as f:
  for chunk in iter(lambda:f.read(1048576),b''):h.update(chunk)
 return h.hexdigest()
def put(obj,path,value):
 for key in path[:-1]:obj=obj.setdefault(key,{})
 obj[path[-1]]=value

def normalize_predictions(config,logits,text,area,model,offsets,sequences,attention,truncated=False):
 """One unbatched prediction; exact source offsets supplied by the fast tokenizer."""
 issues=[];ranges=[];aux={};R=config['maxRequests'];C=config['maxConstraints'];L=len(offsets)
 v2=config.get('format')=='psys2.raw-structural-model/2'
 def issue(path,reason,**extra):issues.append({'path':path,'reason':reason,**extra})
 if config.get('format')not in ['psys2.raw-structural-model/1','psys2.raw-structural-model/2']:raise ValueError('unsupported model format')
 if v2:
  policy={'modeHead':'c:valueMode','copyPointer':'c:copy_span','auxiliaryHeads':['c:value']}
  modes=[{'kind':'absent'},{'kind':'unknown'},{'kind':'value','value':'source-span'},{'kind':'value','value':'declared-symbol'}]
  if config.get('valuePolicy')!=policy or config['banks'].get('c:valueMode')!=modes or 'copy_span'not in config['constraintSpans']:raise ValueError('unsupported v2 value policy')
 expected={'count','presence','conditionCount',*config['banks']}
 for prefix,names in [('r',config['requestSpans']),('c',config['constraintSpans'])]:
  expected.update(prefix+':'+name+':'+suffix for name in names for suffix in ['state','start','end'])
 if set(logits)!=expected:issue([],'incompatible-output-heads',missing=sorted(expected-set(logits)),extra=sorted(set(logits)-expected))
 def argmax(key,index,size,path):
  try:
   values=logits[key]
   for i in index:values=values[i]
   if not isinstance(values,list)or len(values)!=size or any(not isinstance(v,(int,float))or isinstance(v,bool)or not math.isfinite(v)for v in values):raise ValueError()
   best=max(values);choices=[i for i,v in enumerate(values)if v==best]
   if len(choices)!=1:issue(path,'ambiguous-logit-maximum',head=key);return None
   aux[json.dumps([key,*index])]=best;return choices[0]
  except (KeyError,IndexError,TypeError,ValueError):issue(path,'invalid-head-output',head=key);return None
 def category(key,index,obj,path):
  bank=config['banks'][key];choice=argmax(key,index,len(bank),path)
  if choice is None:return
  entry=bank[choice]
  if entry.get('kind')=='absent':return
  if entry.get('kind')=='unknown':issue(path,'unknown-label',head=key);return
  if entry.get('kind')!='value'or 'value'not in entry:issue(path,'invalid-typed-bank-entry',head=key);return
  put(obj,key.split(':',1)[1].split('.'),entry['value'])
 def span(key,index,obj,path,within=None,field=None):
  state=argmax(key+':state',index,3,path)
  if state==0:return None
  if state!=1:issue(path,'unresolved-span');return None
  start=argmax(key+':start',index,L,path);end=argmax(key+':end',index,L,path)
  try:
   if start is None or end is None or start>end or len(sequences)!=L or len(attention)!=L:raise ValueError()
   if any(sequences[i]!=0 or not attention[i]for i in range(start,end+1)):raise ValueError()
   a,b=offsets[start][0],offsets[end][1]
   if not isinstance(a,int)or not isinstance(b,int)or a<0 or a>=b or b>len(text)or any(offsets[i][1]<=offsets[i][0]for i in range(start,end+1)):raise ValueError()
   if within is not None and not(within[0]<=a<b<=within[1]):raise ValueError()
   literal=text[a:b];put(obj,(field or key.split(':',1)[1]).split('.'),literal);ranges.append({'path':path,'range':[a,b]});return [a,b]
  except (ValueError,TypeError,IndexError):issue(path,'invalid-source-pointer');return None
 count=argmax('count',[],R+2,['requestCount']);presence=argmax('presence',[],2,['requestCount']);requests=[]
 if count is None or count>R:
  if count is not None:issue(['requestCount'],'overflow',capacity=R)
  count=None
 if presence is None or count is not None and presence!=int(count>0):issue(['requestCount'],'presence-count-inconsistent');count=None
 if count is not None:
  for ri in range(count):
   obj={};path=['requests',str(ri)];requests.append(obj)
   for key in config['banks']:
    if key.startswith('r:'):category(key,[ri],obj,path+key[2:].split('.'))
   request_range=span('r:span',[ri],obj,path+['span'])
   if request_range is None:issue(path+['span'],'missing-request-span')
   for name in config['requestSpans']:
    if name=='span':continue
    if request_range is None:
     if argmax('r:'+name+':state',[ri],3,path+name.split('.'))!=0:issue(path+name.split('.'),'missing-parent-span')
    else:span('r:'+name,[ri],obj,path+name.split('.'),request_range)
   nc=argmax('conditionCount',[ri],C+2,path+['constraints'])
   if nc is None or nc>C:
    issue(path+['constraints'],'overflow-or-unknown',capacity=C);continue
   obj['constraints']=[]
   for ci in range(nc):
    condition={};cp=path+['constraints',str(ci)];obj['constraints'].append(condition)
    for key in config['banks']:
     if key.startswith('c:')and not(v2 and key in ['c:value','c:valueMode']):category(key,[ri,ci],condition,cp+key[2:].split('.'))
    for name in config['constraintSpans']:
     if v2 and name=='copy_span':continue
     if request_range is None:
      if argmax('c:'+name+':state',[ri,ci],3,cp+[name])!=0:issue(cp+[name],'missing-parent-span')
     else:span('c:'+name,[ri,ci],condition,cp+[name],request_range)
    if v2:
     # The old closed value bank remains auxiliary and cannot emit a value.
     try:
      values=logits['c:value'][ri][ci]
      if len(values)!=len(config['banks']['c:value'])or any(not isinstance(v,(int,float))or isinstance(v,bool)or not math.isfinite(v)for v in values):raise ValueError()
      aux[json.dumps(['c:value',ri,ci])]=max(values)
     except (KeyError,IndexError,TypeError,ValueError):issue(cp+['value'],'invalid-auxiliary-head-output')
     mode=argmax('c:valueMode',[ri,ci],4,cp+['value'])
     if mode==2:
      outer=next((r['range']for r in reversed(ranges)if r['path']==cp+['value_span']),None)
      if outer is None or request_range is None:issue(cp+['value'],'missing-copy-parent-span')
      elif span('c:copy_span',[ri,ci],condition,cp+['value'],outer,field='value')is None:issue(cp+['value'],'missing-source-copy')
     elif mode==3:issue(cp+['value'],'requires-declared-symbol-projection')
     elif mode!=0:issue(cp+['value'],'unknown-value-mode')
 if truncated:issue([],'tokenizer-truncated')
 packet={'format':FORMAT,'source':{'text':text,'unit':'unicode-scalar'},'area':area,'model':model,'requestCount':count,'requests':requests,'coverage':{'complete':not issues,'truncated':bool(truncated)},'unresolved':issues,'ranges':ranges}
 return {'prediction':packet,'auxiliarySelectedLogits':aux,'graphConfidence':None,'executable':False}

def run(args):
 import torch
 from transformers import AutoTokenizer
 root=args.model
 fingerprint_paths={'checkpoint':root/'latest.pt','config':root/'model-config.json','run':root/'run-manifest.json','trainer':args.trainer,'predictor':Path(__file__),'input':args.input,'encoderConfig':args.encoder/'config.json',**{'tokenizer:'+p.name:p for p in sorted((root/'tokenizer').glob('*'))if p.is_file()}}
 fingerprints={key:sha(path)for key,path in fingerprint_paths.items()}
 run=json.loads((root/'run-manifest.json').read_text());config=json.loads((root/'model-config.json').read_text())
 assert sha(root/'latest.pt')==args.checkpoint_sha256
 assert sha(root/'model-config.json')==args.config_sha256==run['modelConfigSha256']
 assert sha(root/'run-manifest.json')==args.run_sha256
 assert sha(args.trainer)==run['scriptSha256']==args.trainer_sha256
 assert Path(config['encoder']).resolve()==args.encoder.resolve()==Path(run['arguments']['encoder']).resolve()
 spec=importlib.util.spec_from_file_location('frozen_structural_trainer',args.trainer);trainer=importlib.util.module_from_spec(spec);spec.loader.exec_module(trainer)
 checkpoint=torch.load(root/'latest.pt',map_location='cpu',weights_only=True);assert checkpoint['config']==config
 assert isinstance(checkpoint.get('steps'),int)and checkpoint['steps']>=0
 model=trainer.build_model(config,args.encoder);model.load_state_dict(checkpoint['model'],strict=True);del checkpoint
 device=args.device;model.to(device).eval();torch.set_num_threads(args.threads)
 tokenizer=AutoTokenizer.from_pretrained(root/'tokenizer',local_files_only=True,use_fast=True);assert tokenizer.is_fast
 assert json.loads((root/'tokenizer/tokenizer.json').read_text())==json.loads(tokenizer.backend_tokenizer.to_str())
 inputs=[]
 for line in args.input.open():
  if not line.strip():continue
  row=json.loads(line);assert set(row)<=set(['id','text','area','context'])and all(k in row for k in ['id','text','area']);assert all(isinstance(row[k],str)for k in ['id','text','area']);inputs.append(row)
 assert len({r['id']for r in inputs})==len(inputs)
 outputs=0;started=time.time();model_identity={'kind':'structural-graph','sha256':args.checkpoint_sha256,'decoderVersion':1}
 with args.out.open('x')as output,torch.inference_mode():
  for offset in range(0,len(inputs),args.batch):
   chunk=inputs[offset:offset+args.batch];texts=[r['text']for r in chunk];contexts=[json.dumps({'area':r['area'],'context':r.get('context')},ensure_ascii=False,sort_keys=True,separators=(',',':'))for r in chunk]
   encoded=tokenizer(texts,contexts,padding='max_length',truncation=True,max_length=config['maxLength'],return_offsets_mapping=True,return_tensors='pt');full=tokenizer(texts,contexts,padding=False,truncation=False)
   ids=encoded['input_ids'].to(device);mask=encoded['attention_mask'].to(device)
   with torch.autocast(device_type='cuda',dtype=torch.bfloat16,enabled=device.startswith('cuda')):result=model(ids,mask)
   tensors={k:v.float().cpu().tolist()for k,v in result.items()}
   for i,row in enumerate(chunk):
    sequence=encoded.sequence_ids(i);truncated=any(trainer.truncation_details(full.sequence_ids(i),sequence).values())
    normalized=normalize_predictions(config,{k:v[i]for k,v in tensors.items()},row['text'],row['area'],model_identity,encoded['offset_mapping'][i].tolist(),sequence,encoded['attention_mask'][i].tolist(),truncated)
    record={'id':row['id'],'inputSha256':hashlib.sha256(json.dumps(row,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest(),**normalized};output.write(json.dumps(record,ensure_ascii=False)+'\n');outputs+=1
   output.flush();print(json.dumps({'rows':outputs,'total':len(inputs),'seconds':time.time()-started}),flush=True)
 assert {key:sha(path)for key,path in fingerprint_paths.items()}==fingerprints,'immutable inference inputs changed; no complete manifest'
 manifest={'complete':True,'frozenInputs':fingerprints,'encoderConfigProvenance':'Exact local config at the run-recorded immutable HF revision path, checked before and after inference. Original training run did not record a separate encoder-config hash; retrospective capture does not prove prior file contents.','torch':torch.__version__,'format':'sop.structural-prediction-run/1','checkpointSha256':args.checkpoint_sha256,'configSha256':args.config_sha256,'runSha256':args.run_sha256,'trainerSha256':args.trainer_sha256,'predictorSha256':sha(__file__),'inputSha256':sha(args.input),'outputSha256':sha(args.out),'tokenizerSha256':sha(root/'tokenizer/tokenizer.json'),'rows':outputs,'device':device,'precision':('cuda-bfloat16'if device.startswith('cuda')else'float32'),'graphConfidence':None,'executable':False}
 args.out.with_suffix(args.out.suffix+'.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')

def main():
 p=argparse.ArgumentParser();p.add_argument('--model',type=Path,required=True);p.add_argument('--trainer',type=Path,required=True);p.add_argument('--encoder',type=Path,required=True)
 for name in ['checkpoint','config','run','trainer']:p.add_argument('--'+name+'-sha256',required=True)
 p.add_argument('--input',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--device',choices=['cuda','cpu'],default='cpu');p.add_argument('--batch',type=int,default=8);p.add_argument('--threads',type=int,default=2);args=p.parse_args();assert args.batch>0 and args.threads>0;run(args)
if __name__=='__main__':main()
