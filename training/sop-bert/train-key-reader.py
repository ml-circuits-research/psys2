"""Inventory-key BIO reader with shared per-mention metadata; no slot assignment.
Gold request cuts are conditional supervision, never an inference argument.
"""
import argparse,collections,hashlib,json,random,time,importlib.util
from pathlib import Path

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def typed(v):return json.dumps(v,sort_keys=True,ensure_ascii=False)
def bank(spec):return [{'state':'absent'},{'state':'unknown'}]+[{'state':'value','value':v}for v in spec.get('values',[])]
def label(value,values):
    for i,item in enumerate(values[2:],2):
        if typed(value)==typed(item['value']):return i
    return 1

def token_interval(offsets,span):
    if not span:return None
    ids=[i for i,(a,b)in enumerate(offsets)if b>a and a>=span[0]and b<=span[1]]
    return (ids[0],ids[-1]+1)if ids and offsets[ids[0]][0]==span[0]and offsets[ids[-1]][1]==span[1]else None

def configuration(manifest):
    registry={k:dict(v)for k,v in manifest['registry'].items()};keys=list(registry)
    families=manifest.get('targetFamilies')
    if families is not None:
        if not isinstance(families,dict)or not families or any(not isinstance(area,str)or not area or not isinstance(types,list)or not types or any(not isinstance(t,str)or not t for t in types)or len(set(types))!=len(types)for area,types in families.items()):raise ValueError('invalid-target-families')
        declared={t for types in families.values()for t in types}
        if set(registry.get('request.target.type',{}).get('values',[]))!=declared or any(v.get('role')=='domain'and v.get('type')not in families.get(v.get('area'),[])for v in registry.values()):raise ValueError('target-family-registry-mismatch')
        registry['request.target.type']['familiesByArea']=families
    return {'format':'sop.key-reader/1',**({'targetFamilies':families}if families is not None else{}),'keys':keys,'registry':registry,'banks':{k:bank(v)for k,v in registry.items()if v.get('values')},'bioKeys':[k for k,v in registry.items()if v['role']in ['domain','global']and(not manifest.get('annotationContract')or v['role']=='domain'or not v.get('values')or k=='request.request.act')],'metadataKeys':[k for k,v in registry.items()if v['role']=='metadata'and v.get('values')],'maxLength':manifest.get('maxLength',192),'boundary':'Conditional gold-cut training; predicted BIO mentions at runtime; unrepresented normalizations/candidates unresolved. No observed literal vocabulary.'}

def fit_context(text,context,area,tokenizer,maximum):
    import copy
    original=copy.deepcopy(context);current=copy.deepcopy(context)
    measure=lambda ctx:tokenizer(text,json.dumps({'area':area,'context':ctx},ensure_ascii=False,sort_keys=True),truncation=False)
    encoded=measure(current)
    if len(encoded['input_ids'])>maximum and isinstance(current,dict):
        if 'previous'in current:current['previous']=None
        if isinstance(current.get('existing'),list):
            values=current['existing'];low,high=0,len(values)
            while low<high:
                middle=(low+high+1)//2;trial={**current,'existing':values[:middle]}
                if len(measure(trial)['input_ids'])<=maximum:low=middle
                else:high=middle-1
            current['existing']=values[:low]
        encoded=measure(current)
    return current,encoded,current!=original

def encode(row,tokenizer,config):
    import torch
    context_value,full,context_fitted=fit_context(row['text'],row['context'],row['area'],tokenizer,config['maxLength']);context=json.dumps({'area':row['area'],'context':context_value},ensure_ascii=False,sort_keys=True)
    enc=tokenizer(row['text'],context,truncation='longest_first',max_length=config['maxLength'],padding='max_length',return_offsets_mapping=True)
    seq=enc.sequence_ids();offsets=[tuple(o)if seq[i]==0 else(0,0)for i,o in enumerate(enc.pop('offset_mapping'))];truncated=len(full['input_ids'])>config['maxLength'];n=len(offsets);bio=torch.full((len(config['bioKeys']),n),-100,dtype=torch.int8);presence=torch.full((len(config['keys']),),-100.,dtype=torch.float32);index={k:i for i,k in enumerate(config['keys'])};bindex={k:i for i,k in enumerate(config['bioKeys'])};covered=set(row['coveredKeys']);unknown=set(row['unknownBIOKeys']);classes={};mentions=[]
    active=[bindex[key]for key in covered if key in bindex and key not in unknown and not truncated]
    source_indices=torch.tensor([i for i,(a,b)in enumerate(offsets)if b>a],dtype=torch.long)
    if active and len(source_indices):bio[torch.tensor(active,dtype=torch.long)[:,None],source_indices[None,:]]=0
    for key in covered:
        if config['registry'][key]['role']!='derived':presence[index[key]]=float(key in row['globals']or any(m['key']==key or key in m['metadata']for m in row['mentions']))
        if key in config['banks']and config['registry'][key]['role']=='global':classes[key]=label(row['globals'][key]['value'],config['banks'][key])if key in row['globals']else 0
    records=[{'key':k,'span':v['span'],'value':v['value'],'metadata':{},'trainable':True}for k,v in row['globals'].items()]+row['mentions']
    for m in records:
        interval=token_interval(offsets,m['span'])
        if m['key']not in bindex:continue
        if m['key']in unknown or not interval or not m['trainable']or truncated:
            bio[bindex[m['key']]]=-100
            continue
        a,b=interval;bio[bindex[m['key']],a]=1
        if b>a+1:bio[bindex[m['key']],a+1:b]=2
        targets={}
        if m.get('valuePresent',True)and m['key']in config['banks']and config['registry'][m['key']]['role']=='domain':targets[m['key']]=label(m['value'],config['banks'][m['key']])
        for key in config['metadataKeys']:
            if key in m['metadata']:targets[key]=label(m['metadata'][key],config['banks'][key])
            elif row['version']=='v2':targets[key]=0
        mentions.append((index[m['key']],a,b,targets))
    out={'input_ids':torch.tensor(enc['input_ids']),'attention_mask':torch.tensor(enc['attention_mask']),'bio':bio,'presence':presence,'classes':classes,'mentions':mentions,'truncated':truncated,'id':row['id'],'source_mask':torch.tensor([seq[i]==0 and b>a for i,(a,b) in enumerate(offsets)],dtype=torch.bool),'context_fitted':context_fitted}
    if config.get('inputPadding')=='dynamic':
        # Dynamic padding: keep only the attended tokens; batches are padded to their own longest row (pad_batch).
        n=int(out['attention_mask'].sum());out['input_ids']=out['input_ids'][:n];out['attention_mask']=out['attention_mask'][:n];out['bio']=out['bio'][:,:n].contiguous();out['source_mask']=out['source_mask'][:n]
    return out

def pad_batch(rows,device):
    """Stack a batch padded to its longest row: ids, mask, BIO gold (-100 beyond a row) and source mask."""
    import torch
    L=max(r['input_ids'].shape[0]for r in rows);B=len(rows);K=rows[0]['bio'].shape[0]
    ids=torch.zeros((B,L),dtype=torch.long);mask=torch.zeros((B,L),dtype=torch.long);bio=torch.full((B,K,L),-100,dtype=torch.long);source=torch.zeros((B,L),dtype=torch.bool)
    for i,r in enumerate(rows):
        n=r['input_ids'].shape[0];ids[i,:n]=r['input_ids'];mask[i,:n]=r['attention_mask'];bio[i,:,:n]=r['bio'];source[i,:n]=r['source_mask']
    return ids.to(device,non_blocking=True),mask.to(device,non_blocking=True),bio.to(device,non_blocking=True),source.to(device,non_blocking=True)

def batches(rows,size,bucket,rng):
    """Shuffled batches; with bucket, rows of similar length share a batch (chunks of 64 batches sorted by length)."""
    order=list(range(len(rows)));rng.shuffle(order)
    if bucket:
        chunk=size*64;order=[i for c in range(0,len(order),chunk)for i in sorted(order[c:c+chunk],key=lambda j:rows[j]['input_ids'].shape[0])]
    out=[[rows[i]for i in order[k:k+size]]for k in range(0,len(order),size)]
    if bucket:rng.shuffle(out)
    return out

def build_model(config,encoder_path):
    import torch
    from transformers import AutoModel
    class Reader(torch.nn.Module):
        def __init__(self):
            super().__init__();self.encoder=AutoModel.from_pretrained(encoder_path);h=self.encoder.config.hidden_size;self.bio=torch.nn.Linear(h,len(config['bioKeys'])*3);self.presence=torch.nn.Linear(h,len(config['keys']));self.key=torch.nn.Embedding(len(config['keys']),h);self.classes=torch.nn.ModuleDict({str(config['keys'].index(k)):torch.nn.Linear(h,len(v))for k,v in config['banks'].items()})
        def forward(self,input_ids,attention_mask):
            hidden=self.encoder(input_ids=input_ids,attention_mask=attention_mask).last_hidden_state
            return hidden,self.bio(hidden).reshape(hidden.shape[0],hidden.shape[1],len(config['bioKeys']),3).permute(0,2,1,3),self.presence(hidden[:,0])
    return Reader()

_consistency=None
def consistency_loss(*args):
 global _consistency
 if _consistency is None:
  path=Path(__file__).parent/'candidates/target-type/train-key-reader.py';spec=importlib.util.spec_from_file_location('shared_reader_consistency',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);_consistency=module.presence_bio_consistency
 return _consistency(*args)

def objective(model,rows,config,device,bio_weights):
 import torch
 F=torch.nn.functional
 ids,mask,gold,source=pad_batch(rows,device)
 hidden,bio,presence=model(ids,mask);pgold=torch.stack([r['presence']for r in rows]).to(device)
 valid=gold>=0;safe=gold.clamp_min(0);weights=torch.stack(bio_weights)
 token_weights=weights[torch.arange(gold.shape[1],device=device)[None,:,None],safe]*valid
 token_loss=-bio.float().log_softmax(-1).gather(-1,safe[...,None]).squeeze(-1)
 denominators=token_weights.sum((0,2));active=denominators>0
 loss_sum=((token_loss*token_weights).sum((0,2))/denominators.clamp_min(1)).sum();loss_count=active.sum()
 bce=F.binary_cross_entropy_with_logits(presence.float(),pgold.clamp(0,1),reduction='none')
 strata=torch.stack([pgold==0,pgold==1]);counts=strata.sum(1);strata_active=counts>0
 perhead=((bce[None]*strata).sum(1)/counts.clamp_min(1)).sum(0)/strata_active.sum(0).clamp_min(1)
 head_active=strata_active.any(0);presence_active=head_active.any()
 loss_sum+=perhead.sum()/head_active.sum().clamp_min(1);loss_count+=presence_active
 index={key:i for i,key in enumerate(config['keys'])};groups=collections.defaultdict(list)
 for ri,row in enumerate(rows):
  for key,target in row['classes'].items():groups[(key,0 if target==0 else 1 if target==1 else 2)].append((hidden[ri,0],target))
  for ki,a,b,targets in row['mentions']:
   feature=hidden[ri,a:b].mean(0)+model.key.weight[ki]
   for key,target in targets.items():groups[(key,0 if target==0 else 1 if target==1 else 2)].append((feature,target))
 byhead=collections.defaultdict(list)
 for(key,stratum),items in groups.items():
  features=torch.stack([f for f,t in items]);targets=torch.tensor([t for f,t in items],device=device)
  byhead[key].append(F.cross_entropy(model.classes[str(index[key])](features).float(),targets))
 if byhead:
  loss_sum+=torch.stack([torch.stack(values).mean()for values in byhead.values()]).mean();loss_count+=1
 loss=loss_sum/loss_count
 coefficient=config.get('consistencyCoefficient',0)
 if coefficient:
  truncated=torch.tensor([row['truncated']for row in rows],dtype=torch.bool,device=device)
  loss=loss+coefficient*consistency_loss(bio,presence,gold,pgold,source,mask,truncated,config)
 return loss,bio,gold


def bio_mentions(tags):
    spans=[];start=None
    for i,tag in enumerate(list(tags)+[0]):
        if tag==1 or tag==0 or tag<0:
            if start is not None:spans.append((start,i));start=None
            if tag==1:start=i
        elif tag==2 and start is None:
            return None
    return spans

def evaluate(model,rows,config,device,batch):
    import torch
    report={k:collections.Counter()for k in config['keys']};exact=total=positive_exact=positive_total=0
    model.eval()
    with torch.no_grad():
        for start in range(0,len(rows),batch):
            items=rows[start:start+batch];ids,mask,_,_=pad_batch(items,device);hidden,bio,presence=model(ids,mask);pred=bio.argmax(-1).cpu()
            for ri,row in enumerate(items):
                rowexact=not row['truncated'];haspositive=False
                for ki,key in enumerate(config['keys']):
                    goldpresence=float(row['presence'][ki]);p=bool(presence[ri,ki]>0)
                    if goldpresence>=0:report[key]['presence'+('TP'if p and goldpresence else'FP'if p else'FN'if goldpresence else'TN')]+=1
                for ki,key in enumerate(config['bioKeys']):
                    gold=row['bio'][ki];valid=gold>=0
                    if not valid.any():continue
                    tags=pred[ri,ki,:gold.shape[0]].clone();tags[~valid]=-100;expected=bio_mentions(gold.tolist());actual=bio_mentions(tags.tolist());g=set(expected or []);a=set(actual or []);report[key]['mentionTP']+=len(g&a);report[key]['mentionFP']+=len(a-g);report[key]['mentionFN']+=len(g-a);report[key]['invalidBIO']+=actual is None;report[key]['positiveTokens']+=int((gold>0).sum());report[key]['positiveTokenCorrect']+=int(((gold>0)&(gold==tags)).sum());report[key]['absentTokens']+=int((gold==0).sum());report[key]['absentTokenCorrect']+=int(((gold==0)&(tags==0)).sum());rowexact &= actual is not None and a==g;haspositive |= bool(g)
                for key,target in row['classes'].items():
                    predicted=int(model.classes[str(config['keys'].index(key))](hidden[ri,0]).argmax());bucket='absent'if target==0 else'unknown'if target==1 else'present';report[key][bucket+'ClassSupport']+=1;report[key][bucket+'ClassCorrect']+=predicted==target;rowexact &= predicted==target
                for ki,a,b,targets in row['mentions']:
                    feature=hidden[ri,a:b].mean(0)+model.key.weight[ki]
                    for key,target in targets.items():
                        predicted=int(model.classes[str(config['keys'].index(key))](feature).argmax());bucket='absent'if target==0 else'unknown'if target==1 else'present';report[key]['goldMention'+bucket+'ClassSupport']+=1;report[key]['goldMention'+bucket+'ClassCorrect']+=predicted==target
                exact+=bool(rowexact);total+=1;positive_exact+=bool(rowexact and haspositive);positive_total+=haspositive
    tp=sum(v['mentionTP']for v in report.values());fp=sum(v['mentionFP']for v in report.values());fn=sum(v['mentionFN']for v in report.values())
    return {'perKey':{k:dict(v)for k,v in report.items()},'decodedMentionF1':2*tp/max(1,2*tp+fp+fn),'conditionalBioAndGlobalExact':exact,'conditionalBioAndGlobalSupport':total,'positiveBioAndGlobalExact':positive_exact,'positiveBioAndGlobalSupport':positive_total,'scope':'Gold request-cut conditional; mention metadata metrics explicitly gold-mention conditioned; not canonical/full-pipeline graph exact.'}

def bio_class_weights(rows,key_count,device):
    # Count all keys together: the prior per-key/per-row loop launched millions
    # of tiny CPU operations before the first training batch.
    import numpy as np
    import torch
    counts=np.zeros((key_count,3),dtype=np.int64)
    for row in rows:
        labels=row['bio'].numpy()
        for tag in range(3):counts[:,tag]+=(labels==tag).sum(axis=1)
    result=[]
    for values in counts:
        counts_tensor=torch.tensor(values,dtype=torch.float32)
        weight=(counts_tensor.sum()/counts_tensor.clamp_min(1)).sqrt()
        result.append((weight/weight.mean()).to(device))
    return result

def main():
    import torch
    from transformers import AutoTokenizer
    p=argparse.ArgumentParser();p.add_argument('--data',type=Path,required=True);p.add_argument('--encoder',required=True);p.add_argument('--init-checkpoint',type=Path);p.add_argument('--out',type=Path,required=True);p.add_argument('--epochs',type=int,default=5);p.add_argument('--cpu-threads',type=int,default=2);p.add_argument('--batch',type=int,default=8);p.add_argument('--limit',type=int);p.add_argument('--no-save',action='store_true');p.add_argument('--patience',type=int,default=0);p.add_argument('--min-epochs',type=int,default=3);p.add_argument('--consistency',type=float,default=0.1);p.add_argument('--lr',type=float,default=3e-5);p.add_argument('--input-padding',choices=['max_length','dynamic'],default='dynamic');p.add_argument('--bucket',action='store_true',help='length-bucketed batches (needs dynamic padding)');p.add_argument('--warmup',type=int,default=0,help='linear learning-rate warmup steps');p.add_argument('--encode-cache',type=Path,help='folder of encoded splits reused when data, tokenizer and label layout are unchanged');args=p.parse_args();random.seed(17);torch.manual_seed(17);torch.set_num_threads(args.cpu_threads);args.out.mkdir(parents=True,exist_ok=False)
    device='cuda'if torch.cuda.is_available()else'cpu'
    if device=='cuda':torch.cuda.init()
    manifest=json.loads((args.data/'manifest.json').read_text());config=configuration(manifest);config['labelStorage']='int8 CPU; int64 per optimizer batch';tokenizer=AutoTokenizer.from_pretrained(args.encoder);config['inputPadding']=args.input_padding;config['consistencyCoefficient']=args.consistency;config['encoder']=args.encoder;config['encoderFiles']={str(p.name):sha(p)for p in Path(args.encoder).iterdir()if p.is_file()};config['initCheckpointSha256']=sha(args.init_checkpoint)if args.init_checkpoint else None;config['dataManifestSha256']=sha(args.data/'manifest.json');config['trainerSha256']=sha(Path(__file__));datasets={}
    import inspect
    layout=hashlib.sha256(json.dumps([manifest['outputs'],args.encoder,config['maxLength'],config['keys'],config['bioKeys'],config['metadataKeys'],config['banks'],config['inputPadding'],args.limit,inspect.getsource(encode),inspect.getsource(fit_context)],sort_keys=True,default=str).encode()).hexdigest()[:24]
    for split in ['train','calibration']:
        path=args.data/(split+'.jsonl');assert sha(path)==manifest['outputs'][split];datasets[split]=[]
        cached=args.encode_cache/f'{layout}-{split}.pt'if args.encode_cache else None
        if cached and cached.is_file():
            datasets[split]=torch.load(cached,weights_only=False);print(json.dumps({'phase':'encoding-cache','split':split,'rows':len(datasets[split]),'file':str(cached)}),flush=True);continue
        with path.open()as stream:
            for ri,line in enumerate(stream):
                if args.limit and ri>=args.limit:break
                datasets[split].append(encode(json.loads(line),tokenizer,config))
                if (ri+1)%5000==0:print(json.dumps({'phase':'encoding','split':split,'rows':ri+1}),flush=True)
        if cached:
            cached.parent.mkdir(parents=True,exist_ok=True);torch.save(datasets[split],cached.with_suffix('.tmp'));cached.with_suffix('.tmp').rename(cached)
    device='cuda'if torch.cuda.is_available()else'cpu';model=build_model(config,args.encoder)
    if args.init_checkpoint:
        state=torch.load(args.init_checkpoint,map_location='cpu',weights_only=False);spec=importlib.util.spec_from_file_location('semantic_reader_warmstart',Path(__file__).with_name('warmstart-key-reader.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);config['warmstart']=module.transfer(model,state,config);del state
    (args.out/'model-config.json').write_text(json.dumps(config,indent=2)+'\n');model.to(device);optimizer=torch.optim.AdamW(model.parameters(),lr=args.lr);scheduler=torch.optim.lr_scheduler.LambdaLR(optimizer,lambda step:min(1.,(step+1)/args.warmup)if args.warmup else 1.);rng=random.Random(17)
    weights=bio_class_weights(datasets['train'],len(config['bioKeys']),device)
    print(json.dumps({'phase':'training-ready','trainRows':len(datasets['train']),'calibrationRows':len(datasets['calibration']),'device':device}),flush=True)
    steps=0;history=[];best=(-1.,-1.);bad_epochs=0;training_started=time.monotonic()
    for epoch in range(args.epochs):
        model.train();total=0
        for rows in batches(datasets['train'],args.batch,args.bucket and args.input_padding=='dynamic',rng):
            optimizer.zero_grad(set_to_none=True)
            with torch.autocast(device_type=device,dtype=torch.bfloat16,enabled=device=='cuda'):loss,_,_=objective(model,rows,config,device,weights)
            assert torch.isfinite(loss);loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1);optimizer.step();scheduler.step();steps+=1;total+=loss.item()
            if steps==10 or steps%100==0:print(json.dumps({'epoch':epoch+1,'steps':steps,'lastLoss':loss.item(),'trainingSeconds':time.monotonic()-training_started,'secondsPerStep':(time.monotonic()-training_started)/steps}),flush=True)
        model.eval();correct=present_correct=present_count=count=0
        with torch.no_grad():
            for start in range(0,len(datasets['calibration']),args.batch):
                with torch.autocast(device_type=device,dtype=torch.bfloat16,enabled=device=='cuda'):_,pred,gold=objective(model,datasets['calibration'][start:start+args.batch],config,device,weights)
                pred=pred.argmax(-1);valid=gold>=0;positive=gold>0;correct+=int(((pred==gold)&valid).sum());count+=int(valid.sum());present_correct+=int(((pred==gold)&positive).sum());present_count+=int(positive.sum())
        evaluation=evaluate(model,datasets['calibration'],config,device,args.batch)
        metric={'evaluation':evaluation,'epoch':epoch+1,'steps':steps,'trainLossSum':total,'conditionalBioCorrect':correct,'conditionalBioSupport':count,'positiveTokenCorrect':present_correct,'positiveTokenSupport':present_count,'contextFittedTrain':sum(r['context_fitted']for r in datasets['train']),'contextFittedCalibration':sum(r['context_fitted']for r in datasets['calibration']),'truncatedTrain':sum(r['truncated']for r in datasets['train']),'truncatedCalibration':sum(r['truncated']for r in datasets['calibration']),'executable':False};history.append(metric);print(json.dumps(metric),flush=True);(args.out/'metrics.json').write_text(json.dumps(history,indent=2)+'\n')
        rank=(evaluation['positiveBioAndGlobalExact']/max(1,evaluation['positiveBioAndGlobalSupport']),evaluation['decodedMentionF1'])
        improved=rank>best
        bad_epochs=0 if improved else bad_epochs+1
        if not args.no_save and improved:
            best=rank
            import os,shutil
            required=sum(v.numel()*2 for v in model.state_dict().values())*2+128*1024**2
            assert shutil.disk_usage(args.out).free>required,'Insufficient atomic checkpoint reserve'
            temp=args.out/'checkpoint.tmp';torch.save({'model':{k:v.detach().cpu().to(torch.bfloat16)if v.is_floating_point()else v.cpu()for k,v in model.state_dict().items()},'config':config,'epoch':epoch+1},temp);os.replace(temp,args.out/'checkpoint.pt')
        if args.patience and epoch+1>=args.min_epochs and bad_epochs>=args.patience:break
    (args.out/'run.json').write_text(json.dumps({'format':'sop.key-reader-run/1','configSha256':sha(args.out/'model-config.json'),'trainerSha256':sha(Path(__file__)),'steps':steps,'checkpointSha256':sha(args.out/'checkpoint.pt')if(args.out/'checkpoint.pt').exists()else None,'bestDecodedMentionF1':best[1],'bestPositiveBioGlobalExact':best[0],'epochsCompleted':len(history),'trainingPolicy':{'maxEpochs':args.epochs,'minEpochs':args.min_epochs,'patience':args.patience,'learningRate':args.lr,'selection':'positive supervised BIO/global exact, then mention F1'},'scope':'conditional gold-cut; not full pipeline or calibrated graph confidence'},indent=2)+'\n')
if __name__=='__main__':main()
