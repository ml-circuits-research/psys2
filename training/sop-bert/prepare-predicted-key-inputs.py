#!/usr/bin/env python3
"""Build request-local inference inputs from frozen cutter predictions, never gold cuts."""
import argparse, hashlib, json
from pathlib import Path

def digest(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda:stream.read(1048576),b''):h.update(block)
    return h.hexdigest()

def rows(path):
    return [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]

def indexed(records,fields):
    result={}
    for row in records:
        if not isinstance(row,dict) or set(row)!=set(fields) or not isinstance(row.get('id'),str) or not row['id'] or row['id'] in result:raise ValueError('invalid-or-duplicate-record')
        result[row['id']]=row
    return result

def model_identity(value):
    fields={'sha256','tokenizerSha256','codecSha256','decoderVersion'}
    if not isinstance(value,dict) or set(value)!=fields or type(value['decoderVersion']) is not int or value['decoderVersion']<1:raise ValueError('invalid-model-identity')
    if any(not isinstance(value[k],str) or len(value[k])!=64 or any(c not in '0123456789abcdef' for c in value[k]) for k in fields-{'decoderVersion'}):raise ValueError('invalid-model-identity')
    return value

def prepare(sources,predictions,contexts,model,max_requests=32):
    source_by=indexed(sources,['id','text']);pred_by=indexed(predictions,['id','prediction']);context_by=indexed(contexts,['id','area','context']);model_identity(model)
    if set(source_by)!=set(pred_by) or set(source_by)!=set(context_by):raise ValueError('source-prediction-context-identity-mismatch')
    inputs=[];messages=[];origins=[]
    for source_id,source in source_by.items():
        text=source['text'];context=context_by[source_id];cut=pred_by[source_id]['prediction'];reasons=[]
        if not isinstance(text,str) or len(text)>16384 or not isinstance(context['area'],str) or not context['area']:raise ValueError('invalid-source-or-context')
        if not isinstance(cut,dict) or set(cut)!={'source','spans','coverage','unresolved','model'}:reasons.append('invalid-cutter-envelope')
        else:
            if cut['source']!={'text':text,'unit':'unicode-scalar'}:reasons.append('source-snapshot-mismatch')
            try:
                if model_identity(cut['model'])!=model:reasons.append('cutter-model-mismatch')
            except ValueError:reasons.append('invalid-cutter-model')
            coverage=cut['coverage']
            if not isinstance(coverage,dict) or set(coverage)!={'complete','truncated'} or coverage['complete'] is not True or coverage['truncated'] is not False:reasons.append('incomplete-cutter-coverage')
            if not isinstance(cut['unresolved'],list) or cut['unresolved']:reasons.append('cutter-unresolved')
            spans=cut['spans']
            if not isinstance(spans,list) or len(spans)>max_requests:reasons.append('request-count-overflow')
            else:
                previous=0
                for span in spans:
                    if not isinstance(span,list) or len(span)!=2 or any(type(n)is not int for n in span) or not 0<=previous<=span[0]<span[1]<=len(text):reasons.append('invalid-cut-span');break
                    previous=span[1]
        if reasons:
            messages.append({'sourceId':source_id,'status':'refused','reasons':reasons,'cutIds':[]});continue
        cut_ids=[]
        for index,(start,end) in enumerate(cut['spans']):
            # JSON tuple identity prevents collisions even when source IDs contain separators.
            cut_id=json.dumps([source_id,index],ensure_ascii=False,separators=(',',':'));cut_ids.append(cut_id)
            inputs.append({'id':cut_id,'text':text[start:end],'area':context['area'],'context':context['context']})
            origins.append({'id':cut_id,'sourceId':source_id,'cutIndex':index,'sourceRange':[start,end],'unit':'unicode-scalar','sourceSha256':hashlib.sha256(text.encode()).hexdigest(),'cutterModel':model})
        messages.append({'sourceId':source_id,'status':'empty' if not cut_ids else 'prepared','cutIds':cut_ids,'unresolved':['request-dependencies-unknown'] if len(cut_ids)>1 else []})
    return {'inputs':inputs,'origins':origins,'messages':messages,'counts':{'sources':len(sources),'requests':len(inputs),'empty':sum(m['status']=='empty' for m in messages),'refused':sum(m['status']=='refused' for m in messages),'multiple':sum(len(m['cutIds'])>1 for m in messages)},'executionEligible':False}

def run(args):
    paths={'sources':args.sources,'predictions':args.predictions,'contexts':args.contexts,'manifest':args.manifest,'builder':Path(__file__)};before={key:digest(path) for key,path in paths.items()}
    if before['manifest']!=args.manifest_sha256 or before['contexts']!=args.contexts_sha256:raise ValueError('trusted-input-hash-mismatch')
    manifest=json.loads(args.manifest.read_text())
    if manifest.get('format')!='sop.request-cutter-prediction-run/1' or manifest.get('complete') is not True or manifest.get('executionEligible') is not False:raise ValueError('complete-cutter-run-required')
    if manifest.get('outputSha256')!=before['predictions'] or manifest.get('frozenInputs',{}).get('input')!=before['sources']:raise ValueError('cutter-source-output-chain-mismatch')
    sources=rows(args.sources);predictions=rows(args.predictions)
    if type(manifest.get('rows')) is not int or manifest['rows']!=len(sources) or len(predictions)!=len(sources):raise ValueError('cutter-row-count-mismatch')
    result=prepare(sources,predictions,rows(args.contexts),manifest['model'])
    if before!={key:digest(path) for key,path in paths.items()}:raise ValueError('input-changed-during-preparation')
    args.out.mkdir(parents=True,exist_ok=False)
    for key in ['inputs','origins','messages']:
        (args.out/(key+'.jsonl')).write_text(''.join(json.dumps(row,ensure_ascii=False)+'\n' for row in result[key]))
    if before!={key:digest(path) for key,path in paths.items()}:raise ValueError('input-changed-before-completion')
    (args.out/'manifest.json').write_text(json.dumps({'format':'sop.predicted-key-inputs/1','complete':True,'frozenInputs':before,'outputs':{key:digest(args.out/(key+'.jsonl')) for key in ['inputs','origins','messages']},'counts':result['counts'],'cutterModel':manifest['model'],'contextAuthority':'caller-supplied actual host observations; hash proves bytes, not truth','executionEligible':False,'graphConfidence':None},indent=2)+'\n')

def main():
    p=argparse.ArgumentParser()
    for name in ['sources','predictions','contexts','manifest','out']:p.add_argument('--'+name,type=Path,required=True)
    for name in ['manifest','contexts']:p.add_argument('--'+name+'-sha256',required=True)
    run(p.parse_args())
if __name__=='__main__':main()
