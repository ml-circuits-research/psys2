"""Adapt authored phase-one source text to the existing strict cutter training loader."""
import argparse,collections,gzip,hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def prepare(source,out,exclusion,supplement_train_ids=None):
    out.mkdir(parents=True,exist_ok=False);rawroot=out/'raw';rawroot.mkdir();reserved=set(json.loads(exclusion.read_text()));supplement=set(json.loads(supplement_train_ids.read_text()))if supplement_train_ids else set();groups=collections.defaultdict(list);counts=collections.Counter()
    with gzip.open(source,'rt')as stream:
        for line in stream:
            row=json.loads(line)
            if row['phase']!='direct':counts['otherPhase']+=1;continue
            if row['source_id']in reserved:counts['reserved']+=1;continue
            groups[row['source_path']].append(row)
    sources=[]
    for relative,rows in groups.items():
        path=rawroot/relative;path.parent.mkdir(parents=True,exist_ok=True)
        with path.open('w')as stream:
            for row in rows:stream.write(json.dumps({'id':row['source_id'],'world':row['world'],'context':row['context'],'text':row['text'],'requests':row['requests']},ensure_ascii=False)+'\n')
        sources.append({'path':relative,'sha256':sha(path)})
    released_supplement=sorted(supplement&{row['source_id']for rows in groups.values()for row in rows})
    supplement_path=out/'supplement-train-ids.json';supplement_path.write_text(json.dumps(released_supplement,indent=2)+'\n')
    handles={split:(out/(split+'.jsonl')).open('w')for split in ['train','calibration']}
    try:
        for source_record in sources:
            for row in groups[source_record['path']]:
                identity=row['source_path']+':'+row['source_id'];split='calibration'if row['source_id']not in supplement and int(hashlib.sha256(identity.encode()).hexdigest()[:8],16)%10==0 else'train'
                record={'id':identity,'source_path':row['source_path'],'source_id':row['source_id'],'source_sha256':source_record['sha256'],'split':split,'source':{'text':row['text'],'unit':'unicode-scalar'},'annotations':row['requests']}
                handles[split].write(json.dumps(record,ensure_ascii=False)+'\n');counts[split]+=1
    finally:
        for stream in handles.values():stream.close()
    manifest={'format':'psys2.authored-cutter-data/1','authoringSource':str(source),'authoringSourceSha256':sha(source),'sources':sources,'outputs':{split:sha(out/(split+'.jsonl'))for split in handles},'exclusion':{'sha256':sha(exclusion)},'supplementTrainIdsSha256':sha(supplement_train_ids)if supplement_train_ids else None,'authoredTrainSupplement':{'path':supplement_path.name,'sha256':sha(supplement_path),'reason':'Owner includes newly rewritten source counterparts in TRAIN while preserving existing CAL identities'},'counts':dict(counts),'scope':'Exact authored phase-one full utterances, including ignored incidental remarks and true chatter. Raw source files here are deliberate revised data, not original Haiku labels.'}
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');return manifest
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',type=Path,default=ROOT/'data/demo-tool-profile/active.jsonl.gz');p.add_argument('--out',type=Path,required=True);p.add_argument('--exclude-ids',type=Path,default=ROOT/'data/demo-tool-profile/revised-exclusions.json');p.add_argument('--supplement-train-ids',type=Path);a=p.parse_args();m=prepare(a.source,a.out,a.exclude_ids,a.supplement_train_ids);print(json.dumps(m['counts']))
