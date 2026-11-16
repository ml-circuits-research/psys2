"""Read-only frozen raw model audit; no fitting, normalization or graph confidence."""
import argparse,collections,hashlib,importlib.util,json
from pathlib import Path

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    import torch
    from transformers import AutoTokenizer
    p=argparse.ArgumentParser();p.add_argument('--run',type=Path,required=True);p.add_argument('--out',type=Path,required=True);args=p.parse_args();torch.set_num_threads(2)
    run=args.run;manifest=json.loads((run/'run-manifest.json').read_text());config=json.loads((run/'model-config.json').read_text());trainer=Path(__file__).with_name('train-structural.py');assert sha(trainer)==manifest['scriptSha256'];checkpoint=run/'latest.pt';checkpoint_hash=sha(checkpoint)
    spec=importlib.util.spec_from_file_location('frozen_structural_trainer',trainer);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    data=Path(manifest['arguments']['data'])/'calibration.jsonl';assert sha(data)==manifest['data']['outputs']['calibration'];rows=[json.loads(line)for line in data.open()]
    tokenizer=AutoTokenizer.from_pretrained(config['encoder'],local_files_only=True);encoded,preprocessing=module.encode_rows(rows,config,tokenizer,config['maxLength']);model=module.build_model(config,config['encoder']);model.load_state_dict(torch.load(checkpoint,map_location='cpu',weights_only=True)['model'],strict=True);model.to('cuda').eval();batch_size=int(manifest['arguments']['batch'])
    metrics=collections.defaultdict(lambda:collections.defaultdict(collections.Counter));exact_buckets=collections.defaultdict(collections.Counter);count_confusion=collections.Counter()
    with torch.no_grad():
        for offset in range(0,len(encoded),batch_size):
            batch=encoded[offset:offset+batch_size];ids=torch.stack([row['ids']for row in batch]).to('cuda');mask=torch.stack([row['mask']for row in batch]).to('cuda');labels={key:torch.stack([row['labels'][key]for row in batch]).to('cuda')for key in batch[0]['labels']}
            with torch.autocast('cuda',dtype=torch.bfloat16):outputs=model(ids,mask)
            exact=torch.ones(len(batch),dtype=torch.bool,device='cuda')
            for key,truth in labels.items():
                prediction=outputs[key].argmax(-1);valid=truth!=-100;correct=(prediction==truth)&valid
                if key in config['banks']:correct&=truth!=1;categories=[('absent',truth==0),('present_known',truth>=2),('present_unseen',truth==1)]
                elif key.endswith(':state'):categories=[('absent',truth==0),('present',truth==1),('unresolved',truth==2)]
                else:categories=[('annotated',valid)]
                overflow=config['maxRequests']+1 if key=='count'else config['maxConstraints']+1 if key=='conditionCount'else None
                if overflow is not None:correct&=truth!=overflow
                for name,condition in categories:
                    selected=condition&valid;c=metrics[key][name];c['support']+=selected.sum().item();c['correct']+=(correct&selected).sum().item();c['predictedUnknown']+=((prediction==1)&selected).sum().item()if key in config['banks']else 0
                exact&=((correct|~valid).reshape(len(batch),-1)).all(-1)
            counts=outputs['count'].argmax(-1);presence=outputs['presence'].argmax(-1)
            for index,row in enumerate(batch):
                source_row=rows[offset+index];actual=bool(source_row['annotations']);predicted=int(counts[index])!=0;count_confusion['tp'if actual and predicted else'fp'if predicted else'fn'if actual else'tn']+=1;count_confusion['presenceCountDisagreements']+=int(bool(presence[index])!=predicted)
                if row['v2']:
                    bucket='nonempty'if actual else'no_request';exact_buckets[bucket]['rows']+=1;exact_buckets[bucket]['representable']+=row['supported'];exact_buckets[bucket]['correct']+=bool(exact[index])and row['supported']
    result={'format':'sop.frozen-structural-audit','version':1,'executable':False,'confidenceFitted':False,'checkpointSha256':checkpoint_hash,'trainerSha256':sha(trainer),'configSha256':sha(run/'model-config.json'),'dataSha256':sha(data),'evaluatorSha256':sha(Path(__file__)),'precision':'CUDA BF16','v2RawTensorExact':{k:dict(v)for k,v in exact_buckets.items()},'requestCountPresenceConfusion':dict(count_confusion),'headBuckets':{k:{name:{**dict(c),'accuracy':c['correct']/c['support']if c['support']else None}for name,c in groups.items()}for k,groups in metrics.items()},'preprocessing':preprocessing,'boundary':'Conditional raw labels and representation support; canonical graph/intent/execution truth separate. Unseen value labels never count as correct; no-request and nonempty exactness separated.'}
    assert sha(checkpoint)==checkpoint_hash;old=json.loads((run/'summary.json').read_text())['v2RawTensorExactLowerBound'];assert sum(c['correct']for c in result['v2RawTensorExact'].values())==old['correct'];assert sum(c['rows']for c in result['v2RawTensorExact'].values())==old['rows'];args.out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result['v2RawTensorExact']))
if __name__=='__main__':main()
