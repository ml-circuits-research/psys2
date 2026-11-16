"""Read-only structural evidence inventory; never manufactures request graph gold."""
import argparse,collections,hashlib,json
from pathlib import Path

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def split_for(source,row_id):return 'calibration'if int(hashlib.sha256((source+':'+row_id).encode()).hexdigest()[:8],16)%10==0 else 'train'
def type_name(value):return 'null'if value is None else 'boolean'if isinstance(value,bool)else 'integer'if isinstance(value,int)else 'number'if isinstance(value,float)else 'string'if isinstance(value,str)else 'array'if isinstance(value,list)else 'object'
def occurrences(text,needle):
    if not isinstance(needle,str)or not needle:return 0
    count=0;start=0
    while True:
        at=text.find(needle,start)
        if at<0:return count
        count+=1;start=at+1

def audit(root,exclusion_path):
    raw=json.loads(exclusion_path.read_text())
    if not isinstance(raw,list)or any(not isinstance(x,str)for x in raw)or len(set(raw))!=len(raw):raise ValueError('exclusions must be unique string IDs')
    excluded=set(raw);found=set();sources=[];stats={};excluded_counts=collections.Counter()
    structural_names={'id','request_id','target_id','constraint_id','owner','request','target_ref','root','selector','result','member','members','bind','body','of','goal','after','group_id','group_ref','quantifier_id','quantifier_ref'}
    def group(split,version,area):
        key=split+':'+version+':'+area
        if key not in stats:stats[key]={'counts':collections.Counter({k:0 for k in ['rows','requests','emptyRequestRows','requestObjectsWithExplicitId','targetObjectsWithExplicitId','constraintObjectsWithExplicitId','explicitSourceCoordinateFields','nestedTargetObjects','nestedConstraintObjects','requestsWithSelectorAndResultPhase','constraintTypePrefixEqualsTargetType','constraintTypePrefixDiffersFromTargetType']}),'paths':collections.defaultdict(collections.Counter),'requestCountHistogram':collections.Counter(),'constraintCountHistogram':collections.Counter(),'phases':collections.Counter(),'groups':collections.Counter(),'quantifiers':collections.Counter(),'scopes':collections.Counter(),'operators':collections.Counter(),'anchorFill':collections.Counter(),'units':collections.Counter(),'questionOperations':collections.Counter(),'structuralFieldNames':collections.Counter(),'spanEvidence':collections.Counter()}
        return stats[key]
    for version in ['haiku-v1','haiku-v2']:
        for path in sorted((root/'data'/version).glob('*/*.jsonl')):
            source=path.relative_to(root).as_posix();sources.append({'path':source,'sha256':sha(path)})
            for line in path.read_text().splitlines():
                if not line.strip():continue
                row=json.loads(line)
                if row['id']in excluded:found.add(row['id']);excluded_counts[version+':'+row['world']]+=1;continue
                split=split_for(source,row['id']);g=group(split,version,row['world']);g['counts']['rows']+=1
                def walk(value,path):
                    g['paths'][path][type_name(value)]+=1
                    if isinstance(value,dict):
                        for key,item in value.items():walk(item,path+'.'+key)
                    elif isinstance(value,list):
                        for item in value:walk(item,path+'[]')
                walk(row,'row')
                requests=row.get('requests')
                if not isinstance(requests,list):g['counts']['malformedRequestLists']+=1;continue
                g['requestCountHistogram'][str(len(requests))]+=1;g['counts']['emptyRequestRows']+=not bool(requests)
                for request in requests:
                    g['counts']['requests']+=1
                    if not isinstance(request,dict):g['counts']['malformedRequests']+=1;continue
                    target=request.get('target');constraints=request.get('constraints')or []
                    g['counts']['requestObjectsWithExplicitId']+=any(k in request for k in ['id','request_id'])
                    if isinstance(target,dict):
                        g['counts']['nestedTargetObjects']+=1;g['counts']['targetObjectsWithExplicitId']+=any(k in target for k in ['id','target_id'])
                        if 'quantifier'in target:g['quantifiers'][json.dumps(target['quantifier'],sort_keys=True)]+=1
                    if isinstance(constraints,list):
                        g['constraintCountHistogram'][str(len(constraints))]+=1;phases=set()
                        for constraint in constraints:
                            if not isinstance(constraint,dict):g['counts']['malformedConstraints']+=1;continue
                            g['counts']['nestedConstraintObjects']+=1;g['counts']['constraintObjectsWithExplicitId']+=any(k in constraint for k in ['id','constraint_id'])
                            if isinstance(target,dict)and isinstance(target.get('type'),str)and isinstance(constraint.get('key'),str):
                                same=constraint['key'].split('.')[0]==target['type'];g['counts']['constraintTypePrefixEqualsTargetType'if same else 'constraintTypePrefixDiffersFromTargetType']+=1
                            for field,destination in [('phase','phases'),('group','groups'),('scope','scopes'),('operator','operators'),('anchor_fill','anchorFill'),('unit','units')]:
                                if field in constraint:g[destination][json.dumps(constraint[field],sort_keys=True)]+=1
                            if isinstance(constraint.get('phase'),str):phases.add(constraint['phase'])
                        g['counts']['requestsWithSelectorAndResultPhase']+=phases.issuperset({'selector','result'})
                    else:g['counts']['malformedConstraintLists']+=1
                    def evidence(value,path):
                        if isinstance(value,dict):
                            for key,item in value.items():
                                field=path+'.'+key
                                if key in structural_names:g['structuralFieldNames'][field+':'+type_name(item)]+=1
                                if key=='span'or key.endswith('_span'):
                                    g['spanEvidence'][field+':'+type_name(item)]+=1
                                    if isinstance(item,str)and isinstance(row.get('text'),str):
                                        n=occurrences(row['text'],item);g['spanEvidence'][field+':matchesInRow='+('0'if not n else '1'if n==1 else 'many')]+=1
                                if key in ['source.start','source.end','source_start','source_end']:g['counts']['explicitSourceCoordinateFields']+=1
                                evidence(item,field)
                        elif isinstance(value,list):
                            for item in value:evidence(item,path+'[]')
                    evidence(request,'request')
                    question=request.get('question')
                    if isinstance(question,dict)and 'ask'in question:g['questionOperations'][json.dumps(question['ask'],sort_keys=True)]+=1
    return {'format':'sop.structural-supervision-audit','version':1,'executable':False,'graphGoldGenerated':False,'sources':sources,'sourceManifestSha256':hashlib.sha256(json.dumps(sources,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'exclusion':{'sha256':sha(exclusion_path),'requestedIds':len(excluded),'foundIds':len(found),'missingIds':sorted(excluded-found),'excludedRowsBySourceFamily':dict(excluded_counts),'beforeAnnotationWalk':True},'split':'sha256(source-relative-path + colon + row.id), first8hex mod10 == 0 means calibration','groups':stats,'auditScriptSha256':sha(Path(__file__)),'interpretationBoundary':'Records nested containment, list positions, literal spans, scalar phase/group/quantifier labels and explicit structural field names as supplied. No canonical node identities, ref edges, binder scope or numeric source coordinates are inferred. Field names and unequal raw property-type prefixes are evidence for separate semantic review, not proof of canonical graph meaning or annotation error.'}

def main():
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--exclude-ids',type=Path,required=True);p.add_argument('--out',type=Path,required=True);args=p.parse_args();result=audit(args.root,args.exclude_ids);args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(json.dumps(result,indent=2,sort_keys=True)+'\n')
if __name__=='__main__':main()
