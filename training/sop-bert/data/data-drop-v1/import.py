#!/usr/bin/env python3
"""Import the Diagram/Drawing data drops (management/data-drop/<batch>/*.jsonl, format of
management/DATA-REQUEST-diagram-drawing.md) into this folder for official-dataset/build.py.

Per batch: normalise the few request-format differences to the trainer's label inventory (act ask -> answer, determiners
demonstrative/possessive/quantified -> definite, operator count -> eq on node.n / drawn.count, `needs` collected and removed),
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
INV = official.Inventory(INVENTORY)
VALIDATOR = official.Validator(INV)
_, LEMMAS = official.kind_vocabulary()
WORLDS = {'diagram', 'drawing'}
DETERMINERS = {'definite': 'definite', 'indefinite': 'indefinite', 'demonstrative': 'definite', 'possessive': 'definite', 'quantified': 'definite'}
SLOT_ID = re.compile(r'\b(?:[a-z]+_[a-z_]+|chart:\d+|seg-\d+)\b')
REF_KEYS = {'node.ids', 'link.ids', 'group.id', 'group.ids', 'drawn.ids', 'drawn.id', 'drawn.anchor', 'node.anchor', 'part.owner', 'chart.id'}
POPULATION = re.compile(r'\b(all|every|each|everything|them|these|those|it|its|this|that|selected|selection|one|ones|both|other|others|rest)\b', re.I)
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
    return False


def normalise(row, stats):
    world = row['world']
    for q in row.get('requests') or []:
        if q.get('act') == 'ask':
            q['act'] = 'answer'; stats['act ask -> answer'] += 1
            q.setdefault('mood', 'ask')
            q.setdefault('question', {'ask': 'describe'})
        moved = []
        kept = []
        for c in q.get('constraints') or []:
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
        if moved:
            q['needs'] = (q.get('needs') if isinstance(q.get('needs'), list) else [q['needs']] if q.get('needs') else []) + moved
        t = q.get('target') or {}
        if t.get('determiner') in DETERMINERS and DETERMINERS[t['determiner']] != t['determiner']:
            stats[f'determiner {t["determiner"]} -> definite'] += 1
            t['determiner'] = DETERMINERS[t['determiner']]
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
        needs = q.pop('needs', None)
        if needs:
            yield needs if isinstance(needs, list) else [needs]


def check(row, seen, official_seen):
    errs = []
    world, text = row.get('world'), row.get('text')
    if world not in WORLDS:
        return ['world-not-diagram-or-drawing']
    if not isinstance(text, str) or not text.strip():
        return ['empty-text']
    if SLOT_ID.search(text):
        errs.append('tool-or-slot-id-in-text')
    k = (world, norm(text))
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
            if f in t and (not isinstance(t[f], str) or not official.find_all(span, t[f])):
                errs.append(f'target-{f}-not-verbatim-in-span')
        if t.get('mode') == 'existing' and t.get('fill') in ('written', 'description') and not existing:
            errs.append('reference-with-empty-context')
        if t.get('fill') == 'written' and t.get('name_span') and not ref_in_context(t['name_span'], existing):
            errs.append('name-not-in-context')
        for c in q.get('constraints') or []:
            vs = c.get('value_span')
            if isinstance(vs, str) and not official.find_all(span, vs):
                errs.append('value-span-not-verbatim-in-span')
            if isinstance(c.get('anchor_span'), str) and not official.find_all(span, c['anchor_span']):
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


def main():
    batches = sorted(p for p in DROP.iterdir() if p.is_dir()) if DROP.exists() else []
    official_seen = official_texts()
    seen, accepted, needs_all, needs_count = set(), [], collections.defaultdict(list), collections.Counter()
    summary = {}
    for batch in batches:
        files = sorted(batch.glob('*.jsonl'))
        rejected, reasons, examples, stats = 0, collections.Counter(), collections.defaultdict(list), collections.Counter()
        kept, total, per_world, per_class = 0, 0, collections.Counter(), collections.Counter()
        batch_needs = collections.Counter()
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
                needs = [n for group in normalise(row, stats) for n in group] if isinstance(row.get('requests'), list) else []
                errs = check(row, seen, official_seen)
                for n in needs:
                    frame = str((n or {}).get('frame', 'unspecified')) if isinstance(n, dict) else str(n)
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
                seen.add((row['world'], norm(row['text'])))
                kept += 1
                per_world[row['world']] += 1
                for c in row.get('classes') or []:
                    per_class[c] += 1
                fam = str(row.get('family') or hashlib.sha256(row['text'].encode()).hexdigest()[:12])
                accepted.append({'id': f'{batch.name}-{path.stem}-{i:05d}', 'world': row['world'], 'text': row['text'],
                                 'context': row.get('context') or {'existing': [], 'previous': None}, 'requests': row['requests'],
                                 'style': 'drop-' + str(row.get('tier') or 'equivalent'), 'tier': row.get('tier'), 'phase': 'direct',
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
            lines += ['## `needs` received (collected for the compilation stream, removed from the imported labels)', '']
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
    if len(sys.argv) > 1:
        print(json.dumps({'batches': summary, 'accepted': len(accepted), 'dryRun': True}, indent=1))
        return
    (HERE / 'accepted.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in accepted))
    if batches:
        out = ['# Meanings without a key (data drops)', '', 'Collected from `needs` of every batch by the importer; frame -> count and examples.', '']
        for frame, n in needs_count.most_common():
            out.append(f'## {frame} ({n} requests)')
            out += [f'- {e.get("batch")}: {e.get("text")!r} value={e.get("value")!r} span={e.get("span")!r}' for e in needs_all[frame]]
            out.append('')
        (DROP / 'NEEDS-SUMMARY.md').write_text('\n'.join(out))
    print(json.dumps({'batches': summary, 'accepted': len(accepted)}, indent=1))


if __name__ == '__main__':
    main()
