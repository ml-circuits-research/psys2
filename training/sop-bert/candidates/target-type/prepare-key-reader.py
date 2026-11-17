"""C1 per-request/per-key mention supervision, no slot assignment or literal vocabulary."""
import argparse,ast,collections,gzip,hashlib,json,shutil
from pathlib import Path
MISSING=object()
TARGET_TYPE='request.target.type'
CANDIDATE_FORMAT='sop.per-key-supervision/3-target-type-migration-candidate'
GLOBAL={'request.target.type':'target.type','request.request.mood':'mood','request.request.act':'act','request.target.mode':'target.mode','request.target.fill':'target.fill','request.target.determiner':'target.determiner','request.target.kind':'target.kind','request.target.name':'target.name_span','request.target.description':'target.description_span','request.target.ordinal':'target.ordinal','request.target.count':'target.count','request.logic.quantifier':'target.quantifier','request.question.ask':'question.ask','request.question.asked_key':'question.asked_key','conversation.turn.fragment':'turn.fragment','conversation.turn.objection':'turn.objection','conversation.turn.repeat_count':'turn.repeat_count','conversation.turn.area':'turn.area'}
META={'request.constraint.operator':'operator','request.constraint.phase':'phase','request.constraint.polarity':'polarity','request.constraint.character':'character','request.constraint.scope':'scope','request.constraint.step':'step','request.constraint.measure':'measure','request.constraint.unit':'unit','request.constraint.variety':'variety','request.logic.group':'group'}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def get(obj,path):
    for key in path.split('.'):
        if not isinstance(obj,dict)or key not in obj:return MISSING
        obj=obj[key]
    return obj
def unique(text,value,base=0):
    if not isinstance(value,str)or not value:return None
    at=text.find(value)
    return None if at<0 or text.find(value,at+1)>=0 else [base+at,base+at+len(value)]
def span_for(text,value,literal):
    outer=unique(text,literal)
    if outer and isinstance(value,str):
        inner=unique(literal,value,outer[0])
        if inner:return inner
    return outer or unique(text,value)
def aliases(path):
    result={}
    for node in ast.parse(path.read_text()).body:
        if isinstance(node,ast.Assign):
            for target in node.targets:
                if isinstance(target,ast.Name)and target.id in ['M','W','CO']:result[target.id]=ast.literal_eval(node.value)
    return result
def target_families(inventory):
    """Family names are declaration keys, never observed annotation values."""
    families={area:sorted(types) for area,types in inventory.items() if area not in ('request','conversation')}
    if not families or any(not isinstance(area,str) or not area or not names for area,names in families.items()):
        raise ValueError('invalid-domain-family-inventory')
    return families

def registry(inventory):
    reg={f'{area}.{typ}.{key}':{**spec,'area':area,'type':typ,'key':key,'role':'global'if f'{area}.{typ}.{key}'in GLOBAL else'metadata'if f'{area}.{typ}.{key}'in META else'derived'if area in ['request','conversation']else'domain'}for area,types in inventory.items()for typ,row in types.items()for key,spec in row['keys'].items()}
    if TARGET_TYPE in reg:
        raise ValueError('target-type-already-declared-requires-review')
    families=target_families(inventory)
    reg[TARGET_TYPE]={'head':'class','concept':'target.type','values':sorted({name for names in families.values() for name in names}),
                     'src':'authoritative inventory domain-family declarations','area':'request','type':'target',
                     'key':'type','role':'global','bio':False,'familiesByArea':families}
    return reg

def sample(row,request,reg,v1_aliases):
    text=request.get('span',row['source']['text'])if request is not None else row['source']['text'];global_values={};mentions=[];diagnostics=[];version='v2'if'haiku-v2'in row['source_path']else'v1';covered=set(reg)if version=='v2'or request is None else set();unknown_keys=set()
    def global_value(key,value,literal=None):
        if key not in reg:return
        global_values[key]={'value':value,'span':span_for(text,value,literal)};covered.add(key)
    def mention(key,value,literal,metadata):
        if key not in reg:diagnostics.append({'reason':'unmapped-raw-key','key':key});return
        present=value is not MISSING;bounds=span_for(text,value,literal);value=None if value is MISSING else value;item={'key':key,'value':value,'valuePresent':present,'span':bounds,'metadata':metadata,'trainable':bounds is not None};mentions.append(item);covered.add(key)
        if bounds is None:unknown_keys.add(key);diagnostics.append({'reason':'missing-or-ambiguous-mention-span','key':key})
    if request is not None and version=='v2':
        for key,path in GLOBAL.items():
            if key==TARGET_TYPE:continue
            value=get(request,path)
            if value is MISSING:continue
            literal=get(request,'target.'+path.rsplit('.',1)[1]+'_span')if path.startswith('target.')else request.get('trigger')if path=='act'else None
            global_value(key,value,None if literal is MISSING else literal)
        target_type=get(request,'target.type')
        if target_type is MISSING:
            covered.discard(TARGET_TYPE)
            diagnostics.append({'reason':'missing-v2-target-type-masked','key':TARGET_TYPE})
        elif isinstance(target_type,str) and target_type in reg[TARGET_TYPE]['familiesByArea'].get(row['world'],[]):
            # The family is structural metadata, not words occurring in the request.
            global_values[TARGET_TYPE]={'value':target_type,'span':None}
        else:
            # Preserve the original annotation in rawRequest; explicit UNKNOWN class.
            global_values[TARGET_TYPE]={'value':None,'span':None}
            diagnostics.append({'reason':'invalid-or-cross-area-target-type-unknown','key':TARGET_TYPE})
        for condition in request.get('constraints')or []:
            key=row['world']+'.'+condition['key'];metadata={head:condition[field]for head,field in META.items()if field in condition};mention(key,condition.get('value',MISSING),condition.get('value_span'),metadata)
    elif request is not None:
        answers=request['answers'];a=v1_aliases
        covered.update(a['M'].values());covered.difference_update(META);covered.discard('request.logic.negated')
        for target in a['W'].get(row['world'],{}).values():
            if target=='chart.*':covered.update(row['world']+'.chart.'+value for value in a['CO'].values())
            else:covered.add(target[1:]if target.startswith('@')else row['world']+'.'+target)
        grouped=collections.defaultdict(list)
        for name,value in answers.items():
            key=a['M'].get(name);mapped=a['W'].get(row['world'],{}).get(name)
            if key is None and mapped:
                if mapped=='chart.*':
                    if value not in a['CO']:diagnostics.append({'reason':'unmapped-v1-chart-option','key':name});continue
                    mapped='chart.'+a['CO'][value]
                key=mapped[1:]if mapped.startswith('@')else row['world']+'.'+mapped
            if name=='format'and value in ['bullets','numbered']:key='document.inline.list_kind'
            if name=='target_fill'and value=='new':
                global_value('request.target.mode','new');covered.discard('request.target.fill');diagnostics.append({'reason':'explicit-v1-new-target-mode-alignment'});continue
            if key not in reg:continue
            grouped[key].append((name,value))
        for key,items in grouped.items():
            spec=reg[key];literal_items=[(n,v)for n,v in items if n.endswith('_span')];value_items=[(n,v)for n,v in items if not n.endswith('_span')];chosen=value_items[0][1]if value_items else items[0][1];literal=literal_items[0][1]if literal_items else None
            if spec['role']=='global':global_value(key,chosen,literal)
            elif spec['role']=='domain':
                values=chosen if isinstance(chosen,list)else[chosen];spans=literal if isinstance(literal,list)else[literal]*len(values)
                for i,value in enumerate(values):mention(key,value,spans[i]if i<len(spans)else None,{})
            else:diagnostics.append({'reason':'v1-unowned-metadata-retained','key':key});covered.discard(key)
    if request is not None and version=='v1':
        covered.discard(TARGET_TYPE)
        global_values.pop(TARGET_TYPE,None)
        diagnostics.append({'reason':'v1-target-type-unknown-masked','key':TARGET_TYPE})
    for i,item in enumerate(mentions):
        for other in mentions[i+1:]:
            if item['key']==other['key']and item['span']and other['span']and max(item['span'][0],other['span'][0])<min(item['span'][1],other['span'][1]):
                item['trainable']=other['trainable']=False;unknown_keys.add(item['key']);diagnostics.append({'reason':'same-key-overlap-or-identical-range','key':item['key'],'ranges':[item['span'],other['span']]})
    return {'text':text,'area':row['world'],'context':row.get('context'),'version':version,'globals':global_values,'mentions':mentions,'coveredKeys':sorted(k for k in covered if k in reg),'unknownBIOKeys':sorted(unknown_keys),'diagnostics':diagnostics,'rawRequest':request,'hasRequest':request is not None}
def prepare(corpus,inventory_path,aliases_path,out,exclusions_path,*,max_output_bytes=134217728,
            reserve_bytes=67108864,max_record_bytes=2097152,max_decoded_bytes=1073741824):
    """Deterministic streaming gzip. Own partial outputs are removed on refusal."""
    if any(type(v)is not int or v<1 for v in (max_output_bytes,reserve_bytes,max_record_bytes,max_decoded_bytes)):
        raise ValueError('invalid-output-bounds')
    corpus,inventory_path,aliases_path,out,exclusions_path=map(Path,(corpus,inventory_path,aliases_path,out,exclusions_path))
    inputs={'inventory':inventory_path,'aliases':aliases_path,'manifest':corpus/'manifest.json',
            'exclusions':exclusions_path,'preparer':Path(__file__)}
    before={key:sha(path)for key,path in inputs.items()}
    inv=json.loads(inventory_path.read_text(encoding='utf-8'));reg=registry(inv);a=aliases(aliases_path)
    source_manifest=json.loads(inputs['manifest'].read_text(encoding='utf-8'))
    if before['exclusions']!=source_manifest.get('exclusion',{}).get('sha256'):
        raise ValueError('exclusion-hash-mismatch')
    excluded=json.loads(exclusions_path.read_text(encoding='utf-8'))
    if type(excluded)is not list or any(type(v)is not str or not v for v in excluded)or len(excluded)!=len(set(excluded)):
        raise ValueError('invalid-exclusions')
    excluded=set(excluded)
    if out.exists():raise ValueError('output-already-exists')
    out.parent.mkdir(parents=True,exist_ok=True)
    if shutil.disk_usage(out.parent).free<max_output_bytes+reserve_bytes:
        raise ValueError('insufficient-compressed-output-reserve')
    for split in ('train','calibration'):
        path=corpus/(split+'.jsonl')
        if sha(path)!=source_manifest['outputs'][split]:raise ValueError('source-output-hash-mismatch')
        inputs[split]=path;before[split]=source_manifest['outputs'][split]
    out.mkdir()
    counts=collections.Counter();reasons=collections.Counter();outputs={};data_files={};seen=set()
    try:
        encoded_total=0
        for split in ('train','calibration'):
            filename=split+'.jsonl.gz';target_path=out/filename;decoded_hash=hashlib.sha256()
            decoded_bytes=records=0
            with target_path.open('xb')as raw:
                with gzip.GzipFile(filename='',mode='wb',fileobj=raw,mtime=0,compresslevel=6)as target:
                    with inputs[split].open(encoding='utf-8')as source:
                        for line in iter(lambda:source.readline(max_record_bytes+1),''):
                            if len(line.encode('utf-8'))>max_record_bytes:raise ValueError('source-record-byte-bound')
                            row=json.loads(line)
                            identity=row['source_path']+':'+row['source_id']
                            expected='calibration'if int(hashlib.sha256(identity.encode()).hexdigest()[:8],16)%10==0 else'train'
                            if row['source_id']in excluded:raise ValueError('reserved-source-id')
                            if row['id']!=identity or row['split']!=split or expected!=split or identity in seen:
                                raise ValueError('source-identity-or-split-mismatch')
                            seen.add(identity)
                            if type(row['annotations'])is not list:raise ValueError('malformed-request-list')
                            counts[split+':sourceRows']+=1
                            for ri,request in enumerate(row['annotations']or[None]):
                                record=sample(row,request,reg,a)
                                record.update({'id':row['id']+':'+str(ri),'source_id':row['source_id'],
                                               'source_path':row['source_path'],'split':split,'requestIndex':ri})
                                encoded=(json.dumps(record,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n').encode('utf-8')
                                if len(encoded)>max_record_bytes:raise ValueError('prepared-record-byte-bound')
                                decoded_bytes+=len(encoded)
                                if decoded_bytes>max_decoded_bytes:raise ValueError('decoded-output-byte-bound')
                                decoded_hash.update(encoded);target.write(encoded);records+=1
                                if encoded_total+raw.tell()>max_output_bytes:raise ValueError('encoded-output-byte-bound')
                                if shutil.disk_usage(out).free<reserve_bytes:raise ValueError('output-reserve-exhausted')
                                counts[split+':samples']+=1;counts[split+':mentions']+=len(record['mentions'])
                                counts[split+':noRequest']+=not record['hasRequest']
                                reasons.update(d['reason']for d in record['diagnostics'])
            size=target_path.stat().st_size;encoded_total+=size
            if encoded_total>max_output_bytes:raise ValueError('encoded-output-byte-bound')
            outputs[split]=sha(target_path)
            data_files[split]={'path':filename,'encoding':'utf-8','compression':'gzip','sha256':outputs[split],
                               'decodedSha256':decoded_hash.hexdigest(),'encodedBytes':size,
                               'decodedBytes':decoded_bytes,'records':records}
        if before!={key:sha(path)for key,path in inputs.items()}:raise ValueError('preparation-input-mutated')
        manifest={'format':CANDIDATE_FORMAT,'executable':False,'candidate':True,'tensorArchitectureVersion':2,
                  'registry':reg,'targetFamilies':target_families(inv),'inventorySha256':before['inventory'],
                  'v1AliasesSha256':before['aliases'],'sourceManifestSha256':before['manifest'],
                  'sourceManifest':source_manifest,'exclusionSha256':before['exclusions'],'exclusionCount':len(excluded),
                  'scriptSha256':before['preparer'],'frozenInputs':before,'counts':dict(counts),'diagnostics':dict(reasons),
                  'outputs':outputs,'dataFiles':data_files,'gzip':{'mtime':0,'filename':'','compresslevel':6},
                  'outputBounds':{'maxEncodedBytes':max_output_bytes,'reserveBytes':reserve_bytes,
                                  'maxRecordBytes':max_record_bytes,'maxDecodedBytesPerSplit':max_decoded_bytes},
                  'boundary':'All retained source rows/request annotations; gold cuts are training-only; no subset or activation.'}
        body=(json.dumps(manifest,indent=2,sort_keys=True)+'\n').encode('utf-8')
        if encoded_total+len(body)>max_output_bytes:raise ValueError('encoded-output-byte-bound')
        if shutil.disk_usage(out).free<len(body)+reserve_bytes:raise ValueError('output-reserve-exhausted')
        (out/'manifest.json').write_bytes(body)
        return manifest
    except Exception:
        # out was created exclusively above; only this preparation owns it.
        shutil.rmtree(out)
        raise

if __name__=='__main__':
    p=argparse.ArgumentParser()
    for key in ('corpus','inventory','aliases','out','exclusions'):p.add_argument('--'+key,type=Path,required=True)
    p.add_argument('--max-output-bytes',type=int,default=134217728)
    p.add_argument('--reserve-bytes',type=int,default=67108864)
    args=p.parse_args()
    print(json.dumps(prepare(args.corpus,args.inventory,args.aliases,args.out,args.exclusions,
                            max_output_bytes=args.max_output_bytes,reserve_bytes=args.reserve_bytes),indent=2))
