#!/usr/bin/env python3
"""Import the Diagram/Drawing data drops (management/data-drop/<batch>/*.jsonl, format of
management/DATA-REQUEST-diagram-drawing.md) into this folder for official-dataset/build.py.

A batch is imported only when its DONE marker file exists and matches its files (see signed()); imported batches are
frozen (frozen/<batch>.jsonl) and never re-read. Per batch: normalise the few request-format differences to the trainer's label inventory (act ask -> answer, operator count -> eq on
node.n / drawn.count; determiners and `needs` are kept as written),
validate every row (world, request fields, label banks and keys of the merged inventory, verbatim spans, references present
in context.existing, official Validator and row conversions, duplicates against the official dataset and earlier drops) and
write management/data-drop/<batch>/FEEDBACK.md (accepted/rejected counts with reasons and examples, normalisations).
Accepted rows of all batches go to accepted.jsonl (source `data-drop-v1` of the official build); `needs` of all batches are
summarised in management/data-drop/NEEDS-SUMMARY.md for the compilation stream. Deterministic; re-run after every drop:
    python3 import.py && python3 ../../../../official-dataset/build.py
"""
import collections
import copy
import gzip
import hashlib
import importlib.util
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
DROP = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else REPO.parent / 'management' / 'data-drop'
sys.path.insert(0, str(REPO / 'training' / 'sop-bert' / 'data' / 'ui-diagram-v2'))
from engine import merged_inventory  # noqa: E402  (official inventory + the Diagram keys of ui-diagram-v2)

spec = importlib.util.spec_from_file_location('official_build', REPO / 'official-dataset' / 'build.py')
official = importlib.util.module_from_spec(spec)
spec.loader.exec_module(official)
INVENTORY = merged_inventory()
for _area, _types in json.loads((HERE / 'inventory.json').read_text()).items():  # keys only the drops use so far (drawn.facing)
    for _typ, _definition in _types.items():
        INVENTORY.setdefault(_area, {}).setdefault(_typ, {'keys': {}})['keys'].update(_definition['keys'])
INV = official.Inventory(INVENTORY)
VALIDATOR = official.Validator(INV)
_, LEMMAS = official.kind_vocabulary()
WORLDS = {'diagram', 'drawing'}
DETERMINERS = {'definite': 'definite', 'indefinite': 'indefinite', 'demonstrative': 'definite', 'possessive': 'definite', 'quantified': 'definite'}
SLOT_ID = re.compile(r'\b(?:[a-z]+_[a-z_]+|chart:\d+|seg-\d+)\b')
REF_KEYS = {'node.ids', 'link.ids', 'group.id', 'group.ids', 'drawn.ids', 'drawn.id', 'drawn.anchor', 'node.anchor', 'chart.id'}  # part.owner may name a part of an object ("the roof")
POPULATION = re.compile(r'\b(all|every|each|everything|them|these|those|it|its|this|that|selected|selection|one|ones|both|other|others|rest|her|him|his|she|he|they|their)\b', re.I)
WRAP = re.compile(r"^(hey|please|quick one|hmm|one more thing|ok|okay|so|um|uh|can you|could you|would you)[,:—\- ]+|[,— ]+(please|thanks|thank you|go on|if you can|cheers|pls)[.!?]*$", re.I)
QUAL = {'some', 'a few', 'few', 'several', 'many', 'lots', 'a lot of', 'a couple of', 'more', 'a handful of'}


def norm(t):
    return ' '.join(re.findall(r"[a-z0-9']+", t.lower()))


def official_texts():
    seen = set()
    for p in ('train.jsonl.gz', 'dev.jsonl', 'test.jsonl'):
        path = REPO / 'official-dataset' / p
        with (gzip.open(path, 'rt') if p.endswith('.gz') else open(path)) as s:
            for line in s:
                o = json.loads(line)
                if o['source'] != 'data-drop-v1':
                    seen.add((o['world'], norm(o['text'])))
    return seen


def one_edit(a, b):
    if abs(len(a) - len(b)) > 1 or min(len(a), len(b)) < 4:
        return False
    if len(a) == len(b):
        d = [i for i in range(len(a)) if a[i] != b[i]]
        return len(d) == 1 or (len(d) == 2 and d[1] == d[0] + 1 and a[d[0]] == b[d[1]] and a[d[1]] == b[d[0]])
    if len(a) > len(b):
        a, b = b, a
    return any(b[:i] + b[i + 1:] == a for i in range(len(b)))


def ref_in_context(surface, existing):
    low = re.sub(r'^(the|a|an|this|that|these|those|my|our)\s+', '', surface.lower().strip(' "\'')).strip()
    if not low or POPULATION.search(low):
        return True
    words = set(re.findall(r'[a-z0-9?]+', low))
    for e in existing:
        for f in ('name', 'kind', 'id'):
            v = str(e.get(f, '')).lower()
            if v and (v == low or low in v or v in low or (words & set(re.findall(r'[a-z0-9?]+', v)) - {'the', 'a', 'of', 'to'})):
                return True
            if v and any(one_edit(w, x) for w in words for x in re.findall(r'[a-z0-9?]+', v)):
                return True  # a typo of a visible name ("Chek" for Check)
    return False


def split_merged(needs, text, stats):
    """'drawn.action+part.owner' with value 'hold; girl' and one span -> one entry per frame."""
    out = []
    for n in needs:
        if isinstance(n, dict) and '+' in str(n.get('frame', '')):
            frames = str(n['frame']).split('+')
            values = [v.strip() for v in str(n.get('value', '')).split(';')]
            stats['merged needs frame split ("a+b" -> a, b)'] += 1
            for i, f in enumerate(frames):
                v = values[i] if i < len(values) else None
                span = n.get('span') if (v and n.get('span') and v.lower() in str(n['span']).lower()) or f.endswith('owner') else \
                    (v if v and re.search(r'(?<!\w)' + re.escape(v) + r'(?!\w)', text, re.I) else None)
                out.append({'frame': f, 'value': v, 'span': span})
        else:
            out.append(n)
    return out


FACING_CUE = re.compile(r'\b(facing|faces|face|faced|looking|looks|look|turned|turn|turns|oriented|staring|gazing|glancing|pointed|aimed)\b(?:\W+\w+){0,2}\W+$', re.I)
MOTION_CUE = re.compile(r'\b(move|moves|moving|drive|drives|driving|run|runs|running|walk|walks|walking|slide|go|goes|going|head|heads|heading|fly|flies|flying|swim|swims|swimming|shift|push|drag|nudge|travel|travels)\b(?:\W+\w+){0,3}\W+$', re.I)


def facing_keys(world, q, stats):
    """A static orientation ("a dog facing left", "turned to the left") is drawn.facing; motion or pointing stays drawn.direction;
    when the words around the value say neither, the worker's label stays."""
    if world != 'drawing':
        return
    span = q.get('span') or ''
    for c in q.get('constraints') or []:
        if c.get('key') != 'drawn.direction' or c.get('value') not in ('left', 'right') or not isinstance(c.get('value_span'), str):
            continue
        at = span.find(c['value_span'])
        before = span[:at] if at >= 0 else ''
        if FACING_CUE.search(before) and not MOTION_CUE.search(before):
            c['key'] = 'drawn.facing'; stats['drawn.direction in a static sense (facing/looking/turned) -> drawn.facing'] += 1


def needs_to_keys(world, q, needs, stats):
    """Needs whose meaning has a declared key become that constraint (the worker's recurring frames); the rest stay needs."""
    span = q.get('span') or ''
    keep = []
    for n in split_merged(needs, span, stats):
        if not isinstance(n, dict):
            keep.append(n); continue
        frame, value, nspan = n.get('frame'), n.get('value'), n.get('span')
        if frame == 'drawn.emotion':
            frame = n['frame'] = 'drawn.expression'; stats['needs drawn.emotion folded into drawn.expression'] += 1
            if n.get('cause'):
                keep.append({'frame': 'drawn.expression.cause', 'value': n.pop('cause'), 'span': None})
        def place(surface):
            return isinstance(surface, str) and surface and bool(official.find_all(span, surface) or surface in span)
        c = None
        if world == 'drawing' and frame == 'drawn.becomes' and value:
            surface = value if place(value) else nspan
            if place(surface):
                c = {'key': 'drawn.kind', 'value': value, 'value_span': surface, 'operator': 'eq', 'phase': 'result'}
        elif world == 'drawing' and frame == 'part.owner' and place(nspan):
            c = {'key': 'part.owner', 'value': nspan, 'value_span': nspan, 'operator': 'eq', 'phase': 'selector'}
        elif world == 'drawing' and frame == 'drawn.facing' and str(value).lower() in ('left', 'right') and (place(nspan) or place(str(value))):
            c = {'key': 'drawn.facing', 'value': str(value).lower(), 'value_span': nspan if place(nspan) else str(value), 'operator': 'eq', 'phase': 'result'}
        elif world == 'drawing' and frame == 'drawn.region' and place(nspan):
            c = {'key': 'drawn.at', 'value': value, 'value_span': nspan, 'operator': 'region', 'phase': 'result'}
        if c:
            c.update({'polarity': 'positive', 'character': 'requirement'})
            q.setdefault('constraints', []).append(c)
            stats[f'needs {frame} -> constraint {c["key"]}'] += 1
        else:
            keep.append(n)
    return keep


def normalise(row, stats):
    world = row['world']
    if row.get('tier') in ('robustness', 'fragment'):
        row[row['tier']] = True
        stats[f'tier {row["tier"]} -> flag {row["tier"]}, real tier kept'] += 1
        row['tier'] = row.get('_family_tier') or 'equivalent'
    for q in row.get('requests') or []:
        if q.get('act') == 'ask':
            q['act'] = 'answer'; stats['act ask -> answer'] += 1
            q.setdefault('mood', 'ask')
            q.setdefault('question', {'ask': 'describe'})
        moved = []
        kept = []
        for c in q.get('constraints') or []:
            if isinstance(c, dict) and c.get('operator') == 'count':
                stats['operator count -> eq'] += 1
                c['operator'] = 'eq'
                if world == 'diagram' and c.get('key') in ('node.count', 'node.n'):
                    c['key'] = 'node.n'
                if c.get('value') is not None and not re.fullmatch(r'\d+(\.\d+)?', str(c['value'])):
                    c.pop('value', None); c['qualitative'] = True; stats['vague quantity kept as a mention without value'] += 1
            if isinstance(c, dict) and c.get('key') == 'node.rotate':
                c['key'] = 'node.rotation'; stats['node.rotate -> node.rotation (declared parameter name)'] += 1
            typ, _, name = str(c.get('key', '')).partition('.') if isinstance(c, dict) else ('', '', '')
            bad_meta = isinstance(c, dict) and any(f in c and c[f] not in INVENTORY['request']['constraint']['keys'][f]['values']
                                                   for f in ('operator', 'phase', 'polarity', 'character'))
            if isinstance(c, dict) and 'key' in c and c['key'] != 'question.ask' and (name not in INVENTORY.get(world, {}).get(typ, {}).get('keys', {}) or bad_meta):
                moved.append({'frame': c['key'] + (' (' + ', '.join(f'{f}={c[f]}' for f in ('operator', 'character') if f in c) + ')' if bad_meta else ''),
                              'value': c.get('value'), 'span': c.get('value_span')})
                stats['constraint with an undeclared key or meta value kept as needs (row kept)'] += 1
                continue
            if isinstance(c, dict) and 'key' not in c and ('frame' in c or 'span' in c):
                moved.append(c); stats['`needs` written inside constraints (no key) moved to needs'] += 1
            elif isinstance(c, dict) and c.get('key') == 'question.ask':
                q['question'] = {'ask': c.get('value') or 'describe'}
                if q.get('act') != 'answer':
                    q['act'] = 'answer'
                q['mood'] = q.get('mood') if q.get('mood') in ('ask', 'check') else 'ask'
                if not q.get('trigger') and isinstance(c.get('value_span'), str):
                    q['trigger'] = c['value_span']
                stats['question.ask written as a constraint moved to question.ask'] += 1
            elif isinstance(c, dict) and c.get('key') in ('chart.labels', 'group.labels') and isinstance(c.get('value_span'), str) and \
                    re.search(r'\b(by|per|for each|across)\s+(the\s+)?' + re.escape(c['value_span']) + r'\b', q.get('span') or '', re.I):
                moved.append({'frame': 'chart.dimension', 'value': c.get('value'), 'span': c['value_span']})
                stats['category dimension ("by month") labelled as chart.labels moved to needs chart.dimension'] += 1
            elif isinstance(c, dict) and c.get('character') == 'discard':
                stats['constraint with character discard (an old value) removed'] += 1
            else:
                kept.append(c)
        q['constraints'] = kept
        facing_keys(world, q, stats)
        if moved:
            q['needs'] = (q.get('needs') if isinstance(q.get('needs'), list) else [q['needs']] if q.get('needs') else []) + moved
        t = q.get('target') or {}
        for f in [f for f, v in t.items() if v is None]:
            del t[f]; stats[f'target {f}: null removed'] += 1
        if q.get('trigger') is None and 'trigger' in q:
            del q['trigger']
        if t.get('fill') == 'pronoun':
            t['fill'] = 'context'; stats['target fill pronoun -> context'] += 1
        if t.get('fill') == 'ordinal':
            t['fill'] = 'description'; stats['target fill ordinal -> description (ordinal kept)'] += 1
        span = q.get('span') if isinstance(q.get('span'), str) else ''
        if span:
            for f in ('kind_span', 'name_span', 'description_span', 'count_span'):
                if isinstance(t.get(f), str) and not (official.find_all(span, t[f]) or t[f] in span):
                    del t[f]; stats[f'target {f} not in the request text removed (row kept)'] += 1
            before = len(q.get('constraints') or [])
            q['constraints'] = [c for c in q.get('constraints') or [] if not (isinstance(c, dict) and isinstance(c.get('value_span'), str)
                                                                             and not (official.find_all(span, c['value_span']) or c['value_span'] in span))]
            if len(q['constraints']) < before:
                stats['constraint whose words are not in the request text removed (row kept)'] += before - len(q['constraints'])
        # determiners are stored as said (demonstrative, possessive, quantified); prepare-official maps them for the current trainer
        for c in q.get('constraints') or []:
            if c.get('operator') == 'count':
                stats['operator count -> eq'] += 1
                c['operator'] = 'eq'
                if world == 'diagram' and c.get('key') in ('node.count', 'node.n'):
                    c['key'] = 'node.n'
                if str(c.get('value', '')).lower() in QUAL or not re.search(r'\d', str(c.get('value', ''))):
                    if c.get('value') is not None and not str(c['value']).isdigit():
                        c.pop('value', None); c['qualitative'] = True; stats['vague quantity kept as a mention without value'] += 1
            if c.get('key') == 'chart.type' and isinstance(c.get('value_span'), str):
                m = re.search(re.escape(c['value_span']) + r'(\s+(?:chart|graph|plot|diagram))\b', q.get('span') or '')
                if m:
                    c['value_span'] = c['value_span'] + m.group(1)
                    stats['chart.type span extended to the whole kind phrase ("bar" -> "bar chart")'] += 1
            for f in ('anchor_fill', 'anchor_kind', 'typo_of', 'alias_of'):
                c.pop(f, None)
        needs = q.get('needs')  # kept in the stored labels (request field) for the semantic-frame migration; also summarised
        if needs:
            q['needs'] = needs_to_keys(world, q, needs if isinstance(needs, list) else [needs], stats)
            if not q['needs']:
                del q['needs']
            else:
                yield q['needs']


def check(row, seen, official_seen):
    errs = []
    world, text = row.get('world'), row.get('text')
    if world not in WORLDS:
        return ['world-not-diagram-or-drawing']
    if not isinstance(text, str) or not text.strip():
        return ['empty-text']
    if SLOT_ID.search(text):
        errs.append('tool-or-slot-id-in-text')
    k = (world, norm(text), json.dumps(row.get('context'), sort_keys=True))
    if k in official_seen:
        errs.append('text-already-in-official-dataset')
    elif k in seen:
        errs.append('duplicate-text')
    existing = (row.get('context') or {}).get('existing') or []
    if not isinstance(existing, list) or not all(isinstance(e, dict) and e.get('kind') for e in existing):
        errs.append('context-existing-malformed')
    reqs = row.get('requests')
    if not isinstance(reqs, list):
        return errs + ['requests-missing']
    # objects made by the same message can be referred to by its later requests ("a lake, a boat on it, a house beside the lake")
    existing = existing + [{'kind': (q.get('target') or {}).get('kind') or '', 'name': (q.get('target') or {}).get('kind_span') or ''}
                           for q in reqs if isinstance(q, dict) and (q.get('target') or {}).get('mode') == 'new']
    for q in reqs:
        span = q.get('span')
        if not isinstance(span, str) or span not in text:
            errs.append('request-span-not-verbatim'); continue
        t = q.get('target') or {}
        for f in ('kind_span', 'name_span', 'description_span', 'count_span'):
            if f in t and (not isinstance(t[f], str) or t[f] not in span):
                errs.append(f'target-{f}-not-verbatim-in-span')
        if t.get('mode') == 'existing' and t.get('fill') in ('written', 'description') and not existing:
            errs.append('reference-with-empty-context')
        if t.get('fill') == 'written' and t.get('name_span') and not ref_in_context(t['name_span'], existing):
            errs.append('name-not-in-context')
        for c in q.get('constraints') or []:
            vs = c.get('value_span')
            if isinstance(vs, str) and vs not in span:
                errs.append('value-span-not-verbatim-in-span')
            if isinstance(c.get('anchor_span'), str) and c['anchor_span'] not in span:
                errs.append('anchor-span-not-verbatim-in-span')
            if c.get('key') in REF_KEYS and c.get('phase') == 'selector' and isinstance(vs, str) and not ref_in_context(vs, existing):
                errs.append('selector-not-in-context')
            if isinstance(c.get('anchor_span'), str) and not ref_in_context(c['anchor_span'], existing):
                errs.append('anchor-not-in-context')
    if errs:
        return errs
    probe = {'text': text, 'world': world, 'context': copy.deepcopy(row.get('context') or {'existing': [], 'previous': None}),
             'requests': copy.deepcopy(reqs)}
    e, w, f = VALIDATOR.check(probe)
    return ['official:' + (x if x.startswith(('unregistered-key', 'act-not', 'target-type', 'question-ask', 'operator', 'character', 'phase')) else x.split(':')[0]) for x in e]


FROZEN = HERE / 'frozen'  # batches already consumed (imported once; their folders are never re-read): pilot, dg-batch-01 phase A


def signed(batch):
    """A batch is imported only when the worker's DONE marker file (written last) exists in data-drop/<batch>/ and every
    data file it lists exists with the listed row count; the batch's .jsonl files must all be listed. management/staging/
    is never read. Returns (ok, reason)."""
    marker = batch / 'DONE'
    if not marker.is_file():
        return False, 'no DONE marker'
    text = marker.read_text()
    listed = dict.fromkeys(re.findall(r'([\w.-]+\.jsonl)', text))
    if not listed:
        return False, 'DONE marker lists no .jsonl file'
    present = {p.name for p in batch.glob('*.jsonl')}
    if set(listed) != present:
        return False, f'DONE lists {sorted(listed)} but the folder holds {sorted(present)}'
    total = sum(sum(1 for line in (batch / name).read_text().splitlines() if line.strip()) for name in listed)
    m = re.search(r'^rows:\s*(\d[\d,]*)', text, re.M)
    if m and int(m.group(1).replace(',', '')) != total:
        return False, f'DONE says rows {m.group(1)}, the files hold {total}'
    for name in listed:
        rows = sum(1 for line in (batch / name).read_text().splitlines() if line.strip())
        m = re.search(re.escape(name) + r'\D{0,40}?(\d[\d,]*)', text)
        if m and int(m.group(1).replace(',', '')) != rows:
            return False, f'{name}: DONE says {m.group(1)} rows, the file has {rows}'
    return True, 'signed'


def marker_stamp(batch):
    marker = batch / 'DONE'
    if not marker.is_file():
        return None
    m = re.search(r'^timestamp:\s*(\S+)', marker.read_text(), re.M)
    return m.group(1) if m else marker.read_text()


def residual_marker(batch):
    """A marker for the residual rows of a batch whose bulk was consumed earlier (the bulk stays imported)."""
    return 'residual' in (batch / 'DONE').read_text().lower()


def main():
    frozen = {p.stem: [json.loads(l) for l in p.read_text().splitlines() if l.strip()] for p in sorted(FROZEN.glob('*.jsonl'))
              if not p.name.endswith(('.needs.jsonl', '.residual.jsonl'))}
    metas = {p.name[:-len('.meta.json')]: json.loads(p.read_text()) for p in FROZEN.glob('*.meta.json')}
    # A frozen batch is not re-read unless the worker re-signed it (a DONE marker newer than the import): then its rows are
    # replaced by the re-signed files, or, for a residual marker, the residual rows are added beside the consumed bulk.
    resigned = {}
    for name in list(frozen):
        batch = DROP / name
        stamp = marker_stamp(batch) if batch.is_dir() else None
        if stamp and stamp != metas.get(name, {}).get('marker') and signed(batch)[0]:
            resigned[name] = 'residual' if residual_marker(batch) else 'replace'
            if resigned[name] == 'replace':
                del frozen[name]
    candidates = sorted(p for p in DROP.iterdir() if p.is_dir() and not p.name.startswith(('_', '.')) and (p.name not in frozen or resigned.get(p.name) == 'residual')) if DROP.exists() else []
    batches, waiting = [], {}
    for p in candidates:
        ok, why = signed(p) if len(sys.argv) == 1 else (True, 'dry run')
        if ok:
            batches.append(p)
        else:
            waiting[p.name] = why
    official_seen = set()  # owner decision 2026-11-20: rows are never rejected for being in the official dataset or a benchmark; the build keeps one copy of identical texts
    seen, accepted, needs_all, needs_count = set(), [], collections.defaultdict(list), collections.Counter()
    summary = {}
    for batch in batches:
        files = sorted(batch.glob('*.jsonl'))
        rejected, reasons, examples, stats = 0, collections.Counter(), collections.defaultdict(list), collections.Counter()
        kept, total, per_world, per_class = 0, 0, collections.Counter(), collections.Counter()
        batch_needs = collections.Counter()
        batch_needs_rows = []
        fam_tiers = collections.defaultdict(collections.Counter)
        for path in files:
            for line in path.read_text().splitlines():
                try:
                    r0 = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if r0.get('tier') not in ('robustness', 'fragment', None):
                    fam_tiers[r0.get('family')][r0['tier']] += 1
        for path in files:
            for i, line in enumerate(path.read_text().splitlines(), 1):
                if not line.strip():
                    continue
                total += 1
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    rejected += 1; reasons['invalid-json'] += 1; continue
                row = copy.deepcopy(row)
                if isinstance(row, dict) and fam_tiers.get(row.get('family')):
                    row['_family_tier'] = fam_tiers[row['family']].most_common(1)[0][0]
                needs = [n for group in normalise(row, stats) for n in group] if isinstance(row.get('requests'), list) else []
                errs = check(row, seen, official_seen)
                for n in needs:
                    frame = str((n or {}).get('frame', 'unspecified')) if isinstance(n, dict) else str(n)
                    batch_needs_rows.append({'batch': batch.name, 'text': row.get('text'), 'frame': frame,
                                             **({k: n.get(k) for k in ('value', 'span')} if isinstance(n, dict) else {'need': n})})
                    batch_needs[frame] += 1
                    needs_count[frame] += 1
                    if len(needs_all[frame]) < 8:
                        needs_all[frame].append({'batch': batch.name, 'text': row.get('text'), **(n if isinstance(n, dict) else {'need': n})})
                if errs:
                    rejected += 1
                    for e in sorted(set(errs)):
                        reasons[e] += 1
                        if len(examples[e]) < 5:
                            examples[e].append(f'{path.name}:{i} {row.get("text")!r}')
                    continue
                seen.add((row['world'], norm(row['text']), json.dumps(row.get('context'), sort_keys=True)))
                kept += 1
                per_world[row['world']] += 1
                for c in row.get('classes') or []:
                    per_class[c] += 1
                fam = str(row.get('family') or hashlib.sha256(row['text'].encode()).hexdigest()[:12])
                accepted.append({'id': f'{batch.name}-{path.stem}-{i:05d}', 'world': row['world'], 'text': row['text'],
                                 'context': row.get('context') or {'existing': [], 'previous': None}, 'requests': row['requests'],
                                 'style': 'drop-' + str(row.get('tier') or 'equivalent') + ''.join('-' + f for f in ('robustness', 'fragment') if row.get(f)),
                                 'tier': row.get('tier'), **{f: True for f in ('robustness', 'fragment') if row.get(f)}, 'phase': 'direct',
                                 'cohort': {'recipeFamily': f'drop:{batch.name}:{fam}', 'classes': row.get('classes') or []}})
        cores = collections.defaultdict(set)
        for path in files:
            for line in path.read_text().splitlines():
                try:
                    r = json.loads(line)
                except json.JSONDecodeError:
                    continue
                t = r.get('text') or ''
                for _ in range(3):
                    t = WRAP.sub('', t.strip())
                cores[r.get('family')].add(norm(t))
        distinct = sum(len(v) for v in cores.values())
        summary[batch.name] = {'rows': total, 'accepted': kept, 'rejected': rejected, 'distinctCoresAfterWrappers': distinct}
        lines = [f'# Import feedback: {batch.name}', '',
                 f'Rows {total}: **accepted {kept}**, rejected {rejected} (importer `psys2/training/sop-bert/data/data-drop-v1/import.py`).',
                 f'Accepted per tab: {dict(per_world)}; per class: {dict(per_class.most_common())}.',
                 f'Paraphrase variety: {distinct} distinct texts once greeting/politeness wrappers ("hey,", "quick one —", "please", ", thanks", "— go on") '
                 f'are removed, over {len(cores)} families ({total} rows). Wrappers are robustness, not paraphrases: each family needs 20+ real '
                 'rewordings (other verbs, word order, references, omissions, register), with wrappers as ~10% extra variants.', '']
        if reasons:
            lines += ['## Rejected rows by reason (a row can have several reasons)', '', '| reason | rows | examples |', '| --- | ---: | --- |']
            lines += [f'| {r} | {n} | {"<br>".join(e.replace("|", "/") for e in examples[r])} |' for r, n in reasons.most_common()]
            lines.append('')
        if stats:
            lines += ['## Normalised on import (not an error; the trainer label inventory differs from the request format)', '']
            lines += [f'- {k}: {v}' for k, v in stats.most_common()] + ['']
        if batch_needs:
            lines += ['## `needs` received (collected for the compilation stream, kept in the stored labels as `request.needs`)', '']
            lines += [f'- {k}: {v}' for k, v in batch_needs.most_common()] + ['']
        lines += ['## Systematic issues to fix in the next batches', '',
                  '- A `name_span` must be the words of the text. "turn the car into a truck" with `name_span: "Car"` (the context name) is a '
                  'definite description: `fill: description`, `kind: car`, `kind_span: car`; names are only real names or visible codes.',
                  '- A request `span` must cover every span of its labels: a value span outside the request span ("if Test passes ... — draw both arrows" '
                  'with span "draw both arrows") is rejected; make the span the clause that holds all of them (or the whole sentence).',
                  '- `needs` belong in `request.needs`, not in `constraints` (moved on import this time); a question kind is `question: {ask: ...}`, '
                  'not a `question.ask` constraint (moved on import this time); a replaced old value ("from 30 to 40") gets no constraint, '
                  'not `character: discard`.',
                  '- Target types are `chart`, `node`, ... exactly: typo variants belong in the text, never in label fields (`chhart`).',
                  '- A relation anchor must name an object of `context.existing` (or a new object of the same message: put the anchor on the '
                  'request that creates it only after the creating request, and keep it in the text verbatim).',
                  '- `chart.type` spans the whole kind phrase ("bar chart", "pie chart", "line graph"), as the Diagram corpus does (extended on '
                  'import this time). A list of categories is one `chart.labels` mention per category ("year 1", "year 2"), not one mention for the list.',
                  '- Category dimensions ("a pie chart of the staff by rank") are not category labels: `chart.labels` holds the category '
                  'words themselves ("Q1", "North"); a dimension stays unlabelled or in `needs` (`chart.dimension`).', '']
        lines += ['## Notes for the next batch', '',
                  '- acts: `answer` (with `mood: ask|check` and `question.ask`) is the trainer form of `ask`; `link.style` is the dash/dot key '
                  '(`link.pattern` is chain/cycle/star/all); determiners are `definite` / `indefinite`.',
                  '- Diagram conventions: psys2/training/sop-bert/data/ui-diagram-v2/README.md (populations, connect patterns, charts, '
                  'improvement intent, container words).', '']
        (batch / 'FEEDBACK.md').write_text('\n'.join(lines))
        if len(sys.argv) == 1:
            mine = [r for r in accepted if r['cohort']['recipeFamily'].split(':')[1] == batch.name]
            suffix = '.residual' if resigned.get(batch.name) == 'residual' else ''
            (FROZEN / f'{batch.name}{suffix}.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in mine))
            (FROZEN / f'{batch.name}{suffix}.needs.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in batch_needs_rows))
            (FROZEN / f'{batch.name}.meta.json').write_text(json.dumps({'marker': marker_stamp(batch), 'rows': len(mine), 'mode': resigned.get(batch.name, 'new')}) + '\n')
    if len(sys.argv) > 1:
        print(json.dumps({'batches': summary, 'accepted': len(accepted), 'dryRun': True}, indent=1))
        return
    imported = {r['cohort']['recipeFamily'].split(':')[1] for r in accepted}
    keep_frozen = {n: rows for n, rows in frozen.items() if not (n in imported and resigned.get(n) != 'residual')}
    residuals = [json.loads(l) for p in sorted(FROZEN.glob('*.residual.jsonl')) if p.name[:-len('.residual.jsonl')] not in imported
                 for l in p.read_text().splitlines() if l.strip()]
    accepted = [r for rows in keep_frozen.values() for r in rows] + residuals + accepted
    summary.update({name: {'frozen': len(rows)} for name, rows in keep_frozen.items() if name not in summary})
    for name, mode in resigned.items():
        summary.setdefault(name, {})['resigned'] = mode
    summary.update({name: {'waiting': why} for name, why in waiting.items()})
    (HERE / 'accepted.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in accepted))
    every = [json.loads(l) for p in sorted(FROZEN.glob('*.needs.jsonl')) for l in p.read_text().splitlines() if l.strip()]
    if every:
        by = collections.defaultdict(list)
        for r in every:
            by[r['frame']].append(r)
        out = ['# Meanings without a key (data drops)', '', 'Collected from `needs` of every imported batch by the importer; frame -> requests and examples.', '']
        for frame, rs in sorted(by.items(), key=lambda x: -len(x[1])):
            out.append(f'## {frame} ({len(rs)} requests; batches {sorted({r["batch"] for r in rs})})')
            out += [f'- {r["batch"]}: {r["text"]!r} value={r.get("value")!r} span={r.get("span")!r}' for r in rs[:8]]
            out.append('')
        (DROP / 'NEEDS-SUMMARY.md').write_text('\n'.join(out))
    print(json.dumps({'batches': summary, 'accepted': len(accepted)}, indent=1))


if __name__ == '__main__':
    main()
