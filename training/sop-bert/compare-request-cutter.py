#!/usr/bin/env python3
"""Offline comparison of two decoders over one immutable source-only emission pass."""
import argparse
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import time

def digest(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''):
            h.update(b)
    return h.hexdigest()

def load_module(path):
    spec=importlib.util.spec_from_file_location('frozen_cutter',path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module

def source_records(path):
    rows=[]
    for line in Path(path).read_text().splitlines():
        row=json.loads(line)
        if set(row)!={'id','text'} or not isinstance(row['id'],str) or not row['id'] or not isinstance(row['text'],str) or len(row['text'])>16384:
            raise ValueError('source-only-record-required')
        rows.append(row)
    if len({r['id'] for r in rows})!=len(rows):
        raise ValueError('duplicate-id')
    if not rows or len(rows)>100000:
        raise ValueError('row-bound')
    return rows

def source_indices(offsets,sequences,mask,text_length):
    if not len(offsets)==len(sequences)==len(mask):
        raise ValueError('token-shape')
    indices=[];previous=0
    for i,(pair,seq,active) in enumerate(zip(offsets,sequences,mask)):
        if not active or seq is None:
            continue
        if seq!=0 or len(pair)!=2:
            raise ValueError('source-sequence-required')
        a,b=pair
        if not isinstance(a,int) or not isinstance(b,int) or not previous<=a<b<=text_length:
            raise ValueError('invalid-scalar-offset')
        previous=b;indices.append(i)
    return indices

def transition_counts(before,after,rows):
    counts=Counter()
    for row,a,b in zip(rows,before,after):
        group='empty' if row['request_count']==0 else 'positive'
        counts[group+':'+('correct' if a else 'incorrect')+'->'+('correct' if b else 'incorrect')]+=1
    return dict(counts)

def run(args):
    import torch
    from transformers import AutoTokenizer
    torch.set_num_threads(args.cpu_threads)
    out=Path(args.out);out.mkdir(exist_ok=False,parents=True)
    model_root=Path(args.model)
    files={'checkpoint':model_root/'best.pt','config':model_root/'model-config.json',
           'verification':model_root/'final-verification.json','trainer':Path(args.trainer),
           'input':Path(args.input),'calibration':Path(args.calibration),
           'helper':Path(args.helper),'nodeWrapper':Path(__file__).with_name('compare-request-cutter-decoders.mjs'),
           'comparison':Path(__file__)}
    expected={'checkpoint':args.checkpoint_sha256,'config':args.config_sha256,
              'verification':args.verification_sha256,'trainer':args.trainer_sha256,'helper':args.helper_sha256}
    before={k:digest(v) for k,v in files.items()}
    if any(before[k]!=v for k,v in expected.items()):
        raise ValueError('frozen-hash-mismatch')
    verification=json.loads(files['verification'].read_text())
    config=json.loads(files['config'].read_text())
    if verification.get('complete') is not True or verification.get('role')!='trained-cutter-only':
        raise ValueError('completed-trained-cutter-required')
    for name in ('checkpoint','config','trainer'):
        if verification[name+'Sha256']!=expected[name]:
            raise ValueError('verification-chain-mismatch')
    if config.get('format')!='sop.request-cutter-model/1' or config.get('artifactRole')!='trained':
        raise ValueError('unsupported-model-role')
    if before['calibration']!=verification['provenance']['outputs']['calibration']:
        raise ValueError('calibration-hash-mismatch')
    encoder=Path(config['encoder'])
    for name,sha in config['encoderFiles'].items():
        if Path(name).name!=name or digest(encoder/name)!=sha:
            raise ValueError('encoder-chain-mismatch')
        files['encoder:'+name]=encoder/name
        before['encoder:'+name]=sha
    trainer=load_module(files['trainer'])
    if config['codec']!=trainer.CODEC or hashlib.sha256(trainer.canonical(trainer.CODEC).encode()).hexdigest()!=config['codecSha256']:
        raise ValueError('frozen-codec-mismatch')
    records=source_records(args.input)
    tokenizer=AutoTokenizer.from_pretrained(encoder,local_files_only=True,use_fast=True)
    if not tokenizer.is_fast:
        raise ValueError('exact-offsets-required')
    model=trainer.build_model(encoder)
    state=torch.load(files['checkpoint'],map_location='cpu',weights_only=True)
    if state['config']!=config:
        raise ValueError('checkpoint-config-mismatch')
    model.load_state_dict(state['model'],strict=True);del state
    model.to(args.device).eval()
    started=time.time()
    emissions_path=out/'emissions.jsonl'
    with emissions_path.open('x') as handle,torch.inference_mode():
        for start in range(0,len(records),args.batch):
            batch=records[start:start+args.batch]
            texts=[r['text'] for r in batch]
            full=tokenizer(texts,truncation=False)
            encoded=tokenizer(texts,padding='max_length',truncation=True,max_length=config['maxLength'],
                              return_offsets_mapping=True,return_tensors='pt')
            with torch.autocast('cuda',dtype=torch.bfloat16,enabled=args.device.startswith('cuda')):
                logits=model(encoded['input_ids'].to(args.device),encoded['attention_mask'].to(args.device)).float().cpu().tolist()
            for i,row in enumerate(batch):
                offsets=encoded['offset_mapping'][i].tolist()
                mask=encoded['attention_mask'][i].tolist()
                indices=source_indices(offsets,encoded.sequence_ids(i),mask,len(row['text']))
                value={'id':row['id'],'text':row['text'],'emissions':[logits[i][j] for j in indices],
                       'offsets':[offsets[j] for j in indices],
                       'truncated':len(full['input_ids'][i])>config['maxLength']}
                handle.write(json.dumps(value,separators=(',',':'),ensure_ascii=False)+'\n')
            if start%256==0:
                print(json.dumps({'emissionRows':min(start+args.batch,len(records)),'total':len(records)}),flush=True)
    del model
    if args.device.startswith('cuda'):
        torch.cuda.empty_cache()
    decoder_path=out/'decoder-labels.jsonl'
    subprocess.run(['node',str(files['nodeWrapper']),str(emissions_path),str(decoder_path),
                    str(files['helper']),args.helper_sha256],check=True)
    # Gold is read only after the source-only model pass has been persisted.
    gold={}
    for line in files['calibration'].read_text().splitlines():
        row=json.loads(line)
        if row['id'] in gold:
            raise ValueError('duplicate-gold-id')
        gold[row['id']]=row
    emissions=[json.loads(line) for line in emissions_path.read_text().splitlines()]
    decodes=[json.loads(line) for line in decoder_path.read_text().splitlines()]
    if len(emissions)!=len(decodes) or len(emissions)!=len(gold):
        raise ValueError('calibration-coverage-mismatch')
    rows=[];predictions={'greedy':[],'viterbi':[],'allO':[]};diagnostics=Counter();changes=Counter()
    exact={'greedy':[],'viterbi':[]}
    for row,decoded in zip(emissions,decodes):
        if row['id']!=decoded['id'] or row['id'] not in gold:
            raise ValueError('prediction-identity-mismatch')
        teacher=gold.pop(row['id'])
        if teacher['source']['text']!=row['text']:
            raise ValueError('source-text-mismatch')
        spans,issues=trainer.gold_spans(row['text'],teacher['annotations'])
        n=len(row['offsets']);sequences=[0]*n;mask=[1]*n
        labels,issues=trainer.align_labels(row['text'],spans,row['offsets'],sequences,mask,row['truncated'],issues)
        evaluation={'text':row['text'],'offsets':row['offsets'],'sequence_ids':sequences,'attention_mask':mask,
                    'truncated':row['truncated'],'spans':spans,'issues':issues,'labels':labels,
                    'request_count':len(teacher['annotations'])}
        rows.append(evaluation)
        viterbi=decoded['viterbi']
        if not viterbi['ok']:
            diagnostics[viterbi['reason']]+=1
        choices={'greedy':decoded['greedy'],'viterbi':viterbi['labels'] if viterbi['ok'] else [-1]*n,'allO':[0]*n}
        for name,pred in choices.items():
            if len(pred)!=n:
                raise ValueError('decoded-token-count-mismatch')
            predictions[name].append(pred)
            if name in exact:
                got,reasons=trainer.decode_bio(pred,row['offsets'],sequences,mask,len(row['text']),row['truncated'])
                exact[name].append(not reasons and spans is not None and Counter(map(tuple,got))==Counter(spans))
        changes['changedTokenRows']+=choices['greedy']!=choices['viterbi']
        changes['changedTokens']+=sum(a!=b for a,b in zip(choices['greedy'],choices['viterbi']))
    if gold or before!={k:digest(v) for k,v in files.items()}:
        raise ValueError('immutable-input-or-coverage-changed')
    result={'format':'sop.request-cutter-decoder-comparison/1','complete':True,'executionEligible':False,
            'confidenceCalibrated':False,'precision':'cuda-bfloat16' if args.device.startswith('cuda') else 'CPU-float32',
            'device':args.device,'batchSize':args.batch,'padding':'max_length','maxLength':config['maxLength'],
            'sameEmissionPass':True,'sourceOnly':True,'rows':len(rows),'elapsedSeconds':time.time()-started,
            'hashes':before,'emissionsSha256':digest(emissions_path),'decoderLabelsSha256':digest(decoder_path),
            'metrics':{name:trainer.metrics(rows,pred) for name,pred in predictions.items()},
            'viterbiDiagnostics':dict(diagnostics),'changes':dict(changes),
            'utteranceTransitions':transition_counts(exact['greedy'],exact['viterbi'],rows),
            'frozenTrainingBF16Baseline':verification['calibration'],
            'boundary':'Offline same-emissions structural decoding comparison, not graph confidence or app activation.',
            'versions':{'torch':str(torch.__version__),'transformers':__import__('transformers').__version__},
            'viterbiDecoder':'bio-viterbi/1','strictDecoder':trainer.CODEC['format']}
    (out/'comparison.json').write_text(json.dumps(result,indent=2,sort_keys=True)+'\n')
    print(json.dumps({k:result[k] for k in ('rows','precision','elapsedSeconds','changes','utteranceTransitions')}),flush=True)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('model','trainer','input','calibration','helper','out'):
        p.add_argument('--'+name,required=True)
    for name in ('checkpoint','config','verification','trainer','helper'):
        p.add_argument('--'+name+'-sha256',required=True)
    p.add_argument('--device',default='cpu')
    p.add_argument('--batch',type=int,default=16)
    p.add_argument('--cpu-threads',type=int,default=4)
    args=p.parse_args()
    if not 1<=args.batch<=64:
        p.error('batch must be1..64')
    run(args)

if __name__=='__main__':
    main()
