"""Inventory-key BIO reader with shared per-mention metadata; no slot assignment.
Gold request cuts are conditional supervision, never an inference argument.
"""
import argparse,collections,hashlib,json,random,time
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
    if manifest.get('format')!='sop.per-key-supervision/2-target-type-candidate':raise ValueError('candidate-supervision-required')
    registry=manifest['registry'];keys=list(registry)
    if registry.get('request.target.type',{}).get('bio') is not False:raise ValueError('target-type-must-be-class-only')
    return {'format':'sop.key-reader/2-target-type-candidate','rawCodecFormat':'sop.key-reader-raw-codec/2-target-type-candidate','candidate':True,'executionEligible':False,'baselineTrainerSha256':'eb0a0ef595e1587da2be4ad4aea3a90ce1ba8829b89385be90ace4b13810d01f','inventorySha256':manifest['inventorySha256'],'targetFamilies':manifest['targetFamilies'],'keys':keys,'registry':registry,'banks':{k:bank(v)for k,v in registry.items()if v.get('values')},'bioKeys':[k for k,v in registry.items()if v['role']in ['domain','global'] and v.get('bio',True)],'metadataKeys':[k for k,v in registry.items()if v['role']=='metadata'and v.get('values')],'maxLength':192,'boundary':'Conditional gold-cut training; predicted BIO mentions at runtime; unrepresented normalizations/candidates unresolved. No observed literal vocabulary.'}

def encode(row,tokenizer,config):
    import torch
    context=json.dumps({'area':row['area'],'context':row['context']},ensure_ascii=False,sort_keys=True)
    full=tokenizer(row['text'],context,truncation=False);enc=tokenizer(row['text'],context,truncation='longest_first',max_length=config['maxLength'],padding='max_length',return_offsets_mapping=True)
    seq=enc.sequence_ids();offsets=[tuple(o)if seq[i]==0 else(0,0)for i,o in enumerate(enc.pop('offset_mapping'))];truncated=len(full['input_ids'])>config['maxLength'];n=len(offsets);bio=torch.full((len(config['bioKeys']),n),-100,dtype=torch.long);presence=torch.full((len(config['keys']),),-100.,dtype=torch.float32);index={k:i for i,k in enumerate(config['keys'])};bindex={k:i for i,k in enumerate(config['bioKeys'])};covered=set(row['coveredKeys']);unknown=set(row['unknownBIOKeys']);classes={};mentions=[]
    for key in covered:
        if config['registry'][key]['role']!='derived':presence[index[key]]=float(key in row['globals']or any(m['key']==key or key in m['metadata']for m in row['mentions']))
        if key in bindex and key not in unknown and not truncated:
            for ti,(a,b)in enumerate(offsets):
                if b>a:bio[bindex[key],ti]=0
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
    return {'input_ids':torch.tensor(enc['input_ids']),'attention_mask':torch.tensor(enc['attention_mask']),'bio':bio,'presence':presence,'classes':classes,'mentions':mentions,'truncated':truncated,'id':row['id']}

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

def objective(model,rows,config,device,bio_weights):
    import torch
    ids=torch.stack([r['input_ids']for r in rows]).to(device);mask=torch.stack([r['attention_mask']for r in rows]).to(device);hidden,bio,presence=model(ids,mask);gold=torch.stack([r['bio']for r in rows]).to(device);pgold=torch.stack([r['presence']for r in rows]).to(device);losses=[]
    # Normalize each inventory key independently so common absent streams cannot dominate rare keys.
    for ki in range(len(config['bioKeys'])):
        valid=gold[:,ki]!=-100
        if valid.any():losses.append(torch.nn.functional.cross_entropy(bio[:,ki][valid].float(),gold[:,ki][valid],weight=bio_weights[ki]))
    presence_losses=[]
    for ki in range(len(config['keys'])):
        strata=[]
        for target in [0,1]:
            mask=pgold[:,ki]==target
            if mask.any():strata.append(torch.nn.functional.binary_cross_entropy_with_logits(presence[:,ki][mask].float(),pgold[:,ki][mask]))
        if strata:presence_losses.append(torch.stack(strata).mean())
    if presence_losses:losses.append(torch.stack(presence_losses).mean())
    classloss=collections.defaultdict(list)
    for ri,row in enumerate(rows):
        for key,target in row['classes'].items():
            ki=config['keys'].index(key);classloss[(key,'absent'if target==0 else'unknown'if target==1 else'present')].append(torch.nn.functional.cross_entropy(model.classes[str(ki)](hidden[ri,0]).float()[None],torch.tensor([target],device=device)))
        for ki,a,b,targets in row['mentions']:
            feature=hidden[ri,a:b].mean(0)+model.key.weight[ki]
            for key,target in targets.items():classloss[(key,'absent'if target==0 else'unknown'if target==1 else'present')].append(torch.nn.functional.cross_entropy(model.classes[str(config['keys'].index(key))](feature).float()[None],torch.tensor([target],device=device)))
    if classloss:
        byhead=collections.defaultdict(list)
        for(key,stratum),values in classloss.items():byhead[key].append(torch.stack(values).mean())
        losses.append(torch.stack([torch.stack(values).mean()for values in byhead.values()]).mean())
    return torch.stack(losses).mean(),bio,gold

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
            items=rows[start:start+batch];hidden,bio,presence=model(torch.stack([r['input_ids']for r in items]).to(device),torch.stack([r['attention_mask']for r in items]).to(device));pred=bio.argmax(-1).cpu()
            for ri,row in enumerate(items):
                rowexact=not row['truncated'];haspositive=False
                for ki,key in enumerate(config['keys']):
                    goldpresence=float(row['presence'][ki]);p=bool(presence[ri,ki]>0)
                    if goldpresence>=0:report[key]['presence'+('TP'if p and goldpresence else'FP'if p else'FN'if goldpresence else'TN')]+=1
                for ki,key in enumerate(config['bioKeys']):
                    gold=row['bio'][ki];valid=gold>=0
                    if not valid.any():continue
                    tags=pred[ri,ki].clone();tags[~valid]=-100;expected=bio_mentions(gold.tolist());actual=bio_mentions(tags.tolist());g=set(expected or []);a=set(actual or []);report[key]['mentionTP']+=len(g&a);report[key]['mentionFP']+=len(a-g);report[key]['mentionFN']+=len(g-a);report[key]['invalidBIO']+=actual is None;report[key]['positiveTokens']+=int((gold>0).sum());report[key]['positiveTokenCorrect']+=int(((gold>0)&(gold==tags)).sum());report[key]['absentTokens']+=int((gold==0).sum());report[key]['absentTokenCorrect']+=int(((gold==0)&(tags==0)).sum());rowexact &= actual is not None and a==g;haspositive |= bool(g)
                for key,target in row['classes'].items():
                    predicted=int(model.classes[str(config['keys'].index(key))](hidden[ri,0]).argmax());bucket='absent'if target==0 else'unknown'if target==1 else'present';report[key][bucket+'ClassSupport']+=1;report[key][bucket+'ClassCorrect']+=predicted==target;rowexact &= predicted==target
                for ki,a,b,targets in row['mentions']:
                    feature=hidden[ri,a:b].mean(0)+model.key.weight[ki]
                    for key,target in targets.items():
                        predicted=int(model.classes[str(config['keys'].index(key))](feature).argmax());bucket='absent'if target==0 else'unknown'if target==1 else'present';report[key]['goldMention'+bucket+'ClassSupport']+=1;report[key]['goldMention'+bucket+'ClassCorrect']+=predicted==target
                exact+=bool(rowexact);total+=1;positive_exact+=bool(rowexact and haspositive);positive_total+=haspositive
    tp=sum(v['mentionTP']for v in report.values());fp=sum(v['mentionFP']for v in report.values());fn=sum(v['mentionFN']for v in report.values())
    return {'perKey':{k:dict(v)for k,v in report.items()},'decodedMentionF1':2*tp/max(1,2*tp+fp+fn),'conditionalBioAndGlobalExact':exact,'conditionalBioAndGlobalSupport':total,'positiveBioAndGlobalExact':positive_exact,'positiveBioAndGlobalSupport':positive_total,'scope':'Gold request-cut conditional; mention metadata metrics explicitly gold-mention conditioned; not canonical/full-pipeline graph exact.'}

def weight_migration_plan(old,new):
    """Semantic row plan only; no checkpoints/tensors are read or written.

    An applier must start with fresh new-model weights, verify all non-row
    dimensions/encoder provenance, apply these explicit pairs, and discard
    optimizer state. No unspecified tensor or row is positional-copy eligible.
    """
    if old.get('format')!='sop.key-reader/1' or new.get('format')!='sop.key-reader/2-target-type-candidate':
        raise ValueError('unsupported-migration-version')
    def indices(values):
        if not isinstance(values,list) or len(values)!=len(set(values)):
            raise ValueError('duplicate-semantic-key')
        return {value:i for i,value in enumerate(values)}
    old_keys,new_keys=indices(old['keys']),indices(new['keys'])
    old_bio,new_bio=indices(old['bioKeys']),indices(new['bioKeys'])
    shared=sorted(set(old_keys)&set(new_keys))
    plan=[]
    def add(source,target,pairs):
        plan.append({'source':source,'target':target,'rows':pairs,
                     'requireEqualNonRowDimensions':True})
    pairs=[[old_keys[key],new_keys[key]] for key in shared]
    for tensor in ('key.weight','presence.weight','presence.bias'):
        add(tensor,tensor,pairs)
    bio_pairs=[[3*old_bio[key]+label,3*new_bio[key]+label]
               for key in sorted(set(old_bio)&set(new_bio)) for label in range(3)]
    for tensor in ('bio.weight','bio.bias'):
        add(tensor,tensor,bio_pairs)
    initialized=[]
    for key,values in new['banks'].items():
        new_entries=indices([typed(entry) for entry in values])
        old_entries=indices([typed(entry) for entry in old.get('banks',{}).get(key,[])])
        if key not in old_keys or key not in old.get('banks',{}):
            initialized.append({'key':key,'classRows':list(range(len(values)))})
            continue
        rows=[[old_entries[name],index] for name,index in new_entries.items() if name in old_entries]
        for suffix in ('weight','bias'):
            add('classes.'+str(old_keys[key])+'.'+suffix,
                'classes.'+str(new_keys[key])+'.'+suffix,rows)
        missing=[index for name,index in new_entries.items() if name not in old_entries]
        if missing:initialized.append({'key':key,'classRows':missing})
    return {'format':'sop.key-reader-weight-migration/1','from':old['format'],'to':new['format'],
            'rowPlans':plan,'newKeys':sorted(set(new_keys)-set(old_keys)),
            'newBIOKeys':sorted(set(new_bio)-set(old_bio)),'initializedClasses':initialized,
            'encoderPolicy':'same parameter names, shapes and exact encoder provenance only; otherwise refuse',
            'otherTensorPolicy':'retain fresh initializer; no implicit positional copy',
            'optimizerPolicy':'discard; not index-compatible',
            'appliesWeights':False}

def main():
    import torch
    from transformers import AutoTokenizer
    p=argparse.ArgumentParser();p.add_argument('--data',type=Path,required=True);p.add_argument('--encoder',required=True);p.add_argument('--init-checkpoint',type=Path);p.add_argument('--out',type=Path,required=True);p.add_argument('--epochs',type=int,default=5);p.add_argument('--batch',type=int,default=8);p.add_argument('--limit',type=int);p.add_argument('--no-save',action='store_true');args=p.parse_args();random.seed(17);torch.manual_seed(17);args.out.mkdir(parents=True,exist_ok=False)
    manifest=json.loads((args.data/'manifest.json').read_text());config=configuration(manifest);tokenizer=AutoTokenizer.from_pretrained(args.encoder);config['encoder']=args.encoder;config['encoderFiles']={str(p.name):sha(p)for p in Path(args.encoder).iterdir()if p.is_file()};config['initCheckpointSha256']=sha(args.init_checkpoint)if args.init_checkpoint else None;config['dataManifestSha256']=sha(args.data/'manifest.json');config['trainerSha256']=sha(Path(__file__));(args.out/'model-config.json').write_text(json.dumps(config,indent=2)+'\n');datasets={}
    for split in ['train','calibration']:
        path=args.data/(split+'.jsonl');assert sha(path)==manifest['outputs'][split];rows=[json.loads(line)for line in path.open()];rows=rows[:args.limit]if args.limit else rows;datasets[split]=[encode(r,tokenizer,config)for r in rows]
    device='cuda'if torch.cuda.is_available()else'cpu';model=build_model(config,args.encoder)
    if args.init_checkpoint:
        state=torch.load(args.init_checkpoint,map_location='cpu',weights_only=False);state=state.get('model',state);enc={k[len('encoder.'):]:v for k,v in state.items()if k.startswith('encoder.')};assert enc;model.encoder.load_state_dict(enc,strict=True)
    model.to(device);optimizer=torch.optim.AdamW(model.parameters(),lr=3e-5);weights=[]
    for ki in range(len(config['bioKeys'])):
        counts=torch.zeros(3)
        for row in datasets['train']:
            values=row['bio'][ki];counts+=torch.bincount(values[values>=0],minlength=3)
        w=(counts.sum()/counts.clamp_min(1)).sqrt();weights.append((w/w.mean()).to(device))
    steps=0;history=[];best=-1
    for epoch in range(args.epochs):
        model.train();random.shuffle(datasets['train']);total=0
        for start in range(0,len(datasets['train']),args.batch):
            rows=datasets['train'][start:start+args.batch];optimizer.zero_grad(set_to_none=True)
            with torch.autocast(device_type=device,dtype=torch.bfloat16,enabled=device=='cuda'):loss,_,_=objective(model,rows,config,device,weights)
            assert torch.isfinite(loss);loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1);optimizer.step();steps+=1;total+=loss.item()
            if steps%100==0:print(json.dumps({'epoch':epoch+1,'steps':steps,'lastLoss':loss.item()}),flush=True)
        model.eval();correct=present_correct=present_count=count=0
        with torch.no_grad():
            for start in range(0,len(datasets['calibration']),args.batch):
                with torch.autocast(device_type=device,dtype=torch.bfloat16,enabled=device=='cuda'):_,pred,gold=objective(model,datasets['calibration'][start:start+args.batch],config,device,weights)
                pred=pred.argmax(-1);valid=gold>=0;positive=gold>0;correct+=int(((pred==gold)&valid).sum());count+=int(valid.sum());present_correct+=int(((pred==gold)&positive).sum());present_count+=int(positive.sum())
        evaluation=evaluate(model,datasets['calibration'],config,device,args.batch)
        metric={'evaluation':evaluation,'epoch':epoch+1,'steps':steps,'trainLossSum':total,'conditionalBioCorrect':correct,'conditionalBioSupport':count,'positiveTokenCorrect':present_correct,'positiveTokenSupport':present_count,'truncatedTrain':sum(r['truncated']for r in datasets['train']),'truncatedCalibration':sum(r['truncated']for r in datasets['calibration']),'executable':False};history.append(metric);print(json.dumps(metric),flush=True);(args.out/'metrics.json').write_text(json.dumps(history,indent=2)+'\n')
        if not args.no_save and evaluation['decodedMentionF1']>best:
            best=evaluation['decodedMentionF1']
            import os,shutil
            required=sum(v.numel()*2 for v in model.state_dict().values())*2+128*1024**2
            assert shutil.disk_usage(args.out).free>required,'Insufficient atomic checkpoint reserve'
            temp=args.out/'checkpoint.tmp';torch.save({'model':{k:v.detach().cpu().to(torch.bfloat16)if v.is_floating_point()else v.cpu()for k,v in model.state_dict().items()},'config':config,'epoch':epoch+1},temp);os.replace(temp,args.out/'checkpoint.pt')
    (args.out/'run.json').write_text(json.dumps({'format':'sop.key-reader-run/2-target-type-candidate','candidate':True,'executionEligible':False,'configSha256':sha(args.out/'model-config.json'),'trainerSha256':sha(Path(__file__)),'steps':steps,'checkpointSha256':sha(args.out/'checkpoint.pt')if(args.out/'checkpoint.pt').exists()else None,'bestDecodedMentionF1':best,'scope':'conditional gold-cut; not full pipeline or calibrated graph confidence'},indent=2)+'\n')
if __name__=='__main__':main()
