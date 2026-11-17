"""C1 per-request/per-key mention supervision, no slot assignment or literal vocabulary."""
import argparse,ast,collections,hashlib,json
from pathlib import Path
MISSING=object()
GLOBAL={'request.request.mood':'mood','request.request.act':'act','request.target.mode':'target.mode','request.target.fill':'target.fill','request.target.determiner':'target.determiner','request.target.kind':'target.kind','request.target.name':'target.name_span','request.target.description':'target.description_span','request.target.ordinal':'target.ordinal','request.target.count':'target.count','request.logic.quantifier':'target.quantifier','request.question.ask':'question.ask','request.question.asked_key':'question.asked_key','conversation.turn.fragment':'turn.fragment','conversation.turn.objection':'turn.objection','conversation.turn.repeat_count':'turn.repeat_count','conversation.turn.area':'turn.area'}
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
def registry(inventory):
    return {f'{area}.{typ}.{key}':{**spec,'area':area,'type':typ,'key':key,'role':'global'if f'{area}.{typ}.{key}'in GLOBAL else'metadata'if f'{area}.{typ}.{key}'in META else'derived'if area in ['request','conversation']else'domain'}for area,types in inventory.items()for typ,row in types.items()for key,spec in row['keys'].items()}
def sample(row,request,reg,v1_aliases):
    text=request.get('span',row['source']['text'])if request is not None else row['source']['text'];global_values={};mentions=[];diagnostics=[];version='v2'if'haiku-v2'in row['source_path']else'v1';covered=set(reg)if version=='v2'or request is None else set();unknown_keys=set()
    def global_value(key,value,literal=None):
        if key not in reg:return
        global_values[key]={'value':value,'span':span_for(text,value,literal)};covered.add(key)
    def mention(key,value,literal,metadata):
        if key not in reg:diagnostics.append({'reason':'unmapped-raw-key','key':key});return
        bounds=span_for(text,value,literal);item={'key':key,'value':value,'span':bounds,'metadata':metadata,'trainable':bounds is not None};mentions.append(item);covered.add(key)
        if bounds is None:unknown_keys.add(key);diagnostics.append({'reason':'missing-or-ambiguous-mention-span','key':key})
    if request is not None and version=='v2':
        for key,path in GLOBAL.items():
            value=get(request,path)
            if value is MISSING:continue
            literal=get(request,'target.'+path.rsplit('.',1)[1]+'_span')if path.startswith('target.')else request.get('trigger')if path=='act'else None
            global_value(key,value,None if literal is MISSING else literal)
        for condition in request.get('constraints')or []:
            key=row['world']+'.'+condition['key'];metadata={head:condition[field]for head,field in META.items()if field in condition};mention(key,condition.get('value'),condition.get('value_span'),metadata)
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
    for i,item in enumerate(mentions):
        for other in mentions[i+1:]:
            if item['key']==other['key']and item['span']and other['span']and max(item['span'][0],other['span'][0])<min(item['span'][1],other['span'][1]):
                item['trainable']=other['trainable']=False;unknown_keys.add(item['key']);diagnostics.append({'reason':'same-key-overlap-or-identical-range','key':item['key'],'ranges':[item['span'],other['span']]})
    return {'text':text,'area':row['world'],'context':row.get('context'),'version':version,'globals':global_values,'mentions':mentions,'coveredKeys':sorted(k for k in covered if k in reg),'unknownBIOKeys':sorted(unknown_keys),'diagnostics':diagnostics,'rawRequest':request,'hasRequest':request is not None}
def prepare(corpus,inventory_path,aliases_path,out):
    inv=json.loads(inventory_path.read_text());reg=registry(inv);a=aliases(aliases_path);source_manifest=json.loads((corpus/'manifest.json').read_text());out.mkdir(parents=True,exist_ok=False);counts=collections.Counter();reasons=collections.Counter();outputs={}
    for split in ['train','calibration']:
        source=corpus/(split+'.jsonl');assert sha(source)==source_manifest['outputs'][split]
        with(out/(split+'.jsonl')).open('w')as target:
            for line in source.open():
                row=json.loads(line)
                for ri,request in enumerate(row['annotations']or[None]):
                    record=sample(row,request,reg,a);record.update({'id':row['id']+':'+str(ri),'source_id':row['source_id'],'source_path':row['source_path'],'split':split,'requestIndex':ri});target.write(json.dumps(record,ensure_ascii=False)+'\n');counts[split+':samples']+=1;counts[split+':mentions']+=len(record['mentions']);counts[split+':noRequest']+=not record['hasRequest'];reasons.update(d['reason']for d in record['diagnostics'])
        outputs[split]=sha(out/(split+'.jsonl'))
    manifest={'format':'sop.per-key-supervision/1','executable':False,'registry':reg,'inventorySha256':sha(inventory_path),'v1AliasesSha256':sha(aliases_path),'sourceManifestSha256':sha(corpus/'manifest.json'),'sourceManifest':source_manifest,'scriptSha256':sha(Path(__file__)),'counts':dict(counts),'diagnostics':dict(reasons),'outputs':outputs,'boundary':'Gold request cuts for conditional training only; runtime/full calibration uses independently predicted cutter spans. All raw requests retained; unknown version metadata/overlaps masked, never false absence.'};(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');return manifest
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--corpus',type=Path,required=True);p.add_argument('--inventory',type=Path,required=True);p.add_argument('--aliases',type=Path,required=True);p.add_argument('--out',type=Path,required=True);args=p.parse_args();print(json.dumps(prepare(args.corpus,args.inventory,args.aliases,args.out),indent=2))
