#!/usr/bin/env python3
"""Assign usage classes (multi-label) to benchmark items and report coverage = pass rate per class.
usage: taxonomy.py items.jsonl[,items2.jsonl] scored.jsonl[,scored2.jsonl] TAB > table"""
import json, re, sys, collections

CLASSES = ['create', 'compose-scene', 'place-relative', 'move/position', 'quantify', 'refer', 'modify-attribute', 'part-edit',
           'arrange/layout', 'connect/structure', 'chart-create', 'chart-data-edit', 'chart-formatting', 'remove', 'vague-aesthetic',
           'correction/undo', 'question', 'compound/multi-step', 'fragment/follow-up', 'conversational/complaint']
CHART = re.compile(r'\b(chart|plot|graph|bar|bars|pie|histogram|scatter|line chart|axis|axes|legend|series|values?|data)\b', re.I)
VAGUE = re.compile(r'\b(better|nicer|prettier|beautiful|nice|clean(er)?|look good|improve|natural(ly)?|ugly|logical(ly)?|more readable|neater|tidy)\b', re.I)
REFER = re.compile(r'\b(it|them|they|that|this|those|these|him|her|its|all|every|each|first|second|third|last|other|another|rest|same|both)\b', re.I)
CORR = re.compile(r'\b(undo|revert|back|wrong|no,|not that|instead|again|go back|restore)\b', re.I)

def classes(it):
    t = it['text']; cons = set(c.lower() for c in it.get('construction', [])); eff = it['expect']['effects']
    types = [e['type'] for e in eff]; out = set()
    creates = [e for e in eff if e['type'] == 'create']
    chartish = any('chart' in (e.get('kind') or '') or 'chart' in (e.get('target') or '') or e.get('property') in ('series', 'values', 'data', 'axis', 'legend', 'chart type', 'type')
                   for e in eff) or ('chart' in ' '.join(cons))
    if creates:
        if chartish or any(CHART.search(e.get('kind') or '') for e in creates): out.add('chart-create')
        elif len(creates) >= 2 or 'scene' in cons or 'enumeration' in cons or any((e.get('kind') in ('landscape', 'any')) for e in creates): out.add('compose-scene')
        else: out.add('create')
    if any(e.get('count') not in (None, 1) for e in creates) or cons & {'quantity', 'vague-quantity', 'quantifier', 'plural'}: out.add('quantify')
    if any(e.get('relation') for e in eff) or 'relation' in cons: out.add('place-relative')
    if 'move' in types and not any(e.get('relation') for e in eff if e['type'] == 'move'): out.add('move/position')
    if 'remove' in types: out.add('remove')
    if 'connect' in types: out.add('connect/structure')
    if 'layout' in types or cons & {'layout', 'alignment', 'align', 'distribute'}: out.add('arrange/layout')
    ch = [e for e in eff if e['type'] == 'change']
    if ch:
        if chartish and any(e.get('property') in ('values', 'value', 'data', 'series', 'label', 'labels') for e in ch) and CHART.search(t): out.add('chart-data-edit')
        elif chartish or (CHART.search(t) and it['tab'] == 'diagram' and re.search(r'chart|plot|graph|axis|legend|bar|line|pie', t, re.I)): out.add('chart-formatting')
        if 'part' in cons or any(e.get('property') == 'part' for e in ch): out.add('part-edit')
        if not (out & {'chart-data-edit', 'chart-formatting'}): out.add('modify-attribute')
    if 'part' in cons and 'part-edit' not in out: out.add('part-edit')
    if VAGUE.search(t) or 'vague' in cons: out.add('vague-aesthetic')
    if REFER.search(t) or cons & {'anaphora', 'ordinal', 'quantifier', 'identifier'}: out.add('refer')
    if cons & {'repair', 'undo'} or CORR.search(t): out.add('correction/undo')
    if 'query' in types or 'question' in cons or t.strip().endswith('?'): out.add('question')
    if len(eff) >= 2 or cons & {'multi-request', 'coordination', 'multi-sentence'}: out.add('compound/multi-step')
    if 'fragment' in cons or len(t.split()) <= 2: out.add('fragment/follow-up')
    if 'no_change' in types or cons & {'complaint', 'chit-chat'}: out.add('conversational/complaint')
    return out

def main():
    items = {}; scored = {}
    for p in sys.argv[1].split(','):
        for l in open(p):
            if l.strip(): it = json.loads(l); items[it['id']] = it
    for p in sys.argv[2].split(','):
        for l in open(p):
            if l.strip(): s = json.loads(l); scored[s['id']] = s
    n = collections.Counter(); ok = collections.Counter(); part = collections.Counter(); ex = collections.defaultdict(list); lay = collections.defaultdict(collections.Counter)
    for i, s in scored.items():
        it = items[i]
        for c in classes(it):
            n[c] += 1; ok[c] += s['outcome'] == 'pass'; part[c] += s['outcome'] == 'partial'
            if s.get('layer'): lay[c][s['layer']] += 1
            if len(ex[c]) < 3 and not it['id'].startswith('owner') or len(ex[c]) < 1: ex[c].append(it['text'][:70])
    rows = []
    for c in CLASSES:
        if not n[c]: rows.append({'class': c, 'n': 0}); continue
        rows.append({'class': c, 'n': n[c], 'pass': ok[c], 'partial': part[c], 'passRate': round(ok[c] / n[c], 3), 'topLayer': lay[c].most_common(2), 'examples': ex[c]})
    json.dump(rows, sys.stdout, indent=1)

main()
