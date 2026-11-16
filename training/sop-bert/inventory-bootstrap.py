"""Inventory-conditioned encoder bootstrap. Not a graph decoder or executable reader.
Preserves request/constraint-instance and selector/result labels as separate examples.
"""
import argparse, ast, collections, hashlib, json, random, os, shutil
from pathlib import Path

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def literal_maps(path):
    wanted={'M','W','CO'}; result={}
    for node in ast.parse(path.read_text()).body:
        if isinstance(node,ast.Assign):
            for target in node.targets:
                if isinstance(target,ast.Name) and target.id in wanted: result[target.id]=ast.literal_eval(node.value)
    return result

def prepare(root,out):
    inventory_path=root/'heads/inventory.json'; inventory=json.loads(inventory_path.read_text())
    keys={f'{area}.{typ}.{key}':spec for area,types in inventory.items() for typ,row in types.items() for key,spec in row['keys'].items()}
    aliases=literal_maps(root/'heads/coverage_v1.py'); fields=[]; diagnostics=collections.Counter(); rows=collections.Counter(); sources=[]
    def emit(row,request,req_index,path,key,value,phase='unspecified',hint=None,source=None,split=None):
        if key not in keys: diagnostics['unmapped:'+key]+=1; return
        if isinstance(value,(dict,type(None))): diagnostics['non_scalar:'+key]+=1; return
        values=value if isinstance(value,list) else [value]
        for index,scalar in enumerate(values):
            if isinstance(scalar,(dict,list,type(None))): diagnostics['non_scalar:'+key]+=1; continue
            candidate=json.dumps(scalar,ensure_ascii=False,separators=(',',':')) if not isinstance(scalar,str) else scalar
            span=None
            if isinstance(hint,str) and hint:
                text=row['text']; starts=[]; pos=0
                while len(starts)<2:
                    at=text.find(hint,pos)
                    if at<0: break
                    starts.append(at); pos=at+1
                if len(starts)==1: span=[starts[0],starts[0]+len(hint)]
                else: diagnostics['span_not_unique:'+key]+=1
            fields.append({'id':f'{source}:{row["id"]}:{req_index}:{path}:{index}','source':source,'source_id':row['id'],'request':req_index,'instance':path,'key':key,'concept':keys[key]['concept'],'head':keys[key]['head'],'phase':phase,'text':row['text'],'candidate':candidate,'span':span,'split':split})
    for version in ['haiku-v1','haiku-v2']:
        for file in sorted((root/'data'/version).glob('*/*.jsonl')):
            rel=str(file.relative_to(root)); sources.append({'path':rel,'sha256':digest(file)})
            for line in file.read_text().splitlines():
                if not line.strip(): continue
                row=json.loads(line); area=row['world']; rows[version+':'+area]+=1
                identity=rel+':'+row['id']; split='calibration' if int(hashlib.sha256(identity.encode()).hexdigest()[:8],16)%10==0 else 'train'
                for ri,request in enumerate(row['requests']):
                    def put(path,key,value,phase='unspecified',hint=None):emit(row,request,ri,path,key,value,phase,hint,rel,split)
                    if version=='haiku-v1':
                        for question,value in request['answers'].items():
                            key=aliases['M'].get(question)
                            if key is None:
                                mapped=aliases['W'].get(area,{}).get(question)
                                if mapped:
                                    if mapped=='chart.*':mapped='chart.'+aliases['CO'].get(str(value),'legend')
                                    key=mapped[1:] if mapped.startswith('@') else area+'.'+mapped
                            if question=='format' and value in ['bullets','numbered']:key='document.inline.list_kind'
                            if key is None:diagnostics['v1_question:'+question]+=1;continue
                            put('answers.'+question,key,value,'v1-unspecified',value if question.endswith('_span') and isinstance(value,str) else None)
                    else:
                        for field in ['mood','act']:
                            if field in request:put(field,'request.request.'+field,request[field])
                        for field,value in (request.get('target') or {}).items():
                            if field=='type':continue
                            key='request.logic.quantifier' if field=='quantifier' else 'request.target.'+field
                            if field.endswith('_span'):key='request.logic.quantifier' if field=='quantifier' else 'request.target.'+field[:-5]
                            put('target.'+field,key,value,hint=value if field.endswith('_span') and isinstance(value,str) else None)
                        for ci,c in enumerate((request.get('constraints') or [])):
                            phase=c.get('phase','unspecified'); rawkey=c.get('key',''); key=rawkey if rawkey in keys else area+'.'+rawkey
                            if 'value' in c:put(f'constraints.{ci}.value',key,c['value'],phase,c.get('value_span'))
                            for field,value in c.items():
                                if field in ['key','value','value_span']:continue
                                put(f'constraints.{ci}.{field}','request.logic.group' if field=='group' else 'request.constraint.'+field,value,phase if field!='phase' else 'unspecified',value if field.endswith('_span') and isinstance(value,str) else None)
                        for group,prefix in [('question','request.question'),('turn','conversation.turn')]:
                            for field,value in (request.get(group) or {}).items():put(group+'.'+field,prefix+'.'+field,value)
    pools=collections.defaultdict(set)
    for key,spec in keys.items():pools[key].update(str(x) for x in spec.get('values',[]))
    for field in fields:
        if field['split']=='train':pools[field['key']].add(field['candidate'])
    count=collections.Counter(); coverage=collections.Counter(); span_count=0
    out.mkdir(parents=True,exist_ok=True)
    handles={split:(out/(split+'.jsonl')).open('w') for split in ['train','calibration']}
    try:
        for field in fields:
            candidates=sorted(pools[field['key']]-{field['candidate']}); seed=int(hashlib.sha256(field['id'].encode()).hexdigest()[:12],16); rng=random.Random(seed); negatives=rng.sample(candidates,min(2,len(candidates)))
            for candidate,label in [(field['candidate'],1)]+[(v,0)for v in negatives]:
                record={**field,'candidate':candidate,'label':label,'span':field['span'] if label else None}
                record['query']=f'concept={field["concept"]} key={field["key"]} phase={field["phase"]} instance={field["instance"]} candidate={candidate}'
                handles[field['split']].write(json.dumps(record,ensure_ascii=False)+'\n');count[field['split']]+=1
            coverage[field['key']]+=1;span_count+=field['span'] is not None
    finally:
        for handle in handles.values():handle.close()
    manifest={'format':'sop.inventory-bootstrap','version':1,'executable':False,'scope':'oracle-conditioned field-instance scoring and source spans; not graph reconstruction','inventorySha256':digest(inventory_path),'v1MappingSha256':digest(root/'heads/coverage_v1.py'),'sources':sources,'messageCounts':dict(rows),'fieldInstances':len(fields),'pairCounts':dict(count),'spanInstances':span_count,'keysCovered':len(coverage),'keysTotal':len(keys),'fieldCoverage':dict(coverage),'diagnostics':dict(diagnostics),'candidateBank':'declared closed values plus observed TRAIN labels only; not a deployment inventory','calibration':'deterministic source-row 10% partition; never final unseen evaluation','outputs':{s:digest(out/(s+'.jsonl')) for s in handles}}
    (out/'data-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps({k:manifest[k]for k in ['messageCounts','fieldInstances','pairCounts','spanInstances','keysCovered','keysTotal']},indent=2),flush=True)

def train(args):
    import time, numpy as np, torch
    from torch import nn
    from transformers import AutoTokenizer,AutoModel
    from torch.utils.data import Dataset,DataLoader
    random.seed(args.seed);np.random.seed(args.seed);torch.manual_seed(args.seed);torch.set_num_threads(2)
    class Lines(Dataset):
        def __init__(self,path):
            self.path=path;self.offsets=[]
            with path.open('rb') as f:
                while True:
                    pos=f.tell();line=f.readline()
                    if not line:break
                    self.offsets.append(pos)
                    if args.limit and len(self.offsets)>=args.limit:break
        def __len__(self):return len(self.offsets)
        def __getitem__(self,i):
            with self.path.open('rb')as f:f.seek(self.offsets[i]);return json.loads(f.readline())
    tokenizer=AutoTokenizer.from_pretrained(args.encoder,local_files_only=True);encoder=AutoModel.from_pretrained(args.encoder,local_files_only=True,attn_implementation='eager')
    class Bootstrap(nn.Module):
        def __init__(self):super().__init__();self.encoder=encoder;self.score=nn.Linear(encoder.config.dim,1);self.span=nn.Linear(encoder.config.dim,2)
        def forward(self,**x):
            h=self.encoder(**x).last_hidden_state;return self.score(h[:,0]).squeeze(-1),self.span(h)
    alignment=collections.Counter()
    manifest={'format':'sop.inventory-bootstrap.run','version':1,'executable':False,'encoder':args.encoder,'inventoryData':json.loads((args.data/'data-manifest.json').read_text()),'scriptSha256':digest(Path(__file__)),'arguments':{k:str(v)if isinstance(v,Path)else v for k,v in vars(args).items()},'packages':{'torch':torch.__version__},'checkpointContract':'model weights only, no optimizer; atomic replace of latest.pt, not optimizer-resumable','headContract':'shared candidate score + source span start/end, conditioned on gold field instance and inventory concept; not graph prediction'}
    (args.out/'run-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    model=Bootstrap().to('cuda')
    model_bytes=sum(p.numel()*p.element_size() for p in model.parameters())
    if shutil.disk_usage(args.out).free < 2*model_bytes+128*1024*1024: raise RuntimeError('insufficient-checkpoint-reserve')
    def save_weights(epoch,steps):
        tmp=args.out/'latest.tmp';target=args.out/'latest.pt'
        if shutil.disk_usage(args.out).free < model_bytes+64*1024*1024:
            print(json.dumps({'checkpointDeferred':'insufficient-disk','steps':steps}),flush=True);return False
        torch.save({'model':model.state_dict(),'epoch':epoch,'steps':steps,'optimizerStored':False},tmp);os.replace(tmp,target);return True
    optimizer=torch.optim.AdamW(model.parameters(),lr=args.lr)
    def collate(rows):
        encoded=tokenizer([r['text']for r in rows],[r['query']for r in rows],padding=True,truncation=True,max_length=args.maxlen,return_offsets_mapping=True,return_tensors='pt');offsets=encoded.pop('offset_mapping');starts=[];ends=[]
        alignment['encodedExamples']+=len(rows);alignment['truncatedExamples']+=sum(bool(e.overflowing)for e in encoded.encodings)
        for i,r in enumerate(rows):
            span=r['span'];indices=[j for j,(a,b)in enumerate(offsets[i].tolist())if encoded.sequence_ids(i)[j]==0 and span and a>=span[0] and b<=span[1] and b>a]
            exact=bool(indices)and offsets[i,indices[0],0].item()==span[0]and offsets[i,indices[-1],1].item()==span[1]
            alignment['spanRequested']+=bool(span);alignment['spanAligned']+=exact;alignment['spanUnaligned']+=bool(span)and not exact
            starts.append(indices[0]if exact else -100);ends.append(indices[-1]if exact else -100)
        return {k:v.to('cuda')for k,v in encoded.items()},torch.tensor([r['label']for r in rows],device='cuda',dtype=torch.float32),torch.tensor(starts,device='cuda'),torch.tensor(ends,device='cuda')
    datasets={s:Lines(args.data/(s+'.jsonl'))for s in ['train','calibration']};steps=0;history=[];started=time.time()
    for epoch in range(args.epochs):
        model.train();total=0;loss_sum=0
        loader=DataLoader(datasets['train'],batch_size=args.batch,shuffle=True,collate_fn=collate,generator=torch.Generator().manual_seed(args.seed+epoch))
        for x,y,start,end in loader:
            optimizer.zero_grad(set_to_none=True)
            with torch.autocast('cuda',dtype=torch.bfloat16):
                score,spans=model(**x);loss=nn.functional.binary_cross_entropy_with_logits(score,y)
                if (start!=-100).any():loss=loss+nn.functional.cross_entropy(spans[:,:,0],start)+nn.functional.cross_entropy(spans[:,:,1],end)
            loss.backward();nn.utils.clip_grad_norm_(model.parameters(),1);optimizer.step();steps+=1;total+=len(y);loss_sum+=loss.item()*len(y)
            if steps%50==0:print(json.dumps({'epoch':epoch+1,'steps':steps,'examples':total,'loss':loss_sum/total,'seconds':time.time()-started}),flush=True)
            if steps%500==0:save_weights(epoch,steps)
        model.eval();correct=seen=span_correct=span_seen=0
        with torch.no_grad():
            for x,y,start,end in DataLoader(datasets['calibration'],batch_size=args.batch,collate_fn=collate):
                with torch.autocast('cuda',dtype=torch.bfloat16):score,spans=model(**x)
                correct+=((score>=0)==y.bool()).sum().item();seen+=len(y);mask=start!=-100;span_seen+=mask.sum().item();span_correct+=((spans[:,:,0].argmax(-1)==start)&(spans[:,:,1].argmax(-1)==end)&mask).sum().item()
        result={'epoch':epoch+1,'steps':steps,'trainExamples':total,'trainLoss':loss_sum/max(total,1),'calibrationPairAccuracy':correct/max(seen,1),'calibrationSpanExact':span_correct/max(span_seen,1),'calibrationPairs':seen,'calibrationSpans':span_seen,'seconds':time.time()-started,'executable':False,'alignmentCounters':dict(alignment)};history.append(result)
        save_weights(epoch+1,steps);tokenizer.save_pretrained(args.out/'tokenizer');(args.out/'summary.json').write_text(json.dumps({'history':history,'purpose':'non-executable inventory-conditioned bootstrap; no graph/instance/execution score'},indent=2)+'\n');print(json.dumps(result),flush=True)

def main():
    p=argparse.ArgumentParser();sub=p.add_subparsers(dest='command',required=True);a=sub.add_parser('prepare');a.add_argument('--root',type=Path,required=True);a.add_argument('--out',type=Path,required=True);t=sub.add_parser('train');t.add_argument('--data',type=Path,required=True);t.add_argument('--out',type=Path,required=True);t.add_argument('--encoder',required=True);t.add_argument('--epochs',type=int,default=1);t.add_argument('--batch',type=int,default=16);t.add_argument('--maxlen',type=int,default=192);t.add_argument('--lr',type=float,default=3e-5);t.add_argument('--seed',type=int,default=20261116);t.add_argument('--limit',type=int,default=0);args=p.parse_args();args.out.mkdir(parents=True,exist_ok=True)
    if args.command=='prepare':prepare(args.root,args.out)
    else:train(args)
if __name__=='__main__':main()
