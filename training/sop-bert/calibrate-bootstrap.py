"""Frozen checkpoint per-key calibration. Oracle field instances, never graph accuracy."""
import argparse,collections,hashlib,json,os
from pathlib import Path

def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def main():
    import torch
    from torch import nn
    from transformers import AutoModel,AutoTokenizer
    p=argparse.ArgumentParser();p.add_argument('--run',type=Path,required=True);p.add_argument('--data',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--batch',type=int,default=32);args=p.parse_args()
    manifest=json.loads((args.run/'run-manifest.json').read_text());encoder=manifest['encoder'];torch.set_num_threads(2)
    tokenizer=AutoTokenizer.from_pretrained(encoder,local_files_only=True)
    class Model(nn.Module):
        def __init__(self):
            super().__init__();self.encoder=AutoModel.from_pretrained(encoder,local_files_only=True,attn_implementation='eager');self.score=nn.Linear(self.encoder.config.dim,1);self.span=nn.Linear(self.encoder.config.dim,2)
        def forward(self,**x):
            h=self.encoder(**x).last_hidden_state;return self.score(h[:,0]).squeeze(-1),self.span(h)
    checkpoint=args.run/'latest.pt';checkpoint_hash=sha(checkpoint);model=Model().to('cuda');model.load_state_dict(torch.load(checkpoint,map_location='cpu',weights_only=True)['model']);model.eval();counts=collections.defaultdict(collections.Counter)
    def evaluate(rows):
        x=tokenizer([r['text']for r in rows],[r['query']for r in rows],padding=True,truncation=True,max_length=int(manifest['arguments']['maxlen']),return_offsets_mapping=True,return_tensors='pt');offsets=x.pop('offset_mapping');sequences=[x.sequence_ids(i)for i in range(len(rows))]
        with torch.no_grad(),torch.autocast('cuda',dtype=torch.bfloat16):scores,spans=model(**{k:v.to('cuda')for k,v in x.items()})
        for i,row in enumerate(rows):
            count=counts[row['key']];count['pairs']+=1;count['correct']+=int((scores[i].item()>=0)==bool(row['label']));count['positivePairs']+=int(bool(row['label']));prediction=scores[i].item()>=0;truth=bool(row['label']);count['tp'if prediction and truth else 'fp'if prediction else 'fn'if truth else 'tn']+=1
            span=row['span'];indices=[j for j,(a,b)in enumerate(offsets[i].tolist())if sequences[i][j]==0 and span and a>=span[0]and b<=span[1]and b>a]
            exact=bool(indices)and offsets[i,indices[0],0].item()==span[0]and offsets[i,indices[-1],1].item()==span[1]
            count['spanRequested']+=int(bool(span));count['spanAligned']+=int(exact)
            if exact:count['spanCorrect']+=int(spans[i,:,0].argmax().item()==indices[0]and spans[i,:,1].argmax().item()==indices[-1])
    rows=[]
    with args.data.open() as stream:
        for line in stream:
            rows.append(json.loads(line))
            if len(rows)==args.batch:evaluate(rows);rows=[]
    if rows:evaluate(rows)
    if sha(checkpoint)!=checkpoint_hash:raise RuntimeError('checkpoint changed during calibration')
    result={'format':'sop.inventory-bootstrap.calibration','version':1,'executable':False,'conditioning':'gold field instance, key, phase and candidate; not graph prediction','checkpointSha256':checkpoint_hash,'dataSha256':sha(args.data),'evaluatorSha256':sha(Path(__file__)),'keys':{key:{**{name:c[name]for name in ['pairs','correct','positivePairs','tp','fp','fn','tn','spanRequested','spanAligned','spanCorrect']},'pairAccuracy':c['correct']/c['pairs'],'positivePrecision':c['tp']/(c['tp']+c['fp'])if c['tp']+c['fp']else None,'positiveRecall':c['tp']/(c['tp']+c['fn'])if c['tp']+c['fn']else None,'spanExact':c['spanCorrect']/c['spanAligned']if c['spanAligned']else None}for key,c in sorted(counts.items())}}
    args.out.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
