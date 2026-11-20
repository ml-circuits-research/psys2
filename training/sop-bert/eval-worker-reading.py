"""Measure how a SOP-BERT reader bundle reads the data worker's rows (management/data-drop), on a fixed sample.

The sample (management/benchmark/worker-reading-sample-v1.jsonl) is built once: seeded and stratified by batch x tab x
class x tier from the importer's output (data/data-drop-v1/accepted.jsonl), only for batches whose folder holds a DONE marker. Labels are
the official-dataset version of each row (what the trainer sees: open values flagged, descriptions normalised), importer
labels where the build kept no copy. Each sample line keeps the labels as sampled, so later bundles are scored on identical
rows and labels (--labels current re-reads them by id from accepted.jsonl and official-dataset/ instead).

Scoring reuses the official evaluator (evaluate-demo-reader.py) twice: request cuts given (gold cuts) and full utterances
through the bundle's cutter. Rows are reported per group: `in-v8-train` (batches imported before v8) and `new` (batches
imported after v8, the generalization number), per tab, class and tier. Cuts whose labels carry `needs` or keys outside the
fixed v8 key set are "not readable yet by design" and reported separately. Never changes data, models or deployment.

    .venv/bin/python training/sop-bert/eval-worker-reading.py --bundle v8      # also: v7, active, <bundle manifest sha prefix>
writes management/benchmark/<date>-worker-reading-<bundle>/{summary.md,summary.json,cond.jsonl,cutter.jsonl}.
"""
import argparse
import collections
import contextlib
import datetime
import gzip
import hashlib
import importlib.util
import io
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[1]
WORK = REPO.parent
SC = WORK / '.session-control'
DROP = WORK / 'management' / 'data-drop'
BENCH = WORK / 'management' / 'benchmark'
SAMPLE = BENCH / 'worker-reading-sample-v1.jsonl'
ACCEPTED = ROOT / 'data' / 'data-drop-v1' / 'accepted.jsonl'
MODELS = REPO / 'docs' / 'webchat' / 'models' / 'sop-bert'
EARLY = {'pilot', 'dg-batch-01', 'dg-batch-02', 'dg-batch-03', 'dw-batch-01', 'dw-batch-02'}  # first drops; later ones are `new`
# Groups: `in-v8-train` = batches whose rows are in the v8 training split (read from the dataset commit, not assumed);
# `early-unseen` = early batches not in it (imported after the v8 dataset build); `new` = later batches.
V8_DATASET_COMMIT = '49ad0c94'  # official dataset the v8 reader was trained on
V8_REFERENCE = SC / 'official-key-run-v8' / 'model-config.json'  # fixed key set for the "not readable yet" stratum
GROUPS = ['in-v8-train', 'early-unseen', 'new']
TIERS = ['equivalent', 'complex', 'simplified', 'robustness', 'fragment']


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def norm(text):
    return ' '.join(re.findall(r"[a-z0-9']+", text.lower()))


def batch_of(row):
    return row['cohort']['recipeFamily'].split(':')[1]


def tier_of(row):
    return 'robustness' if row.get('robustness') else 'fragment' if row.get('fragment') else row.get('tier') or 'equivalent'


def class_of(row):
    classes = row['cohort'].get('classes') or []
    return classes[0] if classes else 'none'


# ---------------------------------------------------------------- sample

def v8_training():
    """(texts, batches) of the v8 training split: normalised texts of all rows and the data-drop batches it holds."""
    blob = subprocess.run(['git', '-C', str(REPO), 'show', f'{V8_DATASET_COMMIT}:official-dataset/train.jsonl.gz'], check=True, capture_output=True).stdout
    rows = [json.loads(l) for l in gzip.decompress(blob).decode().splitlines() if l.strip()]
    batches = {re.sub(r'-(diagram|drawing)-\d+$', '', r['source_id']) for r in rows if r['source'] == 'data-drop-v1'}
    return {(r['world'], norm(r['text'])) for r in rows}, batches


def accepted_rows():
    """Importer rows with a unique id: a residual row that reuses an id of its batch's bulk gets '#<text sha prefix>'."""
    rows = [json.loads(l) for l in ACCEPTED.read_text().splitlines() if l.strip()]
    counts = collections.Counter(r['id'] for r in rows)
    for r in rows:
        if counts[r['id']] > 1:
            r['id'] += '#' + hashlib.sha256(r['text'].encode()).hexdigest()[:8]
    return rows


def official_labels():
    """The worker rows as the official build wrote them (open values flagged, descriptions normalised): the labels the
    trainer sees. Keyed by importer id; the previous-message-invariance copies (other context) are kept apart by context."""
    out = collections.defaultdict(list)
    for name in ('train.jsonl.gz', 'dev.jsonl', 'test.jsonl'):
        path = REPO / 'official-dataset' / name
        with (gzip.open(path, 'rt') if name.endswith('.gz') else path.open()) as stream:
            for r in map(json.loads, stream):
                if r['source'] == 'data-drop-v1':
                    out[r['source_id']].append(r)
    return out


def with_official_labels(row, official):
    base = row['id'].split('#')[0]
    copies = [o for o in official.get(base, []) if o['text'] == row['text']]
    match = next((o for o in copies if o['context'] == row['context']), copies[0] if copies else None)
    if match is None:
        return {**row, 'labelSource': 'importer'}
    return {**row, 'requests': match['requests'], 'context': match['context'], 'labelSource': 'official-dataset', 'officialSplit': match['split']}


def build_sample(size, seed):
    signed = {p.name for p in DROP.iterdir() if p.is_dir() and (p / 'DONE').is_file()}
    rows = [r for r in accepted_rows() if batch_of(r) in signed]
    strata = collections.defaultdict(list)
    for r in rows:
        strata[(batch_of(r), r['world'], class_of(r), tier_of(r))].append(r)
    # proportional allocation (largest remainder) with at least min(2, n) rows per stratum
    total = len(rows)
    quota = {k: min(len(v), 2) for k, v in strata.items()}
    rest = size - sum(quota.values())
    exact = {k: max(0.0, len(v) * size / total - quota[k]) for k, v in strata.items()}
    for k in strata:
        quota[k] += min(len(strata[k]) - quota[k], int(exact[k]))
    left = size - sum(quota.values())
    for k in sorted(strata, key=lambda k: (-(exact[k] - int(exact[k])), k)):
        if left <= 0:
            break
        if quota[k] < len(strata[k]):
            quota[k] += 1; left -= 1
    seen, trained = v8_training()
    official = official_labels()
    out = []
    for k in sorted(strata):
        ranked = sorted(strata[k], key=lambda r: hashlib.sha256(f'{seed}:{r["id"]}'.encode()).hexdigest())
        for r in ranked[:quota[k]]:
            out.append({'id': r['id'], 'batch': k[0], 'world': k[1], 'class': k[2], 'tier': k[3],
                        'group': 'in-v8-train' if k[0] in trained else 'early-unseen' if k[0] in EARLY else 'new',
                        'textInV8Train': (r['world'], norm(r['text'])) in seen,
                        'textSha256': hashlib.sha256(r['text'].encode()).hexdigest(), 'row': with_official_labels(r, official)})
    BENCH.mkdir(parents=True, exist_ok=True)
    SAMPLE.write_text(''.join(json.dumps(s, ensure_ascii=False) + '\n' for s in out))
    meta = {'format': 'psys2.worker-reading-sample/1', 'seed': seed, 'requested': size, 'rows': len(out), 'strata': len(strata),
            'population': total, 'v8TrainedBatches': sorted(trained), 'labels': 'official-dataset rows of each worker row (as trained); importer labels where the build kept no copy',
            'labelSources': dict(collections.Counter(o['row']['labelSource'] for o in out)), 'signedBatches': sorted(signed), 'acceptedSha256': sha(ACCEPTED),
            'stratification': 'batch x tab x class (first cohort class) x tier (robustness/fragment flags as tiers); proportional, '
                              'largest remainder, at least min(2, n) per stratum; within a stratum ordered by sha256(seed:id)',
            'created': datetime.date.today().isoformat()}
    SAMPLE.with_suffix('.meta.json').write_text(json.dumps(meta, indent=2) + '\n')
    return out


# ---------------------------------------------------------------- bundles

def key_runs():
    out = {}
    for p in SC.glob('*/run.json'):
        try:
            s = json.loads(p.read_text()).get('checkpointSha256')
        except (json.JSONDecodeError, OSError):
            continue
        if s and (p.parent / 'checkpoint.pt').is_file():
            out.setdefault(s, p.parent)
    return out


def cutter_runs():
    out = {}
    for p in SC.glob('*/final-verification.json'):
        m = re.search(r'"checkpointSha256":\s*"([0-9a-f]{64})"', p.read_text())
        if m and (p.parent / 'best.pt').is_file():
            out.setdefault(m.group(1), p.parent)
    return out


def bundle_manifests():
    out = []
    for d in sorted(MODELS.iterdir()):
        m = d / 'manifest.json'
        if m.is_file():
            text = m.read_text()
            key = re.search(r'"checkpointSha256":\s*"([0-9a-f]{64})"', text.replace('\\"', '"'))
            cut = re.search(r'"cutterCheckpointSha256":\s*"([0-9a-f]{64})"', text.replace('\\"', '"'))
            out.append((d.name, key and key.group(1), cut and cut.group(1)))
    return out


def resolve(bundle, model, cutter):
    manifests = bundle_manifests()
    name = bundle
    if bundle == 'active':
        bundle = json.loads((MODELS / 'deployment.json').read_text())['manifestSha256']
    keys, cutters = key_runs(), cutter_runs()
    chosen = None
    if model:
        model = Path(model)
    elif (SC / f'official-key-run-{bundle}' / 'checkpoint.pt').is_file():
        model = SC / f'official-key-run-{bundle}'
    elif re.fullmatch(r'[0-9a-f]{6,64}', bundle):
        hits = [m for m in manifests if m[0].startswith(bundle)]
        if len(hits) != 1:
            raise SystemExit(f'bundle {bundle!r}: {len(hits)} manifests match')
        chosen = hits[0]
        if chosen[1] not in keys:
            raise SystemExit(f'bundle {bundle}: key checkpoint {chosen[1]} not found under {SC}')
        model = keys[chosen[1]]
    else:
        raise SystemExit(f'unknown bundle {bundle!r}: no {SC}/official-key-run-{bundle}, no manifest prefix; pass --model')
    key_sha = json.loads((model / 'run.json').read_text()).get('checkpointSha256')
    if chosen is None:
        chosen = next((m for m in manifests if m[1] == key_sha), None)
    if cutter:
        cutter = Path(cutter)
    elif chosen and chosen[2] in cutters:
        cutter = cutters[chosen[2]]
    else:
        cutter = None  # no packaged bundle yet (e.g. a fresh run): cutter mode is skipped unless --cutter-model is given
    return {'name': name, 'model': model, 'keyCheckpointSha256': key_sha, 'manifest': chosen[0] if chosen else None, 'cutter': cutter}


# ---------------------------------------------------------------- prepare + evaluate

def prepare(sample, out, labels):
    shared = load('shared_key_preparer', ROOT / 'prepare-key-reader.py')
    official = load('official_preparer', ROOT / 'prepare-official.py')
    inventory = json.loads((REPO / 'official-dataset' / 'inventory.json').read_text())
    registry = shared.registry(inventory)
    current = {}
    if labels == 'current':
        wanted = {s['id'] for s in sample}
        official = official_labels()
        current = {r['id']: with_official_labels(r, official) for r in accepted_rows() if r['id'] in wanted}
    authored, cuts = [], []
    for s in sample:
        raw = official.trainer_view(current.get(s['id'], s['row']), inventory)
        authored.append({'source_path': 'worker-sample', 'source_id': s['id'], 'text': raw['text'], 'requests': raw['requests'],
                         'cohort': {'family': raw['cohort']['recipeFamily'], 'operation': None}, 'world': raw['world']})
        source = {'id': s['id'], 'source_id': s['id'], 'source_path': 'worker-sample', 'source': {'text': raw['text'], 'unit': 'unicode-scalar'},
                  'world': raw['world'], 'context': raw['context'], 'annotationVersion': 'v2'}
        for index, request in enumerate(raw['requests'] or [None]):
            record = shared.sample(source, request, registry, {})
            record.update({'id': f'{s["id"]}:{index}', 'source_id': s['id'], 'source_path': 'worker-sample', 'split': 'worker',
                           'requestIndex': index, 'origin': 'data-drop-v1', 'splitGroup': raw['cohort']['recipeFamily']})
            cuts.append(record)
    out.mkdir(parents=True, exist_ok=True)
    (out / 'authored.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in authored))
    (out / 'test.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in cuts))
    (out / 'manifest.json').write_text(json.dumps({'format': 'sop.per-key-supervision/1', 'maxLength': 256, 'registry': registry,
                                                   'targetFamilies': shared.target_families(inventory),
                                                   'sources': {'worker': {'path': str(out / 'authored.jsonl'), 'sha256': sha(out / 'authored.jsonl')}},
                                                   'boundary': 'worker-reading sample; evaluation only'}) + '\n')
    return out / 'test.jsonl'


def run_evaluator(evaluator, model, cutter, prepared, out, batch_size, device):
    for p in (out, out.with_suffix('.summary.json')):
        p.unlink(missing_ok=True)
    args = argparse.Namespace(model=model, input=prepared, profile=ROOT / 'data/demo-tool-profile/profile.json', out=out,
                              coverage_reference=V8_REFERENCE if V8_REFERENCE.is_file() else None, cutter_model=cutter,
                              device=device, limit=None, batch_size=batch_size)
    with contextlib.redirect_stdout(io.StringIO()):
        summary = evaluator.evaluate(args)
    return summary, [json.loads(l) for l in out.read_text().splitlines()]


# ---------------------------------------------------------------- scoring

def pct(n, d):
    return f'{100 * n / d:.1f}' if d else '-'


class Tally:
    def __init__(self):
        self.c = collections.defaultdict(collections.Counter)

    def add(self, groups, **values):
        for g in groups:
            self.c[g]['cuts'] += 1
            for k, v in values.items():
                self.c[g][k] += int(bool(v)) if not isinstance(v, int) or isinstance(v, bool) else v


def same_meaning(evaluator, predicted, expected, registry):
    try:
        return evaluator.meaning(predicted, registry) == evaluator.meaning(expected, registry)
    except (ValueError, KeyError, TypeError):
        return False


def without_unlabelled_fill(predicted, gold):
    if not predicted or 'fill' in (gold.get('target') or {}):
        return predicted
    return {**predicted, 'target': {k: v for k, v in (predicted.get('target') or {}).items() if k != 'fill'}}


def mention_id(c):
    value = c.get('value')
    return (c['key'], str(value).lower() if value is not None else ' '.join(str(c.get('value_span') or '').lower().split()))


def key_counts(gold, pred):
    """Per constraint key: presence (key in the request), mention (key + value, or the value span when there is no value)
    and span (key + value span) TP/FP/FN over multisets."""
    out = collections.defaultdict(collections.Counter)
    gc, pc = (gold or {}).get('constraints') or [], (pred or {}).get('constraints') or []
    for tag, ident in (('m', mention_id), ('s', lambda c: (c['key'], c.get('value_span')))):
        g, p = collections.Counter(map(ident, gc)), collections.Counter(map(ident, pc))
        for key in {m[0] for m in g} | {m[0] for m in p}:
            gk = +collections.Counter({m: n for m, n in g.items() if m[0] == key})
            pk = +collections.Counter({m: n for m, n in p.items() if m[0] == key})
            tp = sum((gk & pk).values())
            out[key].update({tag + 'TP': tp, tag + 'FP': sum(pk.values()) - tp, tag + 'FN': sum(gk.values()) - tp})
            if tag == 'm':
                out[key].update({'pTP': int(bool(gk) and bool(pk)), 'pFP': int(not gk and bool(pk)), 'pFN': int(bool(gk) and not pk)})
    return out


def f1(tp, fp, fn):
    return 2 * tp / (2 * tp + fp + fn) if tp + fp + fn else None


def score(sample, cuts, cond, cutter, evaluator, reference_keys):
    meta = {s['id']: s for s in sample}
    gold = {c['id']: c for c in cuts}
    stats = {'cond': Tally(), 'cutter': Tally()}
    keys = {'all': collections.defaultdict(collections.Counter), 'new': collections.defaultdict(collections.Counter)}
    fields = {'all': collections.Counter(), 'new': collections.Counter()}
    rowlevel = {'cond': collections.defaultdict(lambda: collections.defaultdict(list)), 'cutter': collections.defaultdict(lambda: collections.defaultdict(list))}
    reg_cache = {}
    for mode, results in (('cond', cond), ('cutter', cutter or [])):
        for r in results:
            s = meta[r['source_id']]; g = gold[r['id']]; raw = g['rawRequest'] or {}
            has_needs = bool(raw.get('needs'))
            unknown = sorted({m['key'] for m in g['mentions']} - reference_keys) if reference_keys else r['missingReferenceKeys']
            readable = not has_needs and not unknown
            groups = ['all', s['group'], f'{s["group"]}|{"readable" if readable else "not-readable"}', 'readable' if readable else 'not-readable',
                      f'tab:{s["world"]}', f'tab:{s["world"]}|{s["group"]}', f'tier:{s["tier"]}', f'tier:{s["tier"]}|{s["group"]}',
                      f'class:{s["class"]}', f'batch:{s["batch"]}']
            area = s['world']
            if area not in reg_cache:
                reg_cache[area] = {k.split('.', 1)[1]: v for k, v in REGISTRY.items() if v['role'] == 'domain' and v['area'] == area}
            stripped = {k: v for k, v in raw.items() if k != 'needs'}
            known_exact = same_meaning(evaluator, r['prediction'], stripped, reg_cache[area]) if has_needs else bool(r['intentExact'])
            # diagnostic: worker labels often leave target.fill out where the reader writes one; ignore the reader's fill then
            lenient = same_meaning(evaluator, without_unlabelled_fill(r['prediction'], raw), stripped, reg_cache[area])
            stats[mode].add(groups, intent=r['intentExact'], complete=r['completeReaderMeaningExact'], spans=r['sourceSpansExact'],
                            seg=bool(r.get('segmentationExact')), needs=has_needs, readable=readable, unknown=bool(unknown),
                            knownPartExact=known_exact, intentLenient=lenient and not has_needs, knownPartLenient=lenient)
            rowlevel[mode][s['group']][r['source_id']].append(bool(r['intentExact']))
            rowlevel[mode]['all'][r['source_id']].append(bool(r['intentExact']))
            if mode == 'cond':
                for key, c in key_counts(raw, r['prediction']).items():
                    keys['all'][key].update(c)
                    if s['group'] == 'new':
                        keys['new'][key].update(c)
                fields['all'].update(d for d in r['intentDifferences'] if not d.startswith('needs'))
                if s['group'] == 'new':
                    fields['new'].update(d for d in r['intentDifferences'] if not d.startswith('needs'))
    rows = {mode: {g: (sum(all(v) for v in ids.values()), len(ids)) for g, ids in by.items()} for mode, by in rowlevel.items()}
    return stats, keys, fields, rows


REGISTRY = {}


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--bundle', default='v8', help='v8, v7, active, official-key-run-<id> suffix, or a bundle manifest sha prefix')
    p.add_argument('--model', help='key-reader run directory (overrides the bundle lookup)')
    p.add_argument('--cutter-model', help='cutter run directory (overrides the bundle lookup)')
    p.add_argument('--labels', choices=['frozen', 'current'], default='frozen', help='labels as sampled, or re-read by id from accepted.jsonl')
    p.add_argument('--rebuild-sample', action='store_true', help='rebuild the fixed sample (changes the baseline!)')
    p.add_argument('--size', type=int, default=3000)
    p.add_argument('--seed', type=int, default=20261120)
    p.add_argument('--batch-size', type=int, default=64)
    p.add_argument('--device', default='cuda')
    p.add_argument('--date', default=datetime.date.today().isoformat())
    p.add_argument('--rescore', action='store_true', help='reuse cond/cutter predictions already in the output folder')
    a = p.parse_args()
    os.environ.setdefault('HF_HOME', str(SC / 'hf-cache'))
    sample = build_sample(a.size, a.seed) if a.rebuild_sample or not SAMPLE.is_file() else [json.loads(l) for l in SAMPLE.read_text().splitlines()]
    bundle = resolve(a.bundle, a.model, a.cutter_model)
    out = BENCH / f'{a.date}-worker-reading-{a.bundle}'
    prepared = prepare(sample, out / 'prepared', a.labels)
    REGISTRY.update(json.loads((out / 'prepared' / 'manifest.json').read_text())['registry'])
    evaluator = load('demo_reader_evaluator', ROOT / 'evaluate-demo-reader.py')
    reference_keys = set(json.loads(V8_REFERENCE.read_text())['keys']) if V8_REFERENCE.is_file() else None
    def reader(name, cutter_model):
        path = out / f'{name}.jsonl'
        if a.rescore and path.is_file():  # score the predictions of an earlier run of this bundle again
            return json.loads(path.with_suffix('.summary.json').read_text()), [json.loads(l) for l in path.read_text().splitlines()]
        return run_evaluator(evaluator, bundle['model'], cutter_model, prepared, path, a.batch_size, a.device)
    cond_summary, cond = reader('cond', None)
    cut_summary, cutter = reader('cutter', bundle['cutter']) if bundle['cutter'] else (None, None)
    cuts = [json.loads(l) for l in prepared.read_text().splitlines()]
    stats, keys, fields, rows = score(sample, cuts, cond, cutter, evaluator, reference_keys)
    write_report(out, a, bundle, sample, stats, keys, fields, rows, cond_summary, cut_summary)
    print(out / 'summary.md')


def write_report(out, a, bundle, sample, stats, keys, fields, rows, cond_summary, cut_summary):
    S, C = stats['cond'].c, stats['cutter'].c
    groups = collections.Counter(s['group'] for s in sample)
    seen = collections.Counter((s['group'], s['textInV8Train']) for s in sample)
    L = [f'# Worker-row reading: bundle {bundle["name"]}', '',
         f'Date {a.date}. Key reader `{bundle["model"]}` (checkpoint {bundle["keyCheckpointSha256"][:12]}, bundle manifest '
         f'{(bundle["manifest"] or "none")[:12]}), cutter `{bundle["cutter"]}`. Labels: {a.labels}.',
         f'Sample `management/benchmark/worker-reading-sample-v1.jsonl`: {len(sample)} rows, {S["all"]["cuts"]} request cuts. Groups: '
         + ', '.join(f'{g} {groups[g]} rows (text in the v8 training split {seen[(g, True)]})' for g in GROUPS) + '. '
         f'`in-v8-train` = batches in the v8 training split ({V8_DATASET_COMMIT}: {", ".join(sorted({s["batch"] for s in sample if s["group"] == "in-v8-train"}))}); '
         '`early-unseen` = dg-batch-02/03, dw-batch-01/02 (imported after the v8 dataset build); `new` = dg-batch-04/05, dw-batch-03/04. '
         'pilot has no DONE marker and is not sampled.',
         'Evaluator: `evaluate-demo-reader.py` (official), gold cuts ("cond") and full utterances through the cutter ("cutter"). '
         'Cuts are "not readable yet" when their labels carry `needs` or keys outside the fixed v8 key set; they stay in the totals.',
         'Rerun: `.venv/bin/python training/sop-bert/eval-worker-reading.py --bundle <id>` (from psys2/).', '',
         '## Headline (per request cut, %)', '',
         '| group | cuts | intent exact (cond) | complete meaning (cond) | spans exact (cond) | intent (cutter) | complete (cutter) | segmentation | utterances all cuts intent exact (cond) | intent, unlabelled fill ignored (cond) |',
         '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
    order = ['all', 'in-v8-train', 'early-unseen', 'new', 'readable', 'not-readable'] + [f'{g}|{r}' for r in ('readable', 'not-readable') for g in GROUPS]
    for g in order:
        s, c = S[g], C[g]
        if not s['cuts']:
            continue
        rw = rows['cond'].get(g)
        L.append(f'| {g} | {s["cuts"]} | {pct(s["intent"], s["cuts"])} | {pct(s["complete"], s["cuts"])} | {pct(s["spans"], s["cuts"])} | '
                 f'{pct(c["intent"], c["cuts"])} | {pct(c["complete"], c["cuts"])} | {pct(c["seg"], c["cuts"])} | {pct(*rw) if rw else "-"} | {pct(s["intentLenient"], s["cuts"])} |')
    L += ['', '## Not readable yet by design (cond)', '', '| group | cuts | with needs | keys outside v8 | known part exact (needs removed from gold) | known part, unlabelled fill ignored |', '| --- | ---: | ---: | ---: | ---: | ---: |']
    for g in ['not-readable'] + [f'{g}|not-readable' for g in GROUPS]:
        s = S[g]
        if s['cuts']:
            L.append(f'| {g} | {s["cuts"]} | {s["needs"]} | {s["unknown"]} | {pct(s["knownPartExact"], s["cuts"])} | {pct(s["knownPartLenient"], s["cuts"])} |')
    for title, prefix in [('Per tab', 'tab:'), ('Per tier', 'tier:')]:
        L += ['', f'## {title} (cond intent / complete, cutter intent, %)', '', '| stratum | cuts | intent | complete | readable share | intent (new only) | complete (new only) | cutter intent |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
        names = sorted({g.split('|')[0] for g in S if g.startswith(prefix)}, key=lambda g: (TIERS.index(g[5:]) if g[5:] in TIERS else 9, g))
        for g in names:
            s, n, c = S[g], S[g + '|new'], C[g]
            L.append(f'| {g[len(prefix):]} | {s["cuts"]} | {pct(s["intent"], s["cuts"])} | {pct(s["complete"], s["cuts"])} | '
                     f'{pct(s["readable"], s["cuts"])} | '
                     f'{pct(n["intent"], n["cuts"])} | {pct(n["complete"], n["cuts"])} | {pct(c["intent"], c["cuts"])} |')
    L += ['', '## Per class (cond, %)', '', '| class | cuts | intent | complete | with needs |', '| --- | ---: | ---: | ---: | ---: |']
    for g in sorted((g for g in S if g.startswith('class:')), key=lambda g: -S[g]['cuts']):
        s = S[g]
        L.append(f'| {g[6:]} | {s["cuts"]} | {pct(s["intent"], s["cuts"])} | {pct(s["complete"], s["cuts"])} | {pct(s["needs"], s["cuts"])} |')
    L += ['', '## Per batch (cond, %)', '', '| batch | cuts | intent | complete |', '| --- | ---: | ---: | ---: |']
    for g in sorted(g for g in S if g.startswith('batch:')):
        s = S[g]
        L.append(f'| {g[6:]} | {s["cuts"]} | {pct(s["intent"], s["cuts"])} | {pct(s["complete"], s["cuts"])} |')
    L += ['', '## Per constraint key (cond; presence = key in the request, mention = key + value (span when no value), span = key + value span)', '',
          '| key | gold mentions | presence F1 | mention F1 | mention F1 (new) | span F1 | FN | FP |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
    K, KN = keys['all'], keys['new']
    top = sorted(K, key=lambda k: -(K[k]['mTP'] + K[k]['mFN']))[:30]
    fmt = lambda v: f'{100 * v:.1f}' if v is not None else '-'
    for k in top:
        c, n = K[k], KN.get(k, collections.Counter())
        L.append(f'| {k} | {c["mTP"] + c["mFN"]} | {fmt(f1(c["pTP"], c["pFP"], c["pFN"]))} | {fmt(f1(c["mTP"], c["mFP"], c["mFN"]))} | '
                 f'{fmt(f1(n["mTP"], n["mFP"], n["mFN"]))} | {fmt(f1(c["sTP"], c["sFP"], c["sFN"]))} | {c["mFN"]} | {c["mFP"]} |')
    failing = sorted((k for k in K if K[k]['mTP'] + K[k]['mFN'] >= 15), key=lambda k: -(K[k]['mFN'] + K[k]['mFP']))[:15]
    L += ['', '## Top failing keys (most mention errors, support >= 15)', '', '| key | support | mention F1 | FN | FP |', '| --- | ---: | ---: | ---: | ---: |']
    for k in failing:
        c = K[k]
        L.append(f'| {k} | {c["mTP"] + c["mFN"]} | {fmt(f1(c["mTP"], c["mFP"], c["mFN"]))} | {c["mFN"]} | {c["mFP"]} |')
    L += ['', '## Most frequent intent field differences (cond, needs excluded)', '', '| field | cuts (all) | cuts (new) |', '| --- | ---: | ---: |']
    for f, n in fields['all'].most_common(20):
        L.append(f'| {f} | {n} | {fields["new"][f]} |')
    (out / 'summary.md').write_text('\n'.join(L) + '\n')
    (out / 'summary.json').write_text(json.dumps({
        'bundle': {k: str(v) if isinstance(v, Path) else v for k, v in bundle.items()}, 'labels': a.labels, 'sampleSha256': sha(SAMPLE),
        'cond': {g: dict(v) for g, v in S.items()}, 'cutter': {g: dict(v) for g, v in C.items()},
        'rowsAllCutsIntentExact': {m: {g: list(v) for g, v in r.items()} for m, r in rows.items()},
        'keys': {g: {k: dict(v) for k, v in kk.items()} for g, kk in keys.items()}, 'intentFieldDifferences': {g: dict(v) for g, v in fields.items()},
        'evaluator': {'cond': {k: cond_summary.get(k) for k in ('counts', 'checkpointSha256', 'decoderSourceSha256', 'trainerSourceSha256', 'seconds')},
                      'cutter': {k: cut_summary.get(k) for k in ('counts', 'cutterCheckpointSha256', 'seconds')} if cut_summary else None}}, indent=1) + '\n')


if __name__ == '__main__':
    main()
