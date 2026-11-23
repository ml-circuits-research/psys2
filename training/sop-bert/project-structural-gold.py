"""C1 mechanical projection of supplied annotation structure, never runtime inference."""
import argparse,collections,hashlib,json,re
from pathlib import Path
PROMPT=Path(__file__).resolve().parent/'specs'/'INSTRUCTIONS-v2.md'  # the V2 annotation contract the conjunction policy cites

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def split_for(source,row_id):return 'calibration'if int(hashlib.sha256((source+':'+row_id).encode()).hexdigest()[:8],16)%10==0 else 'train'
def unique_range(text,literal,base=0):
    if not isinstance(literal,str)or not literal:return None
    start=text.find(literal)
    if start<0 or text.find(literal,start+1)>=0:return None
    return [base+start,base+start+len(literal)]

def project_row(row,version,bindings):
    text=row['text'];requests=row['requests'];projected=[];diagnostics=[]
    def lookup(family,**keys):
        found=[record for record in bindings.get(family,[])if all(record.get(k)==v for k,v in keys.items())]
        return found[0]if len(found)==1 else None
    for index,original in enumerate(requests):
        rid=f'r{index}';tid=f't{index}';issues=[];evidence=[]
        def unresolved(reason,path):issues.append({'reason':reason,'path':path})
        span=unique_range(text,original.get('span'))
        label={'id':rid,'targets':[],'constraints':[],'evidence':evidence}
        if span:label['span']=span
        else:unresolved('ambiguous-or-missing-request-span',['span'])
        if len(requests)==1:label['after']=[]
        else:unresolved('request-dependencies-not-annotated',['after'])
        if version!='haiku-v2':
            unresolved('v1-flat-answers-not-canonical-graph',['request']);label['unresolved']=issues;projected.append(label);diagnostics.extend({'request':rid,**issue}for issue in issues);continue
        segment=original.get('span','');base=span[0]if span else 0
        def anchor(path,literal=None,declaration=None,allow_request=False):
            bounds=unique_range(segment,literal,base)if span else None
            if bounds is None and allow_request and span:bounds=span
            if bounds is None:unresolved('missing-or-ambiguous-field-anchor',path);return
            e={'path':path,'ranges':[bounds],'origin':'declaration'if declaration else'text'}
            if declaration:e['declaration']=declaration
            evidence.append(e)
        for field in ['act','mood']:
            if field in original:label[field]=original[field]
            else:unresolved('missing-annotated-field',[field])
        anchor(['act'],original.get('trigger'))
        target=original.get('target')or {};t={'id':tid}
        if target.get('mode')in ['new','existing','bound']:t['mode']=target['mode']
        else:unresolved('missing-target-mode',['targets',tid,'mode'])
        kind=lookup('kinds',area=row['world'],type=target.get('type'),lemma=target.get('kind'))
        if kind:
            t['kind']=kind['canonical'];anchor(['targets',tid,'kind'],target.get('kind_span')or target.get('kind'),kind['sourceWire'])
        elif target.get('mode')!='bound':unresolved('unresolved-canonical-kind-binding',['targets',tid,'kind'])
        if 'name_span'in target:
            t['name']={'kind':'string','value':target['name_span']};anchor(['targets',tid,'name'],target['name_span'])
        if 'determiner'in target:t['determiner']=target['determiner']
        label['targets'].append(t)
        if target.get('fill')in ['context','previous_reply','journal_step']:unresolved('context-reference-not-bound',['targets',tid])
        for field in ['count','ordinal']:
            if field in target:unresolved('requires-declared-'+field+'-projection',['targets',tid,field])
        phase_nodes=collections.defaultdict(list)
        for ci,condition in enumerate(original.get('constraints')or []):
            cid=f'c{index}_{ci}';c={'id':cid,'target':tid};path=['constraints',cid]
            for field in ['phase','operator','character','polarity']:
                if field in condition:c[field]=condition[field]
                else:unresolved('missing-annotated-field',path+[field])
            if c.get('phase')in ['selector','result']:phase_nodes[c['phase']].append((cid,condition))
            prop=lookup('properties',area=row['world'],key=condition.get('key'))
            if prop:
                c['concept']=prop['canonical'];anchor(path+['concept'],condition.get('value_span'),prop['sourceWire'],allow_request=True)
            else:unresolved('unresolved-canonical-property-binding',path+['concept'])
            if 'value'in condition:
                representation=prop.get('valueKind')if prop else None
                if representation in ['literal','string']and isinstance(condition['value'],str):
                    c['value']={'kind':representation,'value':condition['value']};anchor(path+['value'],condition.get('value_span')or condition['value'])
                else:unresolved('unresolved-value-representation',path+['value'])
            if condition.get('operator')not in ['eq','less.equal','greater.equal','degree','region']:unresolved('requires-operator-reference-projection',path)
            if condition.get('scope')in ['each','group']:c['scope']=condition['scope']
            if 'measure'in condition and condition.get('measure')!=condition.get('value'):unresolved('requires-measure-projection',path+['measure'])
            for field in ['group','variety','step','anchor_fill','anchor_span']:
                if field in condition:unresolved('requires-declared-'+field+'-projection',path+[field])
            if 'unit'in condition:
                unit=lookup('units',lemma=condition['unit'])
                if unit:c['unit']=unit['canonical'];anchor(path+['unit'],condition.get('measure_span')or condition.get('value_span'),unit['sourceWire'])
                else:unresolved('unresolved-unit-binding',path+['unit'])
            bounds=unique_range(segment,condition.get('value_span'),base)if span else None
            if bounds:c['source']=bounds
            label['constraints'].append(c)
        selectors=phase_nodes['selector']
        if target.get('description_span')and not selectors:unresolved('description-reference-without-predicate',['targets',tid])
        if len(selectors)==1:t['selector']=selectors[0][0]
        elif len(selectors)>1:
            if bindings.get('projectionPolicy',{}).get('unmarkedConditions')=='and'and all('group'not in condition for _,condition in selectors):
                gid=f'g{index}_selector';label.setdefault('groups',[]).append({'id':gid,'operator':'and','members':[cid for cid,_ in selectors]});t['selector']=gid
            else:unresolved('selector-logical-closure-not-projected',['targets',tid,'selector'])
        if len(phase_nodes['result'])==1:label['root']=phase_nodes['result'][0][0]
        if 'question'in original:unresolved('requires-declared-query-projection',['queries'])
        if 'turn'in original:label['turn']=original['turn'];unresolved('turn-contract-not-projected',['turn'])
        quantifier=target.get('quantifier')
        if t.get('mode')=='bound'and quantifier in ['all','any','each','none']and not selectors and phase_nodes['result']and all(condition.get('scope')in [None,'each']and not any(field in condition for field in ['group','variety'])for _,condition in phase_nodes['result']):
            members=[cid for cid,_ in phase_nodes['result']];body=members[0]if len(members)==1 else None
            if body is None and bindings.get('projectionPolicy',{}).get('unmarkedConditions')=='and':
                body=f'g{index}_body';label.setdefault('groups',[]).append({'id':body,'operator':'and','members':members})
            if body:
                collection_id=f'collection{index}';collection={'id':collection_id,'mode':'existing'}
                for field in ['kind','name','determiner']:
                    if field in t:collection[field]=t.pop(field)
                for item in evidence:
                    if item['path'][:2]==['targets',tid]:item['path'][1]=collection_id
                if 'kind'not in collection:unresolved('unresolved-canonical-kind-binding',['targets',collection_id,'kind'])
                label['targets'].append(collection);qid=f'q{index}';label['quants']=[{'id':qid,'kind':quantifier,'target':collection_id,'bind':tid,'body':body}];label['root']=qid
            else:unresolved('quantifier-body-closure-not-projected',['quants'])
        elif t.get('mode')=='bound'or quantifier is not None:unresolved('quantifier-binder-not-projected',['targets',tid])
        if issues:label['unresolved']=issues
        projected.append(label);diagnostics.extend({'request':rid,**issue}for issue in issues)
    return {'source':{'text':text,'unit':'unicode-scalar'},'labels':{'has_request':bool(requests),'request_count':len(requests),'requests':projected},'complete':not diagnostics,'diagnostics':diagnostics}

def prepare(root,exclusions,out,binding_path=None):
    ids=json.loads(exclusions.read_text());assert isinstance(ids,list)and len(ids)==len(set(ids))and all(isinstance(v,str)for v in ids)
    excluded=set(ids);found=set();binding_data=json.loads(binding_path.read_text())if binding_path else {};sources=[];counts=collections.Counter();reasons=collections.Counter();out.mkdir(parents=True,exist_ok=False)
    if binding_path and binding_data.get('format')!='sop.structural-bindings/1':raise ValueError('unsupported binding export format')
    policy=binding_data.get('projectionPolicy',{})
    if policy.get('unmarkedConditions')=='and'and policy.get('sourcePromptSha256')!=sha(PROMPT):raise ValueError('conjunction policy must cite exact annotation contract')
    for family in ['kinds','properties','units']:
        for record in binding_data.get(family,[]):
            if not all(isinstance(record.get(key),str)and record[key]for key in ['canonical','sourceWire','sourceWorld','moduleVersion']):raise ValueError('binding requires canonical identity and full declaration provenance')
            if not re.fullmatch('[0-9a-f]{64}',record.get('sourceSnapshotSHA','')):raise ValueError('binding requires exact source snapshot hash')
            if family=='properties'and record.get('valueKind')not in ['literal','string','ref']:raise ValueError('valueKind must be published token kind')
    handles={split:(out/(split+'.jsonl')).open('w')for split in ['train','calibration']}
    try:
        for version in ['haiku-v1','haiku-v2']:
            for path in sorted((root/'data'/version).glob('*/*.jsonl')):
                source=path.relative_to(root).as_posix();digest=sha(path);sources.append({'path':source,'sha256':digest})
                for line_number,line in enumerate(path.read_text().splitlines(),1):
                    if not line.strip():continue
                    row=json.loads(line)
                    if row['id']in excluded:found.add(row['id']);counts['excludedRows']+=1;continue
                    split=split_for(source,row['id']);projected=project_row(row,version,binding_data)
                    record={'format':'sop.projected-structural-gold/1','targetFormat':'psys2.structural-predictions/1','executable':False,'id':source+':'+row['id'],'source_path':source,'source_id':row['id'],'source_line':line_number,'source_sha256':digest,'split':split,'world':row['world'],'context':row.get('context'),'annotations':row['requests'],**projected}
                    handles[split].write(json.dumps(record,ensure_ascii=False)+'\n');counts[split+':rows']+=1;counts[split+':requests']+=len(row['requests']);counts[split+':completeRows']+=projected['complete'];counts[split+':emptyRows']+=not bool(row['requests']);counts[split+':completeNonemptyRows']+=projected['complete']and bool(row['requests']);reasons.update(d['reason']for d in projected['diagnostics'])
    finally:
        for handle in handles.values():handle.close()
    manifest={'format':'sop.projected-structural-gold','version':1,'executable':False,'sourceAnnotationsRetained':True,'rawSupervisionField':'annotations','canonicalUnresolvedIsDistinctFromAbsence':True,'sources':sources,'exclusion':{'sha256':sha(exclusions),'requestedIds':len(excluded),'foundIds':len(found),'missingIds':sorted(excluded-found),'beforeProjection':True},'bindingsSha256':sha(binding_path)if binding_path else None,'annotationContract':{'promptPath':'training/sop-bert/specs/INSTRUCTIONS-v2.md','promptSha256':sha(PROMPT),'inventorySha256':sha(root/'data/haiku-v2/inventory.json')if(root/'data/haiku-v2/inventory.json').exists()else None},'scriptSha256':sha(Path(__file__)),'counts':dict(counts),'unresolved':dict(reasons),'outputs':{split:sha(out/(split+'.jsonl'))for split in handles},'boundary':'C1 teacher structure, not model inference or confidence. No missing semantic bindings, goals, group/binder edges or dependencies are guessed.'};(out/'manifest.json').write_text(json.dumps(manifest,indent=2,sort_keys=True)+'\n');return manifest

def main():
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--exclude-ids',type=Path,required=True);p.add_argument('--bindings',type=Path);p.add_argument('--out',type=Path,required=True);args=p.parse_args();print(json.dumps(prepare(args.root,args.exclude_ids,args.out,args.bindings),indent=2))
if __name__=='__main__':main()
