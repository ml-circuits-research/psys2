"""Source-only two-stage key-reader ONNX contract/prototype.
No checkpoint loader or binary-export CLI is provided in this preparation.
"""
import argparse,hashlib,json,re
from pathlib import Path

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def checked_config(path,expected_sha):
    if path.stat().st_size>4*1024**2:raise ValueError('config-too-large')
    if not re.fullmatch('[0-9a-f]{64}',expected_sha)or sha(path)!=expected_sha:raise ValueError('config-hash-mismatch')
    config=json.loads(path.read_text());layout(config);return config

def layout(config):
    if config.get('format')!='sop.key-reader/1':raise ValueError('unsupported-config-version')
    keys=config.get('keys');bio=config.get('bioKeys');banks=config.get('banks');registry=config.get('registry')
    if not isinstance(keys,list)or not 1<=len(keys)<=512 or any(not isinstance(k,str)or not k for k in keys)or len(set(keys))!=len(keys):raise ValueError('invalid-key-layout')
    if not isinstance(registry,dict)or set(registry)!=set(keys)or any(not isinstance(v,dict)or v.get('role')not in ['global','domain','metadata','derived']for v in registry.values()):raise ValueError('invalid-registry')
    if not isinstance(bio,list)or any(k not in keys for k in bio)or len(set(bio))!=len(bio):raise ValueError('invalid-bio-layout')
    if not isinstance(banks,dict)or not banks or any(k not in keys for k in banks):raise ValueError('invalid-bank-layout')
    offsets=[];offset=0
    for index,key in enumerate(keys):
        if key not in banks:continue
        bank=banks[key]
        if not isinstance(bank,list)or not 2<=len(bank)<=8192 or bank[:2]!=[{'state':'absent'},{'state':'unknown'}]:raise ValueError('invalid-bank-controls')
        if any(not isinstance(v,dict)or set(v)!= {'state','value'}or v['state']!='value'for v in bank[2:]):raise ValueError('invalid-bank-value')
        values=[v['value']for v in bank[2:]]
        if json.dumps(values,sort_keys=True,allow_nan=False)!=json.dumps(registry[key].get('values',[]),sort_keys=True,allow_nan=False):raise ValueError('bank-registry-mismatch')
        if len({json.dumps(v,sort_keys=True,allow_nan=False)for v in values})!=len(values):raise ValueError('duplicate-bank-value')
        offsets.append({'key':key,'keyIndex':index,'start':offset,'end':offset+len(bank),'bank':bank});offset+=len(bank)
    if offset>65536:raise ValueError('class-layout-too-large')
    return {'keys':keys,'bioKeys':bio,'banks':offsets,'classWidth':offset,'domainKeyIndices':[i for i,k in enumerate(keys)if registry[k].get('role')=='domain']}

def validate_queries(config,spans,key_indices,source_mask,max_queries=4096):
    """Host-side admission, not ONNX assertions. Empty batches must skip heads."""
    spec=layout(config)
    if not isinstance(source_mask,list)or not source_mask or any(type(x)is not bool for x in source_mask):raise ValueError('invalid-source-token-mask')
    if source_mask[0]:raise ValueError('cls-token-is-not-source')
    if not isinstance(spans,list)or not isinstance(key_indices,list)or len(spans)!=len(key_indices)or len(spans)>max_queries:raise ValueError('invalid-query-batch')
    if len(spans)*spec['classWidth']>4194304:raise ValueError('class-output-budget')
    for span,key in zip(spans,key_indices):
        if not isinstance(span,list)or len(span)!=2 or any(type(x)is not int for x in span)or type(key)is not int:raise ValueError('invalid-query-shape')
        start,end=span
        if start<0 or end<=start or end>len(source_mask):raise ValueError('invalid-query-range')
        if key==-1:
            if span!=[0,1]:raise ValueError('global-query-must-use-cls')
        elif key not in spec['domainKeyIndices']:raise ValueError('query-key-is-not-domain')
        elif not all(source_mask[start:end]):raise ValueError('query-crosses-nonsource-token')
    return {'skip':not spans,'count':len(spans)}

def make_wrappers(model,config):
    """Accept an already constructed module. Never loads files or checkpoints."""
    import torch
    spec=layout(config)
    if model.key.num_embeddings!=len(spec['keys']):raise ValueError('model-key-layout-mismatch')
    for row in spec['banks']:
        layer=model.classes[str(row['keyIndex'])]
        if layer.in_features!=model.key.embedding_dim or layer.out_features!=row['end']-row['start']:raise ValueError('model-class-layout-mismatch')
    class Encoder(torch.nn.Module):
        def __init__(self):super().__init__();self.model=model
        def forward(self,input_ids,attention_mask):return self.model(input_ids,attention_mask)
    class Heads(torch.nn.Module):
        def __init__(self):
            super().__init__();self.key=model.key;self.layers=torch.nn.ModuleList([model.classes[str(row['keyIndex'])]for row in spec['banks']])
        def forward(self,hidden,spans,key_indices):
            # These are already validated predicted queries. No clipping/repair.
            positions=torch.arange(hidden.shape[0],device=hidden.device)
            mask=(positions[None,:]>=spans[:,0,None])&(positions[None,:]<spans[:,1,None])
            pooled=(mask.to(hidden.dtype)@hidden)/(spans[:,1]-spans[:,0]).to(hidden.dtype)[:,None]
            embeddings=self.key(key_indices.clamp_min(0));features=pooled+torch.where((key_indices>=0)[:,None],embeddings,torch.zeros_like(embeddings))
            return torch.cat([layer(features)for layer in self.layers],dim=-1)
    return Encoder().eval(),Heads().eval()

def prototype_export(model,config,encoder_path,heads_path,input_ids,attention_mask,hidden,spans,key_indices,source_mask):
    """Future explicit caller only; never invoked by this preparation's CLI/tests.
    Caller must first freeze/verify weights and storage and later measure ORT parity.
    """
    import torch
    if validate_queries(config,spans.tolist(),key_indices.tolist(),source_mask)['skip']:raise ValueError('empty-query-batch-skip-export')
    if hidden.ndim!=2 or hidden.shape[0]!=len(source_mask):raise ValueError('hidden-source-length-mismatch')
    if Path(encoder_path).exists()or Path(heads_path).exists():raise ValueError('output-already-exists')
    encoder,heads=make_wrappers(model,config)
    torch.onnx.export(encoder,(input_ids,attention_mask),str(encoder_path),opset_version=17,dynamo=False,input_names=['input_ids','attention_mask'],output_names=['hidden','bio_logits','presence_logits'],dynamic_axes={'input_ids':{0:'batch',1:'sequence'},'attention_mask':{0:'batch',1:'sequence'},'hidden':{0:'batch',1:'sequence'},'bio_logits':{0:'batch',2:'sequence'},'presence_logits':{0:'batch'}})
    torch.onnx.export(heads,(hidden,spans,key_indices),str(heads_path),opset_version=17,dynamo=False,input_names=['hidden','spans','key_indices'],output_names=['class_logits'],dynamic_axes={'hidden':{0:'sequence'},'spans':{0:'queries'},'key_indices':{0:'queries'},'class_logits':{0:'queries'}})

def contract(config,config_sha):
    spec=layout(config)
    return {'format':'sop.key-reader-onnx-prototype/1','configSha256':config_sha,'trainerSha256':config.get('trainerSha256'),'exporterSha256':sha(Path(__file__)),'layout':spec,'encoder':{'inputs':['input_ids:int64[B,L]','attention_mask:int64[B,L]'],'outputs':['hidden:float[B,L,H]','bio_logits:float[B,K,L,3]','presence_logits:float[B,Q]']},'heads':{'inputs':['hidden:float[L,H]','spans:int64[N,2]','key_indices:int64[N]'],'outputs':['class_logits:float[N,classWidth]'],'globalKeyIndex':-1,'globalSpan':[0,1],'emptyBatch':'skip heads invocation'},'identity':{'encoderOnnxSha256':None,'headsOnnxSha256':None,'checkpointSha256':None,'tokenizerFiles':{k:v for k,v in config.get('encoderFiles',{}).items()if k in ['tokenizer.json','tokenizer_config.json','special_tokens_map.json','vocab.txt','added_tokens.json']},'complete':False},'calibrated':False,'executable':False,'status':'source-only; trained weight export and actual ORT parity pending'}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--config',type=Path,required=True);p.add_argument('--config-sha256',required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();c=checked_config(a.config,a.config_sha256)
    if a.out.exists():raise ValueError('output-already-exists')
    a.out.write_text(json.dumps(contract(c,a.config_sha256),indent=2,allow_nan=False)+'\n')
