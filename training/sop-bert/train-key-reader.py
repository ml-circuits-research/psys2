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
    registry=manifest['registry'];keys=list(registry)
    return {'format':'sop.key-reader/1','keys':keys,'registry':registry,'banks':{k:bank(v)for k,v in registry.items()if v.get('values')},'bioKeys':[k for k,v in registry.items()if v['role']in ['domain','global']],'metadataKeys':[k for k,v in registry.items()if v['role']=='metadata'and v.get('values')],'maxLength':192,'boundary':'Conditional gold-cut training; predicted BIO mentions at runtime; unrepresented normalizations/candidates unresolved. No observed literal vocabulary.'}

def encode(row,tokenizer,config):
    import torch
    context=json.dumps({'area':row['area'],'context':row['context']},ensure_ascii=False,sort_keys=True)
    full=tokenizer(row['text'],context,truncation=False);enc=tokenizer(row['text'],context,truncation='longest_first',max_length=config['maxLength'],padding='max_length',return_offsets_mapping=True)
    seq=enc.sequence_ids();offsets=[tuple(o)if seq[i]==0 else(0,0)for i,o in enumerate(enc.pop('offset_mapping'))];truncated=len(full['input_ids'])>config['maxLength'];n=len(offsets);bio=torch.full((len(config['bioKeys']),n),-100,dtype=torch.long);presence=torch.full((len(config['keys']),),-100.,dtype=torch.float32);index={k:i for i,k in enumerate(config['keys'])};bindex={k:i for i,k in enumerate(config['bioKeys'])};covered=set(row['coveredKeys']);unknown=set(row['unknownBIOKeys']);classes={};mentions=[]
    for key in covered:
        presence[index[key]]=float(key in row['globals']or any(m['key']==key for m in row['mentions']))
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
        if m['key']in config['banks']and config['registry'][m['key']]['role']=='domain':targets[m['key']]=label(m['value'],config['banks'][m['key']])
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
            ki=config['keys'].index(key);classloss[key].append(torch.nn.functional.cross_entropy(model.classes[str(ki)](hidden[ri,0]).float()[None],torch.tensor([target],device=device)))
        for ki,a,b,targets in row['mentions']:
            feature=hidden[ri,a:b].mean(0)+model.key.weight[ki]
            for key,target in targets.items():classloss[key].append(torch.nn.functional.cross_entropy(model.classes[str(config['keys'].index(key))](feature).float()[None],torch.tensor([target],device=device)))
    if classloss:losses.append(torch.stack([torch.stack(values).mean()for values in classloss.values()]).mean())
    return torch.stack(losses).mean(),bio,gold

def main():
    import torch
    from transformers import AutoTokenizer
    p=argparse.ArgumentParser();p.add_argument('--data',type=Path,required=True);p.add_argument('--encoder',required=True);p.add_argument('--init-checkpoint',type=Path);p.add_argument('--out',type=Path,required=True);p.add_argument('--epochs',type=int,default=5);p.add_argument('--batch',type=int,default=8);p.add_argument('--limit',type=int);p.add_argument('--no-save',action='store_true');args=p.parse_args();random.seed(17);torch.manual_seed(17);args.out.mkdir(parents=True,exist_ok=False)
    manifest=json.loads((args.data/'manifest.json').read_text());config=configuration(manifest);tokenizer=AutoTokenizer.from_pretrained(args.encoder);config['encoder']=args.encoder;config['dataManifestSha256']=sha(args.data/'manifest.json');config['trainerSha256']=sha(Path(__file__));(args.out/'model-config.json').write_text(json.dumps(config,indent=2)+'\n');datasets={}
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
    steps=0;history=[]
    for epoch in range(args.epochs):
        model.train();random.shuffle(datasets['train']);total=0
        for start in range(0,len(datasets['train']),args.batch):
            rows=datasets['train'][start:start+args.batch];optimizer.zero_grad(set_to_none=True)
            with torch.autocast(device_type=device,dtype=torch.bfloat16,enabled=device=='cuda'):loss,_,_=objective(model,rows,config,device,weights)
            assert torch.isfinite(loss);loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1);optimizer.step();steps+=1;total+=loss.item()
        model.eval();correct=present_correct=present_count=count=0
        with torch.no_grad():
            for start in range(0,len(datasets['calibration']),args.batch):
                with torch.autocast(device_type=device,dtype=torch.bfloat16,enabled=device=='cuda'):_,pred,gold=objective(model,datasets['calibration'][start:start+args.batch],config,device,weights)
                pred=pred.argmax(-1);valid=gold>=0;positive=gold>0;correct+=int(((pred==gold)&valid).sum());count+=int(valid.sum());present_correct+=int(((pred==gold)&positive).sum());present_count+=int(positive.sum())
        metric={'epoch':epoch+1,'steps':steps,'trainLossSum':total,'conditionalBioCorrect':correct,'conditionalBioSupport':count,'positiveTokenCorrect':present_correct,'positiveTokenSupport':present_count,'truncatedTrain':sum(r['truncated']for r in datasets['train']),'truncatedCalibration':sum(r['truncated']for r in datasets['calibration']),'executable':False};history.append(metric);print(json.dumps(metric),flush=True);(args.out/'metrics.json').write_text(json.dumps(history,indent=2)+'\n')
        if not args.no_save:
            import os,shutil
            required=sum(v.numel()*2 for v in model.state_dict().values())*2+128*1024**2
            assert shutil.disk_usage(args.out).free>required,'Insufficient atomic checkpoint reserve'
            temp=args.out/'checkpoint.tmp';torch.save({'model':{k:v.detach().cpu().to(torch.bfloat16)if v.is_floating_point()else v.cpu()for k,v in model.state_dict().items()},'config':config,'epoch':epoch+1},temp);os.replace(temp,args.out/'checkpoint.pt')
    (args.out/'run.json').write_text(json.dumps({'format':'sop.key-reader-run/1','configSha256':sha(args.out/'model-config.json'),'trainerSha256':sha(Path(__file__)),'steps':steps,'scope':'conditional gold-cut; not full pipeline or calibrated graph confidence'},indent=2)+'\n')
if __name__=='__main__':main()
