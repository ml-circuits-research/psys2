#!/usr/bin/env python3
"""Candidate request-local key reader with a learned schema family class; no activation."""
import argparse, hashlib, importlib.util, json, math
from pathlib import Path

MODEL_FORMAT='sop.key-reader/2-target-type-candidate'
RUN_FORMAT='sop.key-reader-run/2-target-type-candidate'
CODEC_FORMAT='sop.key-reader-raw-codec/2-target-type-candidate'
TARGET_TYPE='request.target.type'

def sha(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda:f.read(1048576),b''):h.update(block)
    return h.hexdigest()

def load(path,name):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def choose(values):
    if not isinstance(values,list) or not values or any(isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x) for x in values):return None
    best=max(values);ids=[i for i,x in enumerate(values) if x==best]
    return ids[0] if len(ids)==1 else None

def key_spans(logits,offsets,sequences,attention,text_length):
    if not(len(logits)==len(offsets)==len(sequences)==len(attention)):return [],'invalid-token-shape'
    spans=[];active=None;previous=0
    for i,(values,pair,seq,mask) in enumerate(zip(logits,offsets,sequences,attention)):
        if not mask or seq is None:continue
        if seq==1:
            if active is not None:spans.append(active);active=None
            continue
        if seq!=0 or not isinstance(pair,(list,tuple)) or len(pair)!=2:return [],'invalid-source-offset'
        a,b=pair
        if any(isinstance(x,bool) or not isinstance(x,int) for x in pair) or not previous<=a<b<=text_length:return [],'invalid-source-offset'
        previous=b;tag=choose(values) if isinstance(values,list) and len(values)==3 else None
        if tag is None:return [],'ambiguous-BIO-label'
        if tag==2 and active is None:return [],'illegal-I-after-O'
        if tag in [0,1] and active is not None:spans.append(active);active=None
        if tag==1:active={'tokens':[i,i+1],'range':[a,b]}
        elif tag==2:active['tokens'][1]=i+1;active['range'][1]=b
    if active is not None:spans.append(active)
    return spans,None

def verify_codec_chain(config,manifest,manifest_sha,codec_sha,configuration):
    if config.get('dataManifestSha256')!=manifest_sha or manifest.get('scriptSha256')!=codec_sha:raise ValueError('preparer-manifest-chain-mismatch')
    expected=configuration(manifest)
    if any(config.get(key)!=value for key,value in expected.items()):raise ValueError('trained-layout-mismatch')

def support(config):
    return [{'key':key,'presence':'untrained' if config['registry'][key]['role']=='derived' else 'learned-uncalibrated','value':('untrained' if config['registry'][key]['role']=='derived' else 'unsupported' if config['registry'][key]['role']=='metadata' and key not in config['banks'] else 'declared-class' if key in config['banks'] else 'source-copy-normalization-unresolved')} for key in config['keys']]

def normalize(config,text,area,bio,presence,global_logits,mention_logits,offsets,sequences,attention,model,global_paths,metadata_paths,truncated=False):
    request={'span':text,'target':{},'constraints':[]};ranges=[];issues=[];mentions=[];emitted=set()
    def issue(reason,key=None):issues.append({'reason':reason,**({'key':key} if key else {})})
    def put(path,value):
        obj=request
        for key in path[:-1]:obj=obj.setdefault(key,{})
        obj[path[-1]]=value
    def field(key,values):
        bank=config['banks'].get(key);index=choose(values)
        if bank is None or index is None or len(values)!=len(bank):issue('invalid-or-ambiguous-class',key);return None,False
        entry=bank[index]
        if entry.get('state')=='absent':return None,False
        if entry.get('state')!='value' or 'value' not in entry:issue('unknown-class',key);return None,False
        return entry['value'],True
    if config.get('format')!=MODEL_FORMAT or len(bio)!=len(config['bioKeys']) or len(presence)!=len(config['keys']):issue('incompatible-reader-layout')
    else:
        by_key={};present={}
        for key,score in zip(config['keys'],presence):
            if isinstance(score,bool) or not isinstance(score,(int,float)) or not math.isfinite(score) or score==0:issue('unknown-presence',key);present[key]=None
            else:present[key]=score>0
        for key,logits in zip(config['bioKeys'],bio):
            spans,error=key_spans(logits,offsets,sequences,attention,len(text));by_key[key]=spans
            if error:issue(error,key)
        for key in config['keys']:
            spec=config['registry'][key];role=spec['role'];spans=by_key.get(key,[])
            if role=='derived':continue # These heads were masked, never evidence of absence.
            if role=='global':
                path=global_paths.get(key)
                if not path:
                    if present[key] or spans:issue('unmapped-global-route',key)
                    continue
                if key in config['banks']:
                    value,exists=field(key,global_logits.get(key,[]))
                    if present[key] is not None and present[key]!=exists:issue('presence-class-inconsistent',key)
                    if exists:put(path.split('.'),value);emitted.add(key)
                else:
                    if present[key] is not None and present[key]!=bool(spans):issue('presence-span-inconsistent',key)
                    if len(spans)>1:issue('ambiguous-global-mention',key)
                    if len(spans)==1:
                        a,b=spans[0]['range'];put(path.split('.'),text[a:b]);emitted.add(key)
                        # Literal target identity remains source text, not an inferred canonical kind.
                        anchor=path if path.endswith('_span') else path+'_span'
                        if path in ['target.count','turn.repeat_count']:
                            parent,leaf=path.split('.');request[parent].pop(leaf,None);issue('unresolved-numeric-normalization',key)
                        if path=='target.kind':anchor='target.kind_span'
                        elif path=='target.count':anchor='target.count_span'
                        elif path=='question.asked_key':issue('unsupported-question-key-copy',key);continue
                        elif path=='turn.repeat_count':anchor='turn.repeat_count_span'
                        put(anchor.split('.'),text[a:b]);ranges.append({'path':anchor.split('.'),'range':[a,b]})
                if path=='act':
                    if len(spans)==1:
                        a,b=spans[0]['range'];request['trigger']=text[a:b];ranges.append({'path':['trigger'],'range':[a,b]})
                    else:issue('missing-or-ambiguous-act-anchor',key)
            elif role=='domain':
                if present[key] is not None and present[key]!=bool(spans):issue('presence-span-inconsistent',key)
                if spec['area']!=area:
                    if present[key] or spans:issue('cross-area-key-unresolved',key)
                    continue
                for span in spans:
                    a,b=span['range'];start,end=span['tokens'];identity=(key,start,end)
                    values=mention_logits.get(identity,{})
                    condition={'key':spec['type']+'.'+spec['key'],'value_span':text[a:b]};ci=str(len(request['constraints']));base=['constraints',ci]
                    if key in config['banks']:
                        value,exists=field(key,values.get(key,[]))
                        if exists:condition['value']=value
                        else:issue('unresolved-domain-value',key)
                    else:condition['value']=text[a:b]
                    for meta in config['metadataKeys']:
                        value,exists=field(meta,values.get(meta,[]))
                        if exists:
                            route=metadata_paths.get(meta)
                            if route:condition[route]=value;emitted.add(meta)
                            else:issue('unmapped-metadata-route',meta)
                    request['constraints'].append(condition);ranges.append({'path':base+['value_span'],'range':[a,b]});mentions.append({'key':key,'tokens':[start,end],'range':[a,b]})
                    if isinstance(condition.get('value'),str) and condition['value']==text[a:b]:ranges.append({'path':base+['value'],'range':[a,b]})
                    elif 'value' in condition:issue('normalization-requires-declared-proof',key)
            elif role=='metadata' and key not in config['metadataKeys'] and present[key]:issue('unsupported-metadata-head',key)
        for key in config['metadataKeys']:
            if present[key] is not None and present[key]!=(key in emitted):issue('metadata-presence-inconsistent',key)
    # Only the actual learned class may provide the raw annotation family.
    target_type=request['target'].get('type')
    declared=config.get('targetFamilies',{}).get(area,[])
    type_spec=config.get('registry',{}).get(TARGET_TYPE,{})
    if TARGET_TYPE in config.get('bioKeys',[]) or type_spec.get('bio') is not False or type_spec.get('familiesByArea')!=config.get('targetFamilies'):
        request['target'].pop('type',None);issue('invalid-target-type-profile')
    if not isinstance(target_type,str) or target_type not in declared:
        request['target'].pop('type',None);issue('missing-unknown-or-cross-area-target-type')
    if truncated:issue('source-or-context-truncated')
    return {'source':{'text':text,'unit':'unicode-scalar'},'request':request,'ranges':ranges,'coverage':{'complete':not issues,'truncated':bool(truncated),'support':support(config)},'unresolved':issues,'model':model},mentions

def run(args):
    import torch
    from transformers import AutoTokenizer
    root=args.model;files={'checkpoint':root/'checkpoint.pt','config':root/'model-config.json','run':root/'run.json','trainer':args.trainer,'codecSource':args.codec_source,'dataManifest':args.data_manifest,'input':args.input,'predictor':Path(__file__)}
    expected={k:getattr(args,k.replace('codecSource','codec_source')+'_sha256') for k in ['checkpoint','config','run','trainer','codecSource']}
    for key,value in expected.items():
        if sha(files[key])!=value:raise ValueError('frozen-hash-mismatch:'+key)
    config=json.loads(files['config'].read_text());run_record=json.loads(files['run'].read_text())
    if run_record.get('format')!=RUN_FORMAT or config.get('format')!=MODEL_FORMAT or run_record.get('checkpointSha256')!=args.checkpoint_sha256 or run_record.get('configSha256')!=args.config_sha256 or run_record.get('trainerSha256')!=args.trainer_sha256:raise ValueError('incomplete-frozen-run')
    if config.get('candidate') is not True or config.get('executionEligible') is not False or config.get('rawCodecFormat')!=CODEC_FORMAT or run_record.get('candidate') is not True or run_record.get('executionEligible') is not False:raise ValueError('invalid-candidate-provenance')
    if not isinstance(run_record.get('steps'),int) or run_record['steps']<=0 or config.get('trainerSha256')!=args.trainer_sha256:raise ValueError('incomplete-training-provenance')
    if Path(config['encoder']).resolve()!=args.encoder.resolve():raise ValueError('encoder-mismatch')
    for name,value in config['encoderFiles'].items():
        if Path(name).name!=name or sha(args.encoder/name)!=value:raise ValueError('encoder-content-mismatch')
        files['encoder:'+name]=args.encoder/name
    before={k:sha(v) for k,v in files.items()}
    if any(before[k]!=v for k,v in expected.items()):raise ValueError('changed-before-load')
    trainer=load(args.trainer,'frozen_key_trainer');codec=load(args.codec_source,'frozen_key_codec')
    verify_codec_chain(config,json.loads(args.data_manifest.read_text()),before['dataManifest'],args.codec_source_sha256,trainer.configuration)
    codec_identity={'format':CODEC_FORMAT,'configSha256':args.config_sha256,'sourceSha256':args.codec_source_sha256,'predictorSha256':before['predictor'],'global':codec.GLOBAL,'metadata':codec.META,'BIO':'strict-greedy-ties-unresolved','presence':'sign-uncalibrated','targetType':'learned-class-with-declared-area-validation'}
    model_identity={'sha256':args.checkpoint_sha256,'tokenizerSha256':config['encoderFiles']['tokenizer.json'],'codecSha256':hashlib.sha256(json.dumps(codec_identity,sort_keys=True).encode()).hexdigest(),'decoderVersion':2}
    records=[]
    for line in args.input.read_text().splitlines():
        row=json.loads(line)
        if not isinstance(row,dict) or set(row)!={'id','text','area','context'} or not isinstance(row['id'],str) or not row['id'] or not isinstance(row['text'],str) or len(row['text'])>16384 or not isinstance(row['area'],str):raise ValueError('source-and-actual-context-only')
        records.append(row)
    if len({r['id'] for r in records})!=len(records):raise ValueError('duplicate-input-id')
    tokenizer=AutoTokenizer.from_pretrained(args.encoder,local_files_only=True)
    if not tokenizer.is_fast:raise ValueError('fast-tokenizer-required')
    saved=torch.load(files['checkpoint'],map_location='cpu',weights_only=True)
    if saved['config']!=config:raise ValueError('checkpoint-config-mismatch')
    model=trainer.build_model(config,str(args.encoder));model.load_state_dict(saved['model'],strict=True);del saved;model.to(args.device).eval()
    with args.out.open('x') as out,torch.inference_mode():
        for row in records:
            pair=json.dumps({'area':row['area'],'context':row['context']},ensure_ascii=False,sort_keys=True)
            full=tokenizer(row['text'],pair,truncation=False);enc=tokenizer(row['text'],pair,truncation='longest_first',max_length=config['maxLength'],padding='max_length',return_offsets_mapping=True,return_tensors='pt');seq=enc.sequence_ids();offsets=enc['offset_mapping'][0].tolist();attention=enc['attention_mask'][0].tolist()
            with torch.autocast('cuda',dtype=torch.bfloat16,enabled=args.device.startswith('cuda')):
                hidden,bio,presence=model(enc['input_ids'].to(args.device),enc['attention_mask'].to(args.device));global_logits={k:model.classes[str(config['keys'].index(k))](hidden[0,0]).float().cpu().tolist() for k in config['banks'] if config['registry'][k]['role']=='global'};bio_values=bio[0].float().cpu().tolist();mention_logits={}
                for key,logits in zip(config['bioKeys'],bio_values):
                    if config['registry'][key]['role']!='domain':continue
                    spans,error=key_spans(logits,offsets,seq,attention,len(row['text']))
                    if error:continue
                    for span in spans:
                        start,end=span['tokens'];feature=hidden[0,start:end].mean(0)+model.key.weight[config['keys'].index(key)];heads=([key]if key in config['banks']else[])+config['metadataKeys'];mention_logits[(key,start,end)]={k:model.classes[str(config['keys'].index(k))](feature).float().cpu().tolist() for k in heads}
            prediction,mentions=normalize(config,row['text'],row['area'],bio_values,presence[0].float().cpu().tolist(),global_logits,mention_logits,offsets,seq,attention,model_identity,codec.GLOBAL,codec.META,len(full['input_ids'])>config['maxLength']);out.write(json.dumps({'id':row['id'],'prediction':prediction,'mentions':mentions},ensure_ascii=False)+'\n')
    if before!={k:sha(v) for k,v in files.items()}:raise ValueError('immutable-inference-input-changed')
    args.out.with_suffix(args.out.suffix+'.manifest.json').write_text(json.dumps({'format':'sop.key-reader-prediction-run/2-target-type-candidate','complete':True,'frozenInputs':before,'outputSha256':sha(args.out),'rows':len(records),'model':model_identity,'codec':codec_identity,'device':args.device,'precision':'cuda-bfloat16'if args.device.startswith('cuda')else'float32','graphConfidence':None,'executionEligible':False},indent=2)+'\n')

def main():
    p=argparse.ArgumentParser()
    for name in ['model','trainer','codec-source','data-manifest','encoder','input','out']:p.add_argument('--'+name,type=Path,required=True)
    for name in ['checkpoint','config','run','trainer','codec-source']:p.add_argument('--'+name+'-sha256',required=True)
    p.add_argument('--device',default='cpu');run(p.parse_args())
if __name__=='__main__':main()
