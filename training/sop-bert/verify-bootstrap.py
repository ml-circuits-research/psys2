"""Verify a completed full bootstrap against its frozen provenance; not graph validation."""
import argparse,hashlib,json,math,gzip
from pathlib import Path

def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1048576),b''):h.update(chunk)
    return h.hexdigest()

def main():
    import torch
    p=argparse.ArgumentParser();p.add_argument('--run',type=Path,required=True);p.add_argument('--exclude-ids',type=Path,required=True);args=p.parse_args()
    run=args.run;manifest=json.loads((run/'run-manifest.json').read_text());summary=json.loads((run/'summary.json').read_text())['history'][-1];data=manifest['inventoryData'];options=manifest['arguments'];root=Path(__file__).parent
    checkpoint=run/'latest.pt';state=torch.load(checkpoint,map_location='cpu',weights_only=True)
    assert int(options['limit'])==0,'limited run is not a full corpus run'
    assert summary['trainExamples']==data['pairCounts']['train']
    assert summary['calibrationPairs']==data['pairCounts']['calibration']
    assert state['steps']==summary['steps']==math.ceil(data['pairCounts']['train']/int(options['batch']))*int(options['epochs'])
    assert state['epoch']==int(options['epochs'])
    assert sha(root/'inventory-bootstrap.py')==manifest['scriptSha256']
    for source in data['sources']:assert sha(root/source['path'])==source['sha256']
    suffix='.jsonl.gz'if data.get('compression')=='gzip'else '.jsonl'
    for split,digest in data['outputs'].items():assert sha(Path(options['data'])/(split+suffix))==digest
    assert sha(args.exclude_ids)==data['exclusion']['manifestSha256']
    excluded=set(json.loads(args.exclude_ids.read_text()));audited={}
    for split in ['train','calibration']:
        count=0;path=Path(options['data'])/(split+suffix)
        with (gzip.open(path,'rt')if suffix.endswith('.gz')else path.open())as stream:
            for line in stream:
                row=json.loads(line);assert row['source_id']not in excluded;count+=1
        assert count==data['pairCounts'][split];audited[split]=count
    assert data['exclusion']['manifestSha256']and data['exclusion']['requestedIds']==data['exclusion']['foundIds']and not data['exclusion']['missingIds']
    report={'status':'verified-full-clean-auxiliary-epoch','executable':False,'graphProposal':False,'checkpointSha256':sha(checkpoint),'checkpointSteps':state['steps'],'checkpointEpoch':state['epoch'],'trainExamples':summary['trainExamples'],'calibrationPairs':summary['calibrationPairs'],'exclusionManifestSha256':data['exclusion']['manifestSha256'],'sourceFilesVerified':len(data['sources']),'exclusionRowsAudited':audited,'excludedIdOverlap':0,'scriptSha256':manifest['scriptSha256'],'verifierSha256':sha(Path(__file__)),'summary':summary}
    (run/'final-verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
if __name__=='__main__':main()
