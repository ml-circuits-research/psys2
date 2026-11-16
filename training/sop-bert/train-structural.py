"""Source/context -> raw request tree heads. No gold field queries or canonical inference."""
import argparse,collections,hashlib,json,math,os,random,shutil,time
from pathlib import Path
R_FIELDS=['act','mood','target.type','target.mode','target.fill','target.determiner','target.kind','target.count','target.ordinal','target.quantifier','question.ask','question.asked_key','turn.fragment','turn.objection','turn.repeat_count','turn.area']
C_FIELDS=['key','value','operator','phase','polarity','character','scope','group','step','measure','unit','variety','anchor_fill']
R_SPANS=['span','trigger','target.kind_span','target.name_span','target.description_span','target.count_span']
C_SPANS=['value_span','measure_span','anchor_span']
MISSING=object()
def sha(path):
    h=hashlib.sha256()
    with path.open('rb')as f:
        for chunk in iter(lambda:f.read(1048576),b''):h.update(chunk)
    return h.hexdigest()
def field(obj,path):
    for key in path.split('.'):
        if not isinstance(obj,dict)or key not in obj:return MISSING
        obj=obj[key]
    return obj
def unique(text,value,base=0):
    if not isinstance(value,str)or not value:return None
    at=text.find(value)
    return None if at<0 or text.find(value,at+1)>=0 else [base+at,base+at+len(value)]
def categorical(value):return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def bank_mapping(bank):return {categorical(record['value']):i for i,record in enumerate(bank)if record['kind']=='value'}
def encode_category(value,mapping):return 0 if value is MISSING else mapping.get(categorical(value),1)
def configuration(rows):
    banks={prefix+':'+name:{}for prefix,names in [('r',R_FIELDS),('c',C_FIELDS)]for name in names};max_r=max_c=0
    for row in rows:
        requests=row['annotations'];max_r=max(max_r,len(requests))
        for request in requests:
            if 'haiku-v2'not in row['source_path']:continue
            for name in R_FIELDS:
                value=field(request,name)
                if value is not MISSING:banks['r:'+name][categorical(value)]=value
            conditions=request.get('constraints')or [];max_c=max(max_c,len(conditions))
            for condition in conditions:
                for name in C_FIELDS:
                    value=field(condition,name)
                    if value is not MISSING:banks['c:'+name][categorical(value)]=value
    return {'format':'psys2.raw-structural-model/1','modelKind':'structural-graph','canonicalInference':False,'rawPredictionFormat':'psys2.raw-structural-predictions/1','decoderTarget':'psys2.structural-predictions/1','maxRequests':max(1,max_r),'maxConstraints':max(1,max_c),'banks':{key:[{'kind':'absent'},{'kind':'unknown'},*[{'kind':'value','value':values[key]}for key in sorted(values)]]for key,values in banks.items()},'requestFields':R_FIELDS,'constraintFields':C_FIELDS,'requestSpans':R_SPANS,'constraintSpans':C_SPANS,'spanStates':['absent','present','unresolved'],'reservedIndices':{'absent':0,'unknown':1},'unknownIsNotAbsence':True,'counts':'exact 0..train maximum; extra logit is overflow/unknown, never clipped','input':'source text paired with actual supplied area/context JSON only; no annotation fields','canonicalBinding':'separate declaration-only bridge; raw descriptors and unresolved preserved','graphConfidence':'absent until independent whole-graph calibration'}
def build_model(config,encoder_path):
    import torch
    from torch import nn
    from transformers import AutoModel
    class Structural(nn.Module):
        def __init__(self):
            super().__init__();self.encoder=AutoModel.from_pretrained(encoder_path,local_files_only=True,attn_implementation='eager');d=self.encoder.config.dim;self.dim=d
            self.request_slots=nn.Parameter(torch.randn(config['maxRequests'],d)*.02);self.constraint_slots=nn.Parameter(torch.randn(config['maxConstraints'],d)*.02)
            self.request_attention=nn.MultiheadAttention(d,8,batch_first=True);self.constraint_attention=nn.MultiheadAttention(d,8,batch_first=True)
            self.heads=nn.ModuleDict({key.replace(':','__').replace('.','_'):nn.Linear(d,len(values))for key,values in config['banks'].items()})
            self.count=nn.Linear(d,config['maxRequests']+2);self.condition_count=nn.Linear(d,config['maxConstraints']+2);self.presence=nn.Linear(d,2)
            names=['r:'+name for name in R_SPANS]+['c:'+name for name in C_SPANS];self.pointer_key=nn.Linear(d,64,bias=False)
            self.pointer_start=nn.ModuleDict({key.replace(':','__').replace('.','_'):nn.Linear(d,64,bias=False)for key in names});self.pointer_end=nn.ModuleDict({key.replace(':','__').replace('.','_'):nn.Linear(d,64,bias=False)for key in names});self.pointer_state=nn.ModuleDict({key.replace(':','__').replace('.','_'):nn.Linear(d,3)for key in names})
        def forward(self,input_ids,attention_mask):
            h=self.encoder(input_ids=input_ids,attention_mask=attention_mask).last_hidden_state;b=h.shape[0];mask=attention_mask==0
            rq=self.request_slots.unsqueeze(0).expand(b,-1,-1);r=self.request_attention(rq,h,h,key_padding_mask=mask,need_weights=False)[0]+rq
            cq=(r.unsqueeze(2)+self.constraint_slots.reshape(1,1,-1,self.dim)).flatten(1,2);c=self.constraint_attention(cq,h,h,key_padding_mask=mask,need_weights=False)[0]+cq;c=c.reshape(b,config['maxRequests'],config['maxConstraints'],self.dim)
            result={'count':self.count(h[:,0]),'presence':self.presence(h[:,0]),'conditionCount':self.condition_count(r)}
            for key in config['banks']:
                name=key.replace(':','__').replace('.','_');result[key]=self.heads[name](r if key.startswith('r:')else c)
            k=self.pointer_key(h)
            for key in self.pointer_state:
                raw=key.replace('__',':');prefix=raw.split(':')[0];feature=r if prefix=='r'else c;original=next(name for name in ([*('r:'+x for x in R_SPANS),*('c:'+x for x in C_SPANS)])if name.replace(':','__').replace('.','_')==key)
                result[original+':state']=self.pointer_state[key](feature);start=torch.einsum('b...d,bld->b...l',self.pointer_start[key](feature),k)/8;end=torch.einsum('b...d,bld->b...l',self.pointer_end[key](feature),k)/8
                padding=mask.reshape(b,*([1]*(start.ndim-2)),h.shape[1]);result[original+':start']=start.masked_fill(padding,-10000);result[original+':end']=end.masked_fill(padding,-10000)
            return result
    return Structural()

def truncation_details(full_sequence,current_sequence):return {'source':full_sequence.count(0)>current_sequence.count(0),'context':full_sequence.count(1)>current_sequence.count(1)}
def encode_rows(rows,config,tokenizer,maxlen):
    import torch
    encoded=[];diagnostics=collections.Counter();maps={key:bank_mapping(values)for key,values in config['banks'].items()};R=config['maxRequests'];C=config['maxConstraints']
    for offset in range(0,len(rows),128):
        chunk=rows[offset:offset+128];texts=[row['source']['text']for row in chunk];contexts=[json.dumps({'area':row['world'],'context':row.get('context')},ensure_ascii=False,sort_keys=True,separators=(',',':'))for row in chunk];batch=tokenizer(texts,contexts,padding='max_length',truncation=True,max_length=maxlen,return_offsets_mapping=True);full=tokenizer(texts,contexts,padding=False,truncation=False)
        for i,row in enumerate(chunk):
            source=row['source']['text'];requests=row['annotations'];labels={key:torch.full((R,)if key.startswith('r:')else(R,C),-100,dtype=torch.long)for key in config['banks']};labels['count']=torch.tensor(len(requests)if len(requests)<=R else R+1);labels['presence']=torch.tensor(int(bool(requests)));labels['conditionCount']=torch.full((R,),-100,dtype=torch.long)
            for prefix,names,shape in [('r',R_SPANS,(R,)),('c',C_SPANS,(R,C))]:
                for name in names:
                    for suffix in ['state','start','end']:labels[prefix+':'+name+':'+suffix]=torch.full(shape,-100,dtype=torch.long)
            sequence=batch.sequence_ids(i);positions=batch['offset_mapping'][i];starts={a:j for j,(a,b)in enumerate(positions)if sequence[j]==0 and b>a};ends={b:j for j,(a,b)in enumerate(positions)if sequence[j]==0 and b>a}
            truncation=truncation_details(full.sequence_ids(i),sequence);truncated=any(truncation.values());diagnostics['rows']+=1;diagnostics['truncated']+=truncated;diagnostics['sourceTruncatedRows']+=truncation['source'];diagnostics['contextTruncatedRows']+=truncation['context'];supported='haiku-v2'in row['source_path']and len(requests)<=R and not truncated
            def span_label(prefix,name,index,value,request_range):
                nonlocal supported
                key=prefix+':'+name;state=0;bounds=None
                if value is not MISSING:
                    if name=='span':bounds=unique(source,value)
                    elif request_range:bounds=unique(source[request_range[0]:request_range[1]],value,request_range[0])
                    state=1 if bounds and bounds[0]in starts and bounds[1]in ends else 2
                labels[key+':state'][index]=state
                if state==1:labels[key+':start'][index]=starts[bounds[0]];labels[key+':end'][index]=ends[bounds[1]]
                if state==2:diagnostics['unresolvedSpan:'+key]+=1;supported=False
            def class_label(prefix,name,index,value):
                nonlocal supported
                key=prefix+':'+name;target=encode_category(value,maps[key]);labels[key][index]=target
                if target==1:diagnostics['unseenLabel:'+key]+=1;supported=False
            for ri,request in enumerate(requests):
                if ri>=R:diagnostics['requestOverflow']+=1;break
                request_range=unique(source,request.get('span'))
                for name in ['span','trigger']:span_label('r',name,ri,field(request,name),request_range)
                if 'haiku-v2'not in row['source_path']:continue
                for name in R_FIELDS:class_label('r',name,ri,field(request,name))
                for name in R_SPANS[2:]:span_label('r',name,ri,field(request,name),request_range)
                conditions=request.get('constraints')or [];labels['conditionCount'][ri]=len(conditions)if len(conditions)<=C else C+1
                if len(conditions)>C:diagnostics['conditionOverflow']+=1;supported=False
                for ci,condition in enumerate(conditions):
                    if ci>=C:break
                    for name in C_FIELDS:class_label('c',name,(ri,ci),field(condition,name))
                    for name in C_SPANS:span_label('c',name,(ri,ci),field(condition,name),request_range)
            diagnostics['rawV2Representable']+=supported
            encoded.append({'ids':torch.tensor(batch['input_ids'][i]),'mask':torch.tensor(batch['attention_mask'][i]),'labels':labels,'supported':supported,'v2':'haiku-v2'in row['source_path']})
    return encoded,dict(diagnostics)

def train(args):
    import torch
    from torch import nn
    from torch.utils.data import DataLoader
    from transformers import AutoTokenizer
    random.seed(args.seed);torch.manual_seed(args.seed);torch.set_num_threads(2)
    manifest=json.loads((args.data/'manifest.json').read_text());assert manifest['sourceAnnotationsRetained']and manifest['exclusion']['foundIds']==manifest['exclusion']['requestedIds']and not manifest['exclusion']['missingIds']
    rows={}
    for split in ['train','calibration']:
        path=args.data/(split+'.jsonl');assert sha(path)==manifest['outputs'][split];rows[split]=[json.loads(line)for line in path.open()];assert all(row['split']==split for row in rows[split])
    excluded=set(json.loads(args.exclude_ids.read_text()));assert sha(args.exclude_ids)==manifest['exclusion']['sha256']
    for split,records in rows.items():
        assert all(record['source_id']not in excluded and ('calibration'if int(hashlib.sha256((record['source_path']+':'+record['source_id']).encode()).hexdigest()[:8],16)%10==0 else'train')==split for record in records)
    for source in manifest['sources']:assert sha(Path(__file__).parent/source['path'])==source['sha256']
    assert sha(args.init_checkpoint)==args.init_sha256
    config=configuration(rows['train']);config.update({'encoder':args.encoder,'maxLength':args.maxlen,'initialEncoderCheckpointSha256':args.init_sha256});args.out.mkdir(parents=True,exist_ok=False);(args.out/'model-config.json').write_text(json.dumps(config,indent=2)+'\n')
    model=build_model(config,args.encoder);state=torch.load(args.init_checkpoint,map_location='cpu',weights_only=True)['model'];encoder_state={key[len('encoder.'):]:value for key,value in state.items()if key.startswith('encoder.')};model.encoder.load_state_dict(encoder_state,strict=True);del state,encoder_state
    model_bytes=sum(p.numel()*p.element_size()for p in model.parameters());assert shutil.disk_usage(args.out).free>=2*model_bytes+128*1024*1024,'insufficient atomic checkpoint reserve'
    tokenizer=AutoTokenizer.from_pretrained(args.encoder,local_files_only=True);datasets={};data_diagnostics={}
    for split in rows:datasets[split],data_diagnostics[split]=encode_rows(rows[split],config,tokenizer,args.maxlen)
    run={'format':'sop.raw-structural-training','version':1,'executable':False,'graphConfidence':None,'scriptSha256':sha(Path(__file__)),'dataManifestSha256':sha(args.data/'manifest.json'),'data':manifest,'modelConfigSha256':sha(args.out/'model-config.json'),'initialEncoderCheckpointSha256':args.init_sha256,'arguments':{k:str(v)if isinstance(v,Path)else v for k,v in vars(args).items()},'preprocessing':data_diagnostics,'inputGuarantee':'No annotations, field identities or gold request/constraint counts are model inputs. Slots are learned fixed queries. Actual supplied area/context only.','checkpoint':'compact model weights only; no optimizer; not optimizer-resumable','torch':torch.__version__};(args.out/'run-manifest.json').write_text(json.dumps(run,indent=2)+'\n')
    def collate(batch):return torch.stack([row['ids']for row in batch]).to('cuda'),torch.stack([row['mask']for row in batch]).to('cuda'),{key:torch.stack([row['labels'][key]for row in batch]).to('cuda')for key in batch[0]['labels']},batch
    model.to('cuda');optimizer=torch.optim.AdamW(model.parameters(),lr=args.lr);steps=0;started=time.time()
    def save(epoch):
        if args.no_save:return
        assert shutil.disk_usage(args.out).free>=model_bytes+64*1024*1024,'insufficient atomic save reserve'
        temporary=args.out/'latest.tmp';torch.save({'model':model.state_dict(),'epoch':epoch,'steps':steps,'config':config,'optimizerStored':False},temporary);os.replace(temporary,args.out/'latest.pt')
    for epoch in range(args.epochs):
        model.train();seen=0;loss_sum=0
        for ids,mask,labels,_ in DataLoader(datasets['train'],batch_size=args.batch,shuffle=True,collate_fn=collate,generator=torch.Generator().manual_seed(args.seed+epoch)):
            optimizer.zero_grad(set_to_none=True)
            with torch.autocast('cuda',dtype=torch.bfloat16):
                output=model(ids,mask);losses=[nn.functional.cross_entropy(output[key].reshape(-1,output[key].shape[-1]),truth.reshape(-1),ignore_index=-100)for key,truth in labels.items()if (truth!=-100).any()];loss=torch.stack(losses).mean()
            loss.backward();nn.utils.clip_grad_norm_(model.parameters(),1);optimizer.step();steps+=1;seen+=len(ids);loss_sum+=loss.item()*len(ids)
            if steps%20==0:print(json.dumps({'epoch':epoch+1,'steps':steps,'trainRows':seen,'loss':loss_sum/seen,'seconds':time.time()-started}),flush=True)
            if steps%200==0:save(epoch)
        model.eval();metrics=collections.defaultdict(collections.Counter);raw_exact=raw_rows=0
        with torch.no_grad():
            for ids,mask,labels,batch in DataLoader(datasets['calibration'],batch_size=args.batch,collate_fn=collate):
                with torch.autocast('cuda',dtype=torch.bfloat16):output=model(ids,mask)
                exact=torch.ones(len(ids),dtype=torch.bool,device='cuda')
                for key,truth in labels.items():
                    prediction=output[key].argmax(-1);valid=truth!=-100;correct=(prediction==truth)&valid
                    if key in config['banks']:correct&=truth!=1
                    overflow=config['maxRequests']+1 if key=='count'else config['maxConstraints']+1 if key=='conditionCount'else None
                    if overflow is not None:correct&=truth!=overflow;metrics[key]['overflowTruth']+=((truth==overflow)&valid).sum().item()
                    metrics[key]['support']+=valid.sum().item();metrics[key]['correct']+=correct.sum().item();metrics[key]['unseenTruth']+=((truth==1)&valid).sum().item()if key in config['banks']else 0
                    exact&=((correct|~valid).reshape(len(ids),-1)).all(-1)
                for index,row in enumerate(batch):
                    if row['v2']:raw_rows+=1;raw_exact+=bool(exact[index])and row['supported']
        save(epoch+1);summary={'epoch':epoch+1,'steps':steps,'trainRows':seen,'trainLoss':loss_sum/seen,'seconds':time.time()-started,'conditionalHeadMetrics':{key:{**dict(value),'accuracy':value['correct']/value['support']if value['support']else None}for key,value in metrics.items()},'v2RawTensorExactLowerBound':{'correct':raw_exact,'rows':raw_rows,'accuracy':raw_exact/raw_rows if raw_rows else None},'scope':'Counts, source ranges and raw annotation fields, not canonical graph or request confidence','executable':False};(args.out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary),flush=True)
    tokenizer.save_pretrained(args.out/'tokenizer')

def main():
    p=argparse.ArgumentParser();p.add_argument('--data',type=Path,required=True);p.add_argument('--exclude-ids',type=Path,required=True);p.add_argument('--encoder',required=True);p.add_argument('--init-checkpoint',type=Path,required=True);p.add_argument('--init-sha256',required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--no-save',action='store_true',help='Compatibility smoke only; full training must save weights');p.add_argument('--epochs',type=int,default=1);p.add_argument('--batch',type=int,default=16);p.add_argument('--maxlen',type=int,default=192);p.add_argument('--lr',type=float,default=3e-5);p.add_argument('--seed',type=int,default=20261116);args=p.parse_args();train(args)
if __name__=='__main__':main()
