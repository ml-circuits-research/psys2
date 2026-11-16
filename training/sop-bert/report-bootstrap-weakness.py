"""Rank frozen auxiliary classification errors; declares no acceptance gate."""
import argparse,hashlib,json,shlex
from pathlib import Path

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def rank(metrics):
    values=[metrics[k]for k in ['positivePrecision','positiveRecall']if metrics[k]is not None]
    return min(values)if values else 2

def report(calibration,inventory,run_manifest):
    cal_container=json.loads(calibration.read_text());cal=cal_container.get('calibration',cal_container);inv=json.loads(inventory.read_text());run_container=json.loads(run_manifest.read_text());run=run_container.get('activeRun',run_container)
    assert sha(inventory)==run['inventoryData']['inventorySha256']
    assert hashlib.sha256((json.dumps(run,indent=2)+'\n').encode()).hexdigest()==cal['runManifestSha256']
    mapping={f'{area}.{typ}.{key}':spec['concept']for area,types in inv.items()for typ,row in types.items()for key,spec in row['keys'].items()}
    lines=['# Frozen auxiliary concept error ranking','', 'Ranking only: no accuracy/precision/recall acceptance threshold has been declared. These are oracle-field-instance-conditioned candidate predictions, not independent concept output heads, graph accuracy or calibrated request confidence. Lower minimum defined positive precision/recall appears first; support and FP/FN remain visible. Zero-support keys are uncalibrated, not passed.','',f"Checkpoint: `{cal['checkpointSha256']}`.",f"Calibration data: `{cal['dataSha256']}`.",f"Calibration container: `{sha(calibration)}`.",f"Inventory: `{sha(inventory)}`.",f"Report script: `{sha(Path(__file__))}`.",'','| Rank | Concept | Pairs | Positive support | TP | FP | FN | Precision | Recall | Per-key FP/FN context |','|---:|---|---:|---:|---:|---:|---:|---:|---:|---|']
    def pct(value):return 'unscored'if value is None else f'{100*value:.2f}%'
    for index,(concept,metrics)in enumerate(sorted(cal['concepts'].items(),key=lambda pair:(rank(pair[1]),pair[0])),1):
        for metric in ['pairs','positivePairs','tp','fp','fn','tn']:
            assert sum(m[metric]for key,m in cal['keys'].items()if mapping.get(key)==concept)==metrics[metric]
        context='; '.join(f"`{key}` {m['fp']}/{m['fn']} (n={m['pairs']})"for key,m in sorted(cal['keys'].items())if mapping.get(key)==concept)
        lines.append(f"| {index} | `{concept}` | {metrics['pairs']} | {metrics['positivePairs']} | {metrics['tp']} | {metrics['fp']} | {metrics['fn']} | {pct(metrics['positivePrecision'])} | {pct(metrics['positiveRecall'])} | {context} |")
    lines+=['','Uncalibrated key support: '+', '.join('`'+key+'`'for key in cal['unsupportedCalibrationKeys'])+'.','', 'This ranking prioritizes annotation/error inspection and broad concept-family data work. It does not identify individual failed sentences, establish a deployable threshold, or authorize excluding difficult rows. Quantized/browser metrics and functional-class outcomes remain separate.']
    lines+=['','Reproduce:','','```sh','python3 training/sop-bert/report-bootstrap-weakness.py --calibration '+shlex.quote(str(calibration))+' --inventory '+shlex.quote(str(inventory))+' --run-manifest '+shlex.quote(str(run_manifest))+' --out ../.session-control/bootstrap-concept-errors.md','```']
    return '\n'.join(lines)+'\n'

def main():
    p=argparse.ArgumentParser();p.add_argument('--calibration',type=Path,required=True);p.add_argument('--inventory',type=Path,required=True);p.add_argument('--run-manifest',type=Path,required=True);p.add_argument('--out',type=Path,required=True);args=p.parse_args();args.out.write_text(report(args.calibration,args.inventory,args.run_manifest))
if __name__=='__main__':main()
