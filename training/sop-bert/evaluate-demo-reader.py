"""Actual predicted-span reader meaning on prepared TRAIN/CAL; no teacher mention features.

Reports complete normalized request AND direct tool parameter exactness. The optional cutter runs on actual full utterances; without it request cuts are gold
conditional scope. Neither measurement is end-to-end browser effect accuracy.
"""
import argparse,collections,copy,gzip,hashlib,importlib.util,io,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parent

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result


def meaning(request,registry):
    if not request or not request.get('act'):return None
    result=copy.deepcopy(request);result.pop('span',None);result.pop('trigger',None)
    target=result.setdefault('target',{})
    if 'count_span'in target:
        target['count']=str(number(target['count_span']))
    for key in ['kind_span','description_span','count_span']:
        target.pop(key,None)
    normalized=[]
    for c in result.get('constraints',[]):
        key=c['key'];item={name:value for name,value in c.items()if name not in ['value_span','measure_span']}
        spec=registry.get(key,{})
        if spec.get('concept')=='reference'and isinstance(item.get('value'),str):
            item['value']=' and '.join(json.loads(part)if part.startswith('"')else part for part in item['value'].split(' and '))
        if spec.get('head','').startswith('number'):
            item['value']=str(number(item.get('value',c.get('value_span',''))))
            span=c.get('value_span','')
            match=re.search(r'\b(milliseconds?|minutes?|hours?|pixels?|words?|seats?)\b',span,re.I)
            if match and 'unit'not in item:item['unit']=match[0].lower().removesuffix('s')
            if 'measure'in item:
                if str(number(item['measure']))!=item['value']:raise ValueError('measure/value disagreement')
                item.pop('measure')
        normalized.append(item)
    result['constraints']=sorted(normalized,key=lambda c:json.dumps(c,sort_keys=True))
    return result


def number(value):
    matches=re.findall(r'(?<![A-Za-z])[-+]?\d+(?:\.\d+)?',str(value))
    if len(matches)!=1:raise ValueError('ambiguous numeric value')
    value=float(matches[0]);return int(value)if value.is_integer()else value


def meaning_fields(request):
    if request is None:return {'request':None}
    fields={key:value for key,value in request.items()if key not in ['target','constraints']}
    fields.update({'target.'+key:value for key,value in request.get('target',{}).items()})
    grouped=collections.defaultdict(list)
    for condition in request.get('constraints',[]):grouped[condition['key']].append(condition)
    fields.update({'constraint.'+key:sorted(values,key=lambda value:json.dumps(value,sort_keys=True))for key,values in grouped.items()})
    return fields

def utterance_sources(input_path):
    # Training carries gold cuts; evaluation independently rejoins the frozen
    # authored full utterance. Only text/context enter model prediction.
    manifest=json.loads((input_path.parent/'manifest.json').read_text())
    path=Path(manifest['source'])
    if hashlib.sha256(path.read_bytes()).hexdigest()!=manifest['sourceSha256']:
        raise ValueError('evaluation-authored-source-hash-mismatch')
    stream=gzip.open(path,'rt')if path.suffix=='.gz'else path.open()
    with stream:return {(r['source_path'],r['source_id']):(r['text'],r['requests'])for r in map(json.loads,stream)}

def evaluate(args):
    import itertools,time,torch
    from transformers import AutoTokenizer
    torch.set_num_threads(2)
    trainer=load('demo_training',ROOT/'train-key-reader.py');predictor=load('demo_prediction',ROOT/'predict-key-reader.py');codec=load('demo_codec',ROOT/'prepare-key-reader.py');contract=load('demo_contract',ROOT/'demo-intent-contract.py')
    checkpoint_bytes=(args.model/'checkpoint.pt').read_bytes();checkpoint_sha=hashlib.sha256(checkpoint_bytes).hexdigest();checkpoint=torch.load(io.BytesIO(checkpoint_bytes),map_location='cpu',weights_only=False);checkpoint_epoch=checkpoint.get('epoch');del checkpoint_bytes;config=checkpoint['config'];encoder=config['encoder'];tokenizer=AutoTokenizer.from_pretrained(encoder,local_files_only=True)
    model=trainer.build_model(config,encoder);model.load_state_dict(checkpoint['model'],strict=True);model.to(args.device).eval();del checkpoint
    profile=json.loads(args.profile.read_text());cutter=None;cutter_config=None;cutter_model=None;cutter_sha=None;cutter_epoch=None
    if args.cutter_model:
        cutter=load('demo_cutter',ROOT/'train-request-cutter.py');cutter_bytes=(args.cutter_model/'best.pt').read_bytes();cutter_sha=hashlib.sha256(cutter_bytes).hexdigest();saved=torch.load(io.BytesIO(cutter_bytes),map_location='cpu',weights_only=False);cutter_epoch=saved.get('epoch');del cutter_bytes;cutter_config=saved['config'];cutter_model=cutter.build_model(cutter_config['encoder']);cutter_model.load_state_dict(saved['model'],strict=True);cutter_model.to(args.device).eval();del saved
    field_errors=collections.Counter();consistency_errors=collections.Counter();tool_errors=collections.Counter();counts=collections.Counter();perarea=collections.defaultdict(collections.Counter);started=time.monotonic();key_indices={key:i for i,key in enumerate(config['keys'])}
    utterances=utterance_sources(args.input)if args.cutter_model else None
    with args.input.open()as source,args.out.open('x')as output,torch.inference_mode():
        source=itertools.islice(source,args.limit)if args.limit else source
        while True:
            rows=[json.loads(line)for line in itertools.islice(source,args.batch_size)]
            if not rows:break
            if utterances is not None:
                rows=[{**row,'utteranceText':utterances[(row['source_path'],row['source_id'])][0],'utteranceRequests':utterances[(row['source_path'],row['source_id'])][1]}for row in rows]
            segmentation=[None]*len(rows);cut_issues=[[]for _ in rows];invoke=[True]*len(rows)
            if cutter_model is not None:
                texts=[row['utteranceText']for row in rows]
                cut_enc=tokenizer(texts,padding=True,truncation=True,max_length=cutter_config['maxLength'],return_offsets_mapping=True,return_tensors='pt')
                with torch.autocast('cuda',dtype=torch.bfloat16,enabled=args.device.startswith('cuda')):cut_logits=cutter_model(cut_enc['input_ids'].to(args.device),cut_enc['attention_mask'].to(args.device))
                cut_tags=cut_logits.argmax(-1).cpu().tolist()
                for i,(row,text)in enumerate(zip(rows,texts)):
                    spans,issues=cutter.decode_bio(cut_tags[i],cut_enc['offset_mapping'][i].tolist(),cut_enc.sequence_ids(i),cut_enc['attention_mask'][i].tolist(),len(text),len(tokenizer(text,truncation=False)['input_ids'])>cutter_config['maxLength'])
                    expected,gold_issues=cutter.gold_spans(text,row['utteranceRequests'])
                    segmentation[i]=not issues and not gold_issues and list(map(tuple,spans))==list(map(tuple,expected or[]));counts['segmentationExact']+=segmentation[i]
                    cut_issues[i]=issues
                    if len(spans)>1:cut_issues[i].append('phase1-unexpected-multiple-cuts')
                    invoke[i]=bool(spans)
                    rows[i]={**row,'text':text[spans[0][0]:spans[0][1]]if spans else''}
            active=[i for i in range(len(rows))if invoke[i]];predictions={};consistency={};partial_requests={};value_proofs={}
            if active:
                keyrows=[rows[i]for i in active];texts=[r['text']for r in keyrows];pairs=[json.dumps({'area':r['area'],'context':r['context']},ensure_ascii=False,sort_keys=True)for r in keyrows]
                enc=tokenizer(texts,pairs,truncation='longest_first',max_length=config['maxLength'],padding='max_length',return_offsets_mapping=True,return_tensors='pt')
                with torch.autocast('cuda',dtype=torch.bfloat16,enabled=args.device.startswith('cuda')):
                    hidden,bio,presence=model(enc['input_ids'].to(args.device),enc['attention_mask'].to(args.device))
                    global_values={key:model.classes[str(key_indices[key])](hidden[:,0]).float().cpu().tolist()for key in config['banks']if config['registry'][key]['role']=='global'}
                bio_values=bio.float().cpu().tolist();presence_values=presence.float().cpu().tolist();offsets=enc['offset_mapping'].tolist();attention=enc['attention_mask'].tolist();features=[];identities=[]
                # All metadata features derive from predicted spans. No gold cut/key/mention features.
                for i,row in enumerate(keyrows):
                    for key,logits in zip(config['bioKeys'],bio_values[i]):
                        if config['registry'][key]['role']!='domain'or config['registry'][key]['area']!=row['area']:continue
                        spans,error=predictor.key_spans(logits,offsets[i],enc.sequence_ids(i),attention[i],len(row['text']))
                        if error:continue
                        for span in spans:
                            a,b=span['tokens'];features.append(hidden[i,a:b].mean(0)+model.key.weight[key_indices[key]]);identities.append((i,key,a,b))
                mention_values=[{}for _ in keyrows]
                if features:
                    feature_matrix=torch.stack(features)
                    for i,key,a,b in identities:mention_values[i][(key,a,b)]={}
                    with torch.autocast('cuda',dtype=torch.bfloat16,enabled=args.device.startswith('cuda')):
                        for key in config['metadataKeys']:
                            values=model.classes[str(key_indices[key])](feature_matrix).float().cpu().tolist()
                            for identity,value in zip(identities,values):
                                i,domain,a,b=identity;mention_values[i][(domain,a,b)][key]=value
                        for key in config['banks']:
                            if config['registry'][key]['role']!='domain':continue
                            selected=[j for j,identity in enumerate(identities)if identity[1]==key]
                            if not selected:continue
                            values=model.classes[str(key_indices[key])](feature_matrix[selected]).float().cpu().tolist()
                            for j,value in zip(selected,values):
                                i,domain,a,b=identities[j];mention_values[i][(domain,a,b)][key]=value
                for local,i in enumerate(active):
                    row=rows[i];truncated=len(tokenizer(row['text'],pairs[local],truncation=False)['input_ids'])>config['maxLength']
                    raw,decoded_mentions=predictor.normalize(config,row['text'],row['area'],bio_values[local],presence_values[local],{k:v[local]for k,v in global_values.items()},mention_values[local],offsets[local],enc.sequence_ids(local),attention[local],{'sha256':'unpublished-training-evaluation'},codec.GLOBAL,codec.META,truncated)
                    predictions[i]=raw['request']if raw['request'].get('act')else None;partial_requests[i]=raw['request'];consistency[i]=raw['unresolved'];value_proofs[i]=[m for m in decoded_mentions if 'valueProof'in m]
            for i,row in enumerate(rows):
                expected=row.get('rawRequest');predicted=predictions.get(i);raw_issues=consistency.get(i,[])
                # Declared C1 class normalization is measured independently of
                # legacy proof markers. Keep raw markers visible in each row.
                issues=[issue for issue in raw_issues if issue['reason']not in ['normalization-requires-declared-proof','missing-or-ambiguous-act-anchor']or expected is not None and issue['reason']=='missing-or-ambiguous-act-anchor']
                if expected is None and invoke[i] and (partial_requests.get(i,{}).get('target')or partial_requests.get(i,{}).get('constraints')):issues.append({'reason':'nonempty-reading-without-act'})
                error=None;intent_exact=False;tool_exact=False;differences=[]
                reg={key.split('.',1)[1]:value for key,value in config['registry'].items()if value['role']=='domain'and value['area']==row['area']}
                try:
                    normalized=meaning(predicted,reg);expected_meaning=meaning(expected,reg);intent_exact=normalized==expected_meaning
                    actual_fields=meaning_fields(normalized);expected_fields=meaning_fields(expected_meaning)
                    differences=sorted(key for key in actual_fields.keys()|expected_fields.keys()if key not in actual_fields or key not in expected_fields or actual_fields[key]!=expected_fields[key]);field_errors.update(differences)
                    tools=contract.direct_tools({'world':row['area'],'text':row['text'],'context':row['context'],'requests':[normalized]if normalized else[]},profile)
                    tool_exact=tools==(row.get('expectedTools')or[])
                except(ValueError,KeyError,TypeError)as exception:error=str(exception);tool_errors[error]+=1
                consistency_errors.update(issue['reason']+(':'+issue['key']if issue.get('key')else'')for issue in issues)
                complete=bool(intent_exact and tool_exact and not issues and not cut_issues[i]);full=complete;strict_boundary=complete and segmentation[i]is True
                values=[('rows',1),('intentExact',intent_exact),('toolParameterExact',tool_exact),('completeMeaningExact',complete),('inconsistent',bool(issues or cut_issues[i]))]
                if cutter_model is not None:values.extend([('fullUtteranceMeaningExact',full),('fullUtteranceBoundaryAndMeaningExact',strict_boundary)])
                for key,value in values:counts[key]+=value;perarea[row['area']][key]+=value
                output.write(json.dumps({'id':row['id'],'intentExact':intent_exact,'toolParameterExact':tool_exact,'completeMeaningExact':complete,'prediction':predicted,'segmentationExact':segmentation[i],'cutterIssues':cut_issues[i],'consistency':issues,'rawConsistency':raw_issues,'error':error,'keyReaderInvoked':invoke[i],'intentDifferences':differences,'valueProofs':value_proofs.get(i,[])},ensure_ascii=False)+'\n')
            if counts['rows']//1000!=(counts['rows']-len(rows))//1000:print(json.dumps(dict(counts)),flush=True)
    summary={'intentFieldErrors':dict(field_errors.most_common()),'consistencyErrors':dict(consistency_errors.most_common()),'toolErrors':dict(tool_errors.most_common()),'counts':dict(counts),'perArea':{area:dict(values)for area,values in perarea.items()},'seconds':time.monotonic()-started,'batchSize':args.batch_size,'decoderSourceSha256':hashlib.sha256((ROOT/'predict-key-reader.py').read_bytes()).hexdigest(),'checkpointSha256':checkpoint_sha,'checkpointEpoch':checkpoint_epoch,'input':str(args.input),'cutterModel':str(args.cutter_model)if args.cutter_model else None,'conditionalGoldCut':args.cutter_model is None,'inputSha256':hashlib.sha256(args.input.read_bytes()).hexdigest(),'cutterCheckpointSha256':cutter_sha,'cutterCheckpointEpoch':cutter_epoch,'scope':'Actual predicted BIO spans and per-predicted-mention metadata; complete normalized request plus exact direct native tool args and consistency. '+('Actual full utterance through predicted cutter; 'if args.cutter_model else 'Gold request-cut conditional; ')+'not browser/application effect accuracy. Source numeric units and typed references normalized by declared C1 contract; no expected value enters prediction.'}
    args.out.with_suffix('.summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary,indent=2));return summary
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--model',type=Path,required=True);p.add_argument('--input',type=Path,required=True);p.add_argument('--profile',type=Path,default=ROOT/'data/demo-tool-profile/profile.json');p.add_argument('--out',type=Path,required=True);p.add_argument('--cutter-model',type=Path);p.add_argument('--device',default='cuda');p.add_argument('--limit',type=int);p.add_argument('--batch-size',type=int,default=16);evaluate(p.parse_args())
