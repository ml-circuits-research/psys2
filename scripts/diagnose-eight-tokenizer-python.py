"""Exact Python fast-tokenizer oracle for a source-only eight-case plan; no models."""
import hashlib
import json
from pathlib import Path
import sys

def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def run(plan_path,out_path,tokenizer_path,tokenizer_sha):
    from transformers import AutoTokenizer
    import transformers
    root=Path(tokenizer_path)
    if digest(root/'tokenizer.json')!=tokenizer_sha:
        raise ValueError('frozen-python-tokenizer-mismatch')
    plan=json.loads(Path(plan_path).read_text())
    if plan.get('caseCount')!=8 or not plan.get('sourceOnly') or plan.get('annotationGold')is not False or len(plan['requests'])>520:
        raise ValueError('bounded-source-only-plan-required')
    files={name:digest(root/name)for name in ('tokenizer.json','tokenizer_config.json','config.json','vocab.txt','special_tokens_map.json','added_tokens.json')if(root/name).is_file()}
    tokenizer=AutoTokenizer.from_pretrained(root,local_files_only=True,use_fast=True)
    if not tokenizer.is_fast:raise ValueError('fast-tokenizer-required')
    entries=[]
    for request in plan['requests']:
        context=None if request['kind']=='cutter'else json.dumps(request['pythonContext'],ensure_ascii=False,sort_keys=True)
        def encode(padded):
            encoded=tokenizer(request['text'],context,padding='max_length'if padded else False,
                              truncation='longest_first'if padded else False,max_length=192,
                              return_offsets_mapping=True,return_special_tokens_mask=True)
            sequences=encoded.sequence_ids()
            return {'inputIds':encoded['input_ids'],'attentionMask':encoded['attention_mask'],
                    'sequenceIds':sequences,'specialTokensMask':encoded['special_tokens_mask'],
                    'sourceOffsets':[list(pair)if sequences[i]==0 else None for i,pair in enumerate(encoded['offset_mapping'])]}
        full,padded=encode(False),encode(True)
        entries.append({**request,'contextJSON':context,
                        'contextUTF8Sha256':hashlib.sha256(context.encode()).hexdigest()if context is not None else None,
                        'full':full,'padded':padded,'sourceOffsetError':None})
    if files!={name:digest(root/name)for name in files}:raise ValueError('python-tokenizer-mutated')
    report={'entries':entries,'provenance':{'implementation':'Python AutoTokenizer fast',
            'transformersVersion':transformers.__version__,'tokenizerPath':str(root),'tokenizerFiles':files,
            'template':'single cutter; paired key source first/context second',
            'context':'json.dumps(sort_keys=True,ensure_ascii=False), default separators',
            'feeds':'input_ids + attention_mask only; token_type_ids are not model inputs',
            'modelCalls':0}}
    with Path(out_path).open('x')as handle:json.dump(report,handle,indent=2,ensure_ascii=False)
if __name__=='__main__':run(*sys.argv[1:])
