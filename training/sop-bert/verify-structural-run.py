"""Verify frozen raw structural model provenance, never semantic or execution truth."""
import argparse,hashlib,json,math
from pathlib import Path

def sha(path):
    h=hashlib.sha256()
    with path.open('rb')as stream:
        for chunk in iter(lambda:stream.read(1048576),b''):h.update(chunk)
    return h.hexdigest()

def verify(run,excluded_path):
    import torch
    m=json.loads((run/'run-manifest.json').read_text());s=json.loads((run/'summary.json').read_text());config=json.loads((run/'model-config.json').read_text());state=torch.load(run/'latest.pt',map_location='cpu',weights_only=True);root=Path(__file__).parent;data=Path(m['arguments']['data']);excluded=set(json.loads(excluded_path.read_text()))
    assert sha(excluded_path)==m['data']['exclusion']['sha256'];assert sha(root/'train-structural.py')==m['scriptSha256'];assert sha(run/'model-config.json')==m['modelConfigSha256'];assert state['config']==config
    assert s['steps']==state['steps']==math.ceil(s['trainRows']/int(m['arguments']['batch']))*int(m['arguments']['epochs']);assert state['epoch']==int(m['arguments']['epochs'])
    for source in m['data']['sources']:assert sha(root/source['path'])==source['sha256']
    counts={};raw_hashes={}
    for split in ['train','calibration']:
        path=data/(split+'.jsonl');assert sha(path)==m['data']['outputs'][split];digest=hashlib.sha256();counts[split]=0
        for line in path.open():
            row=json.loads(line);assert row['source_id']not in excluded;assert row['split']==split
            actual='calibration'if int(hashlib.sha256((row['source_path']+':'+row['source_id']).encode()).hexdigest()[:8],16)%10==0 else'train';assert actual==split
            effective={key:row[key]for key in ['source_path','source_id','world','context','annotations']};effective['text']=row['source']['text'];digest.update((json.dumps(effective,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n').encode());counts[split]+=1
        raw_hashes[split]=digest.hexdigest()
    assert counts['train']==s['trainRows'];assert counts['calibration']==s['conditionalHeadMetrics']['count']['support']
    return {'format':'sop.structural-run-verification','version':1,'executable':False,'wholeGraphConfidence':None,'checkpointSha256':sha(run/'latest.pt'),'trainerSha256':m['scriptSha256'],'configSha256':sha(run/'model-config.json'),'runManifestSha256':sha(run/'run-manifest.json'),'summarySha256':sha(run/'summary.json'),'verifierSha256':sha(Path(__file__)),'steps':state['steps'],'epoch':state['epoch'],'rowsAudited':counts,'excludedIdOverlap':0,'exclusionSha256':sha(excluded_path),'sourceFilesVerified':len(m['data']['sources']),'effectiveRawInputAndSupervisionSha256':raw_hashes,'note':'Effective hash excludes unused canonical teacher decorations; actual source/context/raw annotations/version order retained. No graph correctness or confidence verified.'}
def main():
    p=argparse.ArgumentParser();p.add_argument('--run',type=Path,required=True);p.add_argument('--exclude-ids',type=Path,required=True);args=p.parse_args();result=verify(args.run,args.exclude_ids);(args.run/'final-verification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
if __name__=='__main__':main()
